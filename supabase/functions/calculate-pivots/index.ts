import { handleOptions, jsonResponse } from "../_shared/cors.ts";

type Candle = {
  time: number;
  high: number;
  low: number;
  close: number;
};

type PivotLevels = Record<string, number> & {
  PP: number;
  R1: number;
  R2: number;
  R3: number;
  S1: number;
  S2: number;
  S3: number;
};

const ALLOWED_INTERVALS = new Set([
  "1m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
]);

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function calculateClassicPivots(high: number, low: number, close: number): PivotLevels {
  // Classic/Floor formula, matching Python:
  // PP = (high + low + close) / 3
  // R1 = 2*PP - low, R2 = PP + (high-low), R3 = high + 2*(PP-low)
  // S1 = 2*PP - high, S2 = PP - (high-low), S3 = low - 2*(high-PP)
  const pp = (high + low + close) / 3;
  return {
    PP: round2(pp),
    R1: round2(2 * pp - low),
    R2: round2(pp + (high - low)),
    R3: round2(high + 2 * (pp - low)),
    S1: round2(2 * pp - high),
    S2: round2(pp - (high - low)),
    S3: round2(low - 2 * (high - pp)),
  };
}

function calculateFibonacciPivots(high: number, low: number, close: number): PivotLevels {
  // Fibonacci formula, matching Python:
  // PP = (high + low + close) / 3, range = high - low
  // R1/R2/R3 = PP + 0.382/0.618/1.000 * range
  // S1/S2/S3 = PP - 0.382/0.618/1.000 * range
  const pp = (high + low + close) / 3;
  const range = high - low;
  return {
    PP: round2(pp),
    R1: round2(pp + 0.382 * range),
    R2: round2(pp + 0.618 * range),
    R3: round2(pp + 1.000 * range),
    S1: round2(pp - 0.382 * range),
    S2: round2(pp - 0.618 * range),
    S3: round2(pp - 1.000 * range),
  };
}

function calculateTraditionalPivots(high: number, low: number, close: number): PivotLevels & Record<"R4" | "R5" | "S4" | "S5", number> {
  const pp = (high + low + close) / 3;
  const range = high - low;
  const r1 = pp * 2 - low;
  const r2 = pp + range;
  const r3 = pp * 2 + (high - 2 * low);
  const r4 = r3 + range;
  const r5 = r4 + range;
  const s1 = pp * 2 - high;
  const s2 = pp - range;
  const s3 = pp * 2 - (2 * high - low);
  const s4 = s3 - range;
  const s5 = s4 - range;
  return {
    PP: round2(pp),
    R1: round2(r1),
    R2: round2(r2),
    R3: round2(r3),
    R4: round2(r4),
    R5: round2(r5),
    S1: round2(s1),
    S2: round2(s2),
    S3: round2(s3),
    S4: round2(s4),
    S5: round2(s5),
  };
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

function groupCompletedCandles(candles: Candle[], period: string, count = 1) {
  const groups = new Map<string, Candle[]>();
  for (const candle of candles) {
    const key = bucketStart(candle.time, period);
    groups.set(key, [...(groups.get(key) ?? []), candle]);
  }

  const keys = [...groups.keys()].sort();
  if (keys.length < 2) return [];
  return keys.slice(0, -1).slice(-count).map((key) => {
    const periodCandles = [...(groups.get(key) ?? [])].sort((a, b) => a.time - b.time);
    return {
      high: Math.max(...periodCandles.map((c) => c.high)),
      low: Math.min(...periodCandles.map((c) => c.low)),
      close: periodCandles[periodCandles.length - 1].close,
      period: key,
      startTime: periodCandles[0].time,
      endTime: periodCandles[periodCandles.length - 1].time,
    };
  });
}

function withMeta(levels: Record<string, number>, type: string, period: string, basedOn: unknown) {
  return {
    ...levels,
    type,
    period,
    basedOn,
    generatedAt: new Date().toISOString(),
  };
}

function analyzePriceVsPivots(currentPrice: number, pivots: Record<string, number | string | unknown>) {
  const pp = Number(pivots.PP);
  const r1 = Number(pivots.R1);
  const r2 = Number(pivots.R2);
  const r3 = Number(pivots.R3);
  const s1 = Number(pivots.S1);
  const s2 = Number(pivots.S2);
  const s3 = Number(pivots.S3);

  let zone = "below_S3";
  if (currentPrice > r3) zone = "above_R3";
  else if (currentPrice > r2) zone = "between_R2_R3";
  else if (currentPrice > r1) zone = "between_R1_R2";
  else if (currentPrice > pp) zone = "between_PP_R1";
  else if (currentPrice > s1) zone = "between_S1_PP";
  else if (currentPrice > s2) zone = "between_S2_S1";
  else if (currentPrice > s3) zone = "between_S3_S2";

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
    bias: currentPrice > pp ? "bullish" : currentPrice < pp ? "bearish" : "neutral",
    nearestResistance,
    nearestSupport,
    distToResistance: nearestResistance ? Number((((nearestResistance.value - currentPrice) / currentPrice) * 100).toFixed(3)) : null,
    distToSupport: nearestSupport ? Number((((currentPrice - nearestSupport.value) / currentPrice) * 100).toFixed(3)) : null,
    atInflectionPoint,
    inflectionLevel: atInflectionPoint ? { label: nearestLevel.label, value: nearestLevel.value } : null,
    sessionBullish: currentPrice > pp,
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

    if (!Array.isArray(candles) || candles.length < 2) {
      return jsonResponse({ success: false, error: "candles array is required." }, 400);
    }
    if (!ALLOWED_INTERVALS.has(timeframe)) {
      return jsonResponse({ success: false, error: "Invalid interval." }, 400);
    }

    const normalizedCandles = candles.map((c) => ({
      time: Number(c.time),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    })).filter((c) => Number.isFinite(c.time) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));

    const period = getPivotPeriod(timeframe);
    const completed = groupCompletedCandles(normalizedCandles, period, 1)[0];
    if (!completed) {
      return jsonResponse({ success: false, error: "Not enough data to compute pivots for this timeframe." }, 400);
    }

    const currentPrice = normalizedCandles[normalizedCandles.length - 1].close;
    const classicPivots = withMeta(calculateClassicPivots(completed.high, completed.low, completed.close), "classic", period, completed);
    const fibonacciPivots = withMeta(calculateFibonacciPivots(completed.high, completed.low, completed.close), "fibonacci", period, completed);
    const traditionalPivots = withMeta(calculateTraditionalPivots(completed.high, completed.low, completed.close), "traditional", period, completed);
    const standardPeriods = groupCompletedCandles(normalizedCandles, period, 3).map((periodCandle) => ({
      period: periodCandle.period,
      startTime: periodCandle.startTime,
      endTime: periodCandle.endTime,
      pivots: calculateTraditionalPivots(periodCandle.high, periodCandle.low, periodCandle.close),
    }));

    return jsonResponse({
      success: true,
      timeframe,
      currentPrice,
      classic: { pivots: classicPivots, analysis: analyzePriceVsPivots(currentPrice, classicPivots) },
      fibonacci: { pivots: fibonacciPivots, analysis: analyzePriceVsPivots(currentPrice, fibonacciPivots) },
      traditional: { pivots: traditionalPivots, analysis: analyzePriceVsPivots(currentPrice, traditionalPivots) },
      binance: { pivots: traditionalPivots, analysis: analyzePriceVsPivots(currentPrice, traditionalPivots) },
      standardPeriods: { periodType: period, items: standardPeriods },
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
