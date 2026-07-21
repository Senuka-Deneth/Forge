/**
 * Shared market-structure analysis: ATR, swing zones, RSI divergence, signal agreement.
 * Single source of truth — imported by frontend (@forge/market-structure) and edge functions.
 */

import type { Candle } from "./pivotPoints.ts";
import { calculateATR } from "./atr.ts";

export type SwingPoint = {
  index: number;
  price: number;
  time?: number;
  kind: "high" | "low";
};

export type SrZone = {
  mid: number;
  low: number;
  high: number;
  touches: number;
  lastIndex: number;
  score: number;
};

export type AtrResult = {
  value: number | null;
  series: (number | null)[];
};

export { calculateATR } from "./atr.ts";

export type DivergenceResult = "bullish" | "bearish" | "none";

export type SignalAgreementInputs = {
  price: number | null;
  ema20: number | null;
  ema50: number | null;
  rsi: number | null;
  macdLine: number | null;
  signalLine: number | null;
  primaryTrend: "bullish" | "bearish" | "sideways";
  pivotSessionBias?: "bullish" | "bearish" | "neutral";
  hasSupportZone: boolean;
  hasResistanceZone: boolean;
  divergence: DivergenceResult;
  atInflectionPoint?: boolean;
};

export type MarketStructureResult = {
  atr: number | null;
  divergence: DivergenceResult;
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  srZones: { supports: SrZone[]; resistances: SrZone[] };
  nearestSupport: { time?: number; price: number } | null;
  nearestResistance: { time?: number; price: number } | null;
};

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Volatility-adaptive inflection proximity threshold (fractional distance). */
export function inflectionThreshold(price: number, atr: number | null, k = 0.5): number {
  if (!Number.isFinite(price) || price === 0 || atr == null || !Number.isFinite(atr) || atr <= 0) {
    return 0.003;
  }
  return (k * atr) / Math.abs(price);
}

/** 2-bar fractal swing candidates on candle highs/lows or a 1D series. */
export function findFractalSwings(
  input: Candle[] | number[],
  lookback = 2,
): { swingHighs: SwingPoint[]; swingLows: SwingPoint[] } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];

  const isSeries = typeof input[0] === "number";
  const len = input.length;
  if (len < lookback * 2 + 1) return { swingHighs, swingLows };

  for (let i = lookback; i < len - lookback; i++) {
    if (isSeries) {
      const series = input as number[];
      const current = series[i];
      const left = series.slice(i - lookback, i);
      const right = series.slice(i + 1, i + lookback + 1);
      if (current > Math.max(...left) && current > Math.max(...right)) {
        swingHighs.push({ index: i, price: current, kind: "high" });
      }
      if (current < Math.min(...left) && current < Math.min(...right)) {
        swingLows.push({ index: i, price: current, kind: "low" });
      }
    } else {
      const candles = input as Candle[];
      const currentHigh = candles[i].high;
      const currentLow = candles[i].low;
      const leftHighs = candles.slice(i - lookback, i).map((c) => c.high);
      const rightHighs = candles.slice(i + 1, i + lookback + 1).map((c) => c.high);
      const leftLows = candles.slice(i - lookback, i).map((c) => c.low);
      const rightLows = candles.slice(i + 1, i + lookback + 1).map((c) => c.low);

      if (currentHigh > Math.max(...leftHighs) && currentHigh > Math.max(...rightHighs)) {
        swingHighs.push({ index: i, price: currentHigh, time: candles[i].time, kind: "high" });
      }
      if (currentLow < Math.min(...leftLows) && currentLow < Math.min(...rightLows)) {
        swingLows.push({ index: i, price: currentLow, time: candles[i].time, kind: "low" });
      }
    }
  }

  return { swingHighs, swingLows };
}

function swingProminence(
  swings: SwingPoint[],
  candles: Candle[],
  swing: SwingPoint,
  windowRadius: number,
): number {
  const start = Math.max(0, swing.index - windowRadius);
  const end = Math.min(candles.length - 1, swing.index + windowRadius);

  if (swing.kind === "high") {
    let maxOther = -Infinity;
    for (let i = start; i <= end; i++) {
      if (i === swing.index) continue;
      maxOther = Math.max(maxOther, candles[i].high);
    }
    return maxOther === -Infinity ? 0 : swing.price - maxOther;
  }

  let minOther = Infinity;
  for (let i = start; i <= end; i++) {
    if (i === swing.index) continue;
    minOther = Math.min(minOther, candles[i].low);
  }
  return minOther === Infinity ? 0 : minOther - swing.price;
}

/** Filter fractal candidates by minimum prominence (ATR multiple). */
export function filterByProminence(
  swings: SwingPoint[],
  candles: Candle[],
  atr: number | null,
  minMult = 1,
  windowRadius = 4,
): SwingPoint[] {
  if (atr == null || !Number.isFinite(atr) || atr <= 0) return swings;
  const threshold = minMult * atr;
  return swings.filter((s) => swingProminence(swings, candles, s, windowRadius) >= threshold);
}

