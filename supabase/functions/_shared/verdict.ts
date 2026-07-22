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
import type { TradePlan } from "./tradePlan.ts";
import type { BlackoutCheck, FundingWindow } from "./sessions.ts";
import type { EmpiricalCalibration } from "./calibration.ts";

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
}): VerdictPayload {
  const p = input.calibration?.empirical_hit_rate ?? null;
  const n = input.calibration?.n ?? 0;
  const hits = p != null && n > 0 ? Math.round(p * n) : undefined;

  const expectancy = computeExpectancy(input.plan, { p, n, hits });
  const management = buildTradeManagement(input.plan, input.regime);
  const guardrails = evaluateGuardrails({
    expectancy,
    funding: input.funding,
    blackout: input.blackout,
    journal: input.journal,
    book: input.book,
    settings: input.settings,
  });
  const { verdict } = applyGuardrailVerdict(expectancy, guardrails);

  return {
    expectancy,
    management,
    guardrails,
    verdict,
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
