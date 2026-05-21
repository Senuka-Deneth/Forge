import os
import requests
import json
import re
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()


def _resolve_openrouter_url(raw_url: str) -> str:
    base = (raw_url or "").strip().rstrip("/")
    if not base:
        base = "https://openrouter.ai/api/v1"

    # Support both styles:
    # - https://openrouter.ai/api/v1
    # - https://openrouter.ai/api/v1/chat/completions
    if base.endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"


OPENROUTER_URL = _resolve_openrouter_url(os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"))
API_KEY = os.getenv("OPENROUTER_API_KEY", "")
MODEL = os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")
BACKEND_PORT = os.getenv("BACKEND_PORT", "5050")

BASE_HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": f"http://localhost:{BACKEND_PORT}",   # required by OpenRouter
    "X-Title": "Forge"              # shows in OpenRouter dashboard
}


def extract_json(raw_text):
    if not raw_text:
        raise ValueError("Empty response from model")

    # Try direct parse first
    try:
        return json.loads(raw_text.strip())
    except json.JSONDecodeError:
        pass

    # Try extracting JSON block from markdown
    json_block = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_text)
    if json_block:
        try:
            return json.loads(json_block.group(1))
        except json.JSONDecodeError:
            pass

    # Try extracting raw JSON object using brace counting
    best = None
    cleaned = raw_text.strip()
    for start in [m.start() for m in re.finditer(r"\{", cleaned)]:
        depth = 0
        for i, ch in enumerate(cleaned[start:], start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = cleaned[start:i + 1]
                    try:
                        parsed = json.loads(candidate)
                        if best is None or len(candidate) > len(json.dumps(best)):
                            best = parsed
                    except json.JSONDecodeError:
                        pass
                    break

    if best is not None:
        return best

    raise ValueError("Model did not return parseable JSON. Raw: " + raw_text[:300])


def _safe_float(value, default=None):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value, default=0):
    try:
        if value is None:
            return default
        return int(round(float(value)))
    except (TypeError, ValueError):
        return default


def _clamp(value, low, high):
    return max(low, min(high, value))


def _as_enum(value, allowed, default):
    s = str(value).strip().lower() if value is not None else ""
    return s if s in allowed else default


def _normalize_label_value(item):
    if not isinstance(item, dict):
        return None
    label = str(item.get("label", "")).strip() or "N/A"
    value = _safe_float(item.get("value"), None)
    if value is None:
        return None
    return {"label": label, "value": round(value, 6)}


def _derive_rsi_state(rsi):
    if rsi is None:
        return "neutral"
    if rsi >= 70:
        return "overbought"
    if rsi <= 30:
        return "oversold"
    if rsi >= 55:
        return "bullish_zone"
    if rsi <= 45:
        return "bearish_zone"
    return "neutral"


def _derive_alignment(price, ema20, ema50):
    if price is None or ema20 is None or ema50 is None:
        return "mixed", "at", "at", "EMA data unavailable."

    tol20 = abs(price) * 0.0001 if price else 0.0
    tol50 = abs(price) * 0.0001 if price else 0.0

    p20 = "at" if abs(price - ema20) <= tol20 else ("above" if price > ema20 else "below")
    p50 = "at" if abs(price - ema50) <= tol50 else ("above" if price > ema50 else "below")

    if price > ema20 > ema50:
        return "bullish", p20, p50, "Price and short EMA are stacked above EMA50 (bullish alignment)."
    if price < ema20 < ema50:
        return "bearish", p20, p50, "Price and short EMA are stacked below EMA50 (bearish alignment)."
    return "mixed", p20, p50, "EMA structure is mixed; no clean directional stack."


