import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { fetchWithTimeout, safeError } from "../_shared/http.ts";
import { requireAuthenticatedUser, tryServiceClient } from "../_shared/auth.ts";
import { consumeQuota } from "../_shared/rateLimit.ts";
import { empiricalConfidence, clampModelConfidence } from "../_shared/calibration.ts";
import {
  buildUserMessage,
  gatherMarketContext,
  type MarketContext,
  PRIMARY_CANDLE_LIMIT,
  SERIES_WINDOW,
} from "../_shared/aiContext.ts";
import {
  appendPositionSizing,
  applyRegimeGating,
  buildDeterministicTradePlan,
  recomputeTradePlanRiskReward,
  type GatingContext,
  type SetupType,
  type TradePlan,
  type TradePlanTarget,
  validateTradePlanGeometry,
} from "../_shared/tradePlan.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-super-49b-v1:free";
const MODEL = Deno.env.get("OPENROUTER_MODEL") ?? DEFAULT_MODEL;

const ALLOWED_INTERVALS = new Set([
  "1m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
]);
const SYMBOL_REGEX = /^[A-Z0-9]{5,20}$/;
const PRIMARY_CANDLE_LIMIT_REF = PRIMARY_CANDLE_LIMIT;
void PRIMARY_CANDLE_LIMIT_REF;
const SERIES_WINDOW_REF = SERIES_WINDOW;
void SERIES_WINDOW_REF;

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_CALLS = 10;
const ANALYSIS_CACHE_TTL_MS = 90 * 1000;

async function readAnalysisCache(
  supabase: SupabaseClient,
  cacheKey: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("ai_analysis_cache")
    .select("response_payload")
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data?.response_payload) return null;
  return data.response_payload as Record<string, unknown>;
}

async function writeAnalysisCache(
  supabase: SupabaseClient,
  cacheKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ANALYSIS_CACHE_TTL_MS).toISOString();
  const { error } = await supabase.from("ai_analysis_cache").upsert({
    cache_key: cacheKey,
    response_payload: payload,
    expires_at: expiresAt,
  }, { onConflict: "cache_key" });
  if (error) console.error("[ai-analysis] cache upsert failed:", error.message);
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
    requestPayload?: Record<string, unknown> | null;
    responsePayload?: Record<string, unknown> | null;
    setupType?: SetupType | null;
  },
): Promise<string | null> {
  const { data, error } = await supabase.from("ai_analysis_logs").insert({
    user_id: entry.userId,
    symbol: entry.symbol,
    timeframe: entry.timeframe,
    model: entry.model,
    status: entry.status,
    latency_ms: entry.latencyMs,
    error_message: entry.errorMessage ?? null,
    request_payload: entry.requestPayload ?? null,
    response_payload: entry.responsePayload ?? null,
    setup_type: entry.setupType ?? null,
  }).select("id").single();
  if (error) console.error("[ai-analysis] failed to write ai_analysis_logs:", error.message);
  return data?.id ?? null;
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
  };
}

async function fetchEmpiricalCalibration(
  supabase: SupabaseClient,
  setupType: SetupType,
): Promise<{ n: number; empirical_hit_rate: number } | null> {
  const { data: v2data, error: v2error } = await supabase
    .from("ai_analysis_logs")
    .select("outcome, setup_type, scoring_version")
    .eq("status", "success")
    .not("evaluated_at", "is", null)
    .in("outcome", ["target_hit", "stop_hit", "expired", "no_fill"])
    .eq("scoring_version", 2)
    .limit(500);
  const useV2 = !v2error && (v2data?.length ?? 0) >= 20;

  const { data, error } = await supabase
    .from("ai_analysis_logs")
    .select("outcome, setup_type, scoring_version")
    .eq("status", "success")
    .not("evaluated_at", "is", null)
    .in("outcome", ["target_hit", "stop_hit", "expired", "no_fill"])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data?.length) return null;

  const rows = (useV2
    ? (v2data ?? [])
    : data) as Array<{ outcome: string | null; setup_type: string | null }>;
  const globalWins = rows.filter((r) => r.outcome === "target_hit").length;
  const globalDecided = rows.filter((r) => r.outcome === "target_hit" || r.outcome === "stop_hit").length;
  const globalRate = globalDecided > 0 ? globalWins / globalDecided : 0.5;

  const setupRows = rows.filter((r) => r.setup_type === setupType);
  const hits = setupRows.filter((r) => r.outcome === "target_hit").length;
  const decided = setupRows.filter((r) => r.outcome === "target_hit" || r.outcome === "stop_hit").length;
  if (!decided) return null;

  return {
    n: decided,
    empirical_hit_rate: empiricalConfidence(hits, decided, globalRate) / 100,
  };
}

