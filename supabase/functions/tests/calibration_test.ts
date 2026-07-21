import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeBrierScore,
  computeSetupStats,
  empiricalConfidence,
} from "../_shared/calibration.ts";

Deno.test("computeBrierScore for perfect calibration", () => {
  const score = computeBrierScore([
    { confidence: 100, outcome: "target_hit" },
    { confidence: 0, outcome: "stop_hit" },
  ]);
  assertEquals(score, 0);
});

Deno.test("empiricalConfidence shrinks toward global rate on small n", () => {
  const value = empiricalConfidence(1, 2, 0.5, 10);
  assertEquals(value > 40 && value < 60, true);
});

Deno.test("computeSetupStats groups by setup_type", () => {
  const stats = computeSetupStats([
    { setup_type: "trend_continuation_long", outcome: "target_hit", realized_r: 2 },
    { setup_type: "trend_continuation_long", outcome: "stop_hit", realized_r: -1 },
  ]);
  assertEquals(stats.trend_continuation_long.n, 2);
  assertEquals(stats.trend_continuation_long.hit_rate, 0.5);
});