def _build_deterministic_fallback(data, reason="fallback"):
    price = _safe_float(data.get("price"), 0.0)
    rsi = _safe_float(data.get("rsi"), None)
    ema20 = _safe_float(data.get("ema20"), None)
    ema50 = _safe_float(data.get("ema50"), None)

    macd_obj = data.get("macd") or {}
    macd_line = _safe_float(macd_obj.get("macd"), None)
    signal_line = _safe_float(macd_obj.get("signal"), None)
    histogram = _safe_float(macd_obj.get("histogram"), None)

    pivots = (data.get("pivots") or {}).get("classic") or {}
    pivot_analysis_raw = (data.get("pivots") or {}).get("analysis") or {}

    pp = _safe_float(pivots.get("PP"), None)

    alignment, p_vs_20, p_vs_50, ema_signal = _derive_alignment(price, ema20, ema50)

    if alignment == "bullish":
        primary_trend = "bullish"
    elif alignment == "bearish":
        primary_trend = "bearish"
    else:
        primary_trend = "sideways"

    if macd_line is not None and signal_line is not None:
        if macd_line > signal_line and (rsi is None or rsi >= 50):
            momentum = "bullish"
        elif macd_line < signal_line and (rsi is None or rsi <= 50):
            momentum = "bearish"
        else:
            momentum = "neutral"
    else:
        momentum = "neutral"

    if momentum == "bullish" and rsi is not None and rsi >= 70:
        momentum = "strong_bullish"
    if momentum == "bearish" and rsi is not None and rsi <= 30:
        momentum = "strong_bearish"

    bias = "neutral"
    if primary_trend == "bullish" and momentum in {"bullish", "strong_bullish"}:
        bias = "long"
    elif primary_trend == "bearish" and momentum in {"bearish", "strong_bearish"}:
        bias = "short"

    nearest_res = _normalize_label_value(pivot_analysis_raw.get("nearestPivotResistance") or pivot_analysis_raw.get("nearestResistance"))
    nearest_sup = _normalize_label_value(pivot_analysis_raw.get("nearestPivotSupport") or pivot_analysis_raw.get("nearestSupport"))

    inflection_obj = pivot_analysis_raw.get("inflectionLevel")
    inflection_text = None
    if isinstance(inflection_obj, dict):
        il = _normalize_label_value(inflection_obj)
        if il:
            inflection_text = f"{il['label']} @ {il['value']}"
    elif inflection_obj:
        inflection_text = str(inflection_obj)

    distance_res = _safe_float(pivot_analysis_raw.get("distToResistance"), None)
    distance_sup = _safe_float(pivot_analysis_raw.get("distToSupport"), None)

    swing_highs = [
        _safe_float(x, None) for x in (data.get("swingHighs") or [])
    ]
    swing_lows = [
        _safe_float(x, None) for x in (data.get("swingLows") or [])
    ]
    swing_highs = [x for x in swing_highs if x is not None][-3:]
    swing_lows = [x for x in swing_lows if x is not None][-3:]

    nearest_support = _safe_float(data.get("support"), None)
    nearest_resistance = _safe_float(data.get("resistance"), None)

    if nearest_res is None and nearest_resistance is not None:
        nearest_res = {"label": "local_res", "value": round(nearest_resistance, 6)}
    if nearest_sup is None and nearest_support is not None:
        nearest_sup = {"label": "local_sup", "value": round(nearest_support, 6)}

    confluences = []
    if pp is not None and ema20 is not None and price:
        if abs(pp - ema20) / abs(price) <= 0.005:
            confluences.append({
                "level": "PP",
                "price": round(pp, 6),
                "confluent_with": "EMA20",
                "significance": "medium",
            })
    if pp is not None and ema50 is not None and price:
        if abs(pp - ema50) / abs(price) <= 0.005:
            confluences.append({
                "level": "PP",
                "price": round(pp, 6),
                "confluent_with": "EMA50",
                "significance": "medium",
            })

    confidence = 55
    if primary_trend in {"bullish", "bearish"}:
        confidence += 10
    if momentum in {"bullish", "bearish", "strong_bullish", "strong_bearish"}:
        confidence += 10
    if nearest_res is not None:
        confidence += 5
    if nearest_sup is not None:
        confidence += 5
    confidence = _clamp(confidence, 20, 95)

    if primary_trend == "bullish":
        phase = "markup"
    elif primary_trend == "bearish":
        phase = "markdown"
    else:
        phase = "consolidation"

    breakout_watch = "none"
    if primary_trend == "bullish" and nearest_res is not None:
        breakout_watch = "bullish"
    elif primary_trend == "bearish" and nearest_sup is not None:
        breakout_watch = "bearish"

    anomalies = []
    if rsi is not None and rsi >= 70:
        anomalies.append({"type": "trend_exhaustion", "description": "RSI is overbought.", "severity": "medium"})
    elif rsi is not None and rsi <= 30:
        anomalies.append({"type": "trend_exhaustion", "description": "RSI is oversold.", "severity": "medium"})

    if not anomalies:
        anomalies = [{"type": "none", "description": "No deterministic anomaly triggered.", "severity": "low"}]

    regime = "ranging" if primary_trend == "sideways" else "trending"

    return {
        "summary": {
            "primary_trend": primary_trend,
            "momentum": momentum,
            "phase": phase,
            "confidence": confidence,
            "bias": bias,
            "reasoning": f"Fallback analysis: price {price} with EMA alignment {alignment} and RSI state {_derive_rsi_state(rsi)}.",
        },
        "indicators": {
            "rsi": {
                "value": rsi,
                "state": _derive_rsi_state(rsi),
                "divergence": "none",
                "signal": "RSI interpreted with standard 70/30 thresholds.",
            },
            "macd": {
                "macd_line": macd_line,
                "signal_line": signal_line,
                "histogram": histogram,
                "state": "bullish_momentum" if macd_line is not None and signal_line is not None and macd_line > signal_line else "bearish_momentum" if macd_line is not None and signal_line is not None and macd_line < signal_line else "bullish_momentum",
                "signal": "MACD interpreted from line-vs-signal relationship.",
            },
            "ema": {
                "ema20": ema20,
                "ema50": ema50,
                "alignment": alignment,
                "price_vs_ema20": p_vs_20,
                "price_vs_ema50": p_vs_50,
                "signal": ema_signal,
            },
        },
        "pivot_analysis": {
            "pp": pp,
            "current_zone": str(pivot_analysis_raw.get("zone", "unknown")).lower(),
            "session_bias": _as_enum(pivot_analysis_raw.get("bias"), {"bullish", "bearish", "neutral"}, "neutral"),
            "nearest_pivot_resistance": nearest_res,
            "nearest_pivot_support": nearest_sup,
            "distance_to_pivot_resistance_pct": distance_res,
            "distance_to_pivot_support_pct": distance_sup,
            "at_inflection_point": bool(pivot_analysis_raw.get("atInflectionPoint", False)),
            "inflection_level": inflection_text,
            "pivot_target_bull": nearest_res,
            "pivot_target_bear": nearest_sup,
            "confluences": confluences,
            "pivot_signal": "Use pivot levels as context, not standalone triggers.",
        },
        "structure": {
            "nearest_support": nearest_support,
            "nearest_resistance": nearest_resistance,
            "key_support_levels": swing_lows,
            "key_resistance_levels": swing_highs,
            "swing_highs": swing_highs[-2:],
            "swing_lows": swing_lows[-2:],
            "range_bound": primary_trend == "sideways",
            "breakout_watch": breakout_watch,
        },
        "order_flow": {
            "obi": _safe_float(data.get("obi"), 0.0),
            "tfi": _safe_float(data.get("tfi"), 0.0),
            "dominant_side": "neutral",
            "interpretation": "Order-flow metrics not provided by source payload.",
        },
        "trade_logic": {
            "bullish_scenario": "Bull case strengthens on hold above EMA20 and reclaim of nearest resistance.",
            "bearish_scenario": "Bear case strengthens on rejection below EMA20 and loss of nearest support.",
            "invalidation_bull": nearest_support,
            "invalidation_bear": nearest_resistance,
            "suggested_bias": "long" if bias == "long" else "short" if bias == "short" else "wait",
            "risk_note": "Use strict risk limits; this analysis is informational only.",
        },
        "anomalies": anomalies,
        "market_regime": {
            "volatility": "medium",
            "trend_strength": 70 if regime == "trending" else 35,
            "is_trending": regime == "trending",
            "regime": regime,
        },
        "_meta": {
            "model": MODEL,
            "source": reason,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "validated": True,
        },
    }


