import { handleOptions, jsonResponse } from "../_shared/cors.ts";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type PivotLevels = Record<string, number | null> & {
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

const ALLOWED_INTERVALS = new Set([
  "1m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
]);

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function calculatePivotsGeneric(
  prevHigh: number,
  prevLow: number,
  prevClose: number,
  prevOpen?: number | null,
  currOpen?: number | null,
  pivotType = "traditional"
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
    levels.S5 = prevClose - (levels.R5 - prevClose);
  }

  // Round values
  for (const key of Object.keys(levels)) {
    const val = levels[key];
    if (val !== null && val !== undefined) {
      levels[key] = round2(val);
    }
  }

  return levels;
}

function getPivotPeriod(timeframe: string): string {
  const mapping: Record<string, string> = {
    "1m": "daily", "3m": "daily", "5m": "daily",
    "15m": "daily", "30m": "daily", "1h": "daily", "2h": "daily",
    "4h": "weekly", "6h": "weekly", "8h": "weekly", "12h": "weekly",
    "1d": "monthly", "3d": "monthly",
    "1w": "quarterly",
  };
  return mapping[timeframe] ?? "daily";
}

function bucketStart(timestampSeconds: number, period: string): string {
  const d = new Date(timestampSeconds * 1000);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  if (period === "weekly") {
    const dayOfWeek = d.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(Date.UTC(year, month, day + mondayOffset));
    return start.toISOString();
  }

  if (period === "monthly") return new Date(Date.UTC(year, month, 1)).toISOString();

  if (period === "quarterly") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    return new Date(Date.UTC(year, quarterStartMonth, 1)).toISOString();
  }

  return new Date(Date.UTC(year, month, day)).toISOString();
}

function groupPeriodCandles(candles: Candle[], period: string) {
  const groups = new Map<string, Candle[]>();
  for (const candle of candles) {
    const key = bucketStart(candle.time, period);
    groups.set(key, [...(groups.get(key) ?? []), candle]);
  }

  const keys = [...groups.keys()].sort();
  return keys.map((key, idx) => {
    const periodCandles = [...(groups.get(key) ?? [])].sort((a, b) => a.time - b.time);
    return {
      high: Math.max(...periodCandles.map((c) => c.high)),
      low: Math.min(...periodCandles.map((c) => c.low)),
      close: periodCandles[periodCandles.length - 1].close,
      open: periodCandles[0].open,
      period: key,
      startTime: periodCandles[0].time,
      endTime: periodCandles[periodCandles.length - 1].time,
      isCurrent: idx === keys.length - 1,
    };
  });
}

