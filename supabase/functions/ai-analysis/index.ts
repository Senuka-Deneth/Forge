import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { fetchWithTimeout } from "../_shared/http.ts";
import { requireAuthenticatedUser, tryServiceClient } from "../_shared/auth.ts";
import {
  type Candle,
  type Divergence,
  type MarketStructure,
  type SwingPoint,
  classifyMarketStructure,
  detectDivergence,
  detectSwingPoints,
} from "../_shared/indicators.ts";
import {
  type FuturesContext,
  type OrderBookImbalance,
  type Ticker24hr,
  fetchBinanceKlines,
  fetchFuturesContext,
  fetchOrderBookImbalance,
  fetchTicker24hr,
  getConfluenceTimeframes,
} from "../_shared/binance.ts";
import {
  analyzePriceVsPivots,
  calculateClassicPivots,
  calculateFibonacciPivots,
  calculateTraditionalPivots,
  getPivotPeriod,
  groupCompletedCandles,
  withMeta,
} from "../_shared/pivots.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-super-49b-v1:free";
const MODEL = Deno.env.get("OPENROUTER_MODEL") ?? DEFAULT_MODEL;

const ALLOWED_INTERVALS = new Set([
  "1m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
]);
const SYMBOL_REGEX = /^[A-Z0-9]{5,20}$/;
const PRIMARY_CANDLE_LIMIT = 500;
const MTF_CANDLE_LIMIT = 150;
const SERIES_WINDOW = 12;

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_CALLS = 10;