function attachEmpiricalConfidence(
  analysis: Record<string, unknown>,
  calibration: { n: number; empirical_hit_rate: number } | null,
  setupType: SetupType,
): void {
  if (!calibration) return;
  const tradePlan = analysis.trade_plan as TradePlan;
  if (!tradePlan || typeof tradePlan !== "object") return;
  tradePlan.empirical_confidence = Number((calibration.empirical_hit_rate * 100).toFixed(1));
  const pct = (calibration.empirical_hit_rate * 100).toFixed(1);
  tradePlan.rationale = `${tradePlan.rationale} This setup type has hit ${pct}% over ${calibration.n} decided instances — don't report confidence far above this without stating why.`;

  const summary = analysis.summary as Record<string, unknown> | undefined;
  if (summary && typeof summary.confidence === "number") {
    const { confidence, capped } = clampModelConfidence(summary.confidence as number, calibration);
    summary.confidence = confidence;
    if (capped) {
      analysis._meta = {
        ...(analysis._meta as Record<string, unknown>),
        confidence_capped: true,
      };
    }
  }
  if (typeof tradePlan.confidence === "number") {
    const { confidence, capped } = clampModelConfidence(tradePlan.confidence, calibration);
    tradePlan.confidence = confidence;
    if (capped) {
      analysis._meta = {
        ...(analysis._meta as Record<string, unknown>),
        confidence_capped: true,
      };
    }
  }

  analysis.trade_plan = tradePlan;
  analysis._meta = {
    ...(analysis._meta as Record<string, unknown>),
    setup_type: setupType,
    calibration: {
      setup_type: setupType,
      n: calibration.n,
      empirical_hit_rate: calibration.empirical_hit_rate,
    },
  };
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
// Deterministic trade plan — used both as the resilient fallback and as the
// baseline the model's own trade_plan is validated against.
// (buildDeterministicTradePlan lives in _shared/tradePlan.ts)
// ---------------------------------------------------------------------------

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
  const pp = Number(ctx.pivots.classic.pivots.PP);
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

  const gatingCtx = toGatingContext(ctx);
  const gated = applyRegimeGating(bias, confidence, gatingCtx);
  const tradePlan = buildDeterministicTradePlan(gatingCtx, gated.bias, gated.confidence);

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
      regime: ctx.regime,
      htf_bias: ctx.htfBias,
    },
    trade_plan: tradePlan,
    _meta: {
      model: MODEL,
      source,
      timestamp: new Date().toISOString(),
      validated: true,
      confluence_score: ctx.confluenceScore,
      signal_strength: ctx.signalAgreement,
      setup_type: gated.setupType,
      data_completeness: {
        futures_available: ctx.futures.available,
        order_book_available: ctx.orderFlow.obi != null,
        liquidation_available: ctx.liquidation.available,
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

const enumProp = (values: string[]) => ({ type: "string", enum: values });

const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        primary_trend: enumProp(["bullish", "bearish", "sideways"]),
        momentum: enumProp(["strong_bullish", "bullish", "neutral", "bearish", "strong_bearish"]),
        phase: enumProp(["accumulation", "markup", "distribution", "markdown", "consolidation"]),
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        bias: enumProp(["long", "short", "neutral"]),
        reasoning: { type: "string" },
      },
      required: ["primary_trend", "momentum", "phase", "confidence", "bias", "reasoning"],
    },
    indicators: {
      type: "object",
      additionalProperties: false,
      properties: {
        rsi: {
          type: "object",
          additionalProperties: false,
          properties: {
            state: enumProp(["overbought", "bullish_zone", "neutral", "bearish_zone", "oversold"]),
            divergence: enumProp(["bullish", "bearish", "none"]),
            signal: { type: "string" },
          },
          required: ["state", "divergence", "signal"],
        },
        macd: {
          type: "object",
          additionalProperties: false,
          properties: {
            state: enumProp(["bullish_crossover", "bearish_crossover", "bullish_momentum", "bearish_momentum"]),
            signal: { type: "string" },
          },
          required: ["state", "signal"],
        },
        ema: {
          type: "object",
          additionalProperties: false,
          properties: {
            alignment: enumProp(["bullish", "bearish", "mixed"]),
            price_vs_ema20: enumProp(["above", "below", "at"]),
            price_vs_ema50: enumProp(["above", "below", "at"]),
            signal: { type: "string" },
          },
          required: ["alignment", "price_vs_ema20", "price_vs_ema50", "signal"],
        },
      },
      required: ["rsi", "macd", "ema"],
    },
    pivot_analysis: { type: "object", additionalProperties: false, properties: {}, required: [] },
    structure: { type: "object", additionalProperties: false, properties: {}, required: [] },
    order_flow: { type: "object", additionalProperties: false, properties: {}, required: [] },
    trade_logic: { type: "object", additionalProperties: false, properties: {}, required: [] },
    anomalies: { type: "array", items: { type: "object" } },
    market_regime: {
      type: "object",
      additionalProperties: false,
      properties: {
        volatility: enumProp(["low", "medium", "high"]),
        trend_strength: { type: "integer", minimum: 0, maximum: 100 },
        is_trending: { type: "boolean" },
        regime: enumProp(["trending", "ranging", "volatile_chop", "breakout", "reversal"]),
      },
      required: ["volatility", "trend_strength", "is_trending", "regime"],
    },
    trade_plan: {
      type: "object",
      additionalProperties: false,
      properties: {
        bias: enumProp(["long", "short", "wait"]),
        entry_zone: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              properties: { low: { type: "number" }, high: { type: "number" } },
              required: ["low", "high"],
            },
          ],
        },
        stop_loss: { anyOf: [{ type: "null" }, { type: "number" }] },
        targets: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              price: { type: "number" },
              risk_reward: { anyOf: [{ type: "null" }, { type: "number" }] },
            },
            required: ["label", "price", "risk_reward"],
          },
        },
        risk_reward_summary: { type: "string" },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        rationale: { type: "string" },
      },
      required: ["bias", "entry_zone", "stop_loss", "targets", "risk_reward_summary", "confidence", "rationale"],
    },
  },
  required: ["summary", "indicators", "pivot_analysis", "structure", "order_flow", "trade_logic", "anomalies", "market_regime", "trade_plan"],
};

