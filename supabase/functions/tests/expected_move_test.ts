import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assessTargetFeasibility,
  BROWNIAN_RANGE_FACTOR,
  expectedMove,
  normalCdf,
  realizedSigmaPerBar,
  sigmaFromAtr,
  targetBeforeStopProbability,
  touchProbability,
} from "../_shared/expectedMove.ts";

Deno.test("normalCdf matches known values of the standard normal", () => {
  assertAlmostEquals(normalCdf(0), 0.5, 1e-7);
  assertAlmostEquals(normalCdf(1), 0.8413447, 1e-6);
  assertAlmostEquals(normalCdf(-1), 0.1586553, 1e-6);
  assertAlmostEquals(normalCdf(1.96), 0.9750021, 1e-6);
  assertAlmostEquals(normalCdf(-2.5), 0.0062097, 1e-6);
});

Deno.test("normalCdf is symmetric about zero", () => {
  for (const z of [0.3, 1.1, 2.7, 4.0]) {
    assertAlmostEquals(normalCdf(z) + normalCdf(-z), 1, 1e-6);
  }
});

Deno.test("realizedSigmaPerBar recovers the volatility of a synthetic series", () => {
  // Deterministic alternating ±1% log returns: every return is 0.01 from a mean of 0,
  // so the sample stdev is essentially 0.01.
  const closes = [100];
  for (let i = 1; i < 200; i += 1) {
    closes.push(closes[i - 1] * Math.exp(i % 2 === 0 ? 0.01 : -0.01));
  }
  const sigma = realizedSigmaPerBar(closes)!;
  assertAlmostEquals(sigma, 0.01, 5e-4);
});

Deno.test("realizedSigmaPerBar returns null on thin or invalid history", () => {
  assertEquals(realizedSigmaPerBar([100, 101, 102]), null);
  assertEquals(realizedSigmaPerBar([]), null);
  // A flat series has zero volatility, which is not a usable sigma.
  assertEquals(realizedSigmaPerBar(new Array(120).fill(100)), null);
});

Deno.test("sigmaFromAtr inverts the Brownian range factor", () => {
  const price = 100;
  const sigma = 0.02;
  // A path with per-bar sigma of 2% has an expected range of sigma * sqrt(8/pi).
  const impliedAtr = price * sigma * BROWNIAN_RANGE_FACTOR;
  assertAlmostEquals(sigmaFromAtr(impliedAtr, price)!, sigma, 1e-9);
});

Deno.test("sigmaFromAtr rejects non-positive inputs", () => {
  assertEquals(sigmaFromAtr(0, 100), null);
  assertEquals(sigmaFromAtr(5, 0), null);
  assertEquals(sigmaFromAtr(Number.NaN, 100), null);
});

Deno.test("expectedMove scales with the square root of time, not with time", () => {
  const one = expectedMove(100, 0.01, 25)!;
  const four = expectedMove(100, 0.01, 100)!;
  // 4x the bars must be 2x the sigma.
  assertAlmostEquals(four.sigma_horizon_pct / one.sigma_horizon_pct, 2, 1e-6);
  assertAlmostEquals(one.sigma_horizon_pct, 5, 1e-6);
});

Deno.test("expectedMove bands are multiplicatively symmetric and stay positive", () => {
  const move = expectedMove(100, 0.05, 100)!;
  // 50% horizon sigma: a linear band would put 2 sigma below zero.
  assertEquals(move.two_sigma_low > 0, true);
  assertAlmostEquals(move.one_sigma_high * move.one_sigma_low, 100 * 100, 1e-3);
});

Deno.test("expectedMove rejects invalid inputs", () => {
  assertEquals(expectedMove(0, 0.01, 100), null);
  assertEquals(expectedMove(100, 0, 100), null);
  assertEquals(expectedMove(100, 0.01, 0), null);
});

Deno.test("touchProbability follows the reflection principle", () => {
  // P(touch d) = 2*Phi(-d/sigma_T)
  assertAlmostEquals(touchProbability(0.10, 0.10), 2 * normalCdf(-1), 1e-6);
  assertAlmostEquals(touchProbability(0.20, 0.10), 2 * normalCdf(-2), 1e-6);
  // A barrier at zero distance is already touched.
  assertEquals(touchProbability(0, 0.1), 1);
});

Deno.test("touchProbability is bounded and direction-agnostic", () => {
  // Sign of the distance must not matter — a stop below and a target above are both barriers.
  assertAlmostEquals(touchProbability(-0.05, 0.1), touchProbability(0.05, 0.1), 1e-12);
  assertEquals(touchProbability(0.001, 0.5) <= 1, true);
  assertEquals(touchProbability(10, 0.01) >= 0, true);
});

