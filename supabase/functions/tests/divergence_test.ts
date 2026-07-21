import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectMacdDivergence,
  macdDeltaThreshold,
  MACD_DELTA_STDEV_FACTOR,
} from "../_shared/marketStructure.ts";

/**
 * Fixture with exactly two fractal swing highs, at index 5 and index 14 (gap 9, clearing the
 * default minBarGap of 5), where the later high is the higher one. Lows are held flat so no
 * swing lows are produced and only the bearish branch can fire.
 */
const HIGHER_HIGH_CANDLES = [
  100, 101, 102, 103, 104, 110, 104, 103, 102, 101,
  102, 103, 104, 105, 115, 106, 105, 104, 103, 102,
].map((high) => ({ high, low: 90 }));

/**
 * Mirror fixture: two fractal swing lows at index 5 and 14, the later one lower. Highs are flat.
 */
const LOWER_LOW_CANDLES = [
  100, 99, 98, 97, 96, 90, 96, 97, 98, 99,
  98, 97, 96, 95, 85, 94, 95, 96, 97, 98,
].map((low) => ({ high: 110, low }));

Deno.test("detectMacdDivergence returns none on flat data", () => {
  const candles = Array.from({ length: 15 }, () => ({ high: 105, low: 95 }));
  const macd = candles.map(() => 0.5);
  assertEquals(detectMacdDivergence(candles, macd), "none");
});

Deno.test("detectMacdDivergence flags a higher high against a clearly lower MACD", () => {
  // MACD peaks at 2.0 on the first swing and is only 0.5 on the higher second swing.
  const macd = [
    0, 0.5, 1.0, 1.5, 1.8, 2.0, 1.8, 1.5, 1.2, 0.9,
    0.7, 0.6, 0.55, 0.5, 0.5, 0.4, 0.3, 0.2, 0.1, 0,
  ];
  assertEquals(detectMacdDivergence(HIGHER_HIGH_CANDLES, macd), "bearish");
});

Deno.test("detectMacdDivergence ignores a higher high whose MACD barely dips", () => {
  // 2.0 -> 1.99 across the two swings. This is the regression case: with the old zero-default
  // threshold any non-rising MACD counted, so divergence fired on almost every higher high.
  const macd = [
    0, 0.5, 1.0, 1.5, 1.8, 2.0, 1.8, 1.5, 1.2, 0.9,
    1.0, 1.3, 1.6, 1.9, 1.99, 1.5, 1.2, 0.9, 0.6, 0.3,
  ];
  assertEquals(detectMacdDivergence(HIGHER_HIGH_CANDLES, macd), "none");
});

Deno.test("detectMacdDivergence flags a lower low against a clearly higher MACD", () => {
  const macd = [
    0, -0.5, -1.0, -1.5, -1.8, -2.0, -1.8, -1.5, -1.2, -0.9,
    -0.7, -0.6, -0.55, -0.5, -0.5, -0.4, -0.3, -0.2, -0.1, 0,
  ];
  assertEquals(detectMacdDivergence(LOWER_LOW_CANDLES, macd), "bullish");
});

Deno.test("detectMacdDivergence still honours an explicit minMacdDelta override", () => {
  const macd = [
    0, 0.5, 1.0, 1.5, 1.8, 2.0, 1.8, 1.5, 1.2, 0.9,
    0.7, 0.6, 0.55, 0.5, 0.5, 0.4, 0.3, 0.2, 0.1, 0,
  ];
  // Real 1.5 separation, but a caller demanding 5.0 should see nothing.
  assertEquals(detectMacdDivergence(HIGHER_HIGH_CANDLES, macd, { minMacdDelta: 5 }), "none");
  assertEquals(detectMacdDivergence(HIGHER_HIGH_CANDLES, macd, { minMacdDelta: 1 }), "bearish");
});

Deno.test("macdDeltaThreshold scales with the magnitude of the series", () => {
  const base = [0, 1, 2, 3, 4, 5];
  const scaled = base.map((v) => v * 1000);
  assertAlmostEquals(macdDeltaThreshold(scaled), macdDeltaThreshold(base) * 1000, 1e-6);
});

Deno.test("macdDeltaThreshold is zero for a perfectly flat series and ignores nulls", () => {
  assertEquals(macdDeltaThreshold([1, 1, 1, 1]), 0);
  // stdev of [0, 2] is 1, so the threshold is exactly the configured factor.
  assertAlmostEquals(macdDeltaThreshold([null, 0, null, 2, null]), MACD_DELTA_STDEV_FACTOR, 1e-9);
});

Deno.test("macdDeltaThreshold blocks divergence when there is too little data", () => {
  assertEquals(macdDeltaThreshold([]), Infinity);
  assertEquals(macdDeltaThreshold([1]), Infinity);
});
