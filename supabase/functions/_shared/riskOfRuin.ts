/**
 * Risk of ruin — "will this position size kill me before my edge shows up?"
 *
 * Every other number in Forge answers whether a *trade* is worth taking. None of them answer
 * whether the trader survives long enough to collect. Those are different questions with different
 * answers: a strategy with a genuine +0.3R edge, risking 5% per trade, has a comfortably positive
 * expectancy and still ruins a meaningful fraction of the people who run it. Expectancy is an
 * average over infinite trades; ruin is a property of the path.
 *
 * The default method is a **bootstrap** over the trader's own realized R history rather than a
 * parametric win/loss model, because the parametric model is wrong in exactly the way that
 * matters. It assumes every loss is −1R. Real losses include slippage past the stop, gaps, and
 * manual exits; real wins include partial-ladder fills that land at +0.4R rather than +2R. That
 * left tail is precisely what drives ruin, and resampling the actual history keeps it.
 *
 * Everything is seeded, so the same inputs always produce the same numbers. A risk figure that
 * flickered on every page refresh would be worse than useless — it would be untrustworthy.
 */

/**
 * Mulberry32 — small, fast, well-distributed 32-bit PRNG.
 *
 * Deliberately not Math.random(): these results must be reproducible across a reload, across the
 * server and the browser, and inside a test.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Percentile of an unsorted numeric array by linear interpolation. */
export function percentile(values: number[], q: number): number | null {
  const usable = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];
  const clamped = Math.min(1, Math.max(0, q));
  const index = clamped * (usable.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return usable[low];
  return usable[low] + (usable[high] - usable[low]) * (index - low);
}

export type RuinInput = {
  /** Realized R-multiples from past trades. Preferred input — captures the real left tail. */
  rSamples?: number[] | null;
  /** Parametric fallback: hit rate. Used only when rSamples is absent. */
  p?: number | null;
  /** Parametric fallback: reward in R on a win. */
  rewardR?: number | null;
  /** Risk per trade as a percent of equity. */
  riskPct: number;
  /** Horizon in trades. */
  trades?: number;
  simulations?: number;
  /** Drawdown from starting equity that counts as ruin, in percent. */
  ruinDrawdownPct?: number;
  seed?: number;
  /**
   * Risk a fixed percent of *current* equity (true) or of *starting* equity (false).
   *
   * True is the honest default because it is what a percentage-based rule actually does: losing
   * shrinks the next bet. It makes literal ruin rarer but deep drawdowns longer to climb out of,
   * since recovery bets are smaller too.
   */
  compounding?: boolean;
};

export type RuinResult = {
  method: "bootstrap" | "parametric";
  simulations: number;
  trades: number;
  risk_pct: number;
  /** Share of paths that breached the ruin threshold at any point. */
  p_ruin: number;
  /** Share of paths that finished above starting equity. */
  p_profitable: number;
  median_max_drawdown_pct: number;
  p95_max_drawdown_pct: number;
  worst_max_drawdown_pct: number;
  /** Final equity as a multiple of starting equity. */
  median_final_multiple: number;
  p05_final_multiple: number;
  p95_final_multiple: number;
  /** Median of each path's longest consecutive losing run — the streak to be ready for. */
  median_longest_losing_streak: number;
  /** Mean R per trade of the sampled distribution. */
  sample_expectancy_r: number;
  sample_size: number;
  summary: string;
};

const MIN_SAMPLES = 20;

function drawSampler(input: RuinInput, rand: () => number): { draw: () => number; method: "bootstrap" | "parametric"; samples: number[] } | null {
  const samples = (input.rSamples ?? []).filter((r) => Number.isFinite(r));
  if (samples.length >= MIN_SAMPLES) {
    return {
      method: "bootstrap",
      samples,
      draw: () => samples[Math.floor(rand() * samples.length)],
    };
  }

  const p = Number(input.p);
  const rewardR = Number(input.rewardR);
  if (Number.isFinite(p) && p > 0 && p < 1 && Number.isFinite(rewardR) && rewardR > 0) {
    return {
      method: "parametric",
      samples: [],
      draw: () => (rand() < p ? rewardR : -1),
    };
  }
  return null;
}