def _normalize_and_validate_analysis(parsed, market_data):
    base = _build_deterministic_fallback(market_data, reason="normalized")

    if not isinstance(parsed, dict):
        base["_meta"]["normalization_note"] = "Model output was not an object; fallback used."
        return base

    out = base

    summary = parsed.get("summary") if isinstance(parsed.get("summary"), dict) else {}
    out["summary"] = {
        "primary_trend": _as_enum(summary.get("primary_trend"), {"bullish", "bearish", "sideways"}, out["summary"]["primary_trend"]),
        "momentum": _as_enum(summary.get("momentum"), {"strong_bullish", "bullish", "neutral", "bearish", "strong_bearish"}, out["summary"]["momentum"]),
        "phase": _as_enum(summary.get("phase"), {"accumulation", "markup", "distribution", "markdown", "consolidation"}, out["summary"]["phase"]),
        "confidence": _clamp(_safe_int(summary.get("confidence"), out["summary"]["confidence"]), 0, 100),
        "bias": _as_enum(summary.get("bias"), {"long", "short", "neutral"}, out["summary"]["bias"]),
        "reasoning": str(summary.get("reasoning") or out["summary"]["reasoning"]),
    }

    indicators = parsed.get("indicators") if isinstance(parsed.get("indicators"), dict) else {}
    rsi_obj = indicators.get("rsi") if isinstance(indicators.get("rsi"), dict) else {}
    macd_obj = indicators.get("macd") if isinstance(indicators.get("macd"), dict) else {}
    ema_obj = indicators.get("ema") if isinstance(indicators.get("ema"), dict) else {}

    out["indicators"] = {
        "rsi": {
            "value": _safe_float(rsi_obj.get("value"), out["indicators"]["rsi"]["value"]),
            "state": _as_enum(rsi_obj.get("state"), {"overbought", "bullish_zone", "neutral", "bearish_zone", "oversold"}, out["indicators"]["rsi"]["state"]),
            "divergence": _as_enum(rsi_obj.get("divergence"), {"bullish", "bearish", "none"}, out["indicators"]["rsi"]["divergence"]),
            "signal": str(rsi_obj.get("signal") or out["indicators"]["rsi"]["signal"]),
        },
        "macd": {
            "macd_line": _safe_float(macd_obj.get("macd_line"), out["indicators"]["macd"]["macd_line"]),
            "signal_line": _safe_float(macd_obj.get("signal_line"), out["indicators"]["macd"]["signal_line"]),
            "histogram": _safe_float(macd_obj.get("histogram"), out["indicators"]["macd"]["histogram"]),
            "state": _as_enum(macd_obj.get("state"), {"bullish_crossover", "bearish_crossover", "bullish_momentum", "bearish_momentum"}, out["indicators"]["macd"]["state"]),
            "signal": str(macd_obj.get("signal") or out["indicators"]["macd"]["signal"]),
        },
        "ema": {
            "ema20": _safe_float(ema_obj.get("ema20"), out["indicators"]["ema"]["ema20"]),
            "ema50": _safe_float(ema_obj.get("ema50"), out["indicators"]["ema"]["ema50"]),
            "alignment": _as_enum(ema_obj.get("alignment"), {"bullish", "bearish", "mixed"}, out["indicators"]["ema"]["alignment"]),
            "price_vs_ema20": _as_enum(ema_obj.get("price_vs_ema20"), {"above", "below", "at"}, out["indicators"]["ema"]["price_vs_ema20"]),
            "price_vs_ema50": _as_enum(ema_obj.get("price_vs_ema50"), {"above", "below", "at"}, out["indicators"]["ema"]["price_vs_ema50"]),
            "signal": str(ema_obj.get("signal") or out["indicators"]["ema"]["signal"]),
        },
    }

    pa = parsed.get("pivot_analysis") if isinstance(parsed.get("pivot_analysis"), dict) else {}
    nearest_res = _normalize_label_value(pa.get("nearest_pivot_resistance")) or _normalize_label_value(pa.get("nearestResistance")) or out["pivot_analysis"]["nearest_pivot_resistance"]
    nearest_sup = _normalize_label_value(pa.get("nearest_pivot_support")) or _normalize_label_value(pa.get("nearestSupport")) or out["pivot_analysis"]["nearest_pivot_support"]

    inflection_level = pa.get("inflection_level")
    if isinstance(inflection_level, dict):
        il = _normalize_label_value(inflection_level)
        inflection_level = f"{il['label']} @ {il['value']}" if il else None
    elif inflection_level is not None:
        inflection_level = str(inflection_level)

    confluences = []
    raw_conf = pa.get("confluences") if isinstance(pa.get("confluences"), list) else []
    for c in raw_conf:
        if not isinstance(c, dict):
            continue
        confluences.append({
            "level": str(c.get("level") or "N/A"),
            "price": _safe_float(c.get("price"), None),
            "confluent_with": str(c.get("confluent_with") or "unknown"),
            "significance": _as_enum(c.get("significance"), {"high", "medium", "low"}, "low"),
        })
    confluences = [x for x in confluences if x["price"] is not None]

    out["pivot_analysis"] = {
        "pp": _safe_float(pa.get("pp"), out["pivot_analysis"]["pp"]),
        "current_zone": str(pa.get("current_zone") or out["pivot_analysis"]["current_zone"]),
        "session_bias": _as_enum(pa.get("session_bias"), {"bullish", "bearish", "neutral"}, out["pivot_analysis"]["session_bias"]),
        "nearest_pivot_resistance": nearest_res,
        "nearest_pivot_support": nearest_sup,
        "distance_to_pivot_resistance_pct": _safe_float(pa.get("distance_to_pivot_resistance_pct"), out["pivot_analysis"]["distance_to_pivot_resistance_pct"]),
        "distance_to_pivot_support_pct": _safe_float(pa.get("distance_to_pivot_support_pct"), out["pivot_analysis"]["distance_to_pivot_support_pct"]),
        "at_inflection_point": bool(pa.get("at_inflection_point", out["pivot_analysis"]["at_inflection_point"])),
        "inflection_level": inflection_level if inflection_level is not None else out["pivot_analysis"]["inflection_level"],
        "pivot_target_bull": _normalize_label_value(pa.get("pivot_target_bull")) or nearest_res,
        "pivot_target_bear": _normalize_label_value(pa.get("pivot_target_bear")) or nearest_sup,
        "confluences": confluences if confluences else out["pivot_analysis"]["confluences"],
        "pivot_signal": str(pa.get("pivot_signal") or out["pivot_analysis"]["pivot_signal"]),
    }

    structure = parsed.get("structure") if isinstance(parsed.get("structure"), dict) else {}
    out["structure"] = {
        "nearest_support": _safe_float(structure.get("nearest_support"), out["structure"]["nearest_support"]),
        "nearest_resistance": _safe_float(structure.get("nearest_resistance"), out["structure"]["nearest_resistance"]),
        "key_support_levels": [x for x in [_safe_float(v, None) for v in (structure.get("key_support_levels") or out["structure"]["key_support_levels"])] if x is not None][:5],
        "key_resistance_levels": [x for x in [_safe_float(v, None) for v in (structure.get("key_resistance_levels") or out["structure"]["key_resistance_levels"])] if x is not None][:5],
        "swing_highs": [x for x in [_safe_float(v, None) for v in (structure.get("swing_highs") or out["structure"]["swing_highs"])] if x is not None][:5],
        "swing_lows": [x for x in [_safe_float(v, None) for v in (structure.get("swing_lows") or out["structure"]["swing_lows"])] if x is not None][:5],
        "range_bound": bool(structure.get("range_bound", out["structure"]["range_bound"])),
        "breakout_watch": _as_enum(structure.get("breakout_watch"), {"bullish", "bearish", "none"}, out["structure"]["breakout_watch"]),
    }

    order_flow = parsed.get("order_flow") if isinstance(parsed.get("order_flow"), dict) else {}
    out["order_flow"] = {
        "obi": _safe_float(order_flow.get("obi"), out["order_flow"]["obi"]),
        "tfi": _safe_float(order_flow.get("tfi"), out["order_flow"]["tfi"]),
        "dominant_side": _as_enum(order_flow.get("dominant_side"), {"buyers", "sellers", "neutral"}, out["order_flow"]["dominant_side"]),
        "interpretation": str(order_flow.get("interpretation") or out["order_flow"]["interpretation"]),
    }

    tl = parsed.get("trade_logic") if isinstance(parsed.get("trade_logic"), dict) else {}
    out["trade_logic"] = {
        "bullish_scenario": str(tl.get("bullish_scenario") or out["trade_logic"]["bullish_scenario"]),
        "bearish_scenario": str(tl.get("bearish_scenario") or out["trade_logic"]["bearish_scenario"]),
        "invalidation_bull": _safe_float(tl.get("invalidation_bull"), out["trade_logic"]["invalidation_bull"]),
        "invalidation_bear": _safe_float(tl.get("invalidation_bear"), out["trade_logic"]["invalidation_bear"]),
        "suggested_bias": _as_enum(tl.get("suggested_bias"), {"long", "short", "wait"}, out["trade_logic"]["suggested_bias"]),
        "risk_note": str(tl.get("risk_note") or out["trade_logic"]["risk_note"]),
    }

    anomalies = parsed.get("anomalies") if isinstance(parsed.get("anomalies"), list) else []
    norm_anomalies = []
    for a in anomalies:
        if not isinstance(a, dict):
            continue
        norm_anomalies.append({
            "type": _as_enum(a.get("type"), {"divergence", "liquidity_trap", "trend_exhaustion", "pivot_confluence", "volume_spike", "none"}, "none"),
            "description": str(a.get("description") or ""),
            "severity": _as_enum(a.get("severity"), {"low", "medium", "high"}, "low"),
        })
    out["anomalies"] = norm_anomalies if norm_anomalies else out["anomalies"]

    mr = parsed.get("market_regime") if isinstance(parsed.get("market_regime"), dict) else {}
    out["market_regime"] = {
        "volatility": _as_enum(mr.get("volatility"), {"low", "medium", "high"}, out["market_regime"]["volatility"]),
        "trend_strength": _clamp(_safe_int(mr.get("trend_strength"), out["market_regime"]["trend_strength"]), 0, 100),
        "is_trending": bool(mr.get("is_trending", out["market_regime"]["is_trending"])),
        "regime": _as_enum(mr.get("regime"), {"trending", "ranging", "breakout", "reversal"}, out["market_regime"]["regime"]),
    }

    out["_meta"] = {
        "model": MODEL,
        "source": "openrouter",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "validated": True,
        "normalization": "strict",
    }

    return out