async function checkRateLimit(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("ai_analysis_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);
  if (error) {
    console.error("[ai-analysis] rate limit check failed:", error.message);
    return true;
  }
  return (count ?? 0) < RATE_LIMIT_MAX_CALLS;
}

async function logAiAnalysis(
  supabase: SupabaseClient,
  entry: {
    userId: string;
    symbol: string | null;
    timeframe: string | null;
    model: string;
    status: "success" | "fallback" | "error" | "rate_limited";
    latencyMs: number;
    errorMessage?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("ai_analysis_logs").insert({
    user_id: entry.userId,
    symbol: entry.symbol,
    timeframe: entry.timeframe,
    model: entry.model,
    status: entry.status,
    latency_ms: entry.latencyMs,
    error_message: entry.errorMessage ?? null,
  });
  if (error) console.error("[ai-analysis] failed to write ai_analysis_logs:", error.message);
}

function safeFloat(value: unknown, fallback: number | null = null): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function asEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  const normalized = String(value ?? "").trim().toLowerCase() as T;
  return allowed.has(normalized) ? normalized : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeLabelValue(item: unknown): { label: string; value: number } | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const source = item as Record<string, unknown>;
  const value = safeFloat(source.value);
  if (value == null) return null;
  return { label: String(source.label ?? "N/A").trim() || "N/A", value: Number(value.toFixed(6)) };
}

function extractJson(rawText: string): Record<string, unknown> {
  if (!rawText) throw new Error("Empty response from model.");
  try {
    return JSON.parse(rawText.trim());
  } catch {
    const block = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (block) return JSON.parse(block[1]);
  }

  const cleaned = rawText.trim();
  const starts = [...cleaned.matchAll(/\{/g)].map((m) => m.index ?? 0);
  for (const start of starts) {
    let depth = 0;
    for (let i = start; i < cleaned.length; i += 1) {
      if (cleaned[i] === "{") depth += 1;
      if (cleaned[i] === "}") depth -= 1;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error(`Model did not return parseable JSON. Raw: ${rawText.slice(0, 300)}`);
}

// ---------------------------------------------------------------------------
// Market context gathering — everything the model (and the deterministic
// fallback) reasons over is computed here, server-side, from real market
// data. The client only ever sends {symbol, interval}.
// ---------------------------------------------------------------------------

type PivotSet = ReturnType<typeof calculateClassicPivots>;
type PivotBundle = { pivots: PivotSet & Record<string, unknown>; analysis: ReturnType<typeof analyzePriceVsPivots> };

type MtfRead = {
  interval: string;
  trend: "bullish" | "bearish" | "mixed";
  rsi: number | null;
};

type MarketContext = {
  symbol: string;
  interval: string;
  price: number;
  latest: Candle;
  series: {
    closes: number[];
    rsi: Array<number | null>;
    macdHist: Array<number | null>;
    atrPct: Array<number | null>;
    obv: number[];
    cvd: Array<number | null>;
    volume: number[];
  };
  ticker24h: Ticker24hr;
  volatilityState: "low" | "medium" | "high";
  trendStrength: number;
  vwapRelation: "above" | "below" | "at" | "unknown";
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  structure: MarketStructure;
  rsiDivergence: Divergence;
  macdDivergence: Divergence;
  orderFlow: OrderBookImbalance;
  cvdTrend: "buying" | "selling" | "neutral";
  futures: FuturesContext;
  pivots: { classic: PivotBundle; fibonacci: PivotBundle; traditional: PivotBundle };
  nearestSupport: { label: string; value: number } | null;
  nearestResistance: { label: string; value: number } | null;
  mtf: MtfRead[];
  confluenceScore: number;
};

function seriesTrend(alignment: "bullish" | "bearish" | "mixed", macdHist: number | null): "bullish" | "bearish" | "mixed" {
  if (alignment !== "mixed") return alignment;
  if (macdHist != null) return macdHist > 0 ? "bullish" : macdHist < 0 ? "bearish" : "mixed";
  return "mixed";
}

function readTrendFromCandles(candles: Candle[]): MtfRead["trend"] {
  const latest = candles[candles.length - 1];
  if (!latest) return "mixed";
  const { close, ema20, ema50, macdHist } = latest;
  let alignment: "bullish" | "bearish" | "mixed" = "mixed";
  if (ema20 != null && ema50 != null) {
    if (close > ema20 && ema20 > ema50) alignment = "bullish";
    else if (close < ema20 && ema20 < ema50) alignment = "bearish";
  }
  return seriesTrend(alignment, macdHist);
}

function volatilityStateFromAtr(atrPctSeries: Array<number | null>): "low" | "medium" | "high" {
  const recent = atrPctSeries.filter((v): v is number => v != null).slice(-50);
  if (!recent.length) return "medium";
  const current = recent[recent.length - 1];
  const sorted = [...recent].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median === 0) return "medium";
  const ratio = current / median;
  if (ratio >= 1.3) return "high";
  if (ratio <= 0.7) return "low";
  return "medium";
}

function trendStrengthFromAdx(adx: number | null): number {
  if (adx == null) return 35;
  return clamp(Math.round(adx * 2), 0, 100);
}

async function gatherMarketContext(symbol: string, interval: string): Promise<MarketContext> {
  const primaryCandles = await fetchBinanceKlines(symbol, interval, PRIMARY_CANDLE_LIMIT);
  if (!primaryCandles.length) throw new Error("No candle data returned for this symbol/interval.");

  const latest = primaryCandles[primaryCandles.length - 1];
  const price = latest.close;

  const [orderFlow, futures, ticker24h, mtfResults] = await Promise.all([
    fetchOrderBookImbalance(symbol),
    fetchFuturesContext(symbol),
    fetchTicker24hr(symbol),
    Promise.all(
      getConfluenceTimeframes(interval).map(async (tf) => {
        try {
          const candles = await fetchBinanceKlines(symbol, tf, MTF_CANDLE_LIMIT);
          return { interval: tf, trend: readTrendFromCandles(candles), rsi: candles[candles.length - 1]?.rsi14 ?? null } as MtfRead;
        } catch {
          return { interval: tf, trend: "mixed", rsi: null } as MtfRead;
        }
      }),
    ),
  ]);

  const period = getPivotPeriod(interval);
  const completed = groupCompletedCandles(primaryCandles, period, 1)[0];
  const pivotBasis = completed ?? { high: latest.high, low: latest.low, close: latest.close };
  const classicPivots = withMeta(calculateClassicPivots(pivotBasis.high, pivotBasis.low, pivotBasis.close), "classic", period, completed ?? null);
  const fibonacciPivots = withMeta(calculateFibonacciPivots(pivotBasis.high, pivotBasis.low, pivotBasis.close), "fibonacci", period, completed ?? null);
  const traditionalPivots = withMeta(calculateTraditionalPivots(pivotBasis.high, pivotBasis.low, pivotBasis.close), "traditional", period, completed ?? null);

  const classicAnalysis = analyzePriceVsPivots(price, classicPivots);
  const fibonacciAnalysis = analyzePriceVsPivots(price, fibonacciPivots);
  const traditionalAnalysis = analyzePriceVsPivots(price, traditionalPivots);

  const { swingHighs, swingLows } = detectSwingPoints(primaryCandles, 2);
  const structure = classifyMarketStructure(primaryCandles, swingHighs, swingLows);
  const rsiDivergence = detectDivergence(primaryCandles, swingHighs, swingLows, "rsi");
  const macdDivergence = detectDivergence(primaryCandles, swingHighs, swingLows, "macd");

  const recentCvd = primaryCandles.slice(-10).map((c) => c.cvd).filter((v): v is number => v != null);
  const cvdTrend: MarketContext["cvdTrend"] = recentCvd.length >= 2
    ? (recentCvd[recentCvd.length - 1] > recentCvd[0] ? "buying" : recentCvd[recentCvd.length - 1] < recentCvd[0] ? "selling" : "neutral")
    : "neutral";

  const atrPctSeries = primaryCandles.map((c) => c.atrPct);
  const adxSeries = primaryCandles.map((c) => c.adx14);
  const latestAdx = adxSeries[adxSeries.length - 1] ?? null;

  let vwapRelation: MarketContext["vwapRelation"] = "unknown";
  if (latest.vwap != null) {
    const tol = Math.abs(price) * 0.0005;
    vwapRelation = Math.abs(price - latest.vwap) <= tol ? "at" : price > latest.vwap ? "above" : "below";
  }

  const primaryTrend = readTrendFromCandles(primaryCandles);
  const agreeing = mtfResults.filter((r) => r.trend === primaryTrend).length;
  const confluenceScore = mtfResults.length ? Math.round((agreeing / mtfResults.length) * 100) : 50;

  return {
    symbol,
    interval,
    price,
    latest,
    series: {
      closes: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.close),
      rsi: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.rsi14),
      macdHist: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.macdHist),
      atrPct: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.atrPct),
      obv: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.obv ?? 0),
      cvd: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.cvd),
      volume: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.volume),
    },
    ticker24h,
    volatilityState: volatilityStateFromAtr(atrPctSeries),
    trendStrength: trendStrengthFromAdx(latestAdx),
    vwapRelation,
    swingHighs: swingHighs.slice(-5),
    swingLows: swingLows.slice(-5),
    structure,
    rsiDivergence,
    macdDivergence,
    orderFlow,
    cvdTrend,
    futures,
    pivots: {
      classic: { pivots: classicPivots, analysis: classicAnalysis },
      fibonacci: { pivots: fibonacciPivots, analysis: fibonacciAnalysis },
      traditional: { pivots: traditionalPivots, analysis: traditionalAnalysis },
    },
    nearestSupport: classicAnalysis.nearestSupport,
    nearestResistance: classicAnalysis.nearestResistance,
    mtf: mtfResults,
    confluenceScore,
  };
}

// ---------------------------------------------------------------------------
// Deterministic trade plan — used both as the resilient fallback and as the
// baseline the model's own trade_plan is validated against.
// ---------------------------------------------------------------------------

