import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  mulberry32,
  percentile,
  simulateRiskOfRuin,
  solveMaxRiskPct,
} from "../_shared/riskOfRuin.ts";

/** A +EV distribution: 45% win at 2R, 55% lose 1R -> +0.35R expectancy. */
function edgeSamples(n = 200): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(i % 20 < 9 ? 2 : -1);
  return out;
}

/** A losing distribution: 30% win at 1R, 70% lose 1R -> -0.4R expectancy. */
function losingSamples(n = 200): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(i % 10 < 3 ? 1 : -1);
  return out;
}

Deno.test("mulberry32 is deterministic and stays in [0,1)", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i += 1) {
    const v = a();
    assertEquals(v, b());
    assertEquals(v >= 0 && v < 1, true);
  }
});

Deno.test("mulberry32 produces different streams for different seeds", () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  assertEquals(a() === b(), false);
});

Deno.test("mulberry32 has an approximately uniform mean", () => {
  const rand = mulberry32(7);
  let sum = 0;
  const n = 50_000;
  for (let i = 0; i < n; i += 1) sum += rand();
  assertAlmostEquals(sum / n, 0.5, 0.01);
});

Deno.test("percentile interpolates and handles edges", () => {
  const values = [1, 2, 3, 4, 5];
  assertEquals(percentile(values, 0), 1);
  assertEquals(percentile(values, 1), 5);
  assertEquals(percentile(values, 0.5), 3);
  assertAlmostEquals(percentile([1, 2], 0.5)!, 1.5, 1e-9);
  assertEquals(percentile([], 0.5), null);
  assertEquals(percentile([7], 0.9), 7);
});

Deno.test("percentile sorts unsorted input", () => {
  assertEquals(percentile([5, 1, 4, 2, 3], 0.5), 3);
});

Deno.test("simulateRiskOfRuin is reproducible for a given seed", () => {
  const input = { rSamples: edgeSamples(), riskPct: 2, trades: 100, simulations: 500, seed: 99 };
  const a = simulateRiskOfRuin(input)!;
  const b = simulateRiskOfRuin(input)!;
  assertEquals(a.p_ruin, b.p_ruin);
  assertEquals(a.median_max_drawdown_pct, b.median_max_drawdown_pct);
  assertEquals(a.p95_final_multiple, b.p95_final_multiple);
});

Deno.test("simulateRiskOfRuin recovers the expectancy of the sampled distribution", () => {
  const result = simulateRiskOfRuin({
    rSamples: edgeSamples(),
    riskPct: 1,
    trades: 200,
    simulations: 500,
    seed: 5,
  })!;
  // 45% at 2R, 55% at -1R = +0.35R
  assertAlmostEquals(result.sample_expectancy_r, 0.35, 0.05);
  assertEquals(result.method, "bootstrap");
  assertEquals(result.sample_size, 200);
});

Deno.test("simulateRiskOfRuin ruin probability rises monotonically with size", () => {
  const base = { rSamples: edgeSamples(), trades: 200, simulations: 800, seed: 11 };
  const small = simulateRiskOfRuin({ ...base, riskPct: 0.5 })!;
  const medium = simulateRiskOfRuin({ ...base, riskPct: 5 })!;
  const large = simulateRiskOfRuin({ ...base, riskPct: 20 })!;
  assertEquals(small.p_ruin <= medium.p_ruin, true);
  assertEquals(medium.p_ruin <= large.p_ruin, true);
  assertEquals(small.median_max_drawdown_pct < large.median_max_drawdown_pct, true);
});

Deno.test("simulateRiskOfRuin ruins nearly every path on a losing distribution", () => {
  const result = simulateRiskOfRuin({
    rSamples: losingSamples(),
    riskPct: 3,
    trades: 300,
    simulations: 400,
    seed: 3,
  })!;
  assertEquals(result.sample_expectancy_r < 0, true);
  assertEquals(result.p_ruin > 0.9, true);
  assertEquals(result.p_profitable < 0.1, true);
});

Deno.test("simulateRiskOfRuin keeps a small size safe on a positive edge", () => {
  const result = simulateRiskOfRuin({
    rSamples: edgeSamples(),
    riskPct: 0.5,
    trades: 200,
    simulations: 800,
    seed: 21,
  })!;
  assertEquals(result.p_ruin < 0.01, true);
  assertEquals(result.p_profitable > 0.9, true);
  assertEquals(result.median_final_multiple > 1, true);
});

Deno.test("simulateRiskOfRuin falls back to the parametric model without enough history", () => {
  const result = simulateRiskOfRuin({
    rSamples: [1, -1, 2],
    p: 0.5,
    rewardR: 2,
    riskPct: 1,
    trades: 100,
    simulations: 300,
    seed: 8,
  })!;
  assertEquals(result.method, "parametric");
  assertEquals(result.sample_size, 0);
  // 50% at 2R, 50% at -1R = +0.5R
  assertAlmostEquals(result.sample_expectancy_r, 0.5, 0.12);
});