/**
 * Simulate equity paths and measure how many of them end the trader.
 *
 * Returns null when there is neither enough R history to bootstrap nor a usable parametric
 * fallback. Same contract as the rest of Forge: no sample, no number.
 */
export function simulateRiskOfRuin(input: RuinInput): RuinResult | null {
  const riskPct = Number(input.riskPct);
  if (!Number.isFinite(riskPct) || riskPct <= 0) return null;

  const trades = Math.max(1, Math.floor(Number(input.trades) || 200));
  const simulations = Math.max(1, Math.floor(Number(input.simulations) || 2000));
  const ruinDrawdownPct = Number.isFinite(Number(input.ruinDrawdownPct))
    ? Number(input.ruinDrawdownPct)
    : 50;
  const compounding = input.compounding !== false;
  const riskFraction = riskPct / 100;
  const ruinLevel = 1 - ruinDrawdownPct / 100;

  const rand = mulberry32(Number.isFinite(Number(input.seed)) ? Number(input.seed) : 0xF0);
  const sampler = drawSampler(input, rand);
  if (!sampler) return null;

  const maxDrawdowns: number[] = [];
  const finals: number[] = [];
  const streaks: number[] = [];
  let ruined = 0;
  let profitable = 0;
  let rSum = 0;
  let rCount = 0;

  for (let sim = 0; sim < simulations; sim += 1) {
    let equity = 1;
    let peak = 1;
    let maxDrawdown = 0;
    let losingStreak = 0;
    let longestStreak = 0;
    let hitRuin = false;

    for (let t = 0; t < trades; t += 1) {
      const r = sampler.draw();
      rSum += r;
      rCount += 1;

      // Fixed-fractional: the stake is a share of current equity, so it shrinks after losses.
      // Non-compounding risks a constant share of the *starting* equity instead.
      const stake = compounding ? equity * riskFraction : riskFraction;
      equity += stake * r;

      if (r < 0) {
        losingStreak += 1;
        if (losingStreak > longestStreak) longestStreak = losingStreak;
      } else {
        losingStreak = 0;
      }

      // A single outlier can drive equity negative when risk is large (10% risk on a −12R gap).
      // Clamp at zero and stop: there is no trading back from a blown account.
      if (equity <= 0) {
        equity = 0;
        maxDrawdown = 1;
        hitRuin = true;
        break;
      }

      if (equity > peak) peak = equity;
      const drawdown = (peak - equity) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      if (equity <= ruinLevel) hitRuin = true;
    }

    if (hitRuin) ruined += 1;
    if (equity > 1) profitable += 1;
    maxDrawdowns.push(maxDrawdown * 100);
    finals.push(equity);
    streaks.push(longestStreak);
  }

  const pRuin = ruined / simulations;
  const medianDd = percentile(maxDrawdowns, 0.5) ?? 0;
  const p95Dd = percentile(maxDrawdowns, 0.95) ?? 0;
  const medianFinal = percentile(finals, 0.5) ?? 1;
  const medianStreak = percentile(streaks, 0.5) ?? 0;
  const expectancy = rCount > 0 ? rSum / rCount : 0;

  const summary = pRuin > 0.05
    ? `Risking ${riskPct}% per trade, ${(pRuin * 100).toFixed(1)}% of ${simulations} simulated ${trades}-trade paths lost ${ruinDrawdownPct}% of the account. Median worst drawdown ${medianDd.toFixed(1)}%, and 1 in 20 paths saw ${p95Dd.toFixed(1)}%. This size is too large for this distribution.`
    : `Risking ${riskPct}% per trade, ${(pRuin * 100).toFixed(1)}% of paths hit the ${ruinDrawdownPct}% ruin threshold over ${trades} trades. Expect a worst drawdown near ${medianDd.toFixed(1)}% and be ready for ${p95Dd.toFixed(1)}% — plus a losing run of about ${Math.round(medianStreak)} trades.`;

  return {
    method: sampler.method,
    simulations,
    trades,
    risk_pct: riskPct,
    p_ruin: Number(pRuin.toFixed(4)),
    p_profitable: Number((profitable / simulations).toFixed(4)),
    median_max_drawdown_pct: Number(medianDd.toFixed(2)),
    p95_max_drawdown_pct: Number(p95Dd.toFixed(2)),
    worst_max_drawdown_pct: Number(Math.max(...maxDrawdowns).toFixed(2)),
    median_final_multiple: Number(medianFinal.toFixed(4)),
    p05_final_multiple: Number((percentile(finals, 0.05) ?? 0).toFixed(4)),
    p95_final_multiple: Number((percentile(finals, 0.95) ?? 0).toFixed(4)),
    median_longest_losing_streak: Math.round(medianStreak),
    sample_expectancy_r: Number(expectancy.toFixed(4)),
    sample_size: sampler.samples.length,
    summary,
  };
}

