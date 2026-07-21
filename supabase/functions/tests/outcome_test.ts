import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { barHitLong, barHitShort, scorePlanAgainstCandles } from "../_shared/outcome.ts";
import type { TradePlan } from "../_shared/tradePlan.ts";

const basePlan: TradePlan = {
  bias: "long",
  entry_zone: { low: 99, high: 101 },
  stop_loss: 95,
  targets: [{ label: "T1", price: 109, risk_reward: 2 }],
  risk_reward_summary: "test",
  confidence: 60,
  rationale: "test",
};

Deno.test("barHitLong prefers stop when both hit", () => {
  assertEquals(barHitLong({ high: 110, low: 94 }, 95, 109), "stop");
});

Deno.test("barHitShort hits target", () => {
  assertEquals(barHitShort({ high: 104, low: 98 }, 105, 99), "target");
});

Deno.test("scorePlanAgainstCandles expires with no hits", () => {
  const result = scorePlanAgainstCandles(basePlan, [
    { high: 102, low: 98 },
    { high: 103, low: 99 },
  ]);
  assertEquals(result.outcome, "expired");
  assertEquals(result.realized_r, 0);
});

Deno.test("scorePlanAgainstCandles records target hit for long", () => {
  const result = scorePlanAgainstCandles(basePlan, [{ high: 110, low: 100 }]);
  assertEquals(result.outcome, "target_hit");
  assertEquals(result.bars_to_outcome, 1);
});

Deno.test("scorePlanAgainstCandles invalid without geometry", () => {
  const result = scorePlanAgainstCandles({ ...basePlan, stop_loss: null }, [{ high: 110, low: 100 }]);
  assertEquals(result.outcome, "invalid");
});