type TradePlanTarget = { label: string; price: number | null; risk_reward: number | null };
type TradePlan = {
  bias: "long" | "short" | "wait";
  entry_zone: { low: number | null; high: number | null } | null;
  stop_loss: number | null;
  targets: TradePlanTarget[];
  risk_reward_summary: string;
  confidence: number;
  rationale: string;
};

function buildDeterministicTradePlan(ctx: MarketContext, bias: "long" | "short" | "neutral"): TradePlan {
  const { price, latest, pivots, confluenceScore } = ctx;
  const atr = latest.atr14 ?? price * 0.01;

  if (bias === "neutral") {
    return {
      bias: "wait",
      entry_zone: null,
      stop_loss: null,
      targets: [],
      risk_reward_summary: "No clear directional edge; trend, momentum, and multi-timeframe signals are not aligned.",
      confidence: clamp(40 + Math.round(confluenceScore / 10), 20, 60),
      rationale: "Wait for trend, momentum, and higher-timeframe confluence to align before sizing a position.",
    };
  }

  const levels = pivots.classic.analysis.allLevels as Array<{ label: string; value: number }>;
  const isLong = bias === "long";
  const entryLow = isLong ? price - atr * 0.15 : price;
  const entryHigh = isLong ? price : price + atr * 0.15;
  const stop = isLong
    ? Math.min(...[ctx.nearestSupport?.value, price - atr * 1.5].filter((v): v is number => v != null))
    : Math.max(...[ctx.nearestResistance?.value, price + atr * 1.5].filter((v): v is number => v != null));

  const candidateTargets = (isLong
    ? levels.filter((l) => l.value > price).sort((a, b) => a.value - b.value)
    : levels.filter((l) => l.value < price).sort((a, b) => b.value - a.value)
  ).slice(0, 3);

  const risk = Math.abs(price - stop);
  const targets: TradePlanTarget[] = candidateTargets.map((lvl, i) => {
    const reward = Math.abs(lvl.value - price);
    return {
      label: `T${i + 1} (${lvl.label})`,
      price: lvl.value,
      risk_reward: risk > 0 ? Number((reward / risk).toFixed(2)) : null,
    };
  });

  const bestRR = targets.find((t) => t.risk_reward != null)?.risk_reward ?? null;

  return {
    bias: isLong ? "long" : "short",
    entry_zone: { low: Number(entryLow.toFixed(6)), high: Number(entryHigh.toFixed(6)) },
    stop_loss: Number(stop.toFixed(6)),
    targets,
    risk_reward_summary: bestRR != null
      ? `Nearest target offers roughly ${bestRR}:1 reward-to-risk from the suggested entry and stop.`
      : "Insufficient pivot levels beyond price to size a reward-to-risk target.",
    confidence: clamp(45 + Math.round(confluenceScore / 4), 20, 90),
    rationale: `${isLong ? "Long" : "Short"} bias from trend/momentum alignment with ${confluenceScore}% multi-timeframe agreement. Stop placed beyond ${isLong ? "nearest support" : "nearest resistance"} with an ATR buffer; targets use the next pivot levels in the trade direction.`,
  };
}

