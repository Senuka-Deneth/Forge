import requests
import json
import re

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "gpt-oss:20b"


def build_system_prompt():
    return """You are an expert quantitative trading analyst with deep knowledge of market
microstructure, technical analysis, and pivot point theory.

You receive structured market data including price action, technical indicators,
order book metrics, AND pivot point data.

Your job is to perform a complete multi-dimensional market analysis and return
a detailed structured JSON object — nothing else.

PIVOT POINT RULES YOU MUST APPLY:

1. If price is above PP → session bias is bullish.
   If price is below PP → session bias is bearish.

2. Price zones and their meaning:
   - above_R3: extreme bullish extension — overbought warning
   - between_R2_R3: strong bullish trend continuation
   - between_R1_R2: bullish with resistance ahead
   - between_PP_R1: bullish bias, approaching first resistance
   - between_S1_PP: bearish bias, holding above key support
   - between_S2_S1: bearish trend, approaching stronger support
   - between_S3_S2: strongly bearish
   - below_S3: extreme bearish extension — oversold warning

3. If price is within 0.3% of any pivot level →
   this is a high-priority inflection point.
   The next candle direction from this level is critical.
   Flag this clearly in your analysis.

4. Confluence rule:
   If a pivot level aligns with EMA20, EMA50, or a swing high/low
   within 0.5% → that level has VERY HIGH significance.
   Explicitly flag this in your analysis.

5. Trade scenario rule:
   - Bullish scenario must reference the next pivot resistance as target
   - Bearish scenario must reference the next pivot support as target
   - Invalidation levels should reference pivot levels

6. Breakout rule:
   If price closes above R2 or below S2 → likely breakout.
   Target becomes R3 or S3 respectively.

General Rules:
- Never return plain text. Always return a single valid JSON object.
- Never explain your reasoning outside the JSON.
- Be precise. Use actual price numbers from the data.
- Base confidence on confluence of signals.
- Identify pivot confluences explicitly."""