def build_system_prompt():
    return """You are an elite quantitative trading analyst.

You MUST return one valid JSON object only (no markdown, no prose before/after).
Keep output concise and data-grounded.
Do not invent unavailable values.
If a field is uncertain, use neutral values and short notes.

Required output schema keys:
summary, indicators, pivot_analysis, structure, order_flow, trade_logic, anomalies, market_regime.

Core rules:
- Price above PP => bullish session bias; below PP => bearish.
- RSI >= 70 overbought, RSI <= 30 oversold.
- MACD bullish when MACD line > signal line.
- EMA alignment bullish if price > ema20 > ema50; bearish if price < ema20 < ema50; else mixed.
"""


def build_user_message(data):
    pivots_data = data.get("pivots") or {}
    classic = pivots_data.get("classic") or {}
    fib = pivots_data.get("fibonacci") or {}
    traditional = pivots_data.get("traditional") or pivots_data.get("binance") or {}
    analysis = pivots_data.get("analysis") or {}

    return f"""Analyze this market payload and return strict JSON only.

MARKET:
- symbol: {data.get('symbol')}
- timeframe: {data.get('timeframe')}
- price: {data.get('price')}
- change_pct: {data.get('change')}
- volume: {data.get('volume')}

INDICATORS:
- rsi14: {data.get('rsi')}
- ema20: {data.get('ema20')}
- ema50: {data.get('ema50')}
- macd_line: {(data.get('macd') or {}).get('macd')}
- macd_signal: {(data.get('macd') or {}).get('signal')}
- macd_histogram: {(data.get('macd') or {}).get('histogram')}

STRUCTURE:
- swing_highs: {json.dumps(data.get('swingHighs', []))}
- swing_lows: {json.dumps(data.get('swingLows', []))}
- nearest_support: {data.get('support')}
- nearest_resistance: {data.get('resistance')}
- recent_closes: {json.dumps(data.get('recentCloses', []))}
- recent_volumes: {json.dumps(data.get('recentVolumes', []))}

PIVOTS_CLASSIC:
- PP: {classic.get('PP')}
- R1: {classic.get('R1')}  R2: {classic.get('R2')}  R3: {classic.get('R3')}
- S1: {classic.get('S1')}  S2: {classic.get('S2')}  S3: {classic.get('S3')}

PIVOTS_FIB:
- PP: {fib.get('PP')}
- R1: {fib.get('R1')}  R2: {fib.get('R2')}  R3: {fib.get('R3')}
- S1: {fib.get('S1')}  S2: {fib.get('S2')}  S3: {fib.get('S3')}

PIVOTS_TRADITIONAL / BINANCE:
- PP: {traditional.get('PP')}
- R1: {traditional.get('R1')}  R2: {traditional.get('R2')}  R3: {traditional.get('R3')}  R4: {traditional.get('R4')}  R5: {traditional.get('R5')}
- S1: {traditional.get('S1')}  S2: {traditional.get('S2')}  S3: {traditional.get('S3')}  S4: {traditional.get('S4')}  S5: {traditional.get('S5')}

PIVOT_CONTEXT:
- zone: {analysis.get('zone')}
- bias: {analysis.get('bias')}
- nearest_pivot_resistance: {json.dumps(analysis.get('nearestPivotResistance'))}
- nearest_pivot_support: {json.dumps(analysis.get('nearestPivotSupport'))}
- dist_to_res_pct: {analysis.get('distToResistance')}
- dist_to_sup_pct: {analysis.get('distToSupport')}
- at_inflection: {analysis.get('atInflectionPoint')}
- inflection_level: {json.dumps(analysis.get('inflectionLevel'))}
"""


