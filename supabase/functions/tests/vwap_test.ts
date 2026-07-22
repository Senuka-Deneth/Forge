import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  anchoredVwap,
  buildAnchoredVwaps,
  classifyVwapRelation,
  selectVwapAnchors,
} from "../_shared/vwap.ts";

/** Flat candle so typical price ((h+l+c)/3) equals `price` exactly and stays hand-checkable. */
function bar(time: number, price: number, volume: number) {
  return { time, high: price, low: price, close: price, volume };
}

Deno.test("anchoredVwap on constant price returns that price with zero-width bands", () => {
  const candles = Array.from({ length: 10 }, (_, i) => bar(i, 100, 5));
  const result = anchoredVwap(candles, 0);

  assertEquals(result.latest.vwap, 100);
  assertEquals(result.latest.upper1, 100);
  assertEquals(result.latest.lower1, 100);
  // Zero deviation must not produce a NaN or negative-variance sqrt.
  assertEquals(result.latestZScore, null);
});

Deno.test("anchoredVwap computes the volume-weighted mean and 1-sigma band by hand", () => {
  // Two equal-volume bars at 100 and 200: mean 150; E[p²] = 25000; var = 25000 − 150² = 2500; sd 50.
  const candles = [bar(0, 100, 1), bar(1, 200, 1)];
  const result = anchoredVwap(candles, 0);

  assertAlmostEquals(result.latest.vwap!, 150, 1e-6);
  assertAlmostEquals(result.latest.upper1!, 200, 1e-6);
  assertAlmostEquals(result.latest.lower1!, 100, 1e-6);
  assertAlmostEquals(result.latest.upper2!, 250, 1e-6);
  // Close (200) sits exactly 1 sd above the mean.
  assertAlmostEquals(result.latestZScore!, 1, 1e-6);
});

Deno.test("anchoredVwap weights by volume, not by bar count", () => {
  // 3 units at 100 and 1 unit at 200 → (300 + 200) / 4 = 125, not the unweighted 150.
  const candles = [bar(0, 100, 3), bar(1, 200, 1)];
  const result = anchoredVwap(candles, 0);
  assertAlmostEquals(result.latest.vwap!, 125, 1e-6);
  // var = (3·100² + 1·200²)/4 − 125² = 17500 − 15625 = 1875 → sd ≈ 43.3013
  assertAlmostEquals(result.latest.upper1! - result.latest.vwap!, Math.sqrt(1875), 1e-4);
});

Deno.test("anchoredVwap ignores bars before the anchor", () => {
  const candles = [bar(0, 10, 100), bar(1, 200, 1), bar(2, 200, 1)];
  const anchored = anchoredVwap(candles, 1);

  // The heavy 10-price bar sits before the anchor and must not drag the mean down.
  assertAlmostEquals(anchored.latest.vwap!, 200, 1e-6);
  assertEquals(anchored.series[0].vwap, null);
  assertEquals(anchored.anchorIndex, 1);
  assertEquals(anchored.anchorTime, 1);
});

Deno.test("anchoredVwap tolerates zero-volume bars without producing NaN", () => {
  const candles = [bar(0, 100, 0), bar(1, 100, 0), bar(2, 100, 4)];
  const result = anchoredVwap(candles, 0);
  assertEquals(result.latest.vwap, 100);
  assertEquals(result.series[0].vwap, null); // no volume yet, nothing to average
});

Deno.test("anchoredVwap clamps an out-of-range anchor instead of throwing", () => {
  const candles = Array.from({ length: 5 }, (_, i) => bar(i, 100, 1));
  assertEquals(anchoredVwap(candles, 99).anchorIndex, 4);
  assertEquals(anchoredVwap(candles, -3).anchorIndex, 0);
});

Deno.test("selectVwapAnchors picks the latest swings plus the highest-volume bar", () => {
  const candles = Array.from({ length: 20 }, (_, i) => bar(i, 100 + i, 1));
  candles[7] = bar(7, 107, 999); // volume spike, far from either swing

  const anchors = selectVwapAnchors(candles, [{ index: 3 }, { index: 15 }], [{ index: 12 }]);
  const byKind = Object.fromEntries(anchors.map((a) => [a.kind, a.index]));

  assertEquals(byKind.swing_high, 15); // most recent high, not the older index 3
  assertEquals(byKind.swing_low, 12);
  assertEquals(byKind.high_volume, 7);
});

Deno.test("selectVwapAnchors drops a volume anchor that duplicates a swing anchor", () => {
  const candles = Array.from({ length: 20 }, (_, i) => bar(i, 100 + i, 1));
  candles[15] = bar(15, 115, 999); // spike lands on the swing high itself

  const anchors = selectVwapAnchors(candles, [{ index: 15 }], [{ index: 12 }]);
  assertEquals(anchors.some((a) => a.kind === "high_volume"), false);
  assertEquals(anchors.length, 2);
});

Deno.test("selectVwapAnchors ignores swings older than the lookback window", () => {
  const candles = Array.from({ length: 100 }, (_, i) => bar(i, 100, 1));
  const anchors = selectVwapAnchors(candles, [{ index: 2 }], [{ index: 3 }], 20);
  assertEquals(anchors.some((a) => a.kind === "swing_high"), false);
  assertEquals(anchors.some((a) => a.kind === "swing_low"), false);
});

Deno.test("buildAnchoredVwaps returns one series per selected anchor", () => {
  const candles = Array.from({ length: 30 }, (_, i) => bar(i, 100 + i, 1));
  const vwaps = buildAnchoredVwaps(candles, [{ index: 20 }], [{ index: 10 }]);
  assertEquals(vwaps.length >= 2, true);
  for (const v of vwaps) {
    assertEquals(v.series.length, candles.length);
    assertEquals(v.latest.vwap != null, true);
  }
});

Deno.test("classifyVwapRelation reports which band price is in", () => {
  const point = { vwap: 100, upper1: 110, lower1: 90, upper2: 120, lower2: 80 };
  assertEquals(classifyVwapRelation(125, point), "above_2sd");
  assertEquals(classifyVwapRelation(115, point), "above_1sd");
  assertEquals(classifyVwapRelation(105, point), "above");
  assertEquals(classifyVwapRelation(100, point), "at");
  assertEquals(classifyVwapRelation(95, point), "below");
  assertEquals(classifyVwapRelation(85, point), "below_1sd");
  assertEquals(classifyVwapRelation(75, point), "below_2sd");
  assertEquals(classifyVwapRelation(null, point), "unknown");
  assertEquals(classifyVwapRelation(100, { ...point, vwap: null }), "unknown");
});
