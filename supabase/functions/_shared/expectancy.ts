import { feeCostR as outcomeFeeCostR } from "./outcome.ts";
import type { TradePlan } from "./tradePlan.ts";

export type ExpectancyResult = {
  /** EV in R-multiples: p·R_win − (1−p)·1 − cost_R. Positive means the setup pays on average. */
  ev_r: number;
  /** Hit rate this plan needs just to break even given its R:R and fees. */
  breakeven_hit_rate: number;
  /** Calibrated probability used for the EV (0–1). Null when no calibration exists. */
  p: number | null;
  /** Wilson 95% CI lower bound on p. Null when n is too small. */
  p_ci_low: number | null;
  /** Wilson 95% CI upper bound on p. */
  p_ci_high: number | null;
  /** Sample size the probability was estimated from. */
  n: number;
  /** Reward-to-risk of the nearest target. */
  reward_r: number | null;
  /** Round-trip fee expressed in R. */
  cost_r: number;
  /** TAKE when EV > 0 with usable p; SKIP when EV ≤ 0; WAIT when the plan has no directional bias. */
  verdict: "TAKE" | "SKIP" | "WAIT";
  /** One-line explanation for the UI. */
  summary: string;
};

function finite(value: unknown): number | null {
  // `Number(null)` is 0 and `Number("")` is 0, both of which are finite — so a null stop or a null
  // target price would sail through as the price level 0 and produce an EV computed against a
  // level that does not exist. Reject the empty cases before coercing.
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function entryMid(plan: TradePlan): number | null {
  if (!plan.entry_zone) return null;
  const low = finite(plan.entry_zone.low);
  const high = finite(plan.entry_zone.high);
  if (low == null || high == null) return null;
  return (low + high) / 2;
}

/** Round-trip fee cost expressed in R for a given entry and stop. */
export function feeCostR(entry: number, risk: number): number {
  return outcomeFeeCostR(entry, risk);
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * Prefer this over ±1.96·√(p̂(1−p̂)/n) when n is small — the normal approximation understates
 * uncertainty near 0 and 1, which is exactly where thin calibration samples live.
 */
export function wilsonInterval(
  hits: number,
  n: number,
  z = 1.96,
): { low: number; high: number } | null {
  if (n <= 0 || hits < 0 || hits > n) return null;
  const phat = hits / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return {
    low: Math.max(0, (centre - margin) / denom),
    high: Math.min(1, (centre + margin) / denom),
  };
}

/** Hit rate required for EV = 0 given reward R and fee cost in R. */
export function breakevenHitRate(rewardR: number, costR = 0): number {
  if (rewardR <= 0) return 1;
  // p·R − (1−p)·1 − c = 0  →  p·(R+1) = 1+c  →  p = (1+c)/(R+1)
  return Number(((1 + costR) / (rewardR + 1)).toFixed(4));
}

/**
 * Compute expected value for a trade plan given a calibrated hit rate.
 *
 * `p` should come from Phase 0.6 setup×regime calibration. When it is null the verdict is WAIT
 * rather than inventing a probability — inventing one is how the old Market Summary 95% lied.
 */
export function computeExpectancy(
  plan: TradePlan,
  opts: {
    p: number | null;
    n?: number;
    hits?: number;
  },
): ExpectancyResult {
  if (plan.bias === "wait") {
    return {
      ev_r: 0,
      breakeven_hit_rate: 0,
      p: null,
      p_ci_low: null,
      p_ci_high: null,
      n: opts.n ?? 0,
      reward_r: null,
      cost_r: 0,
      verdict: "WAIT",
      summary: "No directional plan — standing aside.",
    };
  }

  const mid = entryMid(plan);
  const stop = finite(plan.stop_loss);
  const target = finite(plan.targets?.[0]?.price);
  const rewardR = finite(plan.targets?.[0]?.risk_reward);

  let costR = 0;
  let resolvedReward = rewardR;
  if (mid != null && stop != null) {
    const risk = Math.abs(mid - stop);
    costR = feeCostR(mid, risk);
    if (resolvedReward == null && target != null && risk > 0) {
      resolvedReward = Math.abs(target - mid) / risk;
    }
  }

  const be = resolvedReward != null ? breakevenHitRate(resolvedReward, costR) : 1;
  const n = opts.n ?? 0;
  const p = opts.p;

  let ci: { low: number; high: number } | null = null;
  if (opts.hits != null && n > 0) {
    ci = wilsonInterval(opts.hits, n);
  } else if (p != null && n > 0) {
    // Reconstruct hits from the rate when only p and n are known.
    ci = wilsonInterval(Math.round(p * n), n);
  }

  if (p == null || resolvedReward == null) {
    return {
      ev_r: 0,
      breakeven_hit_rate: be,
      p,
      p_ci_low: ci?.low ?? null,
      p_ci_high: ci?.high ?? null,
      n,
      reward_r: resolvedReward != null ? Number(resolvedReward.toFixed(3)) : null,
      cost_r: Number(costR.toFixed(4)),
      verdict: "WAIT",
      summary: p == null
        ? "No calibrated hit rate yet — cannot compute expected value."
        : "Plan lacks a usable reward-to-risk — cannot compute expected value.",
    };
  }

  const ev = p * resolvedReward - (1 - p) * 1 - costR;
  const verdict: ExpectancyResult["verdict"] = ev > 0 ? "TAKE" : "SKIP";
  const pct = (p * 100).toFixed(1);
  const bePct = (be * 100).toFixed(1);
  const summary = verdict === "TAKE"
    ? `EV +${ev.toFixed(2)}R — needs ${bePct}% to break even; calibrated hit rate is ${pct}% (n=${n}).`
    : `EV ${ev.toFixed(2)}R — needs ${bePct}% to break even; calibrated hit rate is only ${pct}% (n=${n}).`;

  return {
    ev_r: Number(ev.toFixed(3)),
    breakeven_hit_rate: be,
    p,
    p_ci_low: ci?.low != null ? Number(ci.low.toFixed(4)) : null,
    p_ci_high: ci?.high != null ? Number(ci.high.toFixed(4)) : null,
    n,
    reward_r: Number(resolvedReward.toFixed(3)),
    cost_r: Number(costR.toFixed(4)),
    verdict,
    summary,
  };
}
