/**
 * Assemble the decision-layer payload attached to every analysis.
 *
 * EV, management plan, and guardrails are computed server-side and never by the model. The model
 * may narrate them; it may not invent them. Keeping the assembly here means both the live AI path
 * and the deterministic fallback produce the same shape.
 */

import { computeExpectancy, type ExpectancyResult } from "./expectancy.ts";
import { buildTradeManagement, type TradeManagementPlan } from "./tradeManagement.ts";
import {
  applyGuardrailVerdict,
  evaluateGuardrails,
  type BookQuality,
  type GuardrailResult,
  type JournalSnapshot,
  type RiskSettings,
} from "./guardrails.ts";
import { planEntryMid, type TradePlan } from "./tradePlan.ts";
import type { BlackoutCheck, FundingWindow } from "./sessions.ts";
import type { EmpiricalCalibration } from "./calibration.ts";
import { assessTargetFeasibility, type FeasibilityAssessment } from "./expectedMove.ts";
import {
  computePositionSize,
  suggestRiskPct,
  type PositionSizeResult,
  type RiskSuggestion,
  type SymbolFilters,
} from "./positionSizing.ts";

export type Factor = {
  side: "bull" | "bear";
  label: string;
  weight: number;
};

export type VerdictPayload = {
  expectancy: ExpectancyResult;
  management: TradeManagementPlan;
  guardrails: GuardrailResult[];
  /** Final actionable verdict after guardrails (before any UI override). */
  verdict: "TAKE" | "SKIP" | "WAIT";
  factors: Factor[];
  scenarios: {
    primary: string;
    alternate: string;
    invalidation: string;
  };
  /** Can the nearest target trade inside the scoring horizon? Null when no sigma was available. */
  feasibility: FeasibilityAssessment | null;
  /** Fractional-Kelly risk-per-trade suggestion. Advisory — the trader still sets the number. */
  risk_suggestion: RiskSuggestion | null;
};

export function buildVerdict(input: {
  plan: TradePlan;
  regime: "trending" | "ranging" | "volatile_chop";
  calibration: EmpiricalCalibration | null;
  funding?: FundingWindow | null;
  blackout?: BlackoutCheck | null;
  journal?: JournalSnapshot | null;
  book?: BookQuality | null;
  settings?: Partial<RiskSettings>;
  factors?: Factor[];
  scenarios?: VerdictPayload["scenarios"];
  /** Per-bar log-return volatility for the feasibility check. Omit to skip the check entirely. */
  sigmaPerBar?: number | null;
  /** Scoring horizon in bars — must match score-predictions' EXPIRE_BARS to stay comparable. */
  expireBars?: number;
  /** Sizing result, when the caller knows the account. Drives the liquidation gate. */
  sizing?: PositionSizeResult | null;
}): VerdictPayload {
  const p = input.calibration?.empirical_hit_rate ?? null;
  const n = input.calibration?.n ?? 0;
  const hits = p != null && n > 0 ? Math.round(p * n) : undefined;

  const expectancy = computeExpectancy(input.plan, { p, n, hits });
  const management = buildTradeManagement(input.plan, input.regime);

  // Feasibility needs an entry, and the plan's entry mid is the only price it is fair to measure
  // from — measuring from spot would flag every limit order resting away from the market.
  const feasibility = buildFeasibility(input.plan, input.sigmaPerBar ?? null, input.expireBars ?? 100);

  const guardrails = evaluateGuardrails({
    expectancy,
    funding: input.funding,
    blackout: input.blackout,
    journal: input.journal,
    book: input.book,
    settings: input.settings,
    feasibility,
    sizing: input.sizing,
  });
  const { verdict } = applyGuardrailVerdict(expectancy, guardrails);

  // Sized off the Wilson lower bound, so a thin sample suggests the floor rather than a big number.
  const riskSuggestion = suggestRiskPct({
    p: expectancy.p,
    pCiLow: expectancy.p_ci_low,
    rewardR: expectancy.reward_r,
    n: expectancy.n,
  });

  return {
    expectancy,
    management,
    guardrails,
    verdict,
    feasibility,
    risk_suggestion: riskSuggestion,
    factors: input.factors ?? [],
    scenarios: input.scenarios ?? {
      primary: input.plan.rationale || "No primary scenario.",
      alternate: "No alternate scenario.",
      invalidation: input.plan.stop_loss != null
        ? `Invalidated on a decisive close beyond stop ${input.plan.stop_loss}.`
        : "No invalidation level.",
    },
  };
}

