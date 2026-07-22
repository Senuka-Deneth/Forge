/**
 * Expected move and target feasibility — "can this target even print before the time stop?"
 *
 * Forge already scores `expired` as an outcome, which means it measures this failure *after* the
 * fact and never predicts it. That is backwards. A 4R target on a 15m chart with a 100-bar time
 * stop is not an ambitious plan, it is an arithmetic impossibility, and it will be recorded as an
 * expiry rather than as the bad plan it was — quietly poisoning the calibration bucket it lands in.
 *
 * The model here is deliberately the most boring one available: a driftless random walk in log
 * price. That choice is the point.
 *
 *  - Zero drift is not a forecast that price goes nowhere. It is a refusal to claim a direction.
 *    Every directional opinion in Forge already lives in the trade plan and the calibrated hit
 *    rate; smuggling a second one in here would double-count it.
 *  - Real returns are fat-tailed, so the true probability of touching a *far* barrier is somewhat
 *    higher than the normal model says. The bias therefore runs toward calling ambitious targets
 *    unreachable slightly too often, which is the safe direction for a gate that blocks trades.
 *
 * These are reachability probabilities, not win rates. `touchProbability` answers "does price come
 * this far within N bars", nothing about the order of events or whether you were still in the
 * trade. The calibrated hit rate remains the only number Forge treats as a win probability.
 */

/** Expected high−low range of a driftless Brownian path over one unit of time, in units of σ. */
export const BROWNIAN_RANGE_FACTOR = Math.sqrt(8 / Math.PI); // ≈ 1.5958

/** E|X| for X ~ N(0, σ²), in units of σ. */
export const MEAN_ABS_FACTOR = Math.sqrt(2 / Math.PI); // ≈ 0.7979

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 error-function approximation.
 *
 * Max absolute error ~1.5e-7, which is several orders of magnitude finer than the modelling error
 * in treating crypto returns as Gaussian. Implemented here because Deno has no built-in erf.
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return Number.NaN;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  const erf = sign * y;
  return 0.5 * (1 + erf);
}

/**
 * Per-bar volatility of log returns.
 *
 * The preferred sigma source: it is measured from the same candles the plan was built on, so it
 * already reflects the current regime rather than a long-run average. Returns null below 20
 * usable returns — a sigma from 5 bars is noise wearing a number's clothes.
 */
export function realizedSigmaPerBar(closes: number[], lookback = 100): number | null {
  if (!Array.isArray(closes)) return null;
  const usable = closes.filter((c) => Number.isFinite(c) && c > 0);
  if (usable.length < 21) return null;

  const window = usable.slice(-Math.max(21, lookback + 1));
  const returns: number[] = [];
  for (let i = 1; i < window.length; i += 1) {
    returns.push(Math.log(window[i] / window[i - 1]));
  }
  if (returns.length < 20) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  // Sample variance (n−1): with n≈100 the difference from the population form is small, but this
  // is an estimate of an unknown parameter and the unbiased form is the correct one.
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const sigma = Math.sqrt(variance);
  return Number.isFinite(sigma) && sigma > 0 ? sigma : null;
}

/**
 * Fallback per-bar sigma derived from ATR.
 *
 * The expected high−low range of a driftless Brownian path over one bar is σ·√(8/π), so ATR (a
 * smoothed mean true range) divides by that factor to recover σ. True range also counts gaps,
 * which pushes ATR slightly above the pure intrabar range and makes this estimate marginally
 * conservative — fine for a fallback whose job is to exist when close history does not.
 */
export function sigmaFromAtr(atr: number, price: number): number | null {
  if (!Number.isFinite(atr) || !Number.isFinite(price)) return null;
  if (atr <= 0 || price <= 0) return null;
  return (atr / price) / BROWNIAN_RANGE_FACTOR;
}

