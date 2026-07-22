import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  breakevenHitRate,
  computeExpectancy,
  feeCostR,
  wilsonInterval,
} from "../_shared/expectancy.ts";
import type { TradePlan } from "../_shared/tradePlan.ts";

function longPlan(rr = 2): TradePlan {
  return {
    bias: "long",
    entry_zone: { low: 100, high: 100 },
    stop_loss: 98,
    targets: [{ label: "T1", price: 100 + 2 * rr, risk_reward: rr }],
    risk_reward_summary: `${rr}:1`,
    confidence: 60,
    rationale: "test",
  };
}

Deno.test("breakevenHitRate for 2R with no fees is 33.3%", () => {
  assertAlmostEquals(breakevenHitRate(2, 0), 1 / 3, 1e-4);
});

Deno.test("breakevenHitRate rises when fees are non-zero", () => {
  const plain = breakevenHitRate(2, 0);
  const withFees = breakevenHitRate(2, 0.05);
  assertEquals(withFees > plain, true);
});

Deno.test("feeCostR scales with entry and inverse-scales with risk", () => {
  // ROUND_TRIP_COST = 0.001 → costR = 0.001 * 100 / 2 = 0.05
  assertAlmostEquals(feeCostR(100, 2), 0.05, 1e-6);
  assertEquals(feeCostR(100, 0), 0);
});

Deno.test("wilsonInterval is wider for small n than large n at the same rate", () => {
  const thin = wilsonInterval(5, 10)!;
  const thick = wilsonInterval(50, 100)!;
  assertEquals(thin.high - thin.low > thick.high - thick.low, true);
  assertEquals(thin.low >= 0 && thin.high <= 1, true);
});

Deno.test("wilsonInterval returns null on empty samples", () => {
  assertEquals(wilsonInterval(0, 0), null);
});

Deno.test("computeExpectancy returns WAIT for a wait plan", () => {
  const result = computeExpectancy(
    { bias: "wait", entry_zone: null, stop_loss: null, targets: [], risk_reward_summary: "", confidence: 0, rationale: "" },
    { p: 0.5, n: 50 },
  );
  assertEquals(result.verdict, "WAIT");
  assertEquals(result.ev_r, 0);
});

Deno.test("computeExpectancy TAKE when p beats breakeven", () => {
  // 2R needs ~33% to break even; 50% should be clearly +EV
  const result = computeExpectancy(longPlan(2), { p: 0.5, n: 60, hits: 30 });
  assertEquals(result.verdict, "TAKE");
  assertEquals(result.ev_r > 0, true);
  assertEquals(result.p_ci_low != null, true);
});

Deno.test("computeExpectancy SKIP when p is below breakeven", () => {
  // 2R needs ~33%; 20% is a losing bet
  const result = computeExpectancy(longPlan(2), { p: 0.2, n: 40, hits: 8 });
  assertEquals(result.verdict, "SKIP");
  assertEquals(result.ev_r < 0, true);
});

Deno.test("computeExpectancy WAIT when no calibrated p exists", () => {
  const result = computeExpectancy(longPlan(2), { p: null, n: 0 });
  assertEquals(result.verdict, "WAIT");
  assertEquals(result.summary.includes("No calibrated hit rate"), true);
});
