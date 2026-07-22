/**
 * Liquidity structure: stop pools, sweeps, imbalances and order blocks.
 *
 * This module exists because most retail losses are not analytical failures — they are stops
 * resting in obvious places getting taken before the move the trader predicted actually happens.
 * Equal highs and equal lows are where those stops sit; a sweep is the act of taking them. Knowing
 * where the pools are changes two decisions: where NOT to put a stop, and how to read a wick
 * through a level (a sweep that reclaims is a reversal signal, not a breakout).
 *
 * Everything here is derived from candles plus swing points supplied by the caller, so it agrees
 * with `buildMarketStructure` about what a swing is rather than re-deriving its own.
 */

import { calculateATR } from "./atr.ts";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type SwingRef = { index: number; price: number; time?: number };

function round6(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(6));
}

// ---------------------------------------------------------------------------
// Equal highs / equal lows — resting stop pools
// ---------------------------------------------------------------------------

export type LiquidityPool = {
  side: "buy_side" | "sell_side";
  price: number;
  /** How many swings formed this cluster. More touches, more stops resting behind it. */
  touches: number;
  firstIndex: number;
  lastIndex: number;
  lastTime: number | null;
  /** Whether price has since traded through the level. */
  swept: boolean;
  sweptAtIndex: number | null;
};

/**
 * Cluster swing highs (and lows) that sit within `tolerance × ATR` of each other.
 *
 * Buy-side liquidity sits *above* equal highs (that is where short stops and breakout buy orders
 * rest); sell-side liquidity sits *below* equal lows. The naming follows where the orders are, not
 * where the swings are.
 */
/**
 * Default clustering band, in ATR. Calibrated against BTC 4h, ETH 1h, SOL 15m and BNB 1h: 0.15–0.25
 * produced no pools at all on half of them, while 0.4 yields 2–3 on every one. A stop pool is a
 * zone rather than a single tick — resting orders bunch *around* a level, not on it — so 0.4 ATR
 * (~0.38% on BTC) is both defensible and productive.
 */
export const DEFAULT_POOL_TOLERANCE_ATR = 0.4;

export function findLiquidityPools(
  candles: Candle[],
  swingHighs: SwingRef[],
  swingLows: SwingRef[],
  atr: number | null,
  tolerance = DEFAULT_POOL_TOLERANCE_ATR,
  minTouches = 2,
): LiquidityPool[] {
  if (!candles.length) return [];

  const band = atr != null && atr > 0
    ? atr * tolerance
    : (candles[candles.length - 1]?.close ?? 0) * 0.001;
  if (band <= 0) return [];

  const build = (swings: SwingRef[], side: LiquidityPool["side"]): LiquidityPool[] => {
    if (swings.length < minTouches) return [];

    const sorted = [...swings].sort((a, b) => a.price - b.price);
    const clusters: SwingRef[][] = [];

    for (const swing of sorted) {
      const current = clusters[clusters.length - 1];
      if (!current) {
        clusters.push([swing]);
        continue;
      }
      const mid = current.reduce((sum, s) => sum + s.price, 0) / current.length;
      if (Math.abs(swing.price - mid) <= band) current.push(swing);
      else clusters.push([swing]);
    }

    return clusters
      .filter((cluster) => cluster.length >= minTouches)
      .map((cluster) => {
        const price = cluster.reduce((sum, s) => sum + s.price, 0) / cluster.length;
        const firstIndex = Math.min(...cluster.map((s) => s.index));
        const lastIndex = Math.max(...cluster.map((s) => s.index));

        // A pool is swept once any bar after it formed trades beyond the level.
        let sweptAtIndex: number | null = null;
        for (let i = lastIndex + 1; i < candles.length; i += 1) {
          const breached = side === "buy_side" ? candles[i].high > price : candles[i].low < price;
          if (breached) {
            sweptAtIndex = i;
            break;
          }
        }

        return {
          side,
          price: round6(price) as number,
          touches: cluster.length,
          firstIndex,
          lastIndex,
          lastTime: candles[lastIndex]?.time ?? null,
          swept: sweptAtIndex != null,
          sweptAtIndex,
        };
      });
  };

  return [...build(swingHighs, "buy_side"), ...build(swingLows, "sell_side")]
    .sort((a, b) => b.touches - a.touches || b.lastIndex - a.lastIndex);
}

// ---------------------------------------------------------------------------
// Liquidity sweeps
// ---------------------------------------------------------------------------

export type LiquiditySweep = {
  index: number;
  time: number;
  side: "buy_side" | "sell_side";
  /** The level that was taken. */
  level: number;
  /** How far beyond the level the wick reached, in ATR multiples. */
  penetrationAtr: number | null;
  /** True when the bar closed back inside the range — the signature that makes a sweep tradable. */
  reclaimed: boolean;
  barsAgo: number;
};

