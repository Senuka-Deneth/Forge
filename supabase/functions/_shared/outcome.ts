import type { TradePlan } from "./tradePlan.ts";

export type ScoredOutcome = {
  outcome: "stop_hit" | "target_hit" | "expired" | "pending" | "invalid";
  bars_to_outcome: number | null;
  mfe: number | null;
  mae: number | null;
  realized_r: number | null;
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

export function scorePlanAgainstCandles(
  plan: TradePlan,
  forward: Array<{ high: number; low: number }>,
  expireBars = 100,
): ScoredOutcome {
  if (!forward.length) {
    return { outcome: "pending", bars_to_outcome: null, mfe: null, mae: null, realized_r: null };
  }

  if (plan.bias === "wait") {
    return { outcome: "invalid", bars_to_outcome: null, mfe: null, mae: null, realized_r: null };
  }

  const stop = Number(plan.stop_loss);
  const entryLow = Number(plan.entry_zone?.low);
  const entryHigh = Number(plan.entry_zone?.high);
  const target = Number(plan.targets?.[0]?.price);
  if (plan.stop_loss == null || plan.entry_zone == null || ![stop, entryLow, entryHigh, target].every(Number.isFinite)) {
    return { outcome: "invalid", bars_to_outcome: null, mfe: null, mae: null, realized_r: null };
  }

  const entry = (entryLow + entryHigh) / 2;
  const isLong = plan.bias === "long";
  const risk = Math.abs(entry - stop);
  let mfe = 0;
  let mae = 0;
  const bars = forward.slice(0, expireBars);

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    const fav = isLong ? bar.high - entry : entry - bar.low;
    const adv = isLong ? entry - bar.low : bar.high - entry;
    mfe = Math.max(mfe, fav);
    mae = Math.max(mae, adv);

    const hit = isLong ? barHitLong(bar, stop, target) : barHitShort(bar, stop, target);

    if (hit === "stop") {
      return {
        outcome: "stop_hit",
        bars_to_outcome: i + 1,
        mfe: Number(mfe.toFixed(6)),
        mae: Number(mae.toFixed(6)),
        realized_r: risk > 0 ? Number((-1).toFixed(3)) : null,
      };
    }
    if (hit === "target") {
      const reward = Math.abs(target - entry);
      return {
        outcome: "target_hit",
        bars_to_outcome: i + 1,
        mfe: Number(mfe.toFixed(6)),
        mae: Number(mae.toFixed(6)),
        realized_r: risk > 0 ? Number((reward / risk).toFixed(3)) : null,
      };
    }
  }

  return {
    outcome: "expired",
    bars_to_outcome: bars.length,
    mfe: Number(mfe.toFixed(6)),
    mae: Number(mae.toFixed(6)),
    realized_r: 0,
  };
}
