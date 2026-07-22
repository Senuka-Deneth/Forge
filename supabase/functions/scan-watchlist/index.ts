import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { safeError } from "../_shared/http.ts";
import { requireAuthenticatedUser, tryServiceClient } from "../_shared/auth.ts";
import { consumeQuota } from "../_shared/rateLimit.ts";
import { gatherMarketContext, type MarketContext } from "../_shared/aiContext.ts";
import {
  applyRegimeGating,
  buildDeterministicTradePlan,
  type GatingContext,
  type SetupType,
} from "../_shared/tradePlan.ts";
import { bookQualityFromOrderFlow, buildVerdict } from "../_shared/verdict.ts";
import { round6 } from "../_shared/indicators.ts";

const WATCHLIST_CAP = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 5;

type WatchlistRow = {
  symbol: string;
  interval: string;
};

export type ScanResultRow = {
  symbol: string;
  interval: string;
  bias: string;
  setup_type: SetupType;
  regime: string;
  confidence: number;
  confluence_score: number;
  verdict: string;
  ev_r: number | null;
  risk_reward: number | null;
  nearest_support: number | null;
  nearest_resistance: number | null;
  error?: string;
};

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function toGatingContext(ctx: MarketContext): GatingContext {
  return {
    price: ctx.price,
    latest: ctx.latest,
    regime: ctx.regime,
    htfBias: ctx.htfBias,
    mtf: ctx.mtf,
    structure: ctx.structure,
    confluenceScore: ctx.confluenceScore,
    pivots: ctx.pivots,
    nearestSupport: ctx.nearestSupport,
    nearestResistance: ctx.nearestResistance,
    crossMarket: ctx.crossMarket,
  };
}

/** Mirror the deterministic bias path in ai-analysis — no LLM, same gating inputs. */
function deriveSignalBias(ctx: MarketContext): { bias: "long" | "short" | "neutral"; confidence: number } {
  const { latest, price } = ctx;
  const ema20 = latest.ema20;
  const ema50 = latest.ema50;
  const macdLine = latest.macd;
  const signalLine = latest.macdSignal;
  const rsi = latest.rsi14;

  let alignment: "bullish" | "bearish" | "mixed" = "mixed";
  if (ema20 != null && ema50 != null) {
    if (price > ema20 && ema20 > ema50) alignment = "bullish";
    else if (price < ema20 && ema20 < ema50) alignment = "bearish";
  }

  const primaryTrend = alignment === "bullish" ? "bullish" : alignment === "bearish" ? "bearish" : "sideways";

  let momentum = "neutral";
  if (macdLine != null && signalLine != null) {
    if (macdLine > signalLine && (rsi == null || rsi >= 50)) momentum = "bullish";
    else if (macdLine < signalLine && (rsi == null || rsi <= 50)) momentum = "bearish";
  }

  const bias: "long" | "short" | "neutral" =
    primaryTrend === "bullish" && momentum.includes("bullish") && ctx.confluenceScore >= 50 ? "long"
    : primaryTrend === "bearish" && momentum.includes("bearish") && ctx.confluenceScore >= 50 ? "short"
    : "neutral";

  let confidence = 50;
  if (primaryTrend !== "sideways") confidence += 10;
  if (momentum !== "neutral") confidence += 10;
  confidence += Math.round((ctx.confluenceScore - 50) / 5);
  if (ctx.structure.breakOfStructure !== "none") confidence += 5;

  return { bias, confidence: clamp(confidence, 20, 95) };
}

async function scanSymbol(symbol: string, interval: string): Promise<ScanResultRow> {
  const ctx = await gatherMarketContext(symbol, interval);
  const { bias, confidence } = deriveSignalBias(ctx);
  const gatingCtx = toGatingContext(ctx);
  const gated = applyRegimeGating(bias, confidence, gatingCtx);
  const tradePlan = buildDeterministicTradePlan(gatingCtx, gated.bias, gated.confidence);

  const verdict = buildVerdict({
    plan: tradePlan,
    regime: ctx.regime,
    calibration: null,
    funding: ctx.sessions?.fundingWindow ?? null,
    blackout: ctx.sessions?.eventBlackout ?? null,
    book: bookQualityFromOrderFlow(ctx.orderFlow),
    factors: [],
  });

  const rewardR = tradePlan.targets?.[0]?.risk_reward ?? null;

  return {
    symbol,
    interval,
    bias: tradePlan.bias,
    setup_type: gated.setupType,
    regime: ctx.regime,
    confidence: tradePlan.confidence,
    confluence_score: ctx.confluenceScore,
    verdict: verdict.verdict,
    ev_r: verdict.expectancy.verdict === "WAIT" ? null : verdict.expectancy.ev_r,
    risk_reward: rewardR != null ? round6(rewardR) : null,
    nearest_support: ctx.nearestSupport?.value != null ? round6(ctx.nearestSupport.value) : null,
    nearest_resistance: ctx.nearestResistance?.value != null ? round6(ctx.nearestResistance.value) : null,
  };
}

function sortResults(rows: ScanResultRow[]): ScanResultRow[] {
  return [...rows].sort((a, b) => {
    const evA = a.ev_r ?? -Infinity;
    const evB = b.ev_r ?? -Infinity;
    if (evB !== evA) return evB - evA;
    return b.confluence_score - a.confluence_score;
  });
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse(req, { success: false, error: "Method not allowed." }, 405);
  }

  const clientResult = tryServiceClient();
  if (!clientResult.ok) {
    return jsonResponse(req, { success: false, error: clientResult.error, error_code: clientResult.error_code }, 503);
  }
  const supabase = clientResult.client;

  const authResult = await requireAuthenticatedUser(supabase, req);
  if (!authResult.ok) {
    return jsonResponse(req, { success: false, error: authResult.error, error_code: authResult.error_code }, authResult.status);
  }
  const userId = authResult.userId;

  try {
    const quota = await consumeQuota(supabase, userId, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_CALLS, "watchlist_scan");
    if (!quota.ok) {
      if (quota.reason === "unavailable") {
        return jsonResponse(req, { success: false, error: "Rate limit check unavailable. Please try again shortly." }, 503);
      }
      return jsonResponse(req, { success: false, error: "Too many watchlist scans. Please wait a minute and try again." }, 429);
    }

    const { data: rows, error } = await supabase
      .from("watchlist")
      .select("symbol, interval")
      .eq("user_id", userId)
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(WATCHLIST_CAP);

    if (error) throw error;

    const watchlist = (rows ?? []) as WatchlistRow[];
    const results: ScanResultRow[] = [];

    for (const row of watchlist) {
      try {
        results.push(await scanSymbol(row.symbol, row.interval));
      } catch (symbolError) {
        const message = symbolError instanceof Error ? symbolError.message : String(symbolError);
        console.error("[scan-watchlist] symbol failed:", row.symbol, row.interval, message);
        results.push({
          symbol: row.symbol,
          interval: row.interval,
          bias: "wait",
          setup_type: "wait",
          regime: "ranging",
          confidence: 0,
          confluence_score: 0,
          verdict: "WAIT",
          ev_r: null,
          risk_reward: null,
          nearest_support: null,
          nearest_resistance: null,
          error: message,
        });
      }
    }

    return jsonResponse(req, { success: true, results: sortResults(results) });
  } catch (error) {
    return jsonResponse(req, { success: false, error: safeError("Watchlist scan failed.", error) }, 500);
  }
});
