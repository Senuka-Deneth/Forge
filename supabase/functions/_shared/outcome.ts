import type { TradePlan } from "./tradePlan.ts";

export const ROUND_TRIP_COST = 0.001;
export const FILL_WINDOW_BARS = 20;
/** v3 scores the full partial-TP ladder rather than only targets[0]. */
export const SCORING_VERSION = 3;

export type LadderStepResult = {
  label: string;
  fraction: number;
  hit: boolean;
  realized_r: number | null;
};

export type ScoredOutcome = {
  outcome: "stop_hit" | "target_hit" | "expired" | "no_fill" | "pending" | "invalid";
  bars_to_outcome: number | null;
  filled_at_bar: number | null;
  mfe: number | null;
  mae: number | null;
  realized_r: number | null;
  scoring_version: number;
  /** Per-target fill fractions realized before stop/expiry (v3). */
  ladder?: LadderStepResult[];
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

export function feeCostR(entry: number, risk: number): number {
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

/**
 * Default partial fractions for the scoring ladder.
 *
 * tradeManagement describes a 50% / 25%+runner style plan in prose; for a two-target plan the
 * scorer uses [0.5, 0.5] so the second target stands in for the runner remainder. Three-or-more
 * targets use [0.5, 0.25, …, remainder on last]. Expiry is measured from forward[0] (analysis
 * time), not from fill — a deliberate modeling choice so unfilled plans still age out on a fixed
 * horizon; do not bump SCORING_VERSION solely to retarget the clock at fill.
 */
function defaultFractions(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [1];
  if (count === 2) return [0.5, 0.5];
  const fracs = [0.5, 0.25];
  const rest = 1 - 0.5 - 0.25;
  for (let i = 2; i < count - 1; i += 1) fracs.push(0);
  fracs.push(rest);
  // If more than 3 targets, put remainder on the last one and zero the middle extras.
  if (count > 3) {
    const out = new Array(count).fill(0);
    out[0] = 0.5;
    out[1] = 0.25;
    out[count - 1] = 0.25;
    return out;
  }
  return fracs;
}

/**
 * Score a plan against forward candles.
 *
 * v3 walks a partial-TP ladder: each target locks in its fraction of R when hit; a subsequent
 * stop realizes −1R only on the *remaining* size. A single-target plan behaves identically to v2
 * (full size at T1), so existing calibration rows remain comparable when `scoring_version` is
 * filtered.
 */
export function scorePlanAgainstCandles(
  plan: TradePlan,
  forward: Array<{ high: number; low: number }>,
  expireBars = 100,
): ScoredOutcome {
  const emptyExtras = { filled_at_bar: null as number | null, scoring_version: SCORING_VERSION };

  if (!forward.length) {
    return { outcome: "pending", bars_to_outcome: null, mfe: null, mae: null, realized_r: null, ...emptyExtras };
  }

  if (plan.bias === "wait") {
    return { outcome: "invalid", bars_to_outcome: null, mfe: null, mae: null, realized_r: null, ...emptyExtras };
  }

  const stop = Number(plan.stop_loss);
  const entryLow = Number(plan.entry_zone?.low);
  const entryHigh = Number(plan.entry_zone?.high);
  const targets = (plan.targets ?? [])
    .map((t, i) => ({ label: t.label || `T${i + 1}`, price: Number(t.price) }))
    .filter((t) => Number.isFinite(t.price));

  if (plan.stop_loss == null || plan.entry_zone == null || !targets.length ||
    ![stop, entryLow, entryHigh].every(Number.isFinite)) {
    return { outcome: "invalid", bars_to_outcome: null, mfe: null, mae: null, realized_r: null, ...emptyExtras };
  }

  const entry = (entryLow + entryHigh) / 2;
  const isLong = plan.bias === "long";
  const risk = Math.abs(entry - stop);
  const costR = feeCostR(entry, risk);
  const fillWindow = Math.min(FILL_WINDOW_BARS, expireBars);
  const fractions = defaultFractions(targets.length);

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
      ladder: targets.map((t, i) => ({
        label: t.label,
        fraction: fractions[i],
        hit: false,
        realized_r: null,
      })),
    };
  }

  let mfe = 0;
  let mae = 0;
  let remaining = 1;
  let lockedR = 0;
  const ladder: LadderStepResult[] = targets.map((t, i) => ({
    label: t.label,
    fraction: fractions[i],
    hit: false,
    realized_r: null,
  }));
  let nextTargetIdx = 0;
  const bars = forward.slice(fillBar, expireBars);

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    const fav = isLong ? bar.high - entry : entry - bar.low;
    const adv = isLong ? entry - bar.low : bar.high - entry;
    mfe = Math.max(mfe, fav);
    mae = Math.max(mae, adv);

    // Check stop against remaining size first (conservative: same-bar stop+target → stop).
    const stopHit = isLong ? bar.low <= stop : bar.high >= stop;
    if (stopHit && remaining > 0) {
      const stopR = -1 * remaining;
      return {
        outcome: "stop_hit",
        bars_to_outcome: fillBar + i + 1,
        filled_at_bar: fillBar,
        mfe: Number(mfe.toFixed(6)),
        mae: Number(mae.toFixed(6)),
        realized_r: risk > 0 ? Number((lockedR + stopR - costR).toFixed(3)) : null,
        scoring_version: SCORING_VERSION,
        ladder,
      };
    }

    // Walk targets in order; a single bar can fill multiple if it spans them.
    while (nextTargetIdx < targets.length) {
      const t = targets[nextTargetIdx];
      const targetHit = isLong ? bar.high >= t.price : bar.low <= t.price;
      if (!targetHit) break;

      const frac = fractions[nextTargetIdx];
      const reward = risk > 0 ? Math.abs(t.price - entry) / risk : 0;
      const stepR = reward * frac;
      lockedR += stepR;
      remaining = Math.max(0, remaining - frac);
      ladder[nextTargetIdx] = {
        label: t.label,
        fraction: frac,
        hit: true,
        realized_r: Number(stepR.toFixed(3)),
      };
      nextTargetIdx += 1;
    }

    if (remaining <= 1e-9) {
      return {
        outcome: "target_hit",
        bars_to_outcome: fillBar + i + 1,
        filled_at_bar: fillBar,
        mfe: Number(mfe.toFixed(6)),
        mae: Number(mae.toFixed(6)),
        realized_r: risk > 0 ? Number((lockedR - costR).toFixed(3)) : null,
        scoring_version: SCORING_VERSION,
        ladder,
      };
    }
  }

  // Expired with leftover size: remaining marked to zero (flat exit) — fees still apply.
  // Partially filled ladder still counts the locked R.
  const anyHit = ladder.some((s) => s.hit);
  return {
    outcome: anyHit && remaining < 1 ? "target_hit" : "expired",
    bars_to_outcome: fillBar + bars.length,
    filled_at_bar: fillBar,
    mfe: Number(mfe.toFixed(6)),
    mae: Number(mae.toFixed(6)),
    realized_r: risk > 0 ? Number((lockedR - costR).toFixed(3)) : null,
    scoring_version: SCORING_VERSION,
    ladder,
  };
}
