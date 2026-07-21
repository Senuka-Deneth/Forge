import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calculateClassicPivots } from "../_shared/pivots.ts";
import { isCandleClosed, sliceClosedCandles } from "../_shared/candles.ts";
import {
  appendPositionSizing,
  recomputeTradePlanRiskReward,
  validateTradePlanGeometry,
  type TradePlan,
} from "../_shared/tradePlan.ts";

Deno.test("pivot rounding preserves low-priced alt levels", () => {
  const pivots = calculateClassicPivots(0.00009, 0.00007, 0.00008);
  assertEquals(pivots.PP > 0, true);
  assertEquals(pivots.R1 !== pivots.S1, true);
  assertEquals(String(pivots.PP).includes("0000"), true);
});

Deno.test("sliceClosedCandles drops in-progress last bar", () => {
  const now = Date.UTC(2026, 6, 21, 12, 30, 0);
  const open = Math.floor(now / 1000) - 1800;
  const candles = [
    { time: open - 3600, close: 1 },
    { time: open, close: 2 },
  ];
  const sliced = sliceClosedCandles(candles, "1h", open * 1000 + 1000);
  assertEquals(sliced.length, 1);
  assertEquals(sliced[0].time, open - 3600);
});

Deno.test("isCandleClosed respects interval duration", () => {
  const open = 1_700_000_000;
  assertEquals(isCandleClosed(open, "1h", open * 1000 + 3_600_000), true);
  assertEquals(isCandleClosed(open, "1h", open * 1000 + 1_000), false);
});

Deno.test("validateTradePlanGeometry rejects inverted long plan", () => {
  const badPlan: TradePlan = {
    bias: "long",
    entry_zone: { low: 100, high: 101 },
    stop_loss: 105,
    targets: [{ label: "T1", price: 110, risk_reward: 2 }],
    risk_reward_summary: "bad",
    confidence: 50,
    rationale: "test",
  };
  const result = validateTradePlanGeometry(badPlan, 100.5);
  assertEquals(result.valid, false);
});

Deno.test("recomputeTradePlanRiskReward overwrites model RR", () => {
  const plan: TradePlan = {
    bias: "long",
    entry_zone: { low: 99, high: 101 },
    stop_loss: 95,
    targets: [{ label: "T1", price: 109, risk_reward: 99 }],
    risk_reward_summary: "model",
    confidence: 60,
    rationale: "test",
  };
  const fixed = recomputeTradePlanRiskReward(plan);
  assertEquals(fixed.targets[0]?.risk_reward, 2);
});

Deno.test("appendPositionSizing adds informational block", () => {
  const plan: TradePlan = {
    bias: "short",
    entry_zone: { low: 99, high: 101 },
    stop_loss: 105,
    targets: [],
    risk_reward_summary: "n/a",
    confidence: 50,
    rationale: "test",
  };
  const sized = appendPositionSizing(plan);
  assertEquals(sized.position_sizing?.risk_pct, 1);
});