async function callOpenRouter(apiKey: string, ctx: MarketContext): Promise<Response> {
  const baseBody = {
    model: MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserMessage(ctx) },
    ],
    temperature: 0,
    max_tokens: 3000,
  };

  const schemaBody = {
    ...baseBody,
    response_format: {
      type: "json_schema",
      json_schema: { name: "forge_analysis", strict: true, schema: ANALYSIS_JSON_SCHEMA },
    },
  };

  let response = await fetchWithTimeout(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("OPENROUTER_HTTP_REFERER") ?? "https://supabase.com",
      "X-Title": "Forge",
    },
    body: JSON.stringify(schemaBody),
  }, { timeoutMs: 25000, retries: 1 });

  if (response.status === 400) {
    const text = await response.text();
    if (text.includes("response_format")) {
      response = await fetchWithTimeout(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": Deno.env.get("OPENROUTER_HTTP_REFERER") ?? "https://supabase.com",
          "X-Title": "Forge",
        },
        body: JSON.stringify({ ...baseBody, response_format: { type: "json_object" } }),
      }, { timeoutMs: 25000, retries: 1 });
    } else {
      return new Response(text, { status: 400 });
    }
  }

  return response;
}

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
- Regime gating: volatile_chop => wait; ranging => only fade within 0.5×ATR of S/R zones;
  if 2+ HTF reads contradict bias => wait; if 1 contradicts => lower confidence ~15pts.
- Base stop_loss and targets on the supplied pivot levels, swing structure, and ATR — never invent
  price levels that are not derivable from the provided data.
- Price above the classic PP is bullish session bias; below is bearish. RSI >= 70 is overbought,
  <= 30 is oversold. MACD is bullish when the MACD line is above its signal line. EMA alignment is
  bullish if price > EMA20 > EMA50, bearish if price < EMA20 < EMA50, otherwise mixed.
- If futures or order-book data is unavailable (null), say so rather than inventing a reading, and
  do not let its absence be the sole driver of confidence.
- Liquidation cluster data is an estimated model output (not measured on-chain). Use it as weak
  confluence only — never as a primary driver of bias or confidence.