/** Cluster swing levels within mergeMult * ATR into zones ranked by touches and recency. */
export function clusterIntoZones(
  swings: SwingPoint[],
  atr: number | null,
  mergeMult = 0.5,
  totalBars = 1,
): SrZone[] {
  if (!swings.length) return [];
  const mergeDist = atr != null && Number.isFinite(atr) && atr > 0 ? mergeMult * atr : swings[0].price * 0.001;

  const sorted = [...swings].sort((a, b) => a.price - b.price);
  const clusters: SwingPoint[][] = [];

  for (const swing of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last) {
      clusters.push([swing]);
      continue;
    }
    const clusterMid = last.reduce((sum, s) => sum + s.price, 0) / last.length;
    if (Math.abs(swing.price - clusterMid) <= mergeDist) {
      last.push(swing);
    } else {
      clusters.push([swing]);
    }
  }

  return clusters.map((cluster) => {
    const touches = cluster.length;
    const lastIndex = Math.max(...cluster.map((s) => s.index));
    const mid = cluster.reduce((sum, s) => sum + s.price, 0) / touches;
    const low = Math.min(...cluster.map((s) => s.price));
    const high = Math.max(...cluster.map((s) => s.price));
    const recency = totalBars > 1 ? lastIndex / (totalBars - 1) : 1;
    const score = touches * 10 + recency * 5;
    return { mid, low, high, touches, lastIndex, score };
  }).sort((a, b) => b.score - a.score);
}

/** Nearest support (below price) and resistance (above price) from ranked zones. */
export function nearestZones(
  price: number,
  supportZones: SrZone[],
  resistanceZones: SrZone[],
): { nearestSupport: SrZone | null; nearestResistance: SrZone | null } {
  const supportsBelow = supportZones.filter((z) => z.mid < price).sort((a, b) => b.mid - a.mid);
  const resistancesAbove = resistanceZones.filter((z) => z.mid > price).sort((a, b) => a.mid - b.mid);
  return {
    nearestSupport: supportsBelow[0] ?? null,
    nearestResistance: resistancesAbove[0] ?? null,
  };
}

export type DivergenceOptions = {
  lookback?: number;
  minBarGap?: number;
  minRsiDelta?: number;
};

/** Detect RSI divergence from price swing highs/lows vs RSI at those bars. */
export function detectRsiDivergence(
  candles: Pick<Candle, "high" | "low">[],
  rsi: (number | null)[],
  opts: DivergenceOptions = {},
): DivergenceResult {
  const lookback = opts.lookback ?? 2;
  const minBarGap = opts.minBarGap ?? 5;
  const minRsiDelta = opts.minRsiDelta ?? 3;

  const { swingHighs, swingLows } = findFractalSwings(candles as Candle[], lookback);

  if (swingHighs.length >= 2) {
    const [prev, curr] = swingHighs.slice(-2);
    if (curr.index - prev.index >= minBarGap && curr.price > prev.price) {
      const rsiPrev = rsi[prev.index];
      const rsiCurr = rsi[curr.index];
      if (rsiPrev != null && rsiCurr != null && rsiPrev - rsiCurr >= minRsiDelta) {
        return "bearish";
      }
    }
  }

  if (swingLows.length >= 2) {
    const [prev, curr] = swingLows.slice(-2);
    if (curr.index - prev.index >= minBarGap && curr.price < prev.price) {
      const rsiPrev = rsi[prev.index];
      const rsiCurr = rsi[curr.index];
      if (rsiCurr != null && rsiPrev != null && rsiCurr - rsiPrev >= minRsiDelta) {
        return "bullish";
      }
    }
  }

  return "none";
}

/** Detect MACD line divergence from price swing highs/lows vs MACD at those bars. */
export function detectMacdDivergence(
  candles: Pick<Candle, "high" | "low">[],
  macdLine: (number | null)[],
  opts: DivergenceOptions = {},
): DivergenceResult {
  const lookback = opts.lookback ?? 2;
  const minBarGap = opts.minBarGap ?? 5;
  const minMacdDelta = opts.minRsiDelta ?? 0; // reuse min delta threshold (absolute MACD units)

  const { swingHighs, swingLows } = findFractalSwings(candles as Candle[], lookback);

  if (swingHighs.length >= 2) {
    const [prev, curr] = swingHighs.slice(-2);
    if (curr.index - prev.index >= minBarGap && curr.price > prev.price) {
      const macdPrev = macdLine[prev.index];
      const macdCurr = macdLine[curr.index];
      if (macdPrev != null && macdCurr != null && macdPrev - macdCurr >= minMacdDelta) {
        return "bearish";
      }
    }
  }

  if (swingLows.length >= 2) {
    const [prev, curr] = swingLows.slice(-2);
    if (curr.index - prev.index >= minBarGap && curr.price < prev.price) {
      const macdPrev = macdLine[prev.index];
      const macdCurr = macdLine[curr.index];
      if (macdCurr != null && macdPrev != null && macdCurr - macdPrev >= minMacdDelta) {
        return "bullish";
      }
    }
  }

  return "none";
}