function getCurrentPeriodOpen(candles: Candle[], period: string): number | null {
  const grouped = groupPeriodCandles(candles, period);
  if (!grouped.length) return null;
  return grouped[grouped.length - 1].open;
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

function analyzePriceVsPivots(currentPrice: number, pivots: PivotLevels) {
  const pp = pivots.PP;
  const r1 = pivots.R1;
  const r2 = pivots.R2;
  const r3 = pivots.R3;
  const s1 = pivots.S1;
  const s2 = pivots.S2;
  const s3 = pivots.S3;

  let zone = "below_S3";
  if (pp === null) zone = "unknown";
  else if (r3 !== null && currentPrice > r3) zone = "above_R3";
  else if (r2 !== null && r3 !== null && currentPrice > r2) zone = "between_R2_R3";
  else if (r1 !== null && r2 !== null && currentPrice > r1) zone = "between_R1_R2";
  else if (r1 !== null && currentPrice > pp) zone = "between_PP_R1";
  else if (s1 !== null && currentPrice > s1) zone = "between_S1_PP";
  else if (s1 !== null && s2 !== null && currentPrice > s2) zone = "between_S2_S1";
  else if (s2 !== null && s3 !== null && currentPrice > s3) zone = "between_S3_S2";

  const order: Record<string, number> = { S5: 1, S4: 2, S3: 3, S2: 4, S1: 5, PP: 6, R1: 7, R2: 8, R3: 9, R4: 10, R5: 11 };
  const excluded = new Set(["type", "period", "basedOn", "generatedAt"]);
  const allLevels = Object.entries(pivots)
    .filter(([label, value]) => !excluded.has(label) && typeof value === "number")
    .map(([label, value]) => ({ label, value: value as number }))
    .sort((a, b) => (order[a.label] ?? 999) - (order[b.label] ?? 999));

  const above = allLevels.filter((l) => l.value > currentPrice).sort((a, b) => a.value - b.value);
  const below = allLevels.filter((l) => l.value < currentPrice).sort((a, b) => b.value - a.value);
  const nearestResistance = above[0] ?? null;
  const nearestSupport = below[0] ?? null;
  const levelsWithDist = allLevels
    .map((l) => ({ ...l, dist: Math.abs(currentPrice - l.value) / currentPrice }))
    .sort((a, b) => a.dist - b.dist);
  const nearestLevel = levelsWithDist[0];
  const atInflectionPoint = nearestLevel ? nearestLevel.dist < 0.003 : false;

  return {
    zone,
    bias: pp === null ? "neutral" : currentPrice > pp ? "bullish" : currentPrice < pp ? "bearish" : "neutral",
    nearestResistance,
    nearestSupport,
    distToResistance: nearestResistance ? Number((((nearestResistance.value - currentPrice) / currentPrice) * 100).toFixed(3)) : null,
    distToSupport: nearestSupport ? Number((((currentPrice - nearestSupport.value) / currentPrice) * 100).toFixed(3)) : null,
    atInflectionPoint,
    inflectionLevel: atInflectionPoint && nearestLevel ? { label: nearestLevel.label, value: nearestLevel.value } : null,
    sessionBullish: pp === null ? false : currentPrice > pp,
    allLevels,
  };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json();
    const candles = body.candles;
    const timeframe = String(body.timeframe ?? body.interval ?? "4h").trim();
    const pivotType = String(body.pivotType ?? "traditional").trim().toLowerCase();
    const pivotsBack = Math.max(1, Math.min(50, Number(body.pivotsBack ?? body.pivots_back) || 15));
    const showHistoricalPivots = body.showHistoricalPivots !== false;

    if (!Array.isArray(candles) || candles.length < 2) {
      return jsonResponse({ success: false, error: "candles array is required." }, 400);
    }
    if (!ALLOWED_INTERVALS.has(timeframe)) {
      return jsonResponse({ success: false, error: "Invalid interval." }, 400);
    }

    const normalizedCandles = candles.map((c) => ({
      time: Number(c.time),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    })).filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));

    const period = getPivotPeriod(timeframe);
    const groupedPeriods = groupPeriodCandles(normalizedCandles, period);
    const completed = groupedPeriods.length >= 2 ? groupedPeriods[groupedPeriods.length - 2] : null;
    if (!completed) {
      return jsonResponse({ success: false, error: "Not enough data to compute pivots for this timeframe." }, 400);
    }

    const currentPrice = normalizedCandles[normalizedCandles.length - 1].close;
    const currOpen = getCurrentPeriodOpen(normalizedCandles, period);

    const classicPivots = withMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "classic"), "classic", period, completed);
    const fibonacciPivots = withMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "fibonacci"), "fibonacci", period, completed);
    const traditionalPivots = withMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "traditional"), "traditional", period, completed);
    const woodiePivots = withMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "woodie"), "woodie", period, completed);
    const dmPivots = withMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "dm"), "dm", period, completed);
    const camarillaPivots = withMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, "camarilla"), "camarilla", period, completed);

    const displayPeriods = groupedPeriods.slice(-(pivotsBack + 1));
    const standardPeriods = [];
    for (let i = 1; i < displayPeriods.length; i++) {
      const prevCandle = displayPeriods[i - 1];
      const currCandle = displayPeriods[i];
      standardPeriods.push({
        period: currCandle.period,
        startTime: currCandle.startTime,
        endTime: currCandle.endTime,
        isCurrent: Boolean(currCandle.isCurrent),
        sourcePeriod: prevCandle.period,
        pivots: calculatePivotsGeneric(prevCandle.high, prevCandle.low, prevCandle.close, prevCandle.open, currCandle.open, pivotType),
      });
    }
    const visibleStandardPeriods = showHistoricalPivots
      ? standardPeriods
      : (standardPeriods.length ? [standardPeriods[standardPeriods.length - 1]] : []);

    return jsonResponse({
      success: true,
      timeframe,
      currentPrice,
      classic: { pivots: classicPivots, analysis: analyzePriceVsPivots(currentPrice, classicPivots) },
      fibonacci: { pivots: fibonacciPivots, analysis: analyzePriceVsPivots(currentPrice, fibonacciPivots) },
      traditional: { pivots: traditionalPivots, analysis: analyzePriceVsPivots(currentPrice, traditionalPivots) },
      woodie: { pivots: woodiePivots, analysis: analyzePriceVsPivots(currentPrice, woodiePivots) },
      dm: { pivots: dmPivots, analysis: analyzePriceVsPivots(currentPrice, dmPivots) },
      camarilla: { pivots: camarillaPivots, analysis: analyzePriceVsPivots(currentPrice, camarillaPivots) },
      binance: { pivots: traditionalPivots, analysis: analyzePriceVsPivots(currentPrice, traditionalPivots) },
      standardPeriods: {
        periodType: period,
        requestedCount: pivotsBack,
        availableCount: visibleStandardPeriods.length,
        items: visibleStandardPeriods,
      },
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