export type ExpectedMove = {
  horizon_bars: number;
  sigma_per_bar_pct: number;
  /** σ·√N as a percent — the 1σ move over the whole horizon. */
  sigma_horizon_pct: number;
  /** E|move| over the horizon as a percent (σ_T·√(2/π)). */
  expected_abs_move_pct: number;
  one_sigma_high: number;
  one_sigma_low: number;
  two_sigma_high: number;
  two_sigma_low: number;
};

/**
 * Project the expected move over a horizon.
 *
 * Volatility scales with √time, not time — the single most commonly botched step in this kind of
 * projection. Four times the bars is twice the expected move, not four times.
 */
export function expectedMove(
  price: number,
  sigmaPerBar: number,
  bars: number,
): ExpectedMove | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(sigmaPerBar) || sigmaPerBar <= 0) return null;
  if (!Number.isFinite(bars) || bars <= 0) return null;

  const sigmaHorizon = sigmaPerBar * Math.sqrt(bars);
  // Bands are built in log space and exponentiated, so the upper and lower bounds are
  // multiplicatively symmetric — price cannot go negative at 2σ on a volatile alt.
  return {
    horizon_bars: bars,
    sigma_per_bar_pct: Number((sigmaPerBar * 100).toFixed(4)),
    sigma_horizon_pct: Number((sigmaHorizon * 100).toFixed(4)),
    expected_abs_move_pct: Number((sigmaHorizon * MEAN_ABS_FACTOR * 100).toFixed(4)),
    one_sigma_high: Number((price * Math.exp(sigmaHorizon)).toFixed(8)),
    one_sigma_low: Number((price * Math.exp(-sigmaHorizon)).toFixed(8)),
    two_sigma_high: Number((price * Math.exp(2 * sigmaHorizon)).toFixed(8)),
    two_sigma_low: Number((price * Math.exp(-2 * sigmaHorizon)).toFixed(8)),
  };
}

/**
 * Probability that a driftless walk touches a barrier `logDistance` away within the horizon.
 *
 * This is the reflection principle: for Brownian motion, P(max over [0,T] ≥ d) = 2·Φ(−d/σ_T). The
 * factor of two is what separates a *touch* probability from a *terminal* probability, and it is
 * the reason a target can be far more likely to trade than a naive "where does price end up"
 * calculation suggests. Ignoring it understates every target.
 */
export function touchProbability(logDistance: number, sigmaHorizon: number): number {
  const d = Math.abs(logDistance);
  if (!Number.isFinite(d) || !Number.isFinite(sigmaHorizon) || sigmaHorizon <= 0) return Number.NaN;
  if (d === 0) return 1;
  const p = 2 * normalCdf(-d / sigmaHorizon);
  return Math.min(1, Math.max(0, p));
}

/**
 * Probability the target is reached before the stop, ignoring the time limit.
 *
 * Gambler's ruin for a driftless walk: the odds are simply the inverse ratio of the distances, so
 * a 3R target has a 25% geometric chance regardless of anything Forge believes about the setup.
 *
 * This is the null hypothesis, and its value is as a contrast. When the calibrated hit rate is not
 * meaningfully above this number, the "edge" being claimed is just the geometry of the bracket.
 */
export function targetBeforeStopProbability(
  entry: number,
  stop: number,
  target: number,
): number | null {
  if (![entry, stop, target].every((v) => Number.isFinite(v) && v > 0)) return null;
  const stopDistance = Math.abs(Math.log(entry / stop));
  const targetDistance = Math.abs(Math.log(target / entry));
  // A target or stop sitting on the entry is a degenerate bracket, not a certainty. Returning the
  // ratio here would hand back 1.0 for a zero-reward plan and read as a sure thing downstream.
  if (stopDistance <= 0 || targetDistance <= 0) return null;
  return Number((stopDistance / (stopDistance + targetDistance)).toFixed(4));
}

export type TargetReachability = {
  label: string;
  price: number;
  distance_pct: number;
  /** Distance in units of the horizon sigma. Above ~2 is a fantasy target. */
  distance_sigma: number;
  touch_probability: number;
  reachable: boolean;
};