def build_user_prompt(data):
    swing_highs = data.get("swingHighs", [])
    swing_lows = data.get("swingLows", [])
    recent_closes = data.get("recentCloses", [])
    recent_volumes = data.get("recentVolumes", [])

    pivots_data = data.get("pivots")
    if pivots_data:
        pivot_section = f"""
--- PIVOT POINTS (Classic) ---
PP  (Main Pivot):  {pivots_data['classic'].get('PP', 'N/A')}
R1:  {pivots_data['classic'].get('R1', 'N/A')}
R2:  {pivots_data['classic'].get('R2', 'N/A')}
R3:  {pivots_data['classic'].get('R3', 'N/A')}
S1:  {pivots_data['classic'].get('S1', 'N/A')}
S2:  {pivots_data['classic'].get('S2', 'N/A')}
S3:  {pivots_data['classic'].get('S3', 'N/A')}

--- PIVOT POINTS (Fibonacci) ---
PP:  {pivots_data.get('fibonacci', {}).get('PP', 'N/A')}
R1 (38.2%): {pivots_data.get('fibonacci', {}).get('R1', 'N/A')}
R2 (61.8%): {pivots_data.get('fibonacci', {}).get('R2', 'N/A')}
R3 (100%):  {pivots_data.get('fibonacci', {}).get('R3', 'N/A')}
S1 (38.2%): {pivots_data.get('fibonacci', {}).get('S1', 'N/A')}
S2 (61.8%): {pivots_data.get('fibonacci', {}).get('S2', 'N/A')}
S3 (100%):  {pivots_data.get('fibonacci', {}).get('S3', 'N/A')}

--- PIVOT ANALYSIS ---
Current Zone:         {pivots_data.get('analysis', {}).get('zone', 'N/A')}
Session Bias:         {pivots_data.get('analysis', {}).get('bias', 'N/A')}
Nearest Pivot Resistance: {pivots_data.get('analysis', {}).get('nearestPivotResistance', {}).get('label', 'N/A') if pivots_data.get('analysis', {}).get('nearestPivotResistance') else 'N/A'} @ {pivots_data.get('analysis', {}).get('nearestPivotResistance', {}).get('value', 'N/A') if pivots_data.get('analysis', {}).get('nearestPivotResistance') else 'N/A'}
Nearest Pivot Support:    {pivots_data.get('analysis', {}).get('nearestPivotSupport', {}).get('label', 'N/A') if pivots_data.get('analysis', {}).get('nearestPivotSupport') else 'N/A'} @ {pivots_data.get('analysis', {}).get('nearestPivotSupport', {}).get('value', 'N/A') if pivots_data.get('analysis', {}).get('nearestPivotSupport') else 'N/A'}
Distance to Resistance:   {pivots_data.get('analysis', {}).get('distToResistance', 'N/A')}%
Distance to Support:      {pivots_data.get('analysis', {}).get('distToSupport', 'N/A')}%
At Inflection Point:      {pivots_data.get('analysis', {}).get('atInflectionPoint', False)}
Inflection Level:         {pivots_data.get('analysis', {}).get('inflectionLevel', {}).get('label', 'None') if pivots_data.get('analysis', {}).get('inflectionLevel') else 'None'} @ {pivots_data.get('analysis', {}).get('inflectionLevel', {}).get('value', 'N/A') if pivots_data.get('analysis', {}).get('inflectionLevel') else 'N/A'}
"""
    else:
        pivot_section = "--- PIVOT POINTS ---\nNot available"

    ema20_val = data.get('ema20', 'N/A')
    ema50_val = data.get('ema50', 'N/A')

    confluence_instruction = ""
    if pivots_data:
        confluence_instruction = f"""
IMPORTANT:
- Check if any pivot level aligns with EMA20 ({ema20_val}), EMA50 ({ema50_val}),
  or swing highs/lows within 0.5% — these are high-confluence levels.
- Use pivot levels as targets in bullish and bearish scenarios.
- Flag the inflection point if price is within 0.3% of any pivot level.
"""

    return f"""Analyze the following live market data and return your analysis as a JSON object.

Symbol: {data.get('symbol', 'N/A')}
Timeframe: {data.get('timeframe', 'N/A')}
Current Price: {data.get('price', 'N/A')}
Price Change: {data.get('change', 'N/A')}%

--- TECHNICAL INDICATORS ---
RSI (14): {data.get('rsi', 'N/A')}
EMA 20: {ema20_val}
EMA 50: {ema50_val}
MACD Line: {data.get('macd', {}).get('macd', 'N/A')}
Signal Line: {data.get('macd', {}).get('signal', 'N/A')}
Histogram: {data.get('macd', {}).get('histogram', 'N/A')}
Volume: {data.get('volume', 'N/A')}

--- PRICE STRUCTURE ---
Recent Swing Highs: {json.dumps(swing_highs)}
Recent Swing Lows: {json.dumps(swing_lows)}
Nearest Support: {data.get('support', 'N/A')}
Nearest Resistance: {data.get('resistance', 'N/A')}

--- ORDER FLOW ---
OBI: {data.get('obi', 'N/A') or 'N/A'}
TFI: {data.get('tfi', 'N/A') or 'N/A'}
Funding Rate: {data.get('fundingRate', 'N/A') or 'N/A'}
Open Interest Delta: {data.get('oiDelta', 'N/A') or 'N/A'}

--- RECENT CANDLE CONTEXT ---
Last 5 closes: {json.dumps(recent_closes)}
Last 5 volumes: {json.dumps(recent_volumes)}

{pivot_section}

{confluence_instruction}

Return only the JSON object matching this structure. No extra text:

{{"summary":{{"primary_trend":"bullish|bearish|sideways","momentum":"strong_bullish|bullish|neutral|bearish|strong_bearish","phase":"accumulation|markup|distribution|markdown|consolidation","confidence":70,"bias":"long|short|neutral","reasoning":"Brief one-sentence summary."}},"indicators":{{"rsi":{{"value":55.0,"state":"bullish_zone","divergence":"none","signal":"description"}},"macd":{{"macd_line":0.0,"signal_line":0.0,"histogram":0.0,"state":"bullish_momentum","signal":"description"}},"ema":{{"ema20":0.0,"ema50":0.0,"alignment":"bullish","price_vs_ema20":"above","price_vs_ema50":"above","signal":"description"}}}},"pivot_analysis":{{"pp":0.0,"current_zone":"zone_label","session_bias":"bullish|bearish|neutral","nearest_pivot_resistance":{{"label":"R1","value":0.0}},"nearest_pivot_support":{{"label":"S1","value":0.0}},"distance_to_pivot_resistance_pct":0.0,"distance_to_pivot_support_pct":0.0,"at_inflection_point":false,"inflection_level":"string or null","pivot_target_bull":{{"label":"R1","value":0.0}},"pivot_target_bear":{{"label":"S1","value":0.0}},"confluences":[{{"level":"R1","price":0.0,"confluent_with":"EMA20","significance":"high"}}],"pivot_signal":"one sentence on what pivots suggest"}},"structure":{{"nearest_support":0.0,"nearest_resistance":0.0,"key_support_levels":[0.0],"key_resistance_levels":[0.0],"swing_highs":[0.0],"swing_lows":[0.0],"range_bound":false,"breakout_watch":"none"}},"order_flow":{{"obi":0.0,"tfi":0.0,"dominant_side":"buyers","interpretation":"description"}},"trade_logic":{{"bullish_scenario":"must include pivot target level","bearish_scenario":"must include pivot target level","invalidation_bull":0.0,"invalidation_bear":0.0,"suggested_bias":"long|short|wait","risk_note":"key risk"}},"anomalies":[{{"type":"none","description":"description","severity":"low"}}],"market_regime":{{"volatility":"medium","trend_strength":65,"is_trending":true,"regime":"trending"}}}}"""


def build_prompt(data):
    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(data)
    return f"{system_prompt}\n\n{user_prompt}"


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
