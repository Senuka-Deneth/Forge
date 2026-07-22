import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type CalibrationRow,
  computeBrierScore,
  computeSetupStats,
  decidedCounts,
  empiricalConfidence,
  clampModelConfidence,
  selectCalibrationBucket,
} from "../_shared/calibration.ts";

/** Build n rows for a setup/regime with the given number of wins, rest losses. */
function rows(
  setup_type: string,
  regime: string | null,
  wins: number,
  losses: number,
): CalibrationRow[] {
  return [
    ...Array.from({ length: wins }, () => ({ setup_type, regime, outcome: "target_hit" })),
    ...Array.from({ length: losses }, () => ({ setup_type, regime, outcome: "stop_hit" })),
  ];
}

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
  assertEquals(stats.trend_continuation_long.decided, 2);
  assertEquals(stats.trend_continuation_long.hit_rate, 0.5);
});

Deno.test("clampModelConfidence caps when n >= 20", () => {
  const { confidence, capped } = clampModelConfidence(90, { n: 25, empirical_hit_rate: 0.45 });
  assertEquals(capped, true);
  assertEquals(confidence, 60);
});

Deno.test("clampModelConfidence no cap when n < 20", () => {
  const { confidence, capped } = clampModelConfidence(90, { n: 10, empirical_hit_rate: 0.45 });
  assertEquals(capped, false);
  assertEquals(confidence, 90);
});

Deno.test("decidedCounts ignores undecided outcomes", () => {
  const counts = decidedCounts([
    { setup_type: "s", regime: "trending", outcome: "target_hit" },
    { setup_type: "s", regime: "trending", outcome: "stop_hit" },
    { setup_type: "s", regime: "trending", outcome: "expired" },
    { setup_type: "s", regime: "trending", outcome: "no_fill" },
  ]);
  assertEquals(counts, { hits: 1, decided: 2 });
});

Deno.test("selectCalibrationBucket prefers the setup x regime bucket when it is thick enough", () => {
  const data = [
    ...rows("trend_continuation_long", "trending", 18, 7), // 25 decided, 72%
    ...rows("trend_continuation_long", "volatile_chop", 2, 23), // same setup, far worse regime
  ];
  const result = selectCalibrationBucket(data, "trend_continuation_long", "trending");
  assertEquals(result?.bucket, "setup_regime");
  assertEquals(result?.n, 25);
  // Must reflect the trending sub-population (~72%), not the ~40% pooled across both regimes.
  assertEquals(result!.empirical_hit_rate > 0.6, true);
});

Deno.test("selectCalibrationBucket falls back to setup when the regime bucket is thin", () => {
  const data = [
    ...rows("range_fade_short", "ranging", 3, 2), // only 5 decided in this regime
    ...rows("range_fade_short", "trending", 10, 12),
  ];
  const result = selectCalibrationBucket(data, "range_fade_short", "ranging");
  assertEquals(result?.bucket, "setup");
  assertEquals(result?.n, 27);
});

Deno.test("selectCalibrationBucket falls back to global for an unseen setup", () => {
  const data = rows("trend_continuation_long", "trending", 10, 10);
  const result = selectCalibrationBucket(data, "breakout", "trending");
  assertEquals(result?.bucket, "global");
  assertEquals(result?.n, 20);
  assertEquals(result?.empirical_hit_rate, 0.5);
});

Deno.test("selectCalibrationBucket returns null with no decided history", () => {
  assertEquals(selectCalibrationBucket([], "breakout", "trending"), null);
  const undecided: CalibrationRow[] = [
    { setup_type: "breakout", regime: "trending", outcome: "expired" },
  ];
  assertEquals(selectCalibrationBucket(undecided, "breakout", "trending"), null);
});

Deno.test("selectCalibrationBucket never uses the regime bucket when regime is unknown", () => {
  const data = rows("breakout", "trending", 15, 10);
  const result = selectCalibrationBucket(data, "breakout", null);
  assertEquals(result?.bucket, "setup");
  assertEquals(result?.n, 25);
});

Deno.test("selectCalibrationBucket keeps a thin setup bucket honest rather than dropping it", () => {
  // 4 decided is below the threshold, so it must not be reported as setup_regime, but the caller
  // still needs a number — and clampModelConfidence will refuse to act on n < 20 anyway.
  const data = rows("breakout", "trending", 3, 1);
  const result = selectCalibrationBucket(data, "breakout", "trending");
  assertEquals(result?.bucket, "setup");
  assertEquals(result?.n, 4);
});