/**
 * Detect wick-through-then-close-back-inside events against known levels.
 *
 * A sweep that reclaims is one of the highest-quality reversal signals in crypto: it means the
 * push through the level found no continuation and the participants who were triggered are now
 * offside. A sweep that does NOT reclaim is simply a breakout — the same shape, the opposite
 * meaning — so the `reclaimed` flag is the entire point of this function.
 */
export function detectLiquiditySweeps(
  candles: Candle[],
  pools: LiquidityPool[],
  atr: number | null,
  lookback = 50,
): LiquiditySweep[] {
  if (!candles.length || !pools.length) return [];

  const sweeps: LiquiditySweep[] = [];
  const reportFrom = Math.max(0, candles.length - lookback);

  for (const pool of pools) {
    // Scan from the pool itself, not from the start of the reporting window. Starting at the
    // window would skip the actual first breach and report whichever later bar happened to be
    // above the level — which is how a level taken 200 bars ago in a trend gets logged as a fresh
    // "sweep" with an absurd 14-ATR penetration.
    for (let i = pool.lastIndex + 1; i < candles.length; i += 1) {
      const bar = candles[i];
      const isBuySide = pool.side === "buy_side";
      const breached = isBuySide ? bar.high > pool.price : bar.low < pool.price;
      if (!breached) continue;

      // Found the true first breach. Only report it if it is recent enough to still matter.
      if (i >= reportFrom) {
        sweeps.push({
          index: i,
          time: bar.time,
          side: pool.side,
          level: pool.price,
          penetrationAtr: atr && atr > 0
            ? round6((isBuySide ? bar.high - pool.price : pool.price - bar.low) / atr)
            : null,
          reclaimed: isBuySide ? bar.close < pool.price : bar.close > pool.price,
          barsAgo: candles.length - 1 - i,
        });
      }
      break; // only the first take of a given pool is the sweep
    }
  }

  return sweeps.sort((a, b) => a.barsAgo - b.barsAgo);
}

// ---------------------------------------------------------------------------
// Fair value gaps (3-bar imbalances)
// ---------------------------------------------------------------------------

export type FairValueGap = {
  index: number;
  time: number;
  direction: "bullish" | "bearish";
  top: number;
  bottom: number;
  sizeAtr: number | null;
  /** 0 = untouched, 1 = fully traded through. */
  fillProgress: number;
  filled: boolean;
  barsAgo: number;
};

/**
 * Three-bar imbalance: a range that price moved through so fast that no trading occurred on one
 * side of the book. Bullish gap when bar i+1's low stays above bar i-1's high.
 *
 * These are not mystical — they are simply a record of where price skipped, and they matter
 * because unfilled gaps act as magnets and partially-filled ones act as support/resistance. They
 * are emitted as levels and are scored by the backtest like any other level, not trusted on faith.
 */
