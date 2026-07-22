import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildTradeManagement } from "../_shared/tradeManagement.ts";
import type { TradePlan } from "../_shared/tradePlan.ts";

const directional: TradePlan = {
  bias: "long",
  entry_zone: { low: 100, high: 101 },
  stop_loss: 98,
  targets: [
    { label: "T1", price: 104, risk_reward: 1.5 },
    { label: "T2", price: 107, risk_reward: 3 },
  ],
  risk_reward_summary: "1.5:1",
  confidence: 55,
  rationale: "test",
};

Deno.test("buildTradeManagement returns empty partials for wait", () => {
  const plan = buildTradeManagement(
    { bias: "wait", entry_zone: null, stop_loss: null, targets: [], risk_reward_summary: "", confidence: 0, rationale: "" },
    "trending",
  );
  assertEquals(plan.partials.length, 0);
  assertEquals(plan.trail.method, "none");
  assertEquals(plan.fill_window_bars, 20);
});

Deno.test("buildTradeManagement uses Supertrend trail in trending regime", () => {
  const plan = buildTradeManagement(directional, "trending");
  assertEquals(plan.trail.method, "supertrend");
  assertEquals(plan.breakeven.trigger_r, 1);
  assertEquals(plan.partials.length, 2);
  assertEquals(plan.partials[0].fraction, 0.5);
  assertEquals(plan.partials[1].fraction, 0.25);
});

Deno.test("buildTradeManagement uses Chandelier trail in ranging regime", () => {
  const plan = buildTradeManagement(directional, "ranging");
  assertEquals(plan.trail.method, "chandelier");
});

Deno.test("buildTradeManagement refuses to trail in volatile chop", () => {
  const plan = buildTradeManagement(directional, "volatile_chop");
  assertEquals(plan.trail.method, "none");
  assertEquals(plan.summary.includes("none"), true);
});

Deno.test("buildTradeManagement surfaces fill window and time stop", () => {
  const plan = buildTradeManagement(directional, "trending", { expireBars: 80 });
  assertEquals(plan.fill_window_bars, 20);
  assertEquals(plan.time_stop_bars, 80);
});