Deno.test("simulateRiskOfRuin returns null without any usable distribution", () => {
  assertEquals(simulateRiskOfRuin({ riskPct: 1, trades: 100 }), null);
  assertEquals(simulateRiskOfRuin({ rSamples: [1, -1], riskPct: 1 }), null);
  assertEquals(simulateRiskOfRuin({ p: 0.5, rewardR: 2, riskPct: 0 }), null);
  // A p outside (0,1) is not a probability.
  assertEquals(simulateRiskOfRuin({ p: 1.4, rewardR: 2, riskPct: 1 }), null);
});

Deno.test("simulateRiskOfRuin compounding shrinks the bet after losses", () => {
  const base = { rSamples: edgeSamples(), riskPct: 8, trades: 200, simulations: 600, seed: 17 };
  const compounded = simulateRiskOfRuin({ ...base, compounding: true })!;
  const fixed = simulateRiskOfRuin({ ...base, compounding: false })!;
  // Betting a share of a shrinking account cannot ruin more often than betting a constant
  // share of the original account.
  assertEquals(compounded.p_ruin <= fixed.p_ruin, true);
});

Deno.test("simulateRiskOfRuin clamps a blown account at zero rather than going negative", () => {
  // Risking 50% per trade into a -3R outlier drives equity below zero without a clamp.
  const result = simulateRiskOfRuin({
    rSamples: new Array(50).fill(0).map((_, i) => (i % 5 === 0 ? 1 : -3)),
    riskPct: 50,
    trades: 50,
    simulations: 200,
    seed: 2,
  })!;
  assertEquals(result.p05_final_multiple >= 0, true);
  assertEquals(result.median_final_multiple >= 0, true);
  assertEquals(result.worst_max_drawdown_pct <= 100, true);
});

Deno.test("simulateRiskOfRuin reports a plausible losing streak", () => {
  const result = simulateRiskOfRuin({
    rSamples: edgeSamples(),
    riskPct: 1,
    trades: 200,
    simulations: 500,
    seed: 31,
  })!;
  // At a 55% loss rate over 200 trades, the longest run is typically 6-12.
  assertEquals(result.median_longest_losing_streak >= 4, true);
  assertEquals(result.median_longest_losing_streak <= 20, true);
});

Deno.test("solveMaxRiskPct finds a size that respects the tolerance", () => {
  const solved = solveMaxRiskPct(
    { rSamples: edgeSamples(), trades: 200, simulations: 400, seed: 77 },
    { tolerance: 0.01, maxRiskPct: 10 },
  )!;
  assertEquals(solved.risk_pct > 0, true);
  assertEquals(solved.p_ruin_at_risk <= 0.01, true);

  // Verify independently: the solved size really does stay under tolerance.
  const check = simulateRiskOfRuin({
    rSamples: edgeSamples(),
    riskPct: solved.risk_pct,
    trades: 200,
    simulations: 400,
    seed: 77,
  })!;
  assertEquals(check.p_ruin <= 0.01, true);
});

Deno.test("solveMaxRiskPct returns zero risk for a losing distribution", () => {
  // A tiny stake on a losing edge does not breach the ruin threshold inside 200 trades — it just
  // bleeds slowly. The solver must still refuse to name a size rather than calling slow safe.
  const solved = solveMaxRiskPct(
    { rSamples: losingSamples(), trades: 200, simulations: 300, seed: 4 },
    { tolerance: 0.01 },
  )!;
  assertEquals(solved.risk_pct, 0);
});

Deno.test("solveMaxRiskPct never reports a size larger than the one it verified", () => {
  // Regression: rounding the solved size to nearest could report a stake fractionally above the
  // one the search actually tested, so the returned number failed its own tolerance.
  for (const seed of [1, 2, 3, 77, 404]) {
    const base = { rSamples: edgeSamples(), trades: 200, simulations: 300, seed };
    const solved = solveMaxRiskPct(base, { tolerance: 0.01, maxRiskPct: 10 })!;
    if (solved.risk_pct <= 0) continue;
    const check = simulateRiskOfRuin({ ...base, riskPct: solved.risk_pct })!;
    assertEquals(check.p_ruin <= 0.01, true);
  }
});

Deno.test("solveMaxRiskPct allows more size on a stronger edge", () => {
  const strong = new Array(200).fill(0).map((_, i) => (i % 10 < 7 ? 2 : -1)); // 70% at 2R
  const weak = new Array(200).fill(0).map((_, i) => (i % 10 < 4 ? 1.5 : -1)); // 40% at 1.5R
  const strongSolved = solveMaxRiskPct({ rSamples: strong, trades: 200, simulations: 300, seed: 6 })!;
  const weakSolved = solveMaxRiskPct({ rSamples: weak, trades: 200, simulations: 300, seed: 6 })!;
  assertEquals(strongSolved.risk_pct > weakSolved.risk_pct, true);
});

Deno.test("solveMaxRiskPct returns null without a usable distribution", () => {
  assertEquals(solveMaxRiskPct({ rSamples: [1, -1] }), null);
});
