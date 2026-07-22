/**
 * Canonical pivot calculation module — single source of truth for Forge.
 * Formulas match TradingView Pivot Points Standard (Traditional, Fibonacci, Woodie, Classic, DM, Camarilla).
 * Base data: native Binance higher-timeframe klines (1d / 1w / 1M), not chart-candle aggregation.
 */

import { calculateATR, inflectionThreshold } from "./marketStructure.ts";
import { fetchBinanceHtfKlines } from "./pivotFetch.ts";

export { BINANCE_KLINES_URL, parseBinanceKlines, fetchBinanceHtfKlines } from "./pivotFetch.ts";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type PivotLevels = Record<string, number | null | string | unknown> & {
  PP: number | null;
  R1: number | null;
  R2: number | null;
  R3: number | null;
  R4: number | null;
  R5: number | null;
  S1: number | null;
  S2: number | null;
  S3: number | null;
  S4: number | null;
  S5: number | null;
};

export type PivotBias = "bullish" | "bearish" | "neutral";

export type PivotPeriodType = "daily" | "weekly" | "monthly" | "yearly";
export type PivotTimeframePreference = "auto" | PivotPeriodType;

export type GroupedPeriod = {
  high: number;
  low: number;
  close: number;
  open: number;
  period: string;
  startTime: number;
  endTime: number;
  isCurrent: boolean;
};

export type ChartPrefs = {
  pivotType?: string;
  pivotsBack?: number;
  showHistoricalPivots?: boolean;
  pivotTimeframe?: PivotTimeframePreference;
};

export const ALLOWED_CHART_INTERVALS = new Set([
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
]);

const PIVOT_TIMEFRAME_OPTIONS = new Set<PivotTimeframePreference>([
  "auto", "daily", "weekly", "monthly", "yearly",
]);

const LEVEL_ORDER: Record<string, number> = {
  S5: 1, S4: 2, S3: 3, S2: 4, S1: 5, PP: 6,
  R1: 7, R2: 8, R3: 9, R4: 10, R5: 11,
};

const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "8h": 28800, "12h": 43200,
  "1d": 86400, "3d": 259200, "1w": 604800,
};

export const PIVOT_LEVEL_KEYS = [
  "S5", "S4", "S3", "S2", "S1", "PP", "R1", "R2", "R3", "R4", "R5",
] as const;

export const PIVOT_SEGMENT_CAP = 500;

/** Chart bar step in seconds for whitespace extension (matches chart interval). */
export function getChartIntervalSeconds(chartInterval: string, candles: Candle[] = []): number {
  if (INTERVAL_SECONDS[chartInterval]) return INTERVAL_SECONDS[chartInterval];
  if (candles.length >= 2) {
    const diff = candles[candles.length - 1].time - candles[candles.length - 2].time;
    if (diff > 0) return diff;
  }
  return INTERVAL_SECONDS["1d"];
}

