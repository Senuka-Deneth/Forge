/**
 * Hard risk guardrails. Each returns a structured block the UI can render as a red row with an
 * explicit Override click. The system may refuse a setup; override requires a deliberate action
 * that writes to the override log — silent auto-approval is how guardrails become theatre.
 */

import type { BlackoutCheck, FundingWindow } from "./sessions.ts";
import type { ExpectancyResult } from "./expectancy.ts";

export type GuardrailId =
  | "negative_ev"
  | "event_blackout"
  | "funding_window"
  | "daily_loss_limit"
  | "max_open_r"
  | "loss_cooldown"
  | "thin_book"
  | "correlated_exposure";

export type GuardrailResult = {
  id: GuardrailId;
  blocked: boolean;
  reason: string;
  /** Whether the trader may click through. Some gates (negative EV) are overridable; others
   * (event blackout during FOMC) may be marked non-overridable by the operator. */
  overridable: boolean;
};

export type RiskSettings = {
  daily_loss_limit_r: number;
  max_open_r: number;
  cooldown_losses: number;
  cooldown_minutes: number;
};

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  daily_loss_limit_r: 3,
  max_open_r: 5,
  cooldown_losses: 3,
  cooldown_minutes: 120,
};

export type JournalSnapshot = {
  /** Realized R from closed trades today (negative = loss). */
  realized_r_today: number;
  /** Sum of open-position risk in R. */
  open_r: number;
  /** Number of consecutive closed losses ending at the most recent trade. */
  consecutive_losses: number;
  /** Minutes since the last closed loss (null if no losses). */
  minutes_since_last_loss: number | null;
  /** Open alt positions with beta > threshold to BTC. */
  correlated_open_count: number;
};

export type BookQuality = {
  spreadPct: number | null;
  /** Quote notional available within ±1% on the thin side. Null when book unavailable. */
  thinSideNotional: number | null;
  /** Cost in quote currency to move mid by 1% (book slope). */
  slopeBid: number | null;
  slopeAsk: number | null;
};

const THIN_SPREAD_PCT = 0.15; // 15 bps — wide for majors, routine for thin alts
const THIN_NOTIONAL_FLOOR = 25_000; // quote currency within ±1%
const CORRELATED_CAP = 3;

/**
 * Evaluate every guardrail against the current plan and account state.
 *
 * Returns only the gates that fire (`blocked: true`). An empty list means the plan clears every
 * check — the UI still shows the EV verdict, but no red override rows.
 */
export function evaluateGuardrails(input: {
  expectancy: ExpectancyResult;
  funding?: FundingWindow | null;
  blackout?: BlackoutCheck | null;
  journal?: JournalSnapshot | null;
  book?: BookQuality | null;
  settings?: Partial<RiskSettings>;
}): GuardrailResult[] {
  const settings: RiskSettings = { ...DEFAULT_RISK_SETTINGS, ...input.settings };
  const fired: GuardrailResult[] = [];

  if (input.expectancy.verdict === "SKIP" && input.expectancy.p != null) {
    fired.push({
      id: "negative_ev",
      blocked: true,
      reason: input.expectancy.summary,
      overridable: true,
    });
  }

  if (input.blackout?.blocked) {
    fired.push({
      id: "event_blackout",
      blocked: true,
      reason: `High-impact event blackout${input.blackout.label ? ` (${input.blackout.label})` : ""}${
        input.blackout.minutesRemaining != null
          ? ` — ${input.blackout.minutesRemaining} min remaining`
          : ""
      }.`,
      overridable: true,
    });
  }

  if (input.funding?.imminent) {
    fired.push({
      id: "funding_window",
      blocked: true,
      reason: `Next funding in ${input.funding.minutesUntil} min — avoid opening leveraged positions into a print.`,
      overridable: true,
    });
  }

  if (input.journal) {
    if (input.journal.realized_r_today <= -settings.daily_loss_limit_r) {
      fired.push({
        id: "daily_loss_limit",
        blocked: true,
        reason: `Daily loss limit hit (${input.journal.realized_r_today.toFixed(2)}R ≤ −${settings.daily_loss_limit_r}R).`,
        overridable: true,
      });
    }

    if (input.journal.open_r >= settings.max_open_r) {
      fired.push({
        id: "max_open_r",
        blocked: true,
        reason: `Max concurrent open risk exceeded (${input.journal.open_r.toFixed(2)}R ≥ ${settings.max_open_r}R).`,
        overridable: true,
      });
    }

    if (
      input.journal.consecutive_losses >= settings.cooldown_losses &&
      (input.journal.minutes_since_last_loss == null ||
        input.journal.minutes_since_last_loss < settings.cooldown_minutes)
    ) {
      const remaining = input.journal.minutes_since_last_loss == null
        ? settings.cooldown_minutes
        : Math.max(0, settings.cooldown_minutes - input.journal.minutes_since_last_loss);
      fired.push({
        id: "loss_cooldown",
        blocked: true,
        reason: `${input.journal.consecutive_losses} consecutive losses — cooldown ${remaining.toFixed(0)} min remaining.`,
        overridable: true,
      });
    }

    if (input.journal.correlated_open_count >= CORRELATED_CAP) {
      fired.push({
        id: "correlated_exposure",
        blocked: true,
        reason: `${input.journal.correlated_open_count} open alt positions with high BTC beta — that is one BTC long in ${input.journal.correlated_open_count} costumes.`,
        overridable: true,
      });
    }
  }

  if (input.book) {
    const thinBySpread = input.book.spreadPct != null && input.book.spreadPct >= THIN_SPREAD_PCT;
    const thinByDepth = input.book.thinSideNotional != null &&
      input.book.thinSideNotional < THIN_NOTIONAL_FLOOR;
    if (thinBySpread || thinByDepth) {
      const parts: string[] = [];
      if (thinBySpread) parts.push(`spread ${input.book.spreadPct!.toFixed(3)}%`);
      if (thinByDepth) parts.push(`thin-side depth $${Math.round(input.book.thinSideNotional!).toLocaleString()}`);
      fired.push({
        id: "thin_book",
        blocked: true,
        reason: `Thin book — ${parts.join(", ")}. Tight stops are not executable here.`,
        overridable: true,
      });
    }
  }

  return fired;
}

/**
 * Final actionable verdict after guardrails.
 *
 * TAKE only survives when EV is positive AND no guardrail fired (or all fired ones were
 * explicitly overridden). SKIP when EV is negative. WAIT when the plan has no bias or EV cannot
 * be computed. A blocking guardrail without override forces WAIT even if EV is positive —
 * "the numbers say take it but your risk limits say no".
 */
export function applyGuardrailVerdict(
  expectancy: ExpectancyResult,
  guardrails: GuardrailResult[],
  overriddenIds: GuardrailId[] = [],
): { verdict: "TAKE" | "SKIP" | "WAIT"; blocked_by: GuardrailResult[] } {
  const active = guardrails.filter((g) => g.blocked && !overriddenIds.includes(g.id));
  if (expectancy.verdict === "WAIT") {
    return { verdict: "WAIT", blocked_by: active };
  }
  if (expectancy.verdict === "SKIP") {
    // Negative EV stays SKIP even if other gates are overridden — the math does not care.
    return { verdict: "SKIP", blocked_by: active };
  }
  if (active.length) {
    return { verdict: "WAIT", blocked_by: active };
  }
  return { verdict: "TAKE", blocked_by: [] };
}