/**
 * Largest risk-per-trade that keeps the probability of ruin under `tolerance`.
 *
 * This is the number worth acting on. "Your history supports at most 1.4% per trade" is a decision;
 * "your risk of ruin is 8%" is trivia.
 *
 * Binary search over risk works because P(ruin) is monotonically non-decreasing in position size,
 * and the shared seed keeps every probe drawing the same sequence of trades — so the comparison
 * across candidate sizes is like-for-like rather than a race between different random draws.
 */
export function solveMaxRiskPct(
  input: Omit<RuinInput, "riskPct">,
  opts: { tolerance?: number; maxRiskPct?: number; iterations?: number } = {},
): { risk_pct: number; p_ruin_at_risk: number; tolerance: number } | null {
  const tolerance = Number.isFinite(Number(opts.tolerance)) ? Number(opts.tolerance) : 0.01;
  const ceiling = Number.isFinite(Number(opts.maxRiskPct)) ? Number(opts.maxRiskPct) : 10;
  const iterations = Math.max(4, Math.floor(Number(opts.iterations) || 14));

  const probe = (riskPct: number) => simulateRiskOfRuin({ ...input, riskPct });

  const floorProbe = probe(0.05);
  if (!floorProbe) return null;

  // If even the smallest size ruins, the distribution itself is the problem, not the sizing.
  if (floorProbe.p_ruin > tolerance) {
    return { risk_pct: 0, p_ruin_at_risk: floorProbe.p_ruin, tolerance };
  }

  // A negative-expectancy distribution has no safe size, and the ruin search alone will not say so:
  // at a small enough stake a losing strategy simply bleeds too slowly to breach the threshold
  // inside the horizon, and the binary search happily reports that stake as "safe". It is not safe,
  // it is slow. The correct size for a negative edge is zero, and lengthening the horizon would
  // ruin every one of these paths.
  if (floorProbe.sample_expectancy_r <= 0) {
    return { risk_pct: 0, p_ruin_at_risk: floorProbe.p_ruin, tolerance };
  }

  let low = 0.05;
  let high = ceiling;
  let bestRisk = low;
  let bestP = floorProbe.p_ruin;

  for (let i = 0; i < iterations; i += 1) {
    const mid = (low + high) / 2;
    const result = probe(mid);
    if (!result) break;
    if (result.p_ruin <= tolerance) {
      bestRisk = mid;
      bestP = result.p_ruin;
      low = mid;
    } else {
      high = mid;
    }
  }

  return {
    // Floor, never round to nearest: `toFixed` would round 3.4457 up to 3.45, reporting a size
    // fractionally larger than the one the search actually verified. Same rule as position sizing —
    // rounding must always land on the safer side.
    risk_pct: Math.floor(bestRisk * 100) / 100,
    p_ruin_at_risk: Number(bestP.toFixed(4)),
    tolerance,
  };
}
