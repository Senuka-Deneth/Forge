import type { TradePlan } from "./tradePlan.ts";

export const ROUND_TRIP_COST = 0.001;
export const FILL_WINDOW_BARS = 20;
export const SCORING_VERSION = 2;

export type ScoredOutcome = {
  outcome: "stop_hit" | "target_hit" | "expired" | "no_fill" | "pending" | "invalid";
  bars_to_outcome: number | null;
  filled_at_bar: number | null;
  mfe: number | null;
  mae: number | null;
  realized_r: number | null;
  scoring_version: number;
};

export function barHitLong(
  bar: { high: number; low: number },
  stop: number,
  target: number,
): "stop" | "target" | "none" {
  const stopHit = bar.low <= stop;
  const targetHit = bar.high >= target;
  if (stopHit && targetHit) return "stop";
  if (stopHit) return "stop";
  if (targetHit) return "target";
  return "none";
}

export function barHitShort(
  bar: { high: number; low: number },
  stop: number,
  target: number,
): "stop" | "target" | "none" {
  const stopHit = bar.high >= stop;
  const targetHit = bar.low <= target;
  if (stopHit && targetHit) return "stop";
  if (stopHit) return "stop";
  if (targetHit) return "target";
  return "none";
}

function feeCostR(entry: number, risk: number): number {
  if (risk <= 0) return 0;
  return (ROUND_TRIP_COST * entry) / risk;
}

function entryFilled(
  bar: { high: number; low: number },
  entryLow: number,
  entryHigh: number,
  isLong: boolean,
): boolean {
  return isLong ? bar.low <= entryHigh : bar.high >= entryLow;
}

export function scorePlanAgainstCandles(
  plan: TradePlan,
  forward: Array<{ high: number; low: number }>,
  expireBars = 100,
): ScoredOutcome {
  const emptyExtras = { filled_at_bar: null, scoring_version: SCORING_VERSION };

  if (!forward.length) {
    return { outcome: "pending", bars_to_outcome: null, mfe: null, mae: null, realized_r: null, ...emptyExtras };
  }

  if (plan.bias === "wait") {
    return { outcome: "invalid", bars_to_outcome: null, mfe: null, mae: null, realized_r: null, ...emptyExtras };
  }

  const stop = Number(plan.stop_loss);
  const entryLow = Number(plan.entry_zone?.low);
  const entryHigh = Number(plan.entry_zone?.high);
  const target = Number(plan.targets?.[0]?.price);
  if (plan.stop_loss == null || plan.entry_zone == null || ![stop, entryLow, entryHigh, target].every(Number.isFinite)) {
    return { outcome: "invalid", bars_to_outcome: null, mfe: null, mae: null, realized_r: null, ...emptyExtras };
  }

  const entry = (entryLow + entryHigh) / 2;
  const isLong = plan.bias === "long";
  const risk = Math.abs(entry - stop);
  const costR = feeCostR(entry, risk);
  const fillWindow = Math.min(FILL_WINDOW_BARS, expireBars);

  let fillBar: number | null = null;
  for (let i = 0; i < Math.min(forward.length, fillWindow); i += 1) {
    if (entryFilled(forward[i], entryLow, entryHigh, isLong)) {
      fillBar = i;
      break;
    }
  }

  if (fillBar == null) {
    return {
      outcome: "no_fill",
      bars_to_outcome: null,
      filled_at_bar: null,
      mfe: null,
      mae: null,
      realized_r: risk > 0 ? Number((-costR).toFixed(3)) : null,
      scoring_version: SCORING_VERSION,
    };
  }

  let mfe = 0;
  let mae = 0;
  const bars = forward.slice(fillBar, expireBars);

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    const fav = isLong ? bar.high - entry : entry - bar.low;
    const adv = isLong ? entry - bar.low : bar.high - entry;
    mfe = Math.max(mfe, fav);
    mae = Math.max(mae, adv);

    const hit = isLong ? barHitLong(bar, stop, target) : barHitShort(bar, stop, target);

    if (hit === "stop") {
      const rawR = -1;
      return {
        outcome: "stop_hit",
        bars_to_outcome: fillBar + i + 1,
        filled_at_bar: fillBar,
        mfe: Number(mfe.toFixed(6)),
        mae: Number(mae.toFixed(6)),
        realized_r: risk > 0 ? Number((rawR - costR).toFixed(3)) : null,
        scoring_version: SCORING_VERSION,
      };
    }
    if (hit === "target") {
      const reward = Math.abs(target - entry);
      const rawR = risk > 0 ? reward / risk : 0;
      return {
        outcome: "target_hit",
        bars_to_outcome: fillBar + i + 1,
        filled_at_bar: fillBar,
        mfe: Number(mfe.toFixed(6)),
        mae: Number(mae.toFixed(6)),
        realized_r: risk > 0 ? Number((rawR - costR).toFixed(3)) : null,
        scoring_version: SCORING_VERSION,
      };
    }
  }

  return {
    outcome: "expired",
    bars_to_outcome: fillBar + bars.length,
    filled_at_bar: fillBar,
    mfe: Number(mfe.toFixed(6)),
    mae: Number(mae.toFixed(6)),
    realized_r: risk > 0 ? Number((-costR).toFixed(3)) : null,
    scoring_version: SCORING_VERSION,
  };
}