/**
 * Deterministic signal agreement score (0–100). NOT a probability.
 *
 * Formula:
 *   base 0
 *   +20  EMA stack aligned with trend (bullish: price>ema20>ema50; bearish mirror)
 *   +15  RSI side agrees with trend (bullish→RSI≥50, bearish→RSI≤50; sideways skips)
 *   +15  MACD line vs signal agrees with trend
 *   +15  Pivot session bias agrees with primary trend
 *   +10  Both nearest support and resistance zones present
 *   +10  RSI divergence agrees with bias direction
 *   +15  At pivot inflection (adaptive threshold)
 *   clamp [0, 100]
 */
export function computeSignalAgreement(inputs: SignalAgreementInputs): number {
  let score = 0;
  const {
    price, ema20, ema50, rsi, macdLine, signalLine,
    primaryTrend, pivotSessionBias = "neutral",
    hasSupportZone, hasResistanceZone, divergence, atInflectionPoint,
  } = inputs;

  if (price != null && ema20 != null && ema50 != null) {
    if (primaryTrend === "bullish" && price > ema20 && ema20 > ema50) score += 20;
    if (primaryTrend === "bearish" && price < ema20 && ema20 < ema50) score += 20;
  }

  if (rsi != null && primaryTrend !== "sideways") {
    if (primaryTrend === "bullish" && rsi >= 50) score += 15;
    if (primaryTrend === "bearish" && rsi <= 50) score += 15;
  }

  if (macdLine != null && signalLine != null && primaryTrend !== "sideways") {
    if (primaryTrend === "bullish" && macdLine > signalLine) score += 15;
    if (primaryTrend === "bearish" && macdLine < signalLine) score += 15;
  }

  if (primaryTrend === "bullish" && pivotSessionBias === "bullish") score += 15;
  if (primaryTrend === "bearish" && pivotSessionBias === "bearish") score += 15;

  if (hasSupportZone && hasResistanceZone) score += 10;

  if (divergence === "bullish" && (primaryTrend === "bullish" || pivotSessionBias === "bullish")) score += 10;
  if (divergence === "bearish" && (primaryTrend === "bearish" || pivotSessionBias === "bearish")) score += 10;

  if (atInflectionPoint) score += 15;

  return clamp(score, 0, 100);
}

export function derivePrimaryTrend(
  price: number | null,
  ema20: number | null,
  ema50: number | null,
): "bullish" | "bearish" | "sideways" {
  if (price == null || ema20 == null || ema50 == null) return "sideways";
  if (price > ema20 && ema20 > ema50) return "bullish";
  if (price < ema20 && ema20 < ema50) return "bearish";
  return "sideways";
}

/** Full market-structure pipeline from enriched candles. */
export function buildMarketStructure(
  candles: Candle[],
  rsiSeries?: (number | null)[],
  options: { lookback?: number; atrPeriod?: number } = {},
): MarketStructureResult {
  const lookback = options.lookback ?? 2;
  const atrPeriod = options.atrPeriod ?? 14;
  const { value: atr } = calculateATR(candles, atrPeriod);
  const totalBars = candles.length;

  const raw = findFractalSwings(candles, lookback);
  const filteredHighs = filterByProminence(raw.swingHighs, candles, atr, 1);
  const filteredLows = filterByProminence(raw.swingLows, candles, atr, 1);

  const resistanceZones = clusterIntoZones(filteredHighs, atr, 0.5, totalBars);
  const supportZones = clusterIntoZones(filteredLows, atr, 0.5, totalBars);

  const price = candles[candles.length - 1]?.close ?? 0;
  const { nearestSupport: supZone, nearestResistance: resZone } = nearestZones(price, supportZones, resistanceZones);

  const rsi = rsiSeries ?? candles.map((c) => (c as Candle & { rsi14?: number | null }).rsi14 ?? null);
  const divergence = detectRsiDivergence(candles, rsi);

  return {
    atr,
    divergence,
    swingHighs: filteredHighs,
    swingLows: filteredLows,
    srZones: { supports: supportZones, resistances: resistanceZones },
    nearestSupport: supZone ? { price: supZone.mid, time: filteredLows.find((s) => s.index === supZone.lastIndex)?.time } : null,
    nearestResistance: resZone ? { price: resZone.mid, time: filteredHighs.find((s) => s.index === resZone.lastIndex)?.time } : null,
  };
}
