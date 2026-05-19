import { handleOptions, jsonResponse } from "../_shared/cors.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-super-49b-v1:free";

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

function normalizeModelOutput(parsed: Record<string, unknown>, marketData: Record<string, unknown>) {
  const base = deterministicFallback(marketData, "normalized");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;

  const summary = parsed.summary && typeof parsed.summary === "object" ? parsed.summary as Record<string, unknown> : {};
  const indicators = parsed.indicators && typeof parsed.indicators === "object" ? parsed.indicators as Record<string, unknown> : {};
  const pivotAnalysis = parsed.pivot_analysis && typeof parsed.pivot_analysis === "object" ? parsed.pivot_analysis as Record<string, unknown> : {};
  const tradeLogic = parsed.trade_logic && typeof parsed.trade_logic === "object" ? parsed.trade_logic as Record<string, unknown> : {};
  const marketRegime = parsed.market_regime && typeof parsed.market_regime === "object" ? parsed.market_regime as Record<string, unknown> : {};

  const out = {
    ...base,
    summary: {
      ...(base.summary as Record<string, unknown>),
      primary_trend: asEnum(summary.primary_trend, new Set(["bullish", "bearish", "sideways"]), base.summary.primary_trend),
      momentum: asEnum(summary.momentum, new Set(["strong_bullish", "bullish", "neutral", "bearish", "strong_bearish"]), base.summary.momentum),
      phase: asEnum(summary.phase, new Set(["accumulation", "markup", "distribution", "markdown", "consolidation"]), base.summary.phase),
      confidence: clamp(safeInt(summary.confidence, base.summary.confidence), 0, 100),
      bias: asEnum(summary.bias, new Set(["long", "short", "neutral"]), base.summary.bias),
      reasoning: String(summary.reasoning ?? base.summary.reasoning),
    },
    indicators: Object.keys(indicators).length ? { ...base.indicators, ...indicators } : base.indicators,
    pivot_analysis: Object.keys(pivotAnalysis).length ? { ...base.pivot_analysis, ...pivotAnalysis } : base.pivot_analysis,
    trade_logic: Object.keys(tradeLogic).length ? { ...base.trade_logic, ...tradeLogic } : base.trade_logic,
    market_regime: Object.keys(marketRegime).length ? { ...base.market_regime, ...marketRegime } : base.market_regime,
    anomalies: Array.isArray(parsed.anomalies) && parsed.anomalies.length ? parsed.anomalies : base.anomalies,
    _meta: {
      model: MODEL,
      source: "openrouter",
      timestamp: new Date().toISOString(),
      validated: true,
    },
  };

  return {
    ...out,
    market_structure: parsed.market_structure ?? out.structure,
    trend_momentum: parsed.trend_momentum ?? {
      summary: out.summary,
      indicators: out.indicators,
      market_regime: out.market_regime,
    },
    trade_logic_risk: parsed.trade_logic_risk ?? out.trade_logic,
    anomaly_detection: parsed.anomaly_detection ?? out.anomalies,
  };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed." }, 405);

  const started = Date.now();
  let marketDataForFallback: Record<string, unknown> = {};
  try {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) return jsonResponse({ success: false, error: "OPENROUTER_API_KEY is not configured." }, 500);

    const marketData = await req.json().catch(() => null);
    if (!marketData || typeof marketData !== "object" || safeFloat((marketData as Record<string, unknown>).price) == null) {
      return jsonResponse({ success: false, error: "Invalid market data: price is required." }, 400);
    }
    marketDataForFallback = marketData as Record<string, unknown>;

    const response = await fetch(OPENROUTER_URL, {
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
    });

    if (response.status === 429) {
      return jsonResponse({ success: false, error: "OpenRouter rate limit hit. Wait and retry." }, 429);
    }
    if (response.status === 401) {
      return jsonResponse({ success: false, error: "Invalid OpenRouter API key." }, 500);
    }
    if (!response.ok) {
      const text = await response.text();
      return jsonResponse({ success: false, error: `OpenRouter error: ${response.status}`, details: text }, 502);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content);
    const analysis = normalizeModelOutput(parsed, marketData as Record<string, unknown>);
    analysis._meta = { ...analysis._meta, latency_ms: Date.now() - started };

    return jsonResponse({ success: true, analysis });
  } catch (error) {
    return jsonResponse({
      success: true,
      analysis: deterministicFallback(marketDataForFallback, error instanceof Error ? `fallback: ${error.message}` : "fallback"),
    });
  }
});
