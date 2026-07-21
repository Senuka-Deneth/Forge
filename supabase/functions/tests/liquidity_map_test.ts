import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildLiquidityMap,
  detectFairValueGaps,
  detectLiquiditySweeps,
  detectOrderBlocks,
  findLiquidityPools,
} from "../_shared/liquidityMap.ts";

function bar(time: number, open: number, high: number, low: number, close: number, volume = 100) {
  return { time, open, high, low, close, volume };
}

/** Flat filler bar at `price` with a tight range. */
function flat(time: number, price: number) {
  return bar(time, price, price + 0.5, price - 0.5, price);
}

// ---------------------------------------------------------------------------
// Liquidity pools
// ---------------------------------------------------------------------------

Deno.test("findLiquidityPools clusters near-equal swing highs into one buy-side pool", () => {
  const candles = Array.from({ length: 30 }, (_, i) => flat(i, 100));
  // Three swing highs within a tenth of an ATR of each other.
  const swingHighs = [
    { index: 5, price: 110.0 },
    { index: 12, price: 110.05 },
    { index: 19, price: 109.97 },
  ];

  const pools = findLiquidityPools(candles, swingHighs, [], 10);
  assertEquals(pools.length, 1);
  assertEquals(pools[0].side, "buy_side");
  assertEquals(pools[0].touches, 3);
  assertAlmostEquals(pools[0].price, 110.006667, 1e-4);
});

Deno.test("findLiquidityPools keeps distant swings in separate pools", () => {
  const candles = Array.from({ length: 30 }, (_, i) => flat(i, 100));
  const swingHighs = [
    { index: 4, price: 110 },
    { index: 8, price: 110.1 },
    { index: 15, price: 150 },
    { index: 20, price: 150.1 },
  ];

  const pools = findLiquidityPools(candles, swingHighs, [], 10);
  assertEquals(pools.length, 2);
  assertEquals(pools.every((p) => p.touches === 2), true);
});

Deno.test("findLiquidityPools ignores lone swings below the touch threshold", () => {
  const candles = Array.from({ length: 20 }, (_, i) => flat(i, 100));
  assertEquals(findLiquidityPools(candles, [{ index: 5, price: 110 }], [], 10).length, 0);
});

Deno.test("findLiquidityPools marks a pool swept once price trades through it", () => {
  const candles = Array.from({ length: 20 }, (_, i) => flat(i, 100));
  candles[18] = bar(18, 100, 115, 99, 100); // wick above the 110 pool

  const pools = findLiquidityPools(
    candles,
    [{ index: 5, price: 110 }, { index: 10, price: 110 }],
    [],
    10,
  );
  assertEquals(pools[0].swept, true);
  assertEquals(pools[0].sweptAtIndex, 18);
});

Deno.test("findLiquidityPools labels lows as sell-side liquidity", () => {
  const candles = Array.from({ length: 20 }, (_, i) => flat(i, 100));
  const pools = findLiquidityPools(
    candles,
    [],
    [{ index: 5, price: 90 }, { index: 12, price: 90.02 }],
    10,
  );
  assertEquals(pools[0].side, "sell_side");
  assertEquals(pools[0].swept, false);
});

// ---------------------------------------------------------------------------
// Sweeps
// ---------------------------------------------------------------------------

Deno.test("detectLiquiditySweeps flags a wick through a level that closes back inside", () => {
  const candles = Array.from({ length: 20 }, (_, i) => flat(i, 100));
  candles[15] = bar(15, 100, 114, 99, 101); // pierces 110, closes below it

  const pools = findLiquidityPools(
    candles,
    [{ index: 5, price: 110 }, { index: 10, price: 110 }],
    [],
    10,
  );
  const sweeps = detectLiquiditySweeps(candles, pools, 10);

  assertEquals(sweeps.length, 1);
  assertEquals(sweeps[0].side, "buy_side");
  assertEquals(sweeps[0].reclaimed, true);
  assertAlmostEquals(sweeps[0].penetrationAtr!, 0.4, 1e-6); // (114 − 110) / ATR 10
  assertEquals(sweeps[0].barsAgo, 4);
});

Deno.test("detectLiquiditySweeps distinguishes a breakout from a reclaim", () => {
  const candles = Array.from({ length: 20 }, (_, i) => flat(i, 100));
  candles[15] = bar(15, 100, 114, 99, 113); // pierces AND closes above → breakout, not a sweep

  const pools = findLiquidityPools(
    candles,
    [{ index: 5, price: 110 }, { index: 10, price: 110 }],
    [],
    10,
  );
  const sweeps = detectLiquiditySweeps(candles, pools, 10);
  assertEquals(sweeps[0].reclaimed, false);
});

