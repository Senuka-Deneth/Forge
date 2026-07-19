import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  ALLOWED_CHART_INTERVALS,
  buildPivotData,
  sanitizePivotTimeframe,
  type Candle,
} from "../_shared/pivotPoints.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json();
    const candles = body.candles;
    const timeframe = String(body.timeframe ?? body.interval ?? "4h").trim();
    const symbol = String(body.symbol ?? "BTCUSDT").toUpperCase().trim();
    const pivotType = String(body.pivotType ?? "traditional").trim().toLowerCase();
    const pivotsBack = Math.max(1, Math.min(50, Number(body.pivotsBack ?? body.pivots_back) || 15));
    const showHistoricalPivots = body.showHistoricalPivots !== false;
    const pivotTimeframe = sanitizePivotTimeframe(body.pivotTimeframe ?? body.pivot_timeframe);

    if (!Array.isArray(candles) || candles.length < 1) {
      return jsonResponse({ success: false, error: "candles array is required." }, 400);
    }
    if (!ALLOWED_CHART_INTERVALS.has(timeframe)) {
      return jsonResponse({ success: false, error: "Invalid interval." }, 400);
    }

    const normalizedCandles: Candle[] = candles.map((c: Record<string, unknown>) => ({
      time: Number(c.time),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: c.volume != null ? Number(c.volume) : undefined,
    })).filter((c) => (
      Number.isFinite(c.time) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close)
    ));

    const result = await buildPivotData(normalizedCandles, timeframe, symbol, {
      pivotType,
      pivotsBack,
      showHistoricalPivots,
      pivotTimeframe,
    });

    if (!result) {
      return jsonResponse({
        success: false,
        error: "Not enough data to compute pivots for this timeframe.",
      }, 400);
    }

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
