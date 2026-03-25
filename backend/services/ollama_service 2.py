import json
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "gpt-oss:20b"


def analyze_market(market_data: dict) -> dict:
    """Send market data to the local Ollama model and return structured analysis."""

    system_prompt = _build_system_prompt()
    user_prompt = _build_user_prompt(market_data)

    response = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "prompt": user_prompt,
            "system": system_prompt,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.2,
                "top_p": 0.9,
                "num_predict": 1024,
            },
        },
        timeout=120,
    )
    response.raise_for_status()

    raw = response.json().get("response", "")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        import re

        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            parsed = json.loads(match.group(0))
        else:
            raise ValueError("Model did not return valid JSON")

    return parsed


def check_ollama() -> None:
    """Log whether Ollama is running and the target model is available."""
    try:
        res = requests.get("http://localhost:11434/api/tags", timeout=5)
        res.raise_for_status()
        models = [m.get("name", "") for m in res.json().get("models", [])]
        has_model = any("gpt-oss" in m for m in models)
        if has_model:
            print("✅ Ollama ready — gpt-oss:20b found")
        else:
            print(
                "⚠️  Ollama running but gpt-oss:20b not found. "
                "Run: ollama pull gpt-oss:20b"
            )
    except Exception:
        print("❌ Ollama not running. Start it with: ollama serve")


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def _build_system_prompt() -> str:
    return """
You are an expert quantitative trading analyst and market microstructure specialist.

You receive structured market data including price action, technical indicators,
order book metrics, trade flow data, and momentum signals.

Your job is to perform a complete multi-dimensional market analysis and return
a detailed structured JSON object — nothing else.

Rules:
- Never return plain text. Always return a single valid JSON object.
- Never explain your reasoning outside the JSON.
- Be precise. Use numbers where possible.
- Base confidence scores on confluence of signals, not a single indicator.
- Identify the primary trend, short-term momentum, and key decision levels.
- Provide actionable trade logic with clear invalidation levels.
- Flag anomalies such as divergences, liquidity traps, or trend exhaustion.

Return exactly this JSON structure:

{
  "summary": {
    "primary_trend": "bullish | bearish | sideways",
    "momentum": "strong_bullish | bullish | neutral | bearish | strong_bearish",
    "phase": "accumulation | markup | distribution | markdown | consolidation",
    "confidence": 0-100,
    "bias": "long | short | neutral",
    "reasoning": "One clear sentence summarizing the overall picture"
  },
  "indicators": {
    "rsi": {
      "value": number,
      "state": "overbought | bullish_zone | neutral | bearish_zone | oversold",
      "divergence": "bullish | bearish | none",
      "signal": "string"
    },
    "macd": {
      "macd_line": number,
      "signal_line": number,
      "histogram": number,
      "state": "bullish_crossover | bearish_crossover | bullish_momentum | bearish_momentum",
      "signal": "string"
    },
    "ema": {
      "ema20": number,
      "ema50": number,
      "alignment": "bullish | bearish | mixed",
      "price_vs_ema20": "above | below | at",
      "price_vs_ema50": "above | below | at",
      "signal": "string"
    }
  },
  "structure": {
    "nearest_support": number,
    "nearest_resistance": number,
    "key_support_levels": [number, number, number],
    "key_resistance_levels": [number, number, number],
    "swing_highs": [number, number],
    "swing_lows": [number, number],
    "range_bound": true | false,
    "breakout_watch": "bullish | bearish | none"
  },
  "order_flow": {
    "obi": number,
    "tfi": number,
    "dominant_side": "buyers | sellers | neutral",
    "interpretation": "string"
  },
  "trade_logic": {
    "bullish_scenario": "string — what must happen for bulls to win",
    "bearish_scenario": "string — what must happen for bears to win",
    "invalidation_bull": number,
    "invalidation_bear": number,
    "suggested_bias": "long | short | wait",
    "risk_note": "string — one sentence on key risk"
  },
  "anomalies": [
    {
      "type": "divergence | liquidity_trap | trend_exhaustion | volume_spike | none",
      "description": "string",
      "severity": "low | medium | high"
    }
  ],
  "market_regime": {
    "volatility": "low | medium | high",
    "trend_strength": 0-100,
    "is_trending": true | false,
    "regime": "trending | ranging | breakout | reversal"
  }
}
""".strip()


def _build_user_prompt(data: dict) -> str:
    def _json(val):
        return json.dumps(val) if val is not None else "N/A"

    macd = data.get("macd", {})

    return f"""
Analyze the following live market data and return your analysis as a JSON object.

Symbol: {data.get('symbol', 'N/A')}
Timeframe: {data.get('timeframe', 'N/A')}
Current Price: {data.get('price', 'N/A')}
Price Change: {data.get('change', 'N/A')}%

--- TECHNICAL INDICATORS ---
RSI (14): {data.get('rsi', 'N/A')}
EMA 20: {data.get('ema20', 'N/A')}
EMA 50: {data.get('ema50', 'N/A')}
MACD Line: {macd.get('macd', 'N/A')}
Signal Line: {macd.get('signal', 'N/A')}
Histogram: {macd.get('histogram', 'N/A')}
Volume: {data.get('volume', 'N/A')}

--- PRICE STRUCTURE ---
Recent Swing Highs: {_json(data.get('swingHighs'))}
Recent Swing Lows: {_json(data.get('swingLows'))}
Nearest Support: {data.get('support', 'N/A')}
Nearest Resistance: {data.get('resistance', 'N/A')}

--- ORDER FLOW (if available) ---
Order Book Imbalance (OBI): {data.get('obi', 'N/A')}
Trade Flow Imbalance (TFI): {data.get('tfi', 'N/A')}
Funding Rate: {data.get('fundingRate', 'N/A')}
Open Interest Delta: {data.get('oiDelta', 'N/A')}

--- RECENT CANDLE CONTEXT ---
Last 5 closes: {_json(data.get('recentCloses'))}
Last 5 volumes: {_json(data.get('recentVolumes'))}

Return only the JSON object. No extra text.
""".strip()