Deno.test("detectLiquiditySweeps measures penetration at the true first breach", () => {
  // Pool at 110 is taken at bar 20 by a small wick, then price trends far above it. With the scan
  // clamped to the reporting window instead of starting at the pool, bar 20 was skipped and a much
  // later bar was reported as the sweep — with a penetration of many ATR, which is a trend move,
  // not a sweep.
  const candles = Array.from({ length: 60 }, (_, i) => flat(i, 100));
  candles[20] = bar(20, 100, 111, 99, 101); // the real breach: 1 above the level
  for (let i = 21; i < 60; i += 1) candles[i] = flat(i, 150); // price runs far beyond

  const pools = findLiquidityPools(
    candles,
    [{ index: 5, price: 110 }, { index: 10, price: 110 }],
    [],
    10,
  );
  // Reporting window covers the whole series here, so the true breach is both found and reported.
  const sweeps = detectLiquiditySweeps(candles, pools, 10, 60);
  assertEquals(sweeps.length, 1);
  assertEquals(sweeps[0].index, 20);
  assertAlmostEquals(sweeps[0].penetrationAtr!, 0.1, 1e-6); // (111 − 110) / ATR 10
});

Deno.test("detectLiquiditySweeps suppresses a breach older than the reporting window", () => {
  const candles = Array.from({ length: 60 }, (_, i) => flat(i, 100));
  candles[20] = bar(20, 100, 111, 99, 101);
  for (let i = 21; i < 60; i += 1) candles[i] = flat(i, 150);

  const pools = findLiquidityPools(
    candles,
    [{ index: 5, price: 110 }, { index: 10, price: 110 }],
    [],
    10,
  );
  // Only the last 10 bars are of interest; the breach at bar 20 is stale and must not resurface
  // as a fresh sweep against a later bar.
  assertEquals(detectLiquiditySweeps(candles, pools, 10, 10).length, 0);
});

Deno.test("detectLiquiditySweeps reports only the first take of a pool", () => {
  const candles = Array.from({ length: 20 }, (_, i) => flat(i, 100));
  candles[14] = bar(14, 100, 112, 99, 101);
  candles[17] = bar(17, 100, 118, 99, 101);

  const pools = findLiquidityPools(
    candles,
    [{ index: 5, price: 110 }, { index: 10, price: 110 }],
    [],
    10,
  );
  const sweeps = detectLiquiditySweeps(candles, pools, 10);
  assertEquals(sweeps.length, 1);
  assertEquals(sweeps[0].index, 14);
});

// ---------------------------------------------------------------------------
// Fair value gaps
// ---------------------------------------------------------------------------

// The bracketing bars in these fixtures deliberately overlap their neighbours' ranges. A narrow
// filler bar next to a displacement leg forms a real (if tiny) imbalance of its own, which would
// show up as an extra gap and shift the indices under test.

Deno.test("detectFairValueGaps finds a bullish 3-bar imbalance and its bounds", () => {
  const candles = [
    bar(0, 100, 102, 98, 100), // overlaps bar 1, forms no gap of its own
    bar(1, 100, 102, 99, 101), // bar i-1: high 102
    bar(2, 101, 112, 101, 111), // displacement
    bar(3, 111, 115, 105, 113), // bar i+1: low 105 > 102 → gap [102, 105]
    bar(4, 113, 116, 106, 114), // stays above the gap
  ];

  const gaps = detectFairValueGaps(candles, 2, 0.1);
  assertEquals(gaps.length, 1);
  assertEquals(gaps[0].direction, "bullish");
  assertEquals(gaps[0].bottom, 102);
  assertEquals(gaps[0].top, 105);
  assertAlmostEquals(gaps[0].sizeAtr!, 1.5, 1e-6); // 3 wide / ATR 2
  assertEquals(gaps[0].fillProgress, 0);
  assertEquals(gaps[0].filled, false);
});

Deno.test("detectFairValueGaps finds a bearish imbalance", () => {
  const candles = [
    bar(0, 120, 122, 118, 120),
    bar(1, 120, 121, 118, 119), // low 118
    bar(2, 119, 119, 109, 110),
    bar(3, 110, 115, 105, 107), // high 115 < 118 → gap [115, 118]
    bar(4, 107, 114, 104, 108),
  ];

  const gaps = detectFairValueGaps(candles, 2, 0.1);
  assertEquals(gaps.length, 1);
  assertEquals(gaps[0].direction, "bearish");
  assertEquals(gaps[0].bottom, 115);
  assertEquals(gaps[0].top, 118);
});