function deterministicFallback(ctx: MarketContext, source = "local-fallback") {
  const { latest, price } = ctx;
  const rsi = latest.rsi14;
  const ema20 = latest.ema20;
  const ema50 = latest.ema50;
  const macdLine = latest.macd;
  const signalLine = latest.macdSignal;
  const histogram = latest.macdHist;

  let alignment: "bullish" | "bearish" | "mixed" = "mixed";
  let priceVsEma20: "above" | "below" | "at" = "at";
  let priceVsEma50: "above" | "below" | "at" = "at";
  let emaSignal = "EMA data unavailable.";
  if (ema20 != null && ema50 != null) {
    const tol = Math.abs(price) * 0.0001;
    priceVsEma20 = Math.abs(price - ema20) <= tol ? "at" : price > ema20 ? "above" : "below";
    priceVsEma50 = Math.abs(price - ema50) <= tol ? "at" : price > ema50 ? "above" : "below";
    if (price > ema20 && ema20 > ema50) {
      alignment = "bullish";
      emaSignal = "Price and short EMA are stacked above EMA50 (bullish alignment).";
    } else if (price < ema20 && ema20 < ema50) {
      alignment = "bearish";
      emaSignal = "Price and short EMA are stacked below EMA50 (bearish alignment).";
    } else {
      emaSignal = "EMA structure is mixed; no clean directional stack.";
    }
  }

  const primaryTrend = alignment === "bullish" ? "bullish" : alignment === "bearish" ? "bearish" : "sideways";

  let momentum = "neutral";
  if (macdLine != null && signalLine != null) {
    if (macdLine > signalLine && (rsi == null || rsi >= 50)) momentum = "bullish";
    else if (macdLine < signalLine && (rsi == null || rsi <= 50)) momentum = "bearish";
  }
  if (momentum === "bullish" && rsi != null && rsi >= 70) momentum = "strong_bullish";
  if (momentum === "bearish" && rsi != null && rsi <= 30) momentum = "strong_bearish";

  const macdState = macdLine != null && signalLine != null
    ? (macdLine > signalLine ? "bullish_momentum" : "bearish_momentum")
    : "bullish_momentum";

  const rsiState = rsi == null ? "neutral" : rsi >= 70 ? "overbought" : rsi <= 30 ? "oversold" : rsi >= 55 ? "bullish_zone" : rsi <= 45 ? "bearish_zone" : "neutral";

  const bias: "long" | "short" | "neutral" =
    primaryTrend === "bullish" && momentum.includes("bullish") && ctx.confluenceScore >= 50 ? "long"
    : primaryTrend === "bearish" && momentum.includes("bearish") && ctx.confluenceScore >= 50 ? "short"
    : "neutral";

  const confluences: Array<{ level: string; price: number; confluent_with: string; significance: string }> = [];
  const pp = ctx.pivots.classic.pivots.PP as number;
  if (pp != null && ema20 != null && price && Math.abs(pp - ema20) / Math.abs(price) <= 0.005) {
    confluences.push({ level: "PP", price: Number(pp.toFixed(6)), confluent_with: "EMA20", significance: "medium" });
  }
  if (pp != null && ema50 != null && price && Math.abs(pp - ema50) / Math.abs(price) <= 0.005) {
    confluences.push({ level: "PP", price: Number(pp.toFixed(6)), confluent_with: "EMA50", significance: "medium" });
  }

  let confidence = 50;
  if (primaryTrend !== "sideways") confidence += 10;
  if (momentum !== "neutral") confidence += 10;
  confidence += Math.round((ctx.confluenceScore - 50) / 5);
  if (ctx.structure.breakOfStructure !== "none") confidence += 5;
  confidence = clamp(confidence, 20, 95);

  const anomalies: Array<{ type: string; description: string; severity: string }> = [];
  if (rsi != null && rsi >= 70) anomalies.push({ type: "trend_exhaustion", description: "RSI is overbought.", severity: "medium" });
  if (rsi != null && rsi <= 30) anomalies.push({ type: "trend_exhaustion", description: "RSI is oversold.", severity: "medium" });
  if (ctx.rsiDivergence.type !== "none") anomalies.push({ type: "divergence", description: ctx.rsiDivergence.description, severity: "high" });
  if (ctx.macdDivergence.type !== "none") anomalies.push({ type: "divergence", description: ctx.macdDivergence.description, severity: "high" });
  if (ctx.volatilityState === "high") anomalies.push({ type: "volume_spike", description: "Volatility (ATR) is elevated versus its recent range.", severity: "medium" });
  if (!anomalies.length) anomalies.push({ type: "none", description: "No deterministic anomaly triggered.", severity: "low" });

  const tradePlan = buildDeterministicTradePlan(ctx, bias);

  const legacy = {
    summary: {
      primary_trend: primaryTrend,
      momentum,
      phase: primaryTrend === "bullish" ? "markup" : primaryTrend === "bearish" ? "markdown" : "consolidation",
      confidence,
      bias: bias === "neutral" ? "neutral" : bias,
      reasoning: `Price ${price}, EMA alignment ${alignment}, RSI state ${rsiState}, MTF confluence ${ctx.confluenceScore}%, ADX-based trend strength ${ctx.trendStrength}.`,
    },
    indicators: {
      rsi: {
        value: rsi,
        state: rsiState,
        divergence: ctx.rsiDivergence.type,
        signal: "RSI interpreted with standard 70/30 thresholds.",
      },
      macd: {
        macd_line: macdLine,
        signal_line: signalLine,
        histogram,
        state: macdState,
        signal: "MACD interpreted from line-vs-signal relationship.",
      },
      ema: {
        ema20,
        ema50,
        alignment,
        price_vs_ema20: priceVsEma20,
        price_vs_ema50: priceVsEma50,
        signal: emaSignal,
      },
    },
    pivot_analysis: {
      pp,
      current_zone: String(ctx.pivots.classic.analysis.zone).toLowerCase(),
      session_bias: ctx.pivots.classic.analysis.bias,
      nearest_pivot_resistance: ctx.nearestResistance,
      nearest_pivot_support: ctx.nearestSupport,
      distance_to_pivot_resistance_pct: ctx.pivots.classic.analysis.distToResistance,
      distance_to_pivot_support_pct: ctx.pivots.classic.analysis.distToSupport,
      at_inflection_point: ctx.pivots.classic.analysis.atInflectionPoint,
      inflection_level: ctx.pivots.classic.analysis.inflectionLevel ? JSON.stringify(ctx.pivots.classic.analysis.inflectionLevel) : null,
      pivot_target_bull: ctx.nearestResistance,
      pivot_target_bear: ctx.nearestSupport,
      confluences,
      pivot_signal: "Use pivot levels as context, not standalone triggers.",
    },
    structure: {
      nearest_support: ctx.nearestSupport?.value ?? null,
      nearest_resistance: ctx.nearestResistance?.value ?? null,
      key_support_levels: ctx.swingLows.map((s) => s.price),
      key_resistance_levels: ctx.swingHighs.map((s) => s.price),
      range_bound: primaryTrend === "sideways",
      breakout_watch: ctx.structure.breakOfStructure,
    },
    order_flow: {
      obi: ctx.orderFlow.obi,
      tfi: ctx.cvdTrend === "buying" ? 1 : ctx.cvdTrend === "selling" ? -1 : 0,
      dominant_side: ctx.cvdTrend === "buying" ? "buyers" : ctx.cvdTrend === "selling" ? "sellers" : "neutral",
      interpretation: `Order-book imbalance ${ctx.orderFlow.obi != null ? (ctx.orderFlow.obi * 100).toFixed(1) + "%" : "unavailable"}; cumulative volume delta trending ${ctx.cvdTrend}.`,
    },
    trade_logic: {
      bullish_scenario: "Bull case strengthens on hold above EMA20 and reclaim of nearest resistance.",
      bearish_scenario: "Bear case strengthens on rejection below EMA20 and loss of nearest support.",
      invalidation_bull: ctx.nearestSupport?.value ?? null,
      invalidation_bear: ctx.nearestResistance?.value ?? null,
      suggested_bias: tradePlan.bias,
      risk_note: "Use strict risk limits; this analysis is informational only.",
    },
    anomalies,
    market_regime: {
      volatility: ctx.volatilityState,
      trend_strength: ctx.trendStrength,
      is_trending: ctx.trendStrength >= 50,
      regime: ctx.trendStrength >= 50 ? "trending" : "ranging",
    },
    trade_plan: tradePlan,
    _meta: {
      model: MODEL,
      source,
      timestamp: new Date().toISOString(),
      validated: true,
      confluence_score: ctx.confluenceScore,
      data_completeness: {
        futures_available: ctx.futures.available,
        order_book_available: ctx.orderFlow.obi != null,
      },
    },
  };

  return {
    ...legacy,
    market_structure: legacy.structure,
    trend_momentum: {
      summary: legacy.summary,
      indicators: legacy.indicators,
      market_regime: legacy.market_regime,
    },
    trade_logic_risk: legacy.trade_logic,
    anomaly_detection: legacy.anomalies,
  };
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are an elite quantitative trading analyst and risk manager helping a trader decide whether, and how, to enter a position.

Return one valid JSON object only. No markdown.
Required top-level keys:
market_structure, trend_momentum, trade_logic_risk, anomaly_detection, trade_plan.

Also include the compatibility keys:
summary, indicators, pivot_analysis, structure, order_flow, trade_logic, anomalies, market_regime.

The "trade_plan" object is the most important output for the trader. It must contain:
bias ("long"|"short"|"wait"), entry_zone ({low, high} or null if bias is "wait"), stop_loss,
targets (array of {label, price, risk_reward}, ordered nearest to farthest), risk_reward_summary,
confidence (0-100), and rationale explaining the plan in terms of the confluence of signals provided.

Reasoning rules:
- Weigh trend (EMA stack, ADX trend strength), momentum (RSI, MACD, and any divergence flagged),
  volatility regime (ATR-based), multi-timeframe confluence score, order-book imbalance, cumulative
  volume delta trend, and futures funding/open-interest/long-short data together — do not rely on
  any single indicator. State explicitly when signals conflict and lower confidence accordingly.
- Only propose bias "long" or "short" when trend, momentum, and multi-timeframe confluence
  reasonably agree; otherwise use "wait" with entry_zone null and empty targets.
- Base stop_loss and targets on the supplied pivot levels, swing structure, and ATR — never invent
  price levels that are not derivable from the provided data.
- Price above the classic PP is bullish session bias; below is bearish. RSI >= 70 is overbought,
  <= 30 is oversold. MACD is bullish when the MACD line is above its signal line. EMA alignment is
  bullish if price > EMA20 > EMA50, bearish if price < EMA20 < EMA50, otherwise mixed.
- If futures or order-book data is unavailable (null), say so rather than inventing a reading, and
  do not let its absence be the sole driver of confidence.
- Keep every field data-grounded. Never fabricate values for inputs that were not provided.`;
}

function buildUserMessage(ctx: MarketContext): string {
  const c = ctx.pivots.classic.pivots;
  const f = ctx.pivots.fibonacci.pivots;
  const t = ctx.pivots.traditional.pivots;

  return `Analyze this market context and return strict JSON only.

MARKET:
- symbol: ${ctx.symbol}
- timeframe: ${ctx.interval}
- price: ${ctx.price}
- 24h_change_pct: ${ctx.ticker24h.priceChangePercent}
- 24h_volume: ${ctx.ticker24h.volume}
- 24h_high: ${ctx.ticker24h.highPrice}
- 24h_low: ${ctx.ticker24h.lowPrice}

INDICATOR SERIES (last ${SERIES_WINDOW} candles, oldest to newest):
- closes: ${JSON.stringify(ctx.series.closes)}
- rsi14: ${JSON.stringify(ctx.series.rsi)}
- macd_histogram: ${JSON.stringify(ctx.series.macdHist)}
- atr_pct: ${JSON.stringify(ctx.series.atrPct)}
- obv: ${JSON.stringify(ctx.series.obv)}
- cumulative_volume_delta: ${JSON.stringify(ctx.series.cvd)}
- volume: ${JSON.stringify(ctx.series.volume)}

LATEST INDICATORS:
- ema20: ${ctx.latest.ema20}
- ema50: ${ctx.latest.ema50}
- macd: ${JSON.stringify({ macd: ctx.latest.macd, signal: ctx.latest.macdSignal, histogram: ctx.latest.macdHist })}
- bollinger: ${JSON.stringify({ upper: ctx.latest.bbUpper, middle: ctx.latest.bbMiddle, lower: ctx.latest.bbLower, percentB: ctx.latest.bbPercentB, bandwidth: ctx.latest.bbBandwidth })}
- vwap: ${ctx.latest.vwap} (price is ${ctx.vwapRelation} VWAP)
- adx14: ${ctx.latest.adx14} (+DI ${ctx.latest.plusDI14} / -DI ${ctx.latest.minusDI14})
- relative_volume: ${ctx.latest.relativeVolume}
- volatility_state (ATR vs its recent median): ${ctx.volatilityState}
- adx_trend_strength_score: ${ctx.trendStrength}

MARKET STRUCTURE:
- swing_highs: ${JSON.stringify(ctx.swingHighs.map((s) => s.price))}
- swing_lows: ${JSON.stringify(ctx.swingLows.map((s) => s.price))}
- last_swing_high_label: ${ctx.structure.lastSwingHighLabel}
- last_swing_low_label: ${ctx.structure.lastSwingLowLabel}
- break_of_structure: ${ctx.structure.breakOfStructure}
- rsi_divergence: ${JSON.stringify(ctx.rsiDivergence)}
- macd_divergence: ${JSON.stringify(ctx.macdDivergence)}
- nearest_support: ${JSON.stringify(ctx.nearestSupport)}
- nearest_resistance: ${JSON.stringify(ctx.nearestResistance)}

ORDER FLOW:
- order_book_imbalance (-1 sell-heavy to +1 buy-heavy, within 1% of mid, null if unavailable): ${ctx.orderFlow.obi}
- cumulative_volume_delta_trend: ${ctx.cvdTrend}

FUTURES POSITIONING (null fields mean no futures market / unavailable):
- available: ${ctx.futures.available}
- funding_rate: ${ctx.futures.fundingRate}
- open_interest: ${ctx.futures.openInterest}
- long_short_account_ratio: ${ctx.futures.longShortRatio}

MULTI-TIMEFRAME CONFLUENCE:
- reads: ${JSON.stringify(ctx.mtf)}
- confluence_score_pct (share of higher timeframes agreeing with the current-timeframe trend): ${ctx.confluenceScore}

PIVOTS (classic / fibonacci / traditional, period=${ctx.pivots.classic.pivots.period}):
${JSON.stringify({ classic: c, fibonacci: f, traditional: t })}
PIVOT_ANALYSIS: ${JSON.stringify(ctx.pivots.classic.analysis)}`;
}

// ---------------------------------------------------------------------------
// Model output validation
// ---------------------------------------------------------------------------

function normalizeModelOutput(parsed: Record<string, unknown>, ctx: MarketContext) {
  const base = deterministicFallback(ctx, "normalized");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;

  const summary = asObject(parsed.summary);
  const indicators = asObject(parsed.indicators);
  const rsiObj = asObject(indicators.rsi);
  const macdObj = asObject(indicators.macd);
  const emaObj = asObject(indicators.ema);
  const pivotAnalysis = asObject(parsed.pivot_analysis);
  const structure = asObject(parsed.structure);
  const orderFlow = asObject(parsed.order_flow);
  const tradeLogic = asObject(parsed.trade_logic);
  const marketRegime = asObject(parsed.market_regime);
  const tradePlanObj = asObject(parsed.trade_plan);

  const baseSummary = base.summary as Record<string, unknown>;
  const baseIndicators = base.indicators as { rsi: Record<string, unknown>; macd: Record<string, unknown>; ema: Record<string, unknown> };
  const basePivotAnalysis = base.pivot_analysis as Record<string, unknown>;
  const baseStructure = base.structure as Record<string, unknown>;
  const baseOrderFlow = base.order_flow as Record<string, unknown>;
  const baseTradeLogic = base.trade_logic as Record<string, unknown>;
  const baseMarketRegime = base.market_regime as Record<string, unknown>;
  const baseTradePlan = base.trade_plan as TradePlan;

  const validatedSummary = {
    primary_trend: asEnum(summary.primary_trend, new Set(["bullish", "bearish", "sideways"]), baseSummary.primary_trend as string),
    momentum: asEnum(summary.momentum, new Set(["strong_bullish", "bullish", "neutral", "bearish", "strong_bearish"]), baseSummary.momentum as string),
    phase: asEnum(summary.phase, new Set(["accumulation", "markup", "distribution", "markdown", "consolidation"]), baseSummary.phase as string),
    confidence: clamp(safeInt(summary.confidence, baseSummary.confidence as number), 0, 100),
    bias: asEnum(summary.bias, new Set(["long", "short", "neutral"]), baseSummary.bias as string),
    reasoning: String(summary.reasoning ?? baseSummary.reasoning),
  };

  const validatedIndicators = {
    rsi: {
      value: safeFloat(rsiObj.value, baseIndicators.rsi.value as number | null),
      state: asEnum(rsiObj.state, new Set(["overbought", "bullish_zone", "neutral", "bearish_zone", "oversold"]), baseIndicators.rsi.state as string),
      divergence: asEnum(rsiObj.divergence, new Set(["bullish", "bearish", "none"]), baseIndicators.rsi.divergence as string),
      signal: String(rsiObj.signal ?? baseIndicators.rsi.signal),
    },
    macd: {
      macd_line: safeFloat(macdObj.macd_line, baseIndicators.macd.macd_line as number | null),
      signal_line: safeFloat(macdObj.signal_line, baseIndicators.macd.signal_line as number | null),
      histogram: safeFloat(macdObj.histogram, baseIndicators.macd.histogram as number | null),
      state: asEnum(macdObj.state, new Set(["bullish_crossover", "bearish_crossover", "bullish_momentum", "bearish_momentum"]), baseIndicators.macd.state as string),
      signal: String(macdObj.signal ?? baseIndicators.macd.signal),
    },
    ema: {
      ema20: safeFloat(emaObj.ema20, baseIndicators.ema.ema20 as number | null),
      ema50: safeFloat(emaObj.ema50, baseIndicators.ema.ema50 as number | null),
      alignment: asEnum(emaObj.alignment, new Set(["bullish", "bearish", "mixed"]), baseIndicators.ema.alignment as string),
      price_vs_ema20: asEnum(emaObj.price_vs_ema20, new Set(["above", "below", "at"]), baseIndicators.ema.price_vs_ema20 as string),
      price_vs_ema50: asEnum(emaObj.price_vs_ema50, new Set(["above", "below", "at"]), baseIndicators.ema.price_vs_ema50 as string),
      signal: String(emaObj.signal ?? baseIndicators.ema.signal),
    },
  };

  const nearestResistance = normalizeLabelValue(pivotAnalysis.nearest_pivot_resistance) ?? (basePivotAnalysis.nearest_pivot_resistance as ReturnType<typeof normalizeLabelValue>);
  const nearestSupport = normalizeLabelValue(pivotAnalysis.nearest_pivot_support) ?? (basePivotAnalysis.nearest_pivot_support as ReturnType<typeof normalizeLabelValue>);

  const rawConfluences = Array.isArray(pivotAnalysis.confluences) ? pivotAnalysis.confluences : [];
  const validatedConfluences = rawConfluences
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      level: String(c.level ?? "N/A"),
      price: safeFloat(c.price, null),
      confluent_with: String(c.confluent_with ?? "unknown"),
      significance: asEnum(c.significance, new Set(["high", "medium", "low"]), "low"),
    }))
    .filter((c) => c.price != null);

  const validatedPivotAnalysis = {
    pp: safeFloat(pivotAnalysis.pp, basePivotAnalysis.pp as number | null),
    current_zone: String(pivotAnalysis.current_zone ?? basePivotAnalysis.current_zone),
    session_bias: asEnum(pivotAnalysis.session_bias, new Set(["bullish", "bearish", "neutral"]), basePivotAnalysis.session_bias as string),
    nearest_pivot_resistance: nearestResistance,
    nearest_pivot_support: nearestSupport,
    distance_to_pivot_resistance_pct: safeFloat(pivotAnalysis.distance_to_pivot_resistance_pct, basePivotAnalysis.distance_to_pivot_resistance_pct as number | null),
    distance_to_pivot_support_pct: safeFloat(pivotAnalysis.distance_to_pivot_support_pct, basePivotAnalysis.distance_to_pivot_support_pct as number | null),
    at_inflection_point: Boolean(pivotAnalysis.at_inflection_point ?? basePivotAnalysis.at_inflection_point),
    inflection_level: pivotAnalysis.inflection_level != null ? String(pivotAnalysis.inflection_level) : basePivotAnalysis.inflection_level,
    pivot_target_bull: normalizeLabelValue(pivotAnalysis.pivot_target_bull) ?? nearestResistance,
    pivot_target_bear: normalizeLabelValue(pivotAnalysis.pivot_target_bear) ?? nearestSupport,
    confluences: validatedConfluences.length ? validatedConfluences : basePivotAnalysis.confluences,
    pivot_signal: String(pivotAnalysis.pivot_signal ?? basePivotAnalysis.pivot_signal),
  };

  const filterFiniteNumbers = (value: unknown, fallback: unknown, take: number) => {
    const list = Array.isArray(value) ? value : fallback;
    return (Array.isArray(list) ? list : [])
      .map((v) => safeFloat(v, null))
      .filter((v): v is number => v != null)
      .slice(-take);
  };

  const validatedStructure = {
    nearest_support: safeFloat(structure.nearest_support, baseStructure.nearest_support as number | null),
    nearest_resistance: safeFloat(structure.nearest_resistance, baseStructure.nearest_resistance as number | null),
    key_support_levels: filterFiniteNumbers(structure.key_support_levels, baseStructure.key_support_levels, 5),
    key_resistance_levels: filterFiniteNumbers(structure.key_resistance_levels, baseStructure.key_resistance_levels, 5),
    range_bound: Boolean(structure.range_bound ?? baseStructure.range_bound),
    breakout_watch: asEnum(structure.breakout_watch, new Set(["bullish", "bearish", "none"]), baseStructure.breakout_watch as string),
  };

  const validatedOrderFlow = {
    obi: safeFloat(orderFlow.obi, baseOrderFlow.obi as number | null),
    tfi: safeFloat(orderFlow.tfi, baseOrderFlow.tfi as number | null),
    dominant_side: asEnum(orderFlow.dominant_side, new Set(["buyers", "sellers", "neutral"]), baseOrderFlow.dominant_side as string),
    interpretation: String(orderFlow.interpretation ?? baseOrderFlow.interpretation),
  };

  const validatedTradeLogic = {
    bullish_scenario: String(tradeLogic.bullish_scenario ?? baseTradeLogic.bullish_scenario),
    bearish_scenario: String(tradeLogic.bearish_scenario ?? baseTradeLogic.bearish_scenario),
    invalidation_bull: safeFloat(tradeLogic.invalidation_bull, baseTradeLogic.invalidation_bull as number | null),
    invalidation_bear: safeFloat(tradeLogic.invalidation_bear, baseTradeLogic.invalidation_bear as number | null),
    suggested_bias: asEnum(tradeLogic.suggested_bias, new Set(["long", "short", "wait"]), baseTradeLogic.suggested_bias as string),
    risk_note: String(tradeLogic.risk_note ?? baseTradeLogic.risk_note),
  };

  const rawAnomalies = Array.isArray(parsed.anomalies) ? parsed.anomalies : [];
  const validatedAnomalies = rawAnomalies
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      type: asEnum(a.type, new Set(["divergence", "liquidity_trap", "trend_exhaustion", "pivot_confluence", "volume_spike", "none"]), "none"),
      description: String(a.description ?? ""),
      severity: asEnum(a.severity, new Set(["low", "medium", "high"]), "low"),
    }));

  const validatedMarketRegime = {
    volatility: asEnum(marketRegime.volatility, new Set(["low", "medium", "high"]), baseMarketRegime.volatility as string),
    trend_strength: clamp(safeInt(marketRegime.trend_strength, baseMarketRegime.trend_strength as number), 0, 100),
    is_trending: Boolean(marketRegime.is_trending ?? baseMarketRegime.is_trending),
    regime: asEnum(marketRegime.regime, new Set(["trending", "ranging", "breakout", "reversal"]), baseMarketRegime.regime as string),
  };

  const rawTargets = Array.isArray(tradePlanObj.targets) ? tradePlanObj.targets : [];
  const validatedTargets: TradePlanTarget[] = rawTargets
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      label: String(t.label ?? "Target"),
      price: safeFloat(t.price, null),
      risk_reward: safeFloat(t.risk_reward, null),
    }))
    .filter((t) => t.price != null)
    .slice(0, 5);

  const tradePlanBias = asEnum(tradePlanObj.bias, new Set(["long", "short", "wait"]), baseTradePlan.bias);
  const entryZoneObj = asObject(tradePlanObj.entry_zone);
  const validatedTradePlan: TradePlan = {
    bias: tradePlanBias,
    entry_zone: tradePlanBias === "wait"
      ? null
      : {
        low: safeFloat(entryZoneObj.low, baseTradePlan.entry_zone?.low ?? null),
        high: safeFloat(entryZoneObj.high, baseTradePlan.entry_zone?.high ?? null),
      },
    stop_loss: tradePlanBias === "wait" ? null : safeFloat(tradePlanObj.stop_loss, baseTradePlan.stop_loss),
    targets: tradePlanBias === "wait" ? [] : (validatedTargets.length ? validatedTargets : baseTradePlan.targets),
    risk_reward_summary: String(tradePlanObj.risk_reward_summary ?? baseTradePlan.risk_reward_summary),
    confidence: clamp(safeInt(tradePlanObj.confidence, baseTradePlan.confidence), 0, 100),
    rationale: String(tradePlanObj.rationale ?? baseTradePlan.rationale),
  };

  const out = {
    ...base,
    summary: validatedSummary,
    indicators: validatedIndicators,
    pivot_analysis: validatedPivotAnalysis,
    structure: validatedStructure,
    order_flow: validatedOrderFlow,
    trade_logic: validatedTradeLogic,
    anomalies: validatedAnomalies.length ? validatedAnomalies : base.anomalies,
    market_regime: validatedMarketRegime,
    trade_plan: validatedTradePlan,
    _meta: {
      model: MODEL,
      source: "openrouter",
      timestamp: new Date().toISOString(),
      validated: true,
      confluence_score: base._meta.confluence_score,
      data_completeness: base._meta.data_completeness,
    },
  };

  return {
    ...out,
    market_structure: out.structure,
    trend_momentum: {
      summary: out.summary,
      indicators: out.indicators,
      market_regime: out.market_regime,
    },
    trade_logic_risk: out.trade_logic,
    anomaly_detection: out.anomalies,
  };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") return jsonResponse(req, { success: false, error: "Method not allowed." }, 405);

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

  const started = Date.now();
  let symbol = "";
  let interval = "";
  let ctxForFallback: MarketContext | null = null;

  try {
    const withinLimit = await checkRateLimit(supabase, userId);
    if (!withinLimit) {
      await logAiAnalysis(supabase, { userId, symbol: null, timeframe: null, model: MODEL, status: "rate_limited", latencyMs: Date.now() - started });
      return jsonResponse(req, { success: false, error: "Too many AI analysis requests. Please wait a few minutes and try again." }, 429);
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) return jsonResponse(req, { success: false, error: "OPENROUTER_API_KEY is not configured." }, 500);

    const body = await req.json().catch(() => null);
    symbol = String(body?.symbol ?? "").toUpperCase().trim();
    interval = String(body?.interval ?? body?.timeframe ?? "4h").trim();

    if (!SYMBOL_REGEX.test(symbol)) {
      return jsonResponse(req, { success: false, error: "Invalid or missing symbol." }, 400);
    }
    if (!ALLOWED_INTERVALS.has(interval)) {
      return jsonResponse(req, { success: false, error: "Invalid interval." }, 400);
    }

    const ctx = await gatherMarketContext(symbol, interval);
    ctxForFallback = ctx;

    const response = await fetchWithTimeout(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("OPENROUTER_HTTP_REFERER") ?? "https://supabase.com",
        "X-Title": "Forge",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserMessage(ctx) },
        ],
        temperature: 0,
        max_tokens: 3000,
      }),
    }, { timeoutMs: 25000, retries: 1 });

    if (response.status === 429) {
      await logAiAnalysis(supabase, { userId, symbol, timeframe: interval, model: MODEL, status: "error", latencyMs: Date.now() - started, errorMessage: "OpenRouter rate limit" });
      return jsonResponse(req, { success: false, error: "OpenRouter rate limit hit. Wait and retry." }, 429);
    }
    if (response.status === 401) {
      await logAiAnalysis(supabase, { userId, symbol, timeframe: interval, model: MODEL, status: "error", latencyMs: Date.now() - started, errorMessage: "Invalid OpenRouter API key" });
      return jsonResponse(req, { success: false, error: "Invalid OpenRouter API key." }, 500);
    }
    if (!response.ok) {
      const text = await response.text();
      await logAiAnalysis(supabase, { userId, symbol, timeframe: interval, model: MODEL, status: "error", latencyMs: Date.now() - started, errorMessage: `OpenRouter error: ${response.status}` });
      return jsonResponse(req, { success: false, error: `OpenRouter error: ${response.status}`, details: text }, 502);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content);
    const analysis = normalizeModelOutput(parsed, ctx);
    const latencyMs = Date.now() - started;
    analysis._meta = { ...analysis._meta, latency_ms: latencyMs };

    await logAiAnalysis(supabase, { userId, symbol, timeframe: interval, model: MODEL, status: "success", latencyMs });

    return jsonResponse(req, { success: true, analysis });
  } catch (error) {
    const latencyMs = Date.now() - started;
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logAiAnalysis(supabase, { userId, symbol: symbol || null, timeframe: interval || null, model: MODEL, status: "fallback", latencyMs, errorMessage });

    // Reuse the context already gathered in the try block when the failure happened after that
    // point (e.g. OpenRouter/JSON parsing) instead of re-fetching all market data. Only re-fetch
    // if the failure happened before context could be gathered at all.
    try {
      const ctx = ctxForFallback ?? (symbol && interval ? await gatherMarketContext(symbol, interval) : null);
      if (ctx) {
        return jsonResponse(req, { success: true, analysis: deterministicFallback(ctx, `fallback: ${errorMessage}`) });
      }
    } catch { /* fall through to hard error below */ }

    return jsonResponse(req, { success: false, error: `Unable to gather market data or reach the AI service: ${errorMessage}` }, 502);
  }
});