export type FeasibilityAssessment = {
  horizon_bars: number;
  sigma_horizon_pct: number;
  expected_abs_move_pct: number;
  targets: TargetReachability[];
  stop_touch_probability: number | null;
  /** Geometric P(target before stop) for the nearest target — the no-edge baseline. */
  geometric_p: number | null;
  /** True when the nearest target is unlikely to trade inside the horizon. */
  flagged: boolean;
  summary: string;
};

/** Touch probability below this and the target is more likely to expire than to trade. */
export const REACHABLE_FLOOR = 0.2;

/**
 * Assess whether a plan's targets can be reached inside the scoring horizon.
 *
 * Only the *nearest* target drives the flag. Later targets in a ladder are runners by design and
 * are supposed to be a stretch; flagging a plan because its third target is ambitious would fire
 * on almost every well-built ladder.
 */
export function assessTargetFeasibility(input: {
  entry: number;
  stop: number | null;
  targets: Array<{ label: string; price: number | null }>;
  sigmaPerBar: number;
  bars: number;
  floor?: number;
}): FeasibilityAssessment | null {
  const { entry, sigmaPerBar, bars } = input;
  if (!Number.isFinite(entry) || entry <= 0) return null;
  if (!Number.isFinite(sigmaPerBar) || sigmaPerBar <= 0) return null;
  if (!Number.isFinite(bars) || bars <= 0) return null;

  const floor = Number.isFinite(input.floor as number) ? (input.floor as number) : REACHABLE_FLOOR;
  const sigmaHorizon = sigmaPerBar * Math.sqrt(bars);

  const targets: TargetReachability[] = [];
  for (const target of input.targets ?? []) {
    const price = Number(target?.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const logDistance = Math.abs(Math.log(price / entry));
    const p = touchProbability(logDistance, sigmaHorizon);
    targets.push({
      label: String(target.label ?? ""),
      price,
      distance_pct: Number((Math.abs(price - entry) / entry * 100).toFixed(4)),
      distance_sigma: Number((logDistance / sigmaHorizon).toFixed(4)),
      touch_probability: Number(p.toFixed(4)),
      reachable: p >= floor,
    });
  }

  let stopTouch: number | null = null;
  let geometric: number | null = null;
  const stop = Number(input.stop);
  if (Number.isFinite(stop) && stop > 0) {
    stopTouch = Number(touchProbability(Math.log(stop / entry), sigmaHorizon).toFixed(4));
    if (targets.length) {
      geometric = targetBeforeStopProbability(entry, stop, targets[0].price);
    }
  }

  const nearest = targets[0] ?? null;
  const flagged = nearest != null && !nearest.reachable;

  let summary: string;
  if (!nearest) {
    summary = `No priced target to assess. Expected move over ${bars} bars is ±${(sigmaHorizon * MEAN_ABS_FACTOR * 100).toFixed(2)}%.`;
  } else if (flagged) {
    summary =
      `${nearest.label || "T1"} sits ${nearest.distance_sigma.toFixed(2)}σ away — about a ${(nearest.touch_probability * 100).toFixed(0)}% chance of trading within the ${bars}-bar time stop. This plan expires far more often than it resolves.`;
  } else {
    summary =
      `${nearest.label || "T1"} is ${nearest.distance_sigma.toFixed(2)}σ away with roughly a ${(nearest.touch_probability * 100).toFixed(0)}% chance of trading inside ${bars} bars. Expected move over that horizon is ±${(sigmaHorizon * MEAN_ABS_FACTOR * 100).toFixed(2)}%.`;
  }

  return {
    horizon_bars: bars,
    sigma_horizon_pct: Number((sigmaHorizon * 100).toFixed(4)),
    expected_abs_move_pct: Number((sigmaHorizon * MEAN_ABS_FACTOR * 100).toFixed(4)),
    targets,
    stop_touch_probability: stopTouch,
    geometric_p: geometric,
    flagged,
    summary,
  };
}