export function detectFairValueGaps(
  candles: Candle[],
  atr: number | null,
  minSizeAtr = 0.1,
  lookback = 100,
): FairValueGap[] {
  const gaps: FairValueGap[] = [];
  if (candles.length < 3) return gaps;

  const start = Math.max(1, candles.length - lookback);

  for (let i = start; i < candles.length - 1; i += 1) {
    const prev = candles[i - 1];
    const next = candles[i + 1];

    const bullish = next.low > prev.high;
    const bearish = next.high < prev.low;
    if (!bullish && !bearish) continue;

    const top = bullish ? next.low : prev.low;
    const bottom = bullish ? prev.high : next.high;
    const size = top - bottom;
    if (size <= 0) continue;
    if (atr && atr > 0 && size < atr * minSizeAtr) continue;

    // Walk forward to see how much of the gap has been traded back through.
    let deepest = bullish ? top : bottom;
    for (let j = i + 2; j < candles.length; j += 1) {
      if (bullish) deepest = Math.min(deepest, candles[j].low);
      else deepest = Math.max(deepest, candles[j].high);
    }

    const penetrated = bullish
      ? Math.max(0, top - deepest)
      : Math.max(0, deepest - bottom);
    const fillProgress = Math.max(0, Math.min(1, penetrated / size));

    gaps.push({
      index: i,
      time: candles[i].time,
      direction: bullish ? "bullish" : "bearish",
      top: round6(top) as number,
      bottom: round6(bottom) as number,
      sizeAtr: atr && atr > 0 ? round6(size / atr) : null,
      fillProgress: round6(fillProgress) as number,
      filled: fillProgress >= 1,
      barsAgo: candles.length - 1 - i,
    });
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Order blocks
// ---------------------------------------------------------------------------

export type OrderBlock = {
  index: number;
  time: number;
  direction: "bullish" | "bearish";
  top: number;
  bottom: number;
  /** Size of the displacement leg that followed, in ATR multiples. */
  displacementAtr: number;
  mitigated: boolean;
  barsAgo: number;
};

/**
 * The last opposing candle before a displacement move.
 *
 * The premise is mundane: a large directional leg has to be driven by size, and the candle
 * immediately before it is where that size was likely accumulated. Filtered by displacement
 * measured in ATR so the same code works on BTC and on a sub-cent altcoin.
 */
/**
 * Minimum body size, in ATR, for the following candle to count as displacement. Measured across
 * BTC/ETH/SOL/BNB, candle bodies have a median near 0.4 ATR and a 90th percentile near 1.0, so
 * this threshold means "a candle in the top decile of conviction". The previous 1.5 sat at roughly
 * the 95th–98th percentile and found 0–2 blocks per 500 bars.
 */
export const DEFAULT_DISPLACEMENT_ATR = 1.0;

export function detectOrderBlocks(
  candles: Candle[],
  atr: number | null,
  minDisplacementAtr = DEFAULT_DISPLACEMENT_ATR,
  lookback = 100,
): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  if (candles.length < 3 || !atr || atr <= 0) return blocks;

  const start = Math.max(1, candles.length - lookback);

  for (let i = start; i < candles.length - 1; i += 1) {
    const candidate = candles[i];
    const next = candles[i + 1];

    const displacement = Math.abs(next.close - next.open);
    if (displacement < atr * minDisplacementAtr) continue;

    const nextIsUp = next.close > next.open;
    const candidateIsDown = candidate.close < candidate.open;

    // Bullish block: a down candle immediately before an up displacement (and mirror).
    if (nextIsUp !== candidateIsDown) continue;

    const direction: OrderBlock["direction"] = nextIsUp ? "bullish" : "bearish";
    const top = Math.max(candidate.open, candidate.close);
    const bottom = Math.min(candidate.open, candidate.close);

    // Mitigated once price returns into the block.
    let mitigated = false;
    for (let j = i + 2; j < candles.length; j += 1) {
      if (direction === "bullish" ? candles[j].low <= top : candles[j].high >= bottom) {
        mitigated = true;
        break;
      }
    }

    blocks.push({
      index: i,
      time: candidate.time,
      direction,
      top: round6(top) as number,
      bottom: round6(bottom) as number,
      displacementAtr: round6(displacement / atr) as number,
      mitigated,
      barsAgo: candles.length - 1 - i,
    });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export type LiquidityMap = {
  atr: number | null;
  pools: LiquidityPool[];
  sweeps: LiquiditySweep[];
  fairValueGaps: FairValueGap[];
  orderBlocks: OrderBlock[];
  /** Nearest unswept pools on each side — the levels price is most likely reaching for. */
  nearestBuySidePool: LiquidityPool | null;
  nearestSellSidePool: LiquidityPool | null;
  /** Most recent reclaimed sweep, the highest-signal event this module produces. */
  latestReclaimedSweep: LiquiditySweep | null;
};

export function buildLiquidityMap(
  candles: Candle[],
  swingHighs: SwingRef[],
  swingLows: SwingRef[],
  options: { atrPeriod?: number; maxItems?: number } = {},
): LiquidityMap {
  const atrPeriod = options.atrPeriod ?? 14;
  const maxItems = options.maxItems ?? 8;
  const { value: atr } = calculateATR(candles, atrPeriod);

  const pools = findLiquidityPools(candles, swingHighs, swingLows, atr);
  const sweeps = detectLiquiditySweeps(candles, pools, atr);
  const fairValueGaps = detectFairValueGaps(candles, atr)
    .filter((g) => !g.filled)
    .sort((a, b) => a.barsAgo - b.barsAgo)
    .slice(0, maxItems);
  // Mitigated blocks are kept rather than dropped: price returning into a block once does not
  // erase the level, and filtering them out left this list empty on every symbol tested. Unmitigated
  // blocks sort first, then most recent.
  const orderBlocks = detectOrderBlocks(candles, atr)
    .sort((a, b) => Number(a.mitigated) - Number(b.mitigated) || a.barsAgo - b.barsAgo)
    .slice(0, maxItems);

  const price = candles[candles.length - 1]?.close ?? 0;
  const unswept = pools.filter((p) => !p.swept);

  const nearestBuySidePool = unswept
    .filter((p) => p.side === "buy_side" && p.price > price)
    .sort((a, b) => a.price - b.price)[0] ?? null;
  const nearestSellSidePool = unswept
    .filter((p) => p.side === "sell_side" && p.price < price)
    .sort((a, b) => b.price - a.price)[0] ?? null;

  return {
    atr: round6(atr),
    pools: pools.slice(0, maxItems),
    sweeps: sweeps.slice(0, maxItems),
    fairValueGaps,
    orderBlocks,
    nearestBuySidePool,
    nearestSellSidePool,
    latestReclaimedSweep: sweeps.find((s) => s.reclaimed) ?? null,
  };
}