- Keep every field data-grounded. Never fabricate values for inputs that were not provided.`;
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
      value: baseIndicators.rsi.value as number | null,
      state: asEnum(rsiObj.state, new Set(["overbought", "bullish_zone", "neutral", "bearish_zone", "oversold"]), baseIndicators.rsi.state as string),
      divergence: asEnum(rsiObj.divergence, new Set(["bullish", "bearish", "none"]), baseIndicators.rsi.divergence as string),
      signal: String(rsiObj.signal ?? baseIndicators.rsi.signal),
    },
    macd: {
      macd_line: baseIndicators.macd.macd_line as number | null,
      signal_line: baseIndicators.macd.signal_line as number | null,
      histogram: baseIndicators.macd.histogram as number | null,
      state: asEnum(macdObj.state, new Set(["bullish_crossover", "bearish_crossover", "bullish_momentum", "bearish_momentum"]), baseIndicators.macd.state as string),
      signal: String(macdObj.signal ?? baseIndicators.macd.signal),
    },
    ema: {
      ema20: baseIndicators.ema.ema20 as number | null,
      ema50: baseIndicators.ema.ema50 as number | null,
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
    pp: basePivotAnalysis.pp as number | null,
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
    regime: asEnum(marketRegime.regime, new Set(["trending", "ranging", "volatile_chop", "breakout", "reversal"]), baseMarketRegime.regime as string),
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
  let validatedTradePlan: TradePlan = {
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

  let modelFieldCount = 0;
  let totalFieldCount = 0;
  const trackField = (modelValue: unknown, baseValue: unknown) => {
    totalFieldCount += 1;
    if (modelValue !== undefined && modelValue !== null && modelValue !== baseValue) modelFieldCount += 1;
  };
  trackField(summary.primary_trend, baseSummary.primary_trend);
  trackField(summary.momentum, baseSummary.momentum);
  trackField(summary.confidence, baseSummary.confidence);
  trackField(tradePlanObj.bias, baseTradePlan.bias);
  trackField(tradePlanObj.stop_loss, baseTradePlan.stop_loss);
  trackField(validatedTargets.length, baseTradePlan.targets.length);

  const geometry = validateTradePlanGeometry(validatedTradePlan, ctx.price);
  let tradePlanGeometryValid = geometry.valid;
  const gatingCtx = toGatingContext(ctx);
  const baseSetupType = (base._meta as Record<string, unknown>)?.setup_type as SetupType ?? "wait";
  if (!geometry.valid && validatedTradePlan.bias !== "wait") {
    const fallbackBias = validatedTradePlan.bias === "long" ? "long" : validatedTradePlan.bias === "short" ? "short" : "neutral";
    const detBias = fallbackBias === "long" || fallbackBias === "short" ? fallbackBias : "neutral";
    const gated = applyRegimeGating(detBias, validatedTradePlan.confidence, gatingCtx);
    validatedTradePlan = buildDeterministicTradePlan(gatingCtx, gated.bias, gated.confidence);
    tradePlanGeometryValid = false;
  } else {
    validatedTradePlan = recomputeTradePlanRiskReward(validatedTradePlan);
    validatedTradePlan = appendPositionSizing(validatedTradePlan);
  }

  const setupType = applyRegimeGating(
    validatedTradePlan.bias === "wait" ? "neutral" : validatedTradePlan.bias,
    validatedTradePlan.confidence,
    gatingCtx,
  ).setupType ?? baseSetupType;

  const modelFieldRatio = totalFieldCount > 0 ? modelFieldCount / totalFieldCount : 0;
  const source = modelFieldRatio >= 0.7 ? "openrouter" : modelFieldRatio > 0 ? "openrouter-partial" : "deterministic";

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
      source,
      timestamp: new Date().toISOString(),
      validated: true,
      confluence_score: ctx.confluenceScore,
      signal_strength: ctx.signalAgreement,
      model_field_ratio: Number(modelFieldRatio.toFixed(3)),
      trade_plan_geometry_valid: tradePlanGeometryValid,
      setup_type: setupType,
      data_completeness: {
        futures_available: ctx.futures.available,
        order_book_available: ctx.orderFlow.obi != null,
        liquidation_available: ctx.liquidation.available,
      },
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
    const body = await req.json().catch(() => null);
    symbol = String(body?.symbol ?? "").toUpperCase().trim();
    interval = String(body?.interval ?? body?.timeframe ?? "4h").trim();

    if (!SYMBOL_REGEX.test(symbol)) {
      return jsonResponse(req, { success: false, error: "Invalid or missing symbol." }, 400);
    }
    if (!ALLOWED_INTERVALS.has(interval)) {
      return jsonResponse(req, { success: false, error: "Invalid interval." }, 400);
    }

    const cacheKey = `${symbol}:${interval}`;

    const cached = await readAnalysisCache(supabase, cacheKey);
    if (cached) {
      return jsonResponse(req, {
        success: true,
        analysis: { ...cached, _meta: { ...(cached._meta as Record<string, unknown>), cached: true } },
      });
    }

    const quota = await consumeQuota(supabase, userId, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_CALLS, "ai_analysis");
    if (!quota.ok) {
      if (quota.reason === "unavailable") {
        return jsonResponse(req, { success: false, error: "Rate limit check unavailable. Please try again shortly." }, 503);
      }
      await logAiAnalysis(supabase, { userId, symbol, timeframe: interval, model: MODEL, status: "rate_limited", latencyMs: Date.now() - started });
      return jsonResponse(req, { success: false, error: "Too many AI analysis requests. Please wait a few minutes and try again." }, 429);
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) return jsonResponse(req, { success: false, error: "OPENROUTER_API_KEY is not configured." }, 500);

    const ctx = await gatherMarketContext(symbol, interval);
    ctxForFallback = ctx;

    const requestPayload = {
      symbol,
      interval,
      price: ctx.price,
      confluence_score: ctx.confluenceScore,
      signal_strength: ctx.signalAgreement,
      indicators: {
        rsi14: ctx.latest.rsi14,
        ema20: ctx.latest.ema20,
        ema50: ctx.latest.ema50,
        macd_hist: ctx.latest.macdHist,
        adx14: ctx.latest.adx14,
      },
    };

    const response = await callOpenRouter(apiKey, ctx);

    if (response.status === 429) {
      await logAiAnalysis(supabase, { userId, symbol, timeframe: interval, model: MODEL, status: "error", latencyMs: Date.now() - started, errorMessage: "OpenRouter rate limit", requestPayload });
      return jsonResponse(req, { success: false, error: "OpenRouter rate limit hit. Wait and retry." }, 429);
    }
    if (response.status === 401) {
      await logAiAnalysis(supabase, { userId, symbol, timeframe: interval, model: MODEL, status: "error", latencyMs: Date.now() - started, errorMessage: "Invalid OpenRouter API key", requestPayload });
      return jsonResponse(req, { success: false, error: "Invalid OpenRouter API key." }, 500);
    }
    if (!response.ok) {
      const text = await response.text();
      console.error("[ai-analysis] OpenRouter error:", response.status, text.slice(0, 500));
      await logAiAnalysis(supabase, { userId, symbol, timeframe: interval, model: MODEL, status: "error", latencyMs: Date.now() - started, errorMessage: `OpenRouter error: ${response.status}`, requestPayload });
      return jsonResponse(req, { success: false, error: "AI service returned an error. Please try again." }, 502);
    }

    const payload = await response.json();
    if (payload?.usage) {
      console.log("[ai-analysis] token usage:", JSON.stringify(payload.usage));
    }
    const content = payload?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content);
    const analysis = normalizeModelOutput(parsed, ctx);
    const setupType = (analysis._meta as Record<string, unknown>)?.setup_type as SetupType ?? "wait";
    const calibration = await fetchEmpiricalCalibration(supabase, setupType);
    attachEmpiricalConfidence(analysis as Record<string, unknown>, calibration, setupType);
    const latencyMs = Date.now() - started;

    await writeAnalysisCache(supabase, cacheKey, analysis as Record<string, unknown>);
    const analysisId = await logAiAnalysis(supabase, {
      userId,
      symbol,
      timeframe: interval,
      model: MODEL,
      status: "success",
      latencyMs,
      requestPayload,
      responsePayload: analysis as Record<string, unknown>,
      setupType,
    });
    analysis._meta = {
      ...analysis._meta,
      analysis_id: analysisId,
      latency_ms: latencyMs,
      confluence_score: ctx.confluenceScore,
      confluence_breakdown: ctx.confluenceBreakdown,
    };

    return jsonResponse(req, { success: true, analysis });
  } catch (error) {
    const latencyMs = Date.now() - started;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fallbackAnalysisId = await logAiAnalysis(supabase, { userId, symbol: symbol || null, timeframe: interval || null, model: MODEL, status: "fallback", latencyMs, errorMessage });

    // Reuse the context already gathered in the try block when the failure happened after that
    // point (e.g. OpenRouter/JSON parsing) instead of re-fetching all market data. Only re-fetch
    // if the failure happened before context could be gathered at all.
    try {
      const ctx = ctxForFallback ?? (symbol && interval ? await gatherMarketContext(symbol, interval) : null);
      if (ctx) {
        const fallback = deterministicFallback(ctx, `fallback: ${errorMessage}`);
        fallback._meta = { ...(fallback._meta as Record<string, unknown>), analysis_id: fallbackAnalysisId };
        return jsonResponse(req, { success: true, analysis: fallback });
      }
    } catch { /* fall through to hard error below */ }

    return jsonResponse(req, { success: false, error: safeError("Unable to complete AI analysis.", error) }, 502);
  }
});