Deno.test("touchProbability matches a Monte Carlo random walk", () => {
  // Independent check that the analytic formula is right: simulate driftless walks and count
  // how many touch the barrier. Uses a seeded LCG so the assertion is deterministic.
  let seed = 12345;
  const nextUniform = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const gaussian = () => {
    // Box-Muller.
    const u1 = Math.max(nextUniform(), 1e-12);
    const u2 = nextUniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const bars = 100;
  const sigmaPerBar = 0.01;
  const barrier = 0.10; // 1 sigma of the horizon (0.01 * sqrt(100) = 0.10)
  const trials = 20_000;
  let touched = 0;
  for (let t = 0; t < trials; t += 1) {
    let x = 0;
    for (let i = 0; i < bars; i += 1) {
      x += gaussian() * sigmaPerBar;
      if (x >= barrier) { touched += 1; break; }
    }
  }
  const empirical = touched / trials;
  const analytic = touchProbability(barrier, sigmaPerBar * Math.sqrt(bars));
  // Discrete sampling slightly undercounts touches (a path can cross and return between bars),
  // so allow a modest tolerance.
  assertAlmostEquals(empirical, analytic, 0.03);
});

Deno.test("targetBeforeStopProbability is the gambler's-ruin ratio", () => {
  // Symmetric bracket: 50/50.
  assertAlmostEquals(targetBeforeStopProbability(100, 99, 101)!, 0.5, 0.01);
  // A 3R target has roughly a 25% geometric chance.
  const p = targetBeforeStopProbability(100, 99, 103)!;
  assertAlmostEquals(p, 0.25, 0.01);
});

Deno.test("targetBeforeStopProbability rejects invalid prices", () => {
  assertEquals(targetBeforeStopProbability(100, 0, 110), null);
  assertEquals(targetBeforeStopProbability(100, 99, 100), null);
});

Deno.test("assessTargetFeasibility passes a realistic target", () => {
  // 1% per bar over 100 bars = 10% horizon sigma. A 5% target is 0.5 sigma away.
  const result = assessTargetFeasibility({
    entry: 100,
    stop: 97,
    targets: [{ label: "T1", price: 105 }],
    sigmaPerBar: 0.01,
    bars: 100,
  })!;
  assertEquals(result.flagged, false);
  assertEquals(result.targets[0].reachable, true);
  assertEquals(result.targets[0].touch_probability > 0.5, true);
  assertEquals(result.stop_touch_probability != null, true);
});

Deno.test("assessTargetFeasibility flags a target beyond the horizon", () => {
  // 0.2% per bar over 100 bars = 2% horizon sigma. A 10% target is 5 sigma away.
  const result = assessTargetFeasibility({
    entry: 100,
    stop: 99,
    targets: [{ label: "T1", price: 110 }],
    sigmaPerBar: 0.002,
    bars: 100,
  })!;
  assertEquals(result.flagged, true);
  assertEquals(result.targets[0].reachable, false);
  assertEquals(result.targets[0].touch_probability < 0.01, true);
  assertEquals(result.summary.includes("expires"), true);
});

Deno.test("assessTargetFeasibility flags only on the nearest target", () => {
  // T1 is comfortably reachable; the T3 runner is not. A ladder must not be flagged for that.
  const result = assessTargetFeasibility({
    entry: 100,
    stop: 98,
    targets: [
      { label: "T1", price: 103 },
      { label: "T2", price: 110 },
      { label: "T3", price: 160 },
    ],
    sigmaPerBar: 0.01,
    bars: 100,
  })!;
  assertEquals(result.flagged, false);
  assertEquals(result.targets[0].reachable, true);
  assertEquals(result.targets[2].reachable, false);
});

Deno.test("assessTargetFeasibility skips null target prices", () => {
  const result = assessTargetFeasibility({
    entry: 100,
    stop: 98,
    targets: [{ label: "T1", price: null }, { label: "T2", price: 105 }],
    sigmaPerBar: 0.01,
    bars: 100,
  })!;
  assertEquals(result.targets.length, 1);
  assertEquals(result.targets[0].label, "T2");
});

Deno.test("assessTargetFeasibility handles a plan with no priced targets", () => {
  const result = assessTargetFeasibility({
    entry: 100,
    stop: 98,
    targets: [{ label: "T1", price: null }],
    sigmaPerBar: 0.01,
    bars: 100,
  })!;
  assertEquals(result.targets.length, 0);
  assertEquals(result.flagged, false);
  assertEquals(result.geometric_p, null);
  assertEquals(result.summary.includes("No priced target"), true);
});

Deno.test("assessTargetFeasibility works for shorts", () => {
  const result = assessTargetFeasibility({
    entry: 100,
    stop: 103,
    targets: [{ label: "T1", price: 95 }],
    sigmaPerBar: 0.01,
    bars: 100,
  })!;
  assertEquals(result.flagged, false);
  assertEquals(result.targets[0].touch_probability > 0.5, true);
});

Deno.test("assessTargetFeasibility rejects invalid inputs", () => {
  assertEquals(
    assessTargetFeasibility({ entry: 0, stop: 98, targets: [], sigmaPerBar: 0.01, bars: 100 }),
    null,
  );
  assertEquals(
    assessTargetFeasibility({ entry: 100, stop: 98, targets: [], sigmaPerBar: 0, bars: 100 }),
    null,
  );
});
