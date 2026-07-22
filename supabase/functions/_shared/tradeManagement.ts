/**
 * Post-entry trade management: what happens after you get in.
 *
 * The app currently tells you where to get in and nothing about what happens next. The outcome
 * scorer already models a 20-bar fill window and 100-bar expiry — those rules should be visible
 * to the trader as explicit plan rules rather than buried in the scorer. Trailing stops come from
 * Phase 1 Supertrend / Chandelier, chosen by regime.
 */

import { FILL_WINDOW_BARS } from "./outcome.ts";
import type { TradePlan } from "./tradePlan.ts";

export type PartialStep = {
  /** Fraction of the position to close (0–1). */
  fraction: number;
  /** Target label this partial maps to (T1, T2, …). */
  at: string;
  /** Price of that target, when known. */
  price: number | null;
};

export type TrailingMethod = "supertrend" | "chandelier" | "none";

export type TradeManagementPlan = {
  /** Move stop to entry once price reaches +N R, or on a structure break beyond entry. */
  breakeven: {
    trigger_r: number;
    rule: string;
  };
  /** Ladder of partial takes. Remaining size rides the trail. */
  partials: PartialStep[];
  /** Trailing method for the runner, chosen by regime. */
  trail: {
    method: TrailingMethod;
    rule: string;
  };
  /** Give up if entry has not filled within this many bars. */
  fill_window_bars: number;
  /** Close the remainder if neither stop nor final target has hit by this many bars after fill. */
  time_stop_bars: number;
  summary: string;
};

export type ManagementRegime = "trending" | "ranging" | "volatile_chop";

/**
 * Build a management plan for a directional trade.
 *
 * Regime picks the trail: Supertrend tracks clean trends; Chandelier (ATR off the extreme) is
 * tighter and suits range fades where giving back an open profit is the usual failure mode.
 * Volatile chop should not produce a directional plan at all — gating forces wait upstream —
 * but if one slips through we refuse to trail and surface that explicitly.
 */
export function buildTradeManagement(
  plan: TradePlan,
  regime: ManagementRegime,
  opts: { expireBars?: number; breakevenR?: number } = {},
): TradeManagementPlan {
  const expireBars = opts.expireBars ?? 100;
  const breakevenR = opts.breakevenR ?? 1;

  if (plan.bias === "wait") {
    return {
      breakeven: { trigger_r: 0, rule: "No position — no management." },
      partials: [],
      trail: { method: "none", rule: "No position — no trail." },
      fill_window_bars: FILL_WINDOW_BARS,
      time_stop_bars: expireBars,
      summary: "Standing aside; nothing to manage.",
    };
  }

  const targets = (plan.targets ?? []).filter((t) => t.price != null);
  const partials: PartialStep[] = [];
  if (targets.length >= 1) {
    partials.push({
      fraction: targets.length >= 2 ? 0.5 : 0.5,
      at: targets[0].label || "T1",
      price: targets[0].price,
    });
  }
  if (targets.length >= 2) {
    partials.push({
      fraction: 0.25,
      at: targets[1].label || "T2",
      price: targets[1].price,
    });
  }
  // Remainder (25% or 50%) rides the trail as the runner.

  let trail: TradeManagementPlan["trail"];
  if (regime === "trending") {
    trail = {
      method: "supertrend",
      rule: "Trail the runner with Supertrend (ATR 10 × 3). Exit when Supertrend flips against the bias.",
    };
  } else if (regime === "ranging") {
    trail = {
      method: "chandelier",
      rule: "Trail the runner with Chandelier Exit (ATR off the extreme). Range fades die quickly — tighten early.",
    };
  } else {
    trail = {
      method: "none",
      rule: "Volatile chop — do not trail; prefer a hard time stop over giving the market room.",
    };
  }

  const partialDesc = partials.length
    ? partials.map((p) => `${Math.round(p.fraction * 100)}% at ${p.at}`).join(", ")
    : "no partials defined";

  return {
    breakeven: {
      trigger_r: breakevenR,
      rule: `Move stop to entry once price reaches +${breakevenR}R, or on a decisive structure break beyond entry in the trade direction.`,
    },
    partials,
    trail,
    fill_window_bars: FILL_WINDOW_BARS,
    time_stop_bars: expireBars,
    summary: `BE at +${breakevenR}R · ${partialDesc} · ${trail.method} trail · fill within ${FILL_WINDOW_BARS} bars · time-stop at ${expireBars} bars.`,
  };
}