/**
 * Build the feasibility assessment for a plan, or null when it cannot be built honestly.
 *
 * Returns null rather than a default whenever the entry mid, the volatility estimate, or a
 * directional bias is missing — an unreachable-target gate firing off a guessed sigma would be
 * worse than no gate at all.
 */
function buildFeasibility(
  plan: TradePlan,
  sigmaPerBar: number | null,
  expireBars: number,
): FeasibilityAssessment | null {
  if (plan.bias === "wait") return null;
  if (sigmaPerBar == null || !Number.isFinite(sigmaPerBar) || sigmaPerBar <= 0) return null;

  const entry = planEntryMid(plan);
  if (entry == null) return null;

  return assessTargetFeasibility({
    entry,
    stop: Number.isFinite(Number(plan.stop_loss)) ? Number(plan.stop_loss) : null,
    targets: (plan.targets ?? []).map((t) => ({ label: t.label, price: t.price })),
    sigmaPerBar,
    bars: expireBars,
  });
}

/**
 * Sizing inputs for one account. Structurally the subset of `risk_settings` the sizer needs;
 * declared here rather than imported from journalSnapshot.ts so this module stays free of anything
 * database-shaped.
 */
export type AccountSizing = {
  account_equity: number;
  risk_per_trade_pct: number;
  max_leverage: number;
  exchange_leverage: number | null;
};

/**
 * Size a plan against a specific account, or return null when it cannot be done honestly.
 *
 * Null whenever equity, plan geometry, or a direction is missing. The `liquidation_before_stop`
 * gate is the only non-overridable guardrail in Forge, so it must fire on arithmetic about a real
 * account or not at all — a liquidation price derived from an assumed equity would be a number the
 * trader cannot act on and cannot dismiss.
 */
export function sizePlanForAccount(
  plan: TradePlan | null | undefined,
  account: AccountSizing | null,
  filters: SymbolFilters | null,
): PositionSizeResult | null {
  if (!plan || !account) return null;
  if (plan.bias !== "long" && plan.bias !== "short") return null;

  const entry = planEntryMid(plan);
  const stop = plan.stop_loss == null ? null : Number(plan.stop_loss);
  if (entry == null || stop == null || !Number.isFinite(stop) || stop <= 0) return null;

  return computePositionSize({
    equity: account.account_equity,
    riskPct: account.risk_per_trade_pct,
    entry,
    stop,
    side: plan.bias,
    maxLeverage: account.max_leverage,
    // The reason the gate exists: a position needing 3× on a symbol left set to 50× posts a
    // sixteenth of the margin and liquidates sixteen times closer to entry.
    selectedLeverage: account.exchange_leverage ?? undefined,
    filters,
  });
}

/** Derive a thin-book snapshot from the order-book imbalance shape already on MarketContext. */
export function bookQualityFromOrderFlow(orderFlow: {
  spreadPct: number | null;
  bands?: Array<{ depthPct: number; bidNotional: number; askNotional: number }>;
  slopeBid?: number | null;
  slopeAsk?: number | null;
} | null | undefined): BookQuality | null {
  if (!orderFlow) return null;
  const band1 = orderFlow.bands?.find((b) => Math.abs(b.depthPct - 0.01) < 1e-6)
    ?? orderFlow.bands?.[orderFlow.bands.length - 1];
  const thinSideNotional = band1
    ? Math.min(band1.bidNotional, band1.askNotional)
    : null;
  return {
    spreadPct: orderFlow.spreadPct,
    thinSideNotional,
    slopeBid: orderFlow.slopeBid ?? null,
    slopeAsk: orderFlow.slopeAsk ?? null,
  };
}
