import requests
import json
import re

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "gpt-oss:20b"


def build_prompt(data):
    swing_highs = data.get("swingHighs", [])
    swing_lows = data.get("swingLows", [])
    recent_closes = data.get("recentCloses", [])
    recent_volumes = data.get("recentVolumes", [])

    return f"""You are an expert quantitative trading analyst. You must respond with ONLY a valid JSON object — no other text, no explanations, no markdown, no code blocks.

Analyze this live market data:

Symbol: {data.get('symbol', 'N/A')}
Timeframe: {data.get('timeframe', 'N/A')}
Current Price: {data.get('price', 'N/A')}
Price Change: {data.get('change', 'N/A')}%

TECHNICAL INDICATORS:
RSI (14): {data.get('rsi', 'N/A')}
EMA 20: {data.get('ema20', 'N/A')}
EMA 50: {data.get('ema50', 'N/A')}
MACD Line: {data.get('macd', {}).get('macd', 'N/A')}
Signal Line: {data.get('macd', {}).get('signal', 'N/A')}
Histogram: {data.get('macd', {}).get('histogram', 'N/A')}
Volume: {data.get('volume', 'N/A')}

PRICE STRUCTURE:
Recent Swing Highs: {json.dumps(swing_highs)}
Recent Swing Lows: {json.dumps(swing_lows)}
Nearest Support: {data.get('support', 'N/A')}
Nearest Resistance: {data.get('resistance', 'N/A')}
Last 5 closes: {json.dumps(recent_closes)}
Last 5 volumes: {json.dumps(recent_volumes)}

Respond with ONLY this JSON structure, filled with your analysis. No other text:

{{"summary":{{"primary_trend":"bullish","momentum":"bullish","phase":"markup","confidence":70,"bias":"long","reasoning":"Brief one-sentence summary here."}},"indicators":{{"rsi":{{"value":55.0,"state":"bullish_zone","divergence":"none","signal":"RSI signal description"}},"macd":{{"macd_line":0.0,"signal_line":0.0,"histogram":0.0,"state":"bullish_momentum","signal":"MACD signal description"}},"ema":{{"ema20":0.0,"ema50":0.0,"alignment":"bullish","price_vs_ema20":"above","price_vs_ema50":"above","signal":"EMA signal description"}}}},"structure":{{"nearest_support":0.0,"nearest_resistance":0.0,"key_support_levels":[0.0,0.0,0.0],"key_resistance_levels":[0.0,0.0,0.0],"swing_highs":[0.0,0.0],"swing_lows":[0.0,0.0],"range_bound":false,"breakout_watch":"none"}},"order_flow":{{"obi":0.0,"tfi":0.0,"dominant_side":"buyers","interpretation":"Order flow description"}},"trade_logic":{{"bullish_scenario":"What must happen for bulls","bearish_scenario":"What must happen for bears","invalidation_bull":0.0,"invalidation_bear":0.0,"suggested_bias":"long","risk_note":"Key risk in one sentence"}},"anomalies":[{{"type":"none","description":"No anomalies detected","severity":"low"}}],"market_regime":{{"volatility":"medium","trend_strength":65,"is_trending":true,"regime":"trending"}}}}"""


def analyze_market(market_data):
    prompt = build_prompt(market_data)

    response = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.1,
                "top_p": 0.9,
                "num_predict": 4096
            }
        },
        timeout=180
    )

    response.raise_for_status()
    raw = response.json().get("response", "").strip()

    if not raw:
        raise ValueError("Model returned an empty response")

    # Try direct parse first
    try:
        parsed = json.loads(raw)
        return parsed
    except json.JSONDecodeError:
        pass

    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip()
    cleaned = cleaned.rstrip("`").strip()

    try:
        parsed = json.loads(cleaned)
        return parsed
    except json.JSONDecodeError:
        pass

    # Extract the largest complete JSON object using brace matching
    best = None
    for start in [m.start() for m in re.finditer(r'\{', cleaned)]:
        depth = 0
        for i, ch in enumerate(cleaned[start:], start):
            if ch == '{':
                depth += 1
            elif ch == '}':
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

    raise ValueError(f"Model did not return a valid JSON object.\nRaw (first 400 chars): {raw[:400]}")


def check_ollama_health():
    try:
        res = requests.get("http://localhost:11434/api/tags", timeout=5)
        res.raise_for_status()
        models = [m["name"] for m in res.json().get("models", [])]
        has_model = any("gpt-oss" in m for m in models)
        if has_model:
            print("✅ Ollama ready — gpt-oss:20b found")
        else:
            print("⚠️  Ollama running but gpt-oss:20b not found. Run: ollama pull gpt-oss:20b")
            print(f"   Available models: {models}")
    except Exception as e:
        print(f"❌ Ollama not running or unreachable: {e}")
        print("   Start it with: ollama serve")
