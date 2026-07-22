import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { barHitLong, barHitShort, scorePlanAgainstCandles, ROUND_TRIP_COST } from "../_shared/outcome.ts";
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

Deno.test("scorePlanAgainstCandles expires after fill with fee-adjusted R", () => {
  const result = scorePlanAgainstCandles(basePlan, [
    { high: 102, low: 98 },
    { high: 103, low: 99 },
  ], 20);
  assertEquals(result.outcome, "expired");
  const entry = 100;
  const risk = 5;
  const expected = Number((-(ROUND_TRIP_COST * entry) / risk).toFixed(3));
  assertEquals(result.realized_r, expected);
  assertEquals(result.filled_at_bar, 0);
});

Deno.test("scorePlanAgainstCandles no_fill when entry not touched", () => {
  const result = scorePlanAgainstCandles(basePlan, [
    { high: 105, low: 102 },
    { high: 105, low: 102 },
  ], 20);
  assertEquals(result.outcome, "no_fill");
  assertEquals(result.filled_at_bar, null);
});

Deno.test("scorePlanAgainstCandles records target hit for long", () => {
  const result = scorePlanAgainstCandles(basePlan, [{ high: 110, low: 100 }], 20);
  assertEquals(result.outcome, "target_hit");
  assertEquals(result.bars_to_outcome, 1);
});

Deno.test("scorePlanAgainstCandles invalid without geometry", () => {
  const result = scorePlanAgainstCandles({ ...basePlan, stop_loss: null }, [{ high: 110, low: 100 }]);
  assertEquals(result.outcome, "invalid");
});

Deno.test("scorePlanAgainstCandles ladder locks 50% at T1 then stop leaves partial positive R", () => {
  const ladderPlan: TradePlan = {
    ...basePlan,
    targets: [
      { label: "T1", price: 110, risk_reward: 2 },
      { label: "T2", price: 120, risk_reward: 4 },
    ],
  };

  const result = scorePlanAgainstCandles(ladderPlan, [
    { high: 101, low: 99 },
    { high: 111, low: 100 },
    { high: 102, low: 94 },
  ], 20);

  assertEquals(result.outcome, "stop_hit");
  assertEquals(result.ladder?.[0]?.hit, true);
  assertEquals(result.ladder?.[0]?.realized_r, 1);
  // 50% at +2R (+1R) then remaining 50% stopped (−0.5R) before fees.
  assertEquals(result.realized_r != null && result.realized_r > 0, true);
  assertEquals(result.realized_r! < 0.5, true);
});