def analyze_market(market_data):
    system_prompt = build_system_prompt()
    user_msg = build_user_message(market_data)

    try:
        response = requests.post(
            OPENROUTER_URL,
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0,
                "max_tokens": 2200,
            },
            headers=BASE_HEADERS,
            timeout=25,
        )
        response.raise_for_status()

        payload = response.json()
        choices = payload.get("choices", [])
        if not choices:
            raise ValueError("No choices returned by model")

        content = choices[0].get("message", {}).get("content") or ""
        parsed = extract_json(content)
        normalized = _normalize_and_validate_analysis(parsed, market_data)
        normalized["_meta"]["latency_mode"] = "fast-single-pass"
        return normalized

    except Exception as exc:
        fallback = _build_deterministic_fallback(market_data, reason="local-fallback")
        fallback["_meta"]["error"] = str(exc)
        fallback["_meta"]["latency_mode"] = "no-retry-fallback"
        return fallback


def check_openrouter_health():
    try:
        response = requests.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=10,
        )
        response.raise_for_status()

        models_data = response.json().get("data", [])
        models = [m.get("id") for m in models_data]
        model_available = MODEL in models

        if model_available:
            print(f"✅ OpenRouter ready — {MODEL} available")
        else:
            print(f"⚠️ Model {MODEL} not found in OpenRouter")
            print("Available free models:", [m for m in models if m and "free" in m.lower()])

    except requests.exceptions.HTTPError as err:
        if err.response.status_code == 401:
            print("❌ OpenRouter API key invalid")
        else:
            print(f"❌ Cannot reach OpenRouter: {err}")
    except Exception as e:
        print(f"❌ Cannot reach OpenRouter: {e}")
