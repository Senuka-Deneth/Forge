import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { safeError } from "../_shared/http.ts";
import { requireAuthenticatedUser, tryServiceClient } from "../_shared/auth.ts";
import {
  ALLOWED_INTERVALS,
  analyzePriceVsPivots,
  calculateClassicPivots,
  calculateFibonacciPivots,
  calculateTraditionalPivots,
  getPivotPeriod,
  groupCompletedCandles,
  withMeta,
} from "../_shared/pivots.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed." }, 405);

  const clientResult = tryServiceClient();
  if (!clientResult.ok) {
    return jsonResponse(req, { success: false, error: clientResult.error, error_code: clientResult.error_code }, 503);
  }

  const authResult = await requireAuthenticatedUser(clientResult.client, req);
  if (!authResult.ok) {
    return jsonResponse(req, { success: false, error: authResult.error, error_code: authResult.error_code }, authResult.status);
  }

  try {
    const body = await req.json();
    const candles = body.candles;
    const timeframe = String(body.timeframe ?? body.interval ?? "4h").trim();

    if (!Array.isArray(candles) || candles.length < 2) {
      return jsonResponse(req, { success: false, error: "candles array is required." }, 400);
    }
    if (!ALLOWED_INTERVALS.has(timeframe)) {
      return jsonResponse(req, { success: false, error: "Invalid interval." }, 400);
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
      return jsonResponse(req, { success: false, error: "Not enough data to compute pivots for this timeframe." }, 400);
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

    return jsonResponse(req, {
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
    return jsonResponse(req, {
      success: false,
      error: safeError("Failed to calculate pivots.", error),
    }, 500);
  }
});