/** Projected UTC calendar end of a pivot period (TradingView extends current period here). */
export function projectPivotPeriodEnd(startTime: number, periodType: PivotPeriodType): number {
  const d = new Date(startTime * 1000);
  if (periodType === "daily") {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (periodType === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
  } else if (periodType === "monthly") {
    d.setUTCMonth(d.getUTCMonth() + 1);
  } else if (periodType === "yearly") {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return Math.floor(d.getTime() / 1000);
}

/** Number of drawable levels for a pivot type (used for 500-segment cap). */
export function countPivotLevelsForType(pivotType: string): number {
  const t = String(pivotType ?? "traditional").toLowerCase();
  if (t === "fibonacci") return 7;
  if (t === "dm") return 3;
  if (t === "classic" || t === "woodie") return 9;
  return 11;
}

/** Max pivots-back count so periods × enabledLevels never exceeds 500 segments. */
export function maxPivotsBackForType(pivotType: string, enabledLevelCount?: number): number {
  const levels = enabledLevelCount ?? countPivotLevelsForType(pivotType);
  if (levels <= 0) return 0;
  return Math.floor(PIVOT_SEGMENT_CAP / levels);
}

export function round6(value: number): number {
  return Number(value.toFixed(6));
}

export function sanitizePivotTimeframe(raw: unknown): PivotTimeframePreference {
  const v = String(raw ?? "auto").trim().toLowerCase();
  return PIVOT_TIMEFRAME_OPTIONS.has(v as PivotTimeframePreference)
    ? (v as PivotTimeframePreference)
    : "auto";
}

/** TradingView Auto: <=15m daily; >15m and <1d weekly; >=1d monthly */
export function getPivotPeriodAuto(chartInterval: string): PivotPeriodType {
  const intraday = new Set(["1m", "3m", "5m", "15m"]);
  const weeklyBand = new Set(["30m", "1h", "2h", "4h", "6h", "8h", "12h"]);
  const monthlyBand = new Set(["1d", "3d", "1w", "1M"]);

  if (intraday.has(chartInterval)) return "daily";
  if (weeklyBand.has(chartInterval)) return "weekly";
  if (monthlyBand.has(chartInterval)) return "monthly";
  return "daily";
}

export function resolvePivotPeriod(
  chartInterval: string,
  pivotTimeframe: PivotTimeframePreference = "auto",
): PivotPeriodType {
  if (pivotTimeframe !== "auto") return pivotTimeframe;
  return getPivotPeriodAuto(chartInterval);
}

export function getPivotPeriodLabel(periodType: string): string {
  const labels: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
    quarterly: "Quarterly",
  };
  return labels[periodType] ?? periodType;
}

/** Binance kline interval for pivot base data */
export function getBinanceIntervalForPeriod(period: PivotPeriodType): string {
  if (period === "daily") return "1d";
  if (period === "weekly") return "1w";
  if (period === "monthly" || period === "yearly") return "1M";
  return "1d";
}

/** HTF rows to request: pivotsBack completed sets + current + one prior source period */
export function getHtfFetchLimit(pivotsBack: number, period: PivotPeriodType): number {
  const targetPeriods = Math.max(1, Math.min(50, pivotsBack)) + 2;
  if (period === "yearly") {
    return Math.min(1000, targetPeriods * 12);
  }
  return Math.min(1000, targetPeriods);
}

export function calculatePivotsGeneric(
  prevHigh: number,
  prevLow: number,
  prevClose: number,
  prevOpen?: number | null,
  currOpen?: number | null,
  pivotType = "traditional",
): PivotLevels {
  const levels: PivotLevels = {
    PP: null,
    R1: null, R2: null, R3: null, R4: null, R5: null,
    S1: null, S2: null, S3: null, S4: null, S5: null,
  };

  if (pivotType === "traditional") {
    const pp = (prevHigh + prevLow + prevClose) / 3;
    levels.PP = pp;
    levels.R1 = pp * 2 - prevLow;
    levels.S1 = pp * 2 - prevHigh;
    levels.R2 = pp + (prevHigh - prevLow);
    levels.S2 = pp - (prevHigh - prevLow);
    levels.R3 = pp * 2 + (prevHigh - 2 * prevLow);
    levels.S3 = pp * 2 - (2 * prevHigh - prevLow);
    levels.R4 = pp * 3 + (prevHigh - 3 * prevLow);
    levels.S4 = pp * 3 - (3 * prevHigh - prevLow);
    levels.R5 = pp * 4 + (prevHigh - 4 * prevLow);
    levels.S5 = pp * 4 - (4 * prevHigh - prevLow);
  } else if (pivotType === "fibonacci") {
    const pp = (prevHigh + prevLow + prevClose) / 3;
    levels.PP = pp;
    levels.R1 = pp + 0.382 * (prevHigh - prevLow);
    levels.S1 = pp - 0.382 * (prevHigh - prevLow);
    levels.R2 = pp + 0.618 * (prevHigh - prevLow);
    levels.S2 = pp - 0.618 * (prevHigh - prevLow);
    levels.R3 = pp + (prevHigh - prevLow);
    levels.S3 = pp - (prevHigh - prevLow);
  } else if (pivotType === "woodie") {
    const co = currOpen ?? prevClose;
    const pp = (prevHigh + prevLow + 2 * co) / 4;
    levels.PP = pp;
    levels.R1 = 2 * pp - prevLow;
    levels.S1 = 2 * pp - prevHigh;
    levels.R2 = pp + (prevHigh - prevLow);
    levels.S2 = pp - (prevHigh - prevLow);
    levels.R3 = prevHigh + 2 * (pp - prevLow);
    levels.S3 = prevLow - 2 * (prevHigh - pp);
    levels.R4 = (levels.R3 ?? 0) + (prevHigh - prevLow);
    levels.S4 = (levels.S3 ?? 0) - (prevHigh - prevLow);
  } else if (pivotType === "classic") {
    const pp = (prevHigh + prevLow + prevClose) / 3;
    levels.PP = pp;
    levels.R1 = 2 * pp - prevLow;
    levels.S1 = 2 * pp - prevHigh;
    levels.R2 = pp + (prevHigh - prevLow);
    levels.S2 = pp - (prevHigh - prevLow);
    levels.R3 = pp + 2 * (prevHigh - prevLow);
    levels.S3 = pp - 2 * (prevHigh - prevLow);
    levels.R4 = pp + 3 * (prevHigh - prevLow);
    levels.S4 = pp - 3 * (prevHigh - prevLow);
  } else if (pivotType === "dm") {
    const po = prevOpen ?? prevClose;
    let X = 0;
    if (po === prevClose) {
      X = prevHigh + prevLow + 2 * prevClose;
    } else if (prevClose > po) {
      X = 2 * prevHigh + prevLow + prevClose;
    } else {
      X = 2 * prevLow + prevHigh + prevClose;
    }
    const pp = X / 4;
    levels.PP = pp;
    levels.R1 = X / 2 - prevLow;
    levels.S1 = X / 2 - prevHigh;
  } else if (pivotType === "camarilla") {
    const pp = (prevHigh + prevLow + prevClose) / 3;
    levels.PP = pp;
    levels.R1 = prevClose + 1.1 * (prevHigh - prevLow) / 12;
    levels.S1 = prevClose - 1.1 * (prevHigh - prevLow) / 12;
    levels.R2 = prevClose + 1.1 * (prevHigh - prevLow) / 6;
    levels.S2 = prevClose - 1.1 * (prevHigh - prevLow) / 6;
    levels.R3 = prevClose + 1.1 * (prevHigh - prevLow) / 4;
    levels.S3 = prevClose - 1.1 * (prevHigh - prevLow) / 4;
    levels.R4 = prevClose + 1.1 * (prevHigh - prevLow) / 2;
    levels.S4 = prevClose - 1.1 * (prevHigh - prevLow) / 2;
    levels.R5 = (prevHigh / prevLow) * prevClose;
    levels.S5 = prevClose - ((levels.R5 as number) - prevClose);
  }

  for (const key of Object.keys(levels)) {
    const val = levels[key];
    if (val !== null && val !== undefined && typeof val === "number") {
      levels[key] = round6(val);
    }
  }

  return levels;
}

/** Aggregate native monthly klines into calendar-year OHLC buckets */
export function aggregateMonthlyToYearly(monthlyCandles: Candle[]): GroupedPeriod[] {
  const groups = new Map<number, Candle[]>();
  for (const c of monthlyCandles) {
    const year = new Date(c.time * 1000).getUTCFullYear();
    groups.set(year, [...(groups.get(year) ?? []), c]);
  }

  const years = [...groups.keys()].sort((a, b) => a - b);
  return years.map((year, idx) => {
    const periodCandles = [...(groups.get(year) ?? [])].sort((a, b) => a.time - b.time);
    const startTime = periodCandles[0].time;
    const endTime = periodCandles[periodCandles.length - 1].time;
    return {
      high: Math.max(...periodCandles.map((c) => c.high)),
      low: Math.min(...periodCandles.map((c) => c.low)),
      close: periodCandles[periodCandles.length - 1].close,
      open: periodCandles[0].open,
      period: `${year}-01-01T00:00:00.000Z`,
      startTime,
      endTime,
      isCurrent: idx === years.length - 1,
    };
  });
}

/** Map native HTF klines to grouped period rows (daily/weekly/monthly) */
export function htfCandlesToGroupedPeriods(candles: Candle[]): GroupedPeriod[] {
  if (!candles.length) return [];
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  return sorted.map((c, idx) => ({
    high: c.high,
    low: c.low,
    close: c.close,
    open: c.open,
    period: new Date(c.time * 1000).toISOString(),
    startTime: c.time,
    endTime: c.time,
    isCurrent: idx === sorted.length - 1,
  }));
}

export function getHtfBarIntervalSeconds(
  grouped: GroupedPeriod[],
  period: PivotPeriodType,
): number {
  if (grouped.length >= 2) {
    const diff = grouped[grouped.length - 1].startTime - grouped[grouped.length - 2].startTime;
    if (diff > 0) return diff;
  }
  if (period === "weekly") return INTERVAL_SECONDS["1w"];
  if (period === "monthly" || period === "yearly") return 30 * 86400;
  return INTERVAL_SECONDS["1d"];
}

export function resolvePeriodEndTime(
  currCandle: GroupedPeriod,
  nextCandle: GroupedPeriod | null,
  periodType: PivotPeriodType,
): number {
  if (nextCandle && !currCandle.isCurrent) return nextCandle.startTime;
  return projectPivotPeriodEnd(currCandle.startTime, periodType);
}

function withMeta(levels: PivotLevels, type: string, period: string, basedOn: unknown) {
  return {
    ...levels,
    type,
    period,
    basedOn,
    generatedAt: new Date().toISOString(),
  };
}

function finiteLevel(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type AnalyzePivotsOptions = {
  atr?: number | null;
  k?: number;
};

/** Null-safe zone classification using only defined levels (fixes DM/Fibonacci NaN bug) */
export function analyzePriceVsPivots(currentPrice: number, pivots: PivotLevels, options: AnalyzePivotsOptions = {}) {
  const excluded = new Set(["type", "period", "basedOn", "generatedAt"]);
  const allLevels = Object.entries(pivots)
    .filter(([label, value]) => !excluded.has(label) && typeof value === "number" && Number.isFinite(value))
    .map(([label, value]) => ({ label, value: value as number }))
    .sort((a, b) => (LEVEL_ORDER[a.label] ?? 999) - (LEVEL_ORDER[b.label] ?? 999));

  const pp = finiteLevel(pivots.PP);

  let zone = "unknown";
  if (pp === null) {
    zone = "unknown";
  } else if (allLevels.length === 0) {
    zone = "unknown";
  } else {
    const above = allLevels.filter((l) => l.value > currentPrice);
    const below = allLevels.filter((l) => l.value < currentPrice);

    if (above.length === 0 && below.length > 0) {
      const highest = below[below.length - 1];
      zone = `above_${highest.label}`;
    } else if (below.length === 0 && above.length > 0) {
      const lowest = above[0];
      zone = `below_${lowest.label}`;
    } else if (above.length > 0 && below.length > 0) {
      const nearestBelow = below[below.length - 1];
      const nearestAbove = above[0];
      if (nearestBelow.label === "PP" && nearestAbove.label === "R1") {
        zone = "between_PP_R1";
      } else if (nearestBelow.label === "S1" && nearestAbove.label === "PP") {
        zone = "between_S1_PP";
      } else {
        zone = `between_${nearestBelow.label}_${nearestAbove.label}`;
      }
    }
  }

  const aboveSorted = allLevels.filter((l) => l.value > currentPrice).sort((a, b) => a.value - b.value);
  const belowSorted = allLevels.filter((l) => l.value < currentPrice).sort((a, b) => b.value - a.value);
  const nearestResistance = aboveSorted[0] ?? null;
  const nearestSupport = belowSorted[0] ?? null;

  const threshold = inflectionThreshold(currentPrice, options.atr ?? null, options.k ?? 0.5);
  const levelsWithDist = allLevels
    .map((l) => ({ ...l, dist: Math.abs(currentPrice - l.value) / currentPrice }))
    .sort((a, b) => a.dist - b.dist);
  const nearestLevel = levelsWithDist[0];
  const atInflectionPoint = nearestLevel ? nearestLevel.dist < threshold : false;

  // Typed explicitly — without it this ternary chain widens to `string`, which breaks callers
  // (e.g. computeSignalAgreement) that expect the literal "bullish"|"bearish"|"neutral" union and
  // would otherwise need an unsafe cast at every call site.
  const bias: PivotBias = pp === null
    ? "neutral"
    : currentPrice > pp
    ? "bullish"
    : currentPrice < pp
    ? "bearish"
    : "neutral";

  return {
    zone,
    bias,
    nearestResistance,
    nearestSupport,
    distToResistance: nearestResistance
      ? Number((((nearestResistance.value - currentPrice) / currentPrice) * 100).toFixed(3))
      : null,
    distToSupport: nearestSupport
      ? Number((((currentPrice - nearestSupport.value) / currentPrice) * 100).toFixed(3))
      : null,
    atInflectionPoint,
    inflectionLevel: atInflectionPoint && nearestLevel
      ? { label: nearestLevel.label, value: nearestLevel.value }
      : null,
    sessionBullish: pp === null ? false : currentPrice > pp,
    allLevels,
  };
}

export type BuildPivotDataInput = {
  htfCandles: Candle[];
  chartCandles: Candle[];
  chartInterval: string;
  symbol?: string;
  chartPrefs?: ChartPrefs;
};

export type PivotDataResponse = {
  success: boolean;
  symbol?: string;
  timeframe: string;
  currentPrice: number;
  pivotTimeframe?: PivotTimeframePreference;
  classic: { pivots: ReturnType<typeof withMeta>; analysis: ReturnType<typeof analyzePriceVsPivots> };
  fibonacci: { pivots: ReturnType<typeof withMeta>; analysis: ReturnType<typeof analyzePriceVsPivots> };
  traditional: { pivots: ReturnType<typeof withMeta>; analysis: ReturnType<typeof analyzePriceVsPivots> };
  woodie: { pivots: ReturnType<typeof withMeta>; analysis: ReturnType<typeof analyzePriceVsPivots> };
  dm: { pivots: ReturnType<typeof withMeta>; analysis: ReturnType<typeof analyzePriceVsPivots> };
  camarilla: { pivots: ReturnType<typeof withMeta>; analysis: ReturnType<typeof analyzePriceVsPivots> };
  binance: { pivots: ReturnType<typeof withMeta>; analysis: ReturnType<typeof analyzePriceVsPivots> };
  standardPeriods: {
    periodType: PivotPeriodType;
    requestedCount: number;
    availableCount: number;
    items: Array<{
      period: string;
      startTime: number;
      endTime: number;
      isCurrent: boolean;
      sourcePeriod: string;
      pivots: PivotLevels;
    }>;
  };
  atr?: number | null;
  error?: string;
};

/** Build full pivot payload from native HTF candles + chart candles for current price/timing */
export function buildPivotDataFromHtf(input: BuildPivotDataInput): PivotDataResponse | null {
  const {
    htfCandles,
    chartCandles,
    chartInterval,
    symbol,
    chartPrefs = {},
  } = input;

  if (!htfCandles.length || chartCandles.length < 1) return null;

  const pivotTimeframe = sanitizePivotTimeframe(chartPrefs.pivotTimeframe);
  const period = resolvePivotPeriod(chartInterval, pivotTimeframe);
  const pivotType = String(chartPrefs.pivotType ?? "traditional").toLowerCase();
  const pivotsBackCap = maxPivotsBackForType(pivotType);
  const pivotsBack = Math.max(1, Math.min(50, pivotsBackCap, Number(chartPrefs.pivotsBack) || 15));
  const showHistoricalPivots = chartPrefs.showHistoricalPivots !== false;

  const groupedPeriods = period === "yearly"
    ? aggregateMonthlyToYearly(htfCandles)
    : htfCandlesToGroupedPeriods(htfCandles);

  if (groupedPeriods.length < 2) return null;

  const completed = groupedPeriods[groupedPeriods.length - 2];
  const currentPrice = chartCandles[chartCandles.length - 1].close;
  const currOpen = groupedPeriods[groupedPeriods.length - 1].open;

  const classicPivots = withMeta(
    calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "classic"),
    "classic", period, completed,
  );
  const fibonacciPivots = withMeta(
    calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "fibonacci"),
    "fibonacci", period, completed,
  );
  const traditionalPivots = withMeta(
    calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "traditional"),
    "traditional", period, completed,
  );
  const woodiePivots = withMeta(
    calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "woodie"),
    "woodie", period, completed,
  );
  const dmPivots = withMeta(
    calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "dm"),
    "dm", period, completed,
  );
  const camarillaPivots = withMeta(
    calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "camarilla"),
    "camarilla", period, completed,
  );

  const displayPeriods = groupedPeriods.slice(-(pivotsBack + 1));
  const standardPeriods: PivotDataResponse["standardPeriods"]["items"] = [];

  for (let i = 1; i < displayPeriods.length; i++) {
    const prevCandle = displayPeriods[i - 1];
    const currCandle = displayPeriods[i];
    const nextCandle = displayPeriods[i + 1] ?? null;
    const endTime = resolvePeriodEndTime(currCandle, nextCandle, period);

    standardPeriods.push({
      period: currCandle.period,
      startTime: currCandle.startTime,
      endTime,
      isCurrent: Boolean(currCandle.isCurrent),
      sourcePeriod: prevCandle.period,
      pivots: calculatePivotsGeneric(
        prevCandle.high, prevCandle.low, prevCandle.close, prevCandle.open, currCandle.open, pivotType,
      ),
    });
  }

  const visibleStandardPeriods = showHistoricalPivots
    ? standardPeriods
    : (standardPeriods.length ? [standardPeriods[standardPeriods.length - 1]] : []);

  const { value: atr } = calculateATR(chartCandles, 14);
  const pivotOpts: AnalyzePivotsOptions = { atr };

  return {
    success: true,
    symbol,
    timeframe: chartInterval,
    currentPrice,
    pivotTimeframe,
    atr,
    classic: { pivots: classicPivots, analysis: analyzePriceVsPivots(currentPrice, classicPivots, pivotOpts) },
    fibonacci: { pivots: fibonacciPivots, analysis: analyzePriceVsPivots(currentPrice, fibonacciPivots, pivotOpts) },
    traditional: { pivots: traditionalPivots, analysis: analyzePriceVsPivots(currentPrice, traditionalPivots, pivotOpts) },
    woodie: { pivots: woodiePivots, analysis: analyzePriceVsPivots(currentPrice, woodiePivots, pivotOpts) },
    dm: { pivots: dmPivots, analysis: analyzePriceVsPivots(currentPrice, dmPivots, pivotOpts) },
    camarilla: { pivots: camarillaPivots, analysis: analyzePriceVsPivots(currentPrice, camarillaPivots, pivotOpts) },
    binance: { pivots: traditionalPivots, analysis: analyzePriceVsPivots(currentPrice, traditionalPivots, pivotOpts) },
    standardPeriods: {
      periodType: period,
      requestedCount: pivotsBack,
      availableCount: visibleStandardPeriods.length,
      items: visibleStandardPeriods,
    },
  };
}

