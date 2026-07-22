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
import {
  type CalibrationRow,
  type EmpiricalCalibration,
  selectCalibrationBucket,
} from "../_shared/calibration.ts";
import { fetchJournalSnapshot, fetchRiskSettings } from "../_shared/journalSnapshot.ts";
import { fetchBtcEthKlines } from "../_shared/crossMarket.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const WATCHLIST_CAP = 20;
const SCAN_CONCURRENCY = 4;
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

async function fetchSetupBaseline(
  supabase: SupabaseClient,
  setupType: SetupType,
  regime: string | null,
  symbol: string,
  interval: string,
): Promise<{ hit_rate: number; n: number } | null> {
  if (!regime) return null;
  const { data: exact } = await supabase
    .from("setup_baselines")
    .select("hit_rate, n")
    .eq("setup_type", setupType)
    .eq("regime", regime)
    .eq("symbol", symbol)
    .eq("interval", interval)
    .maybeSingle();
  if (exact?.hit_rate != null) return { hit_rate: Number(exact.hit_rate), n: Number(exact.n) || 0 };

  const { data: pooled } = await supabase
    .from("setup_baselines")
    .select("hit_rate, n")
    .eq("setup_type", setupType)
    .eq("regime", regime)
    .order("n", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pooled?.hit_rate != null) return { hit_rate: Number(pooled.hit_rate), n: Number(pooled.n) || 0 };
  return null;
}

async function fetchScanCalibration(
  supabase: SupabaseClient,
  setupType: SetupType,
  regime: string | null,
  symbol: string,
  interval: string,
  liveRows: CalibrationRow[],
): Promise<EmpiricalCalibration | null> {
  const baseline = await fetchSetupBaseline(supabase, setupType, regime, symbol, interval);
  return selectCalibrationBucket(
    liveRows,
    setupType,
    regime,
    undefined,
    baseline?.hit_rate ?? null,
    baseline?.n ?? 0,
  );
}

async function loadLiveCalibrationRows(supabase: SupabaseClient): Promise<CalibrationRow[]> {
  const { data, error } = await supabase
    .from("ai_analysis_logs")
    .select("outcome, setup_type, regime, scoring_version")
    .eq("status", "success")
    .not("evaluated_at", "is", null)
    .in("outcome", ["target_hit", "stop_hit", "expired", "no_fill"])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data?.length) return [];
  const all = data as Array<CalibrationRow & { scoring_version?: number | null }>;
  const v3 = all.filter((r) => r.scoring_version === 3);
  const v2 = all.filter((r) => r.scoring_version === 2);
  return v3.length >= 20 ? v3 : v2.length >= 20 ? v2 : all;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function scanSymbol(
  supabase: SupabaseClient,
  symbol: string,
  interval: string,
  opts: {
    journal: Awaited<ReturnType<typeof fetchJournalSnapshot>> | null;
    settings: Awaited<ReturnType<typeof fetchRiskSettings>> | null;
    liveRows: CalibrationRow[];
    crossMarketPrefetch: Awaited<ReturnType<typeof fetchBtcEthKlines>> | null;
  },
): Promise<ScanResultRow> {
  const ctx = await gatherMarketContext(symbol, interval, {
    crossMarketPrefetch: opts.crossMarketPrefetch,
  });
  const { bias, confidence } = deriveSignalBias(ctx);
  const gatingCtx = toGatingContext(ctx);
  const gated = applyRegimeGating(bias, confidence, gatingCtx);
  const tradePlan = buildDeterministicTradePlan(gatingCtx, gated.bias, gated.confidence);
  const calibration = await fetchScanCalibration(
    supabase,
    gated.setupType,
    ctx.regime,
    symbol,
    interval,
    opts.liveRows,
  );

  const verdict = buildVerdict({
    plan: tradePlan,
    regime: ctx.regime,
    calibration,
    funding: ctx.sessions?.fundingWindow ?? null,
    blackout: ctx.sessions?.eventBlackout ?? null,
    journal: opts.journal,
    book: bookQualityFromOrderFlow(ctx.orderFlow),
    settings: opts.settings ?? undefined,
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
    const started = Date.now();
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
    const [journal, settings, liveRows] = await Promise.all([
      fetchJournalSnapshot(supabase, userId).catch(() => null),
      fetchRiskSettings(supabase, userId).catch(() => null),
      loadLiveCalibrationRows(supabase),
    ]);

    // Prefetch BTC/ETH once per distinct interval so each symbol does not re-fetch majors.
    const intervals = [...new Set(watchlist.map((r) => r.interval))];
    const prefetchByInterval = new Map<string, Awaited<ReturnType<typeof fetchBtcEthKlines>>>();
    await Promise.all(intervals.map(async (interval) => {
      try {
        prefetchByInterval.set(interval, await fetchBtcEthKlines(interval));
      } catch (err) {
        console.error("[scan-watchlist] BTC/ETH prefetch failed:", interval, err);
      }
    }));

    const results = await mapPool(watchlist, SCAN_CONCURRENCY, async (row) => {
      try {
        return await scanSymbol(supabase, row.symbol, row.interval, {
          journal,
          settings,
          liveRows,
          crossMarketPrefetch: prefetchByInterval.get(row.interval) ?? null,
        });
      } catch (symbolError) {
        const message = symbolError instanceof Error ? symbolError.message : String(symbolError);
        console.error("[scan-watchlist] symbol failed:", row.symbol, row.interval, message);
        return {
          symbol: row.symbol,
          interval: row.interval,
          bias: "wait",
          setup_type: "wait" as SetupType,
          regime: "ranging",
          confidence: 0,
          confluence_score: 0,
          verdict: "WAIT",
          ev_r: null,
          risk_reward: null,
          nearest_support: null,
          nearest_resistance: null,
          error: message,
        };
      }
    });

    const durationMs = Date.now() - started;
    console.log(
      `[scan-watchlist] scanned ${watchlist.length} symbols in ${durationMs}ms ` +
        `(concurrency=${SCAN_CONCURRENCY}, intervals=${intervals.join(",")})`,
    );

    return jsonResponse(req, { success: true, results: sortResults(results), duration_ms: durationMs });
  } catch (error) {
    return jsonResponse(req, { success: false, error: safeError("Watchlist scan failed.", error) }, 500);
  }
});