Deno.test("detectFairValueGaps tracks partial and complete fills", () => {
  const base = [
    bar(0, 100, 102, 98, 100),
    bar(1, 100, 102, 99, 101),
    bar(2, 101, 112, 101, 111),
    bar(3, 111, 115, 105, 113), // gap [102, 105], 3 wide
  ];

  // Retrace to 103.5 → 1.5 of the 3-wide gap traded back through.
  const half = detectFairValueGaps([...base, bar(4, 113, 114, 103.5, 108)], 2, 0.1);
  assertEquals(half.length, 1);
  assertAlmostEquals(half[0].fillProgress, 0.5, 1e-6);
  assertEquals(half[0].filled, false);

  // Retrace through 102 → fully filled, and progress clamps at 1 rather than overshooting.
  const full = detectFairValueGaps([...base, bar(4, 113, 114, 101, 102)], 2, 0.1);
  assertEquals(full[0].fillProgress, 1);
  assertEquals(full[0].filled, true);
});

Deno.test("detectFairValueGaps filters gaps below the ATR size floor", () => {
  const candles = [
    flat(0, 100),
    bar(1, 100, 102, 99, 101),
    bar(2, 101, 104, 101, 103),
    bar(3, 103, 105, 102.1, 104), // gap of only 0.1
    flat(4, 104),
  ];
  assertEquals(detectFairValueGaps(candles, 10, 0.5).length, 0);
});

Deno.test("detectFairValueGaps returns nothing without enough bars", () => {
  assertEquals(detectFairValueGaps([flat(0, 100), flat(1, 100)], 1).length, 0);
});

// ---------------------------------------------------------------------------
// Order blocks
// ---------------------------------------------------------------------------

Deno.test("detectOrderBlocks finds the down candle before an up displacement", () => {
  const candles = [
    flat(0, 100),
    bar(1, 102, 102.5, 100, 100.5), // down candle → bullish order block, body [100.5, 102]
    bar(2, 100.5, 112, 100.5, 111), // up displacement of 10.5 = 5.25 ATR
    flat(3, 111),
    flat(4, 111),
  ];

  const blocks = detectOrderBlocks(candles, 2, 1.5);
  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].direction, "bullish");
  assertEquals(blocks[0].top, 102);
  assertEquals(blocks[0].bottom, 100.5);
  assertAlmostEquals(blocks[0].displacementAtr, 5.25, 1e-6);
  assertEquals(blocks[0].mitigated, false);
});

Deno.test("detectOrderBlocks ignores moves that are too small to be displacement", () => {
  const candles = [
    flat(0, 100),
    bar(1, 102, 102.5, 100, 100.5),
    bar(2, 100.5, 101.5, 100.5, 101), // only 0.5 of body
    flat(3, 101),
  ];
  assertEquals(detectOrderBlocks(candles, 2, 1.5).length, 0);
});

Deno.test("detectOrderBlocks marks a block mitigated when price returns into it", () => {
  const candles = [
    flat(0, 100),
    bar(1, 102, 102.5, 100, 100.5),
    bar(2, 100.5, 112, 100.5, 111),
    bar(3, 111, 111, 101, 102), // trades back into [100.5, 102]
    flat(4, 102),
  ];
  assertEquals(detectOrderBlocks(candles, 2, 1.5)[0].mitigated, true);
});

Deno.test("detectOrderBlocks needs an ATR to scale the displacement filter", () => {
  const candles = [flat(0, 100), bar(1, 102, 103, 100, 100.5), bar(2, 100.5, 112, 100.5, 111)];
  assertEquals(detectOrderBlocks(candles, null).length, 0);
});

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

Deno.test("buildLiquidityMap surfaces the nearest unswept pools on each side", () => {
  const candles = Array.from({ length: 60 }, (_, i) => flat(i, 100));
  const map = buildLiquidityMap(
    candles,
    [{ index: 5, price: 110 }, { index: 12, price: 110 }, { index: 20, price: 130 }, { index: 28, price: 130 }],
    [{ index: 8, price: 90 }, { index: 16, price: 90 }, { index: 24, price: 70 }, { index: 32, price: 70 }],
  );

  assertEquals(map.nearestBuySidePool?.price, 110); // 110 is closer than 130
  assertEquals(map.nearestSellSidePool?.price, 90); // 90 is closer than 70
});

Deno.test("buildLiquidityMap degrades to empty structures on an empty series", () => {
  const map = buildLiquidityMap([], [], []);
  assertEquals(map.pools, []);
  assertEquals(map.sweeps, []);
  assertEquals(map.nearestBuySidePool, null);
  assertEquals(map.latestReclaimedSweep, null);
});