/** Fetch HTF klines and build pivot data (used by edge function and client fallback) */
export async function buildPivotData(
  chartCandles: Candle[],
  chartInterval: string,
  symbol: string,
  chartPrefs: ChartPrefs = {},
): Promise<PivotDataResponse | null> {
  if (!Array.isArray(chartCandles) || chartCandles.length < 1) return null;
  if (!symbol) return null;

  const pivotTimeframe = sanitizePivotTimeframe(chartPrefs.pivotTimeframe);
  const period = resolvePivotPeriod(chartInterval, pivotTimeframe);
  const binanceInterval = getBinanceIntervalForPeriod(period);
  const pivotsBack = Math.max(1, Math.min(50, Number(chartPrefs.pivotsBack) || 15));
  const limit = getHtfFetchLimit(pivotsBack, period);

  const htfCandles = await fetchBinanceHtfKlines(symbol, binanceInterval, limit);
  return buildPivotDataFromHtf({
    htfCandles,
    chartCandles,
    chartInterval,
    symbol,
    chartPrefs: { ...chartPrefs, pivotTimeframe },
  });
}

/** Verify Binance 1w kline opens on Monday 00:00 UTC */
export function isMondayUtc(timestampSeconds: number): boolean {
  const d = new Date(timestampSeconds * 1000);
  return d.getUTCDay() === 1 && d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
}
