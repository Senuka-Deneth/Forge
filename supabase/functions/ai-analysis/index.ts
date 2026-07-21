import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { fetchWithTimeout } from "../_shared/http.ts";
import { requireAuthenticatedUser, tryServiceClient } from "../_shared/auth.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-super-49b-v1:free";

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

function normalizeLabelValue(item: unknown): { label: string; value: number } | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const source = item as Record<string, unknown>;
  const value = safeFloat(source.value);
  if (value == null) return null;
  return { label: String(source.label ?? "N/A").trim() || "N/A", value: Number(value.toFixed(6)) };
}

function deriveRsiState(rsi: number | null): string {
  if (rsi == null) return "neutral";
  if (rsi >= 70) return "overbought";
  if (rsi <= 30) return "oversold";
  if (rsi >= 55) return "bullish_zone";
  if (rsi <= 45) return "bearish_zone";
  return "neutral";
}

function deriveAlignment(price: number | null, ema20: number | null, ema50: number | null) {
  if (price == null || ema20 == null || ema50 == null) {
    return { alignment: "mixed", priceVsEma20: "at", priceVsEma50: "at", signal: "EMA data unavailable." };
  }
  const tol = Math.abs(price) * 0.0001;
  const priceVsEma20 = Math.abs(price - ema20) <= tol ? "at" : price > ema20 ? "above" : "below";
  const priceVsEma50 = Math.abs(price - ema50) <= tol ? "at" : price > ema50 ? "above" : "below";
  if (price > ema20 && ema20 > ema50) {
    return { alignment: "bullish", priceVsEma20, priceVsEma50, signal: "Price and short EMA are stacked above EMA50 (bullish alignment)." };
  }
  if (price < ema20 && ema20 < ema50) {
    return { alignment: "bearish", priceVsEma20, priceVsEma50, signal: "Price and short EMA are stacked below EMA50 (bearish alignment)." };
  }
  return { alignment: "mixed", priceVsEma20, priceVsEma50, signal: "EMA structure is mixed; no clean directional stack." };
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

function deterministicFallback(data: Record<string, unknown>, source = "local-fallback") {
  const price = safeFloat(data.price, 0) as number;
  const rsi = safeFloat(data.rsi);
  const ema20 = safeFloat(data.ema20);
  const ema50 = safeFloat(data.ema50);
  const macdObj = (data.macd && typeof data.macd === "object") ? data.macd as Record<string, unknown> : {};
  const macdLine = safeFloat(macdObj.macd);
  const signalLine = safeFloat(macdObj.signal);
  const histogram = safeFloat(macdObj.histogram);
  const pivots = (data.pivots && typeof data.pivots === "object") ? data.pivots as Record<string, unknown> : {};
  const classic = (pivots.classic && typeof pivots.classic === "object") ? pivots.classic as Record<string, unknown> : {};
  const pivotAnalysisRaw = (pivots.analysis && typeof pivots.analysis === "object") ? pivots.analysis as Record<string, unknown> : {};
  const pp = safeFloat(classic.PP);
  const alignment = deriveAlignment(price, ema20, ema50);

  const primaryTrend = alignment.alignment === "bullish" ? "bullish" : alignment.alignment === "bearish" ? "bearish" : "sideways";
  let momentum = "neutral";
  if (macdLine != null && signalLine != null) {
    if (macdLine > signalLine && (rsi == null || rsi >= 50)) momentum = "bullish";
    else if (macdLine < signalLine && (rsi == null || rsi <= 50)) momentum = "bearish";
  }
  if (momentum === "bullish" && rsi != null && rsi >= 70) momentum = "strong_bullish";
  if (momentum === "bearish" && rsi != null && rsi <= 30) momentum = "strong_bearish";

  const bias = primaryTrend === "bullish" && momentum.includes("bullish")
    ? "long"
    : primaryTrend === "bearish" && momentum.includes("bearish")
      ? "short"
      : "neutral";

  let nearestResistance = normalizeLabelValue(pivotAnalysisRaw.nearestPivotResistance) ?? normalizeLabelValue(pivotAnalysisRaw.nearestResistance);
  let nearestSupport = normalizeLabelValue(pivotAnalysisRaw.nearestPivotSupport) ?? normalizeLabelValue(pivotAnalysisRaw.nearestSupport);
  const localResistance = safeFloat(data.resistance);
  const localSupport = safeFloat(data.support);
  if (!nearestResistance && localResistance != null) nearestResistance = { label: "local_res", value: Number(localResistance.toFixed(6)) };
  if (!nearestSupport && localSupport != null) nearestSupport = { label: "local_sup", value: Number(localSupport.toFixed(6)) };

  const confluences = [];
  if (pp != null && ema20 != null && price && Math.abs(pp - ema20) / Math.abs(price) <= 0.005) {
    confluences.push({ level: "PP", price: Number(pp.toFixed(6)), confluent_with: "EMA20", significance: "medium" });
  }
  if (pp != null && ema50 != null && price && Math.abs(pp - ema50) / Math.abs(price) <= 0.005) {
    confluences.push({ level: "PP", price: Number(pp.toFixed(6)), confluent_with: "EMA50", significance: "medium" });
  }

  let confidence = 55;
  if (primaryTrend !== "sideways") confidence += 10;
  if (momentum !== "neutral") confidence += 10;
  if (nearestResistance) confidence += 5;
  if (nearestSupport) confidence += 5;
  confidence = clamp(confidence, 20, 95);

  const anomalies = [];
  if (rsi != null && rsi >= 70) anomalies.push({ type: "trend_exhaustion", description: "RSI is overbought.", severity: "medium" });
  if (rsi != null && rsi <= 30) anomalies.push({ type: "trend_exhaustion", description: "RSI is oversold.", severity: "medium" });
  if (!anomalies.length) anomalies.push({ type: "none", description: "No deterministic anomaly triggered.", severity: "low" });

  const legacy = {
    summary: {
      primary_trend: primaryTrend,
      momentum,
      phase: primaryTrend === "bullish" ? "markup" : primaryTrend === "bearish" ? "markdown" : "consolidation",
      confidence,
      bias,
      reasoning: `Analysis based on price ${price}, EMA alignment ${alignment.alignment}, RSI state ${deriveRsiState(rsi)}, and MACD line/signal relationship.`,
    },
    indicators: {
      rsi: {
        value: rsi,
        state: deriveRsiState(rsi),
        divergence: "none",
        signal: "RSI interpreted with standard 70/30 thresholds.",
      },
      macd: {
        macd_line: macdLine,
        signal_line: signalLine,
        histogram,
        state: macdLine != null && signalLine != null && macdLine > signalLine ? "bullish_momentum" : "bearish_momentum",
        signal: "MACD interpreted from line-vs-signal relationship.",
      },
      ema: {
        ema20,
        ema50,
        alignment: alignment.alignment,
        price_vs_ema20: alignment.priceVsEma20,
        price_vs_ema50: alignment.priceVsEma50,
        signal: alignment.signal,
      },
    },
    pivot_analysis: {
      pp,
      current_zone: String(pivotAnalysisRaw.zone ?? "unknown").toLowerCase(),
      session_bias: asEnum(pivotAnalysisRaw.bias, new Set(["bullish", "bearish", "neutral"]), "neutral"),
      nearest_pivot_resistance: nearestResistance,
      nearest_pivot_support: nearestSupport,
      distance_to_pivot_resistance_pct: safeFloat(pivotAnalysisRaw.distToResistance),
      distance_to_pivot_support_pct: safeFloat(pivotAnalysisRaw.distToSupport),
      at_inflection_point: Boolean(pivotAnalysisRaw.atInflectionPoint),
      inflection_level: pivotAnalysisRaw.inflectionLevel ? JSON.stringify(pivotAnalysisRaw.inflectionLevel) : null,
      pivot_target_bull: nearestResistance,
      pivot_target_bear: nearestSupport,
      confluences,
      pivot_signal: "Use pivot levels as context, not standalone triggers.",
    },
    structure: {
      nearest_support: localSupport,
      nearest_resistance: localResistance,
      key_support_levels: Array.isArray(data.swingLows) ? data.swingLows.map((v) => safeFloat(v)).filter((v) => v != null).slice(-5) : [],
      key_resistance_levels: Array.isArray(data.swingHighs) ? data.swingHighs.map((v) => safeFloat(v)).filter((v) => v != null).slice(-5) : [],
      range_bound: primaryTrend === "sideways",
      breakout_watch: primaryTrend === "bullish" && nearestResistance ? "bullish" : primaryTrend === "bearish" && nearestSupport ? "bearish" : "none",
    },
    order_flow: {
      obi: safeFloat(data.obi, 0),
      tfi: safeFloat(data.tfi, 0),
      dominant_side: "neutral",
      interpretation: "Order-flow metrics not provided by source payload.",
    },
    trade_logic: {
      bullish_scenario: "Bull case strengthens on hold above EMA20 and reclaim of nearest resistance.",
      bearish_scenario: "Bear case strengthens on rejection below EMA20 and loss of nearest support.",
      invalidation_bull: localSupport,
      invalidation_bear: localResistance,
      suggested_bias: bias === "long" ? "long" : bias === "short" ? "short" : "wait",
      risk_note: "Use strict risk limits; this analysis is informational only.",
    },
    anomalies,
    market_regime: {
      volatility: "medium",
      trend_strength: primaryTrend === "sideways" ? 35 : 70,
      is_trending: primaryTrend !== "sideways",
      regime: primaryTrend === "sideways" ? "ranging" : "trending",
    },
    _meta: {
      model: MODEL,
      source,
      timestamp: new Date().toISOString(),
      validated: true,
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

function buildSystemPrompt(): string {
  return `You are an elite quantitative trading analyst.

Return one valid JSON object only. No markdown.
Required top-level keys:
market_structure, trend_momentum, trade_logic_risk, anomaly_detection.

Also include the compatibility keys:
summary, indicators, pivot_analysis, structure, order_flow, trade_logic, anomalies, market_regime.

Keep values data-grounded. Do not invent unavailable inputs.
Use neutral values when uncertain.
Rules: price above PP is bullish session bias; below PP is bearish. RSI >= 70 is overbought, RSI <= 30 is oversold. MACD is bullish when MACD line > signal line. EMA alignment is bullish if price > ema20 > ema50, bearish if price < ema20 < ema50, otherwise mixed.`;
}

function buildUserMessage(data: Record<string, unknown>): string {
  const pivots = (data.pivots && typeof data.pivots === "object") ? data.pivots as Record<string, unknown> : {};
  return `Analyze this market payload and return strict JSON only.

MARKET:
- symbol: ${data.symbol}
- timeframe: ${data.timeframe}
- price: ${data.price}
- change_pct: ${data.change}
- volume: ${data.volume}

INDICATORS:
- rsi14: ${data.rsi}
- ema20: ${data.ema20}
- ema50: ${data.ema50}
- macd: ${JSON.stringify(data.macd ?? {})}

STRUCTURE:
- swing_highs: ${JSON.stringify(data.swingHighs ?? [])}
- swing_lows: ${JSON.stringify(data.swingLows ?? [])}
- nearest_support: ${data.support}
- nearest_resistance: ${data.resistance}
- recent_closes: ${JSON.stringify(data.recentCloses ?? [])}
- recent_volumes: ${JSON.stringify(data.recentVolumes ?? [])}

PIVOTS:
${JSON.stringify(pivots)}`;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// Strictly validates every field of the model's output against known enums/types instead of
// trusting a shallow merge — a malformed or adversarial model response can only ever override a
// field with a value that passes validation; anything else falls back to the deterministic base.
function normalizeModelOutput(parsed: Record<string, unknown>, marketData: Record<string, unknown>) {
  const base = deterministicFallback(marketData, "normalized");
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

  const baseSummary = base.summary as Record<string, unknown>;
  const baseIndicators = base.indicators as { rsi: Record<string, unknown>; macd: Record<string, unknown>; ema: Record<string, unknown> };
  const basePivotAnalysis = base.pivot_analysis as Record<string, unknown>;
  const baseStructure = base.structure as Record<string, unknown>;
  const baseOrderFlow = base.order_flow as Record<string, unknown>;
  const baseTradeLogic = base.trade_logic as Record<string, unknown>;
  const baseMarketRegime = base.market_regime as Record<string, unknown>;

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
    _meta: {
      model: MODEL,
      source: "openrouter",
      timestamp: new Date().toISOString(),
      validated: true,
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
  let marketDataForFallback: Record<string, unknown> = {};
  let symbolForLog: string | null = null;
  let timeframeForLog: string | null = null;

  try {
    const withinLimit = await checkRateLimit(supabase, userId);
    if (!withinLimit) {
      await logAiAnalysis(supabase, {
        userId,
        symbol: null,
        timeframe: null,
        model: MODEL,
        status: "rate_limited",
        latencyMs: Date.now() - started,
      });
      return jsonResponse(req, { success: false, error: "Too many AI analysis requests. Please wait a few minutes and try again." }, 429);
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) return jsonResponse(req, { success: false, error: "OPENROUTER_API_KEY is not configured." }, 500);

    const marketData = await req.json().catch(() => null);
    if (!marketData || typeof marketData !== "object" || safeFloat((marketData as Record<string, unknown>).price) == null) {
      return jsonResponse(req, { success: false, error: "Invalid market data: price is required." }, 400);
    }
    marketDataForFallback = marketData as Record<string, unknown>;
    symbolForLog = String((marketData as Record<string, unknown>).symbol ?? "") || null;
    timeframeForLog = String((marketData as Record<string, unknown>).timeframe ?? "") || null;

    const response = await fetchWithTimeout(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("OPENROUTER_HTTP_REFERER") ?? "https://supabase.com",
        "X-Title": "Chart Bot",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserMessage(marketData as Record<string, unknown>) },
        ],
        temperature: 0,
        max_tokens: 2200,
      }),
    }, { timeoutMs: 20000, retries: 1 });

    if (response.status === 429) {
      await logAiAnalysis(supabase, { userId, symbol: symbolForLog, timeframe: timeframeForLog, model: MODEL, status: "error", latencyMs: Date.now() - started, errorMessage: "OpenRouter rate limit" });
      return jsonResponse(req, { success: false, error: "OpenRouter rate limit hit. Wait and retry." }, 429);
    }
    if (response.status === 401) {
      await logAiAnalysis(supabase, { userId, symbol: symbolForLog, timeframe: timeframeForLog, model: MODEL, status: "error", latencyMs: Date.now() - started, errorMessage: "Invalid OpenRouter API key" });
      return jsonResponse(req, { success: false, error: "Invalid OpenRouter API key." }, 500);
    }
    if (!response.ok) {
      const text = await response.text();
      await logAiAnalysis(supabase, { userId, symbol: symbolForLog, timeframe: timeframeForLog, model: MODEL, status: "error", latencyMs: Date.now() - started, errorMessage: `OpenRouter error: ${response.status}` });
      return jsonResponse(req, { success: false, error: `OpenRouter error: ${response.status}`, details: text }, 502);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content);
    const analysis = normalizeModelOutput(parsed, marketData as Record<string, unknown>);
    const latencyMs = Date.now() - started;
    analysis._meta = { ...analysis._meta, latency_ms: latencyMs };

    await logAiAnalysis(supabase, { userId, symbol: symbolForLog, timeframe: timeframeForLog, model: MODEL, status: "success", latencyMs });

    return jsonResponse(req, { success: true, analysis });
  } catch (error) {
    const latencyMs = Date.now() - started;
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logAiAnalysis(supabase, { userId, symbol: symbolForLog, timeframe: timeframeForLog, model: MODEL, status: "fallback", latencyMs, errorMessage });
    return jsonResponse(req, {
      success: true,
      analysis: deterministicFallback(marketDataForFallback, `fallback: ${errorMessage}`),
    });
  }
});
