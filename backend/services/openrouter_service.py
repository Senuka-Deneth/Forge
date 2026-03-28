import os
import requests
import json
import re
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1/chat/completions")
API_KEY = os.getenv("OPENROUTER_API_KEY", "")
MODEL = os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")

BASE_HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:5000",   # required by OpenRouter
    "X-Title": "Vision Chart Bot"              # shows in OpenRouter dashboard
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

    raise ValueError("Model did not return parseable JSON. Raw: " + raw_text[:300])

def build_system_prompt():
    return """You are an elite quantitative trading analyst and market microstructure expert.

You specialize in:
- Multi-timeframe technical analysis
- Pivot point theory and confluence detection
- Market microstructure (order flow, funding rates, open interest)
- Risk-defined trade scenario construction

Your job is to receive structured live market data and return a precise analysis.

CRITICAL: For this first step, provide your step-by-step reasoning and market analysis. Keep it concise (under 200 words). Do NOT manually calculate every pivot confluence step-by-step.

DO NOT output JSON yet. Just provide your analytical thought process.
6. Pivot point rules you MUST apply:
   - Price above PP = session bullish bias
   - Price below PP = session bearish bias
   - Price within 0.3% of any pivot level = inflection point → flag it
   - Pivot level aligning with EMA within 0.5% = high-confluence level → flag it
   - Use pivot levels as trade targets in bullish/bearish scenarios
   - R2/S2 break = likely breakout → target R3/S3
7. RSI rules:
   - RSI > 70 = overbought warning even in uptrend
   - RSI < 30 = oversold warning even in downtrend
   - RSI divergence from price = flag as anomaly
8. EMA rules:
   - Price > EMA20 > EMA50 = strong bull alignment
   - Price < EMA20 < EMA50 = strong bear alignment
   - EMA20 crossing EMA50 = trend change signal

Return exactly this JSON schema — all fields required:

{
  "summary": {
    "primary_trend": "bullish | bearish | sideways",
    "momentum": "strong_bullish | bullish | neutral | bearish | strong_bearish",
    "phase": "accumulation | markup | distribution | markdown | consolidation",
    "confidence": 0-100,
    "bias": "long | short | neutral",
    "reasoning": "one sentence with specific price levels"
  },
  "indicators": {
    "rsi": {
      "value": 0.0,
      "state": "overbought | bullish_zone | neutral | bearish_zone | oversold",
      "divergence": "bullish | bearish | none",
      "signal": "string"
    },
    "macd": {
      "macd_line": 0.0,
      "signal_line": 0.0,
      "histogram": 0.0,
      "state": "bullish_crossover | bearish_crossover | bullish_momentum | bearish_momentum",
      "signal": "string"
    },
    "ema": {
      "ema20": 0.0,
      "ema50": 0.0,
      "alignment": "bullish | bearish | mixed",
      "price_vs_ema20": "above | below | at",
      "price_vs_ema50": "above | below | at",
      "signal": "string"
    }
  },
  "pivot_analysis": {
    "pp": 0.0,
    "current_zone": "string",
    "session_bias": "bullish | bearish | neutral",
    "nearest_pivot_resistance": { "label": "string", "value": 0.0 },
    "nearest_pivot_support": { "label": "string", "value": 0.0 },
    "distance_to_pivot_resistance_pct": 0.0,
    "distance_to_pivot_support_pct": 0.0,
    "at_inflection_point": false,
    "inflection_level": "string or null",
    "pivot_target_bull": { "label": "string", "value": 0.0 },
    "pivot_target_bear": { "label": "string", "value": 0.0 },
    "confluences": [
      {
        "level": "string",
        "price": 0.0,
        "confluent_with": "string",
        "significance": "high | medium | low"
      }
    ],
    "pivot_signal": "string"
  },
  "structure": {
    "nearest_support": 0.0,
    "nearest_resistance": 0.0,
    "key_support_levels": [0.0, 0.0, 0.0],
    "key_resistance_levels": [0.0, 0.0, 0.0],
    "swing_highs": [0.0, 0.0],
    "swing_lows": [0.0, 0.0],
    "range_bound": false,
    "breakout_watch": "bullish | bearish | none"
  },
  "order_flow": {
    "obi": 0.0,
    "tfi": 0.0,
    "dominant_side": "buyers | sellers | neutral",
    "interpretation": "string"
  },
  "trade_logic": {
    "bullish_scenario": "string with pivot target level",
    "bearish_scenario": "string with pivot target level",
    "invalidation_bull": 0.0,
    "invalidation_bear": 0.0,
    "suggested_bias": "long | short | wait",
    "risk_note": "string"
  },
  "anomalies": [
    {
      "type": "divergence | liquidity_trap | trend_exhaustion | pivot_confluence | volume_spike | none",
      "description": "string",
      "severity": "low | medium | high"
    }
  ],
  "market_regime": {
    "volatility": "low | medium | high",
    "trend_strength": 0,
    "is_trending": false,
    "regime": "trending | ranging | breakout | reversal"
  }
}"""

def build_first_user_message(data):
    pivots_data = data.get("pivots")
    if pivots_data:
        pivot_section = f"""--- PIVOT POINTS (Classic) ---
PP:  {pivots_data['classic'].get('PP', 'N/A')}
R1:  {pivots_data['classic'].get('R1', 'N/A')}
R2:  {pivots_data['classic'].get('R2', 'N/A')}
R3:  {pivots_data['classic'].get('R3', 'N/A')}
S1:  {pivots_data['classic'].get('S1', 'N/A')}
S2:  {pivots_data['classic'].get('S2', 'N/A')}
S3:  {pivots_data['classic'].get('S3', 'N/A')}

--- PIVOT POINTS (Fibonacci) ---
PP:  {pivots_data.get('fibonacci', {}).get('PP', 'N/A')}
R1 (38.2%):  {pivots_data.get('fibonacci', {}).get('R1', 'N/A')}
R2 (61.8%):  {pivots_data.get('fibonacci', {}).get('R2', 'N/A')}
R3 (100.0%): {pivots_data.get('fibonacci', {}).get('R3', 'N/A')}
S1 (38.2%):  {pivots_data.get('fibonacci', {}).get('S1', 'N/A')}
S2 (61.8%):  {pivots_data.get('fibonacci', {}).get('S2', 'N/A')}
S3 (100.0%): {pivots_data.get('fibonacci', {}).get('S3', 'N/A')}

--- PIVOT CONTEXT ---
Current Zone:              {pivots_data.get('analysis', {}).get('zone', 'N/A')}
Session Bias:              {pivots_data.get('analysis', {}).get('bias', 'N/A')}
Nearest Pivot Resistance:  {pivots_data.get('analysis', {}).get('nearestPivotResistance', {}).get('label', 'N/A') if pivots_data.get('analysis', {}).get('nearestPivotResistance') else 'N/A'} @ {pivots_data.get('analysis', {}).get('nearestPivotResistance', {}).get('value', 'N/A') if pivots_data.get('analysis', {}).get('nearestPivotResistance') else 'N/A'}
Nearest Pivot Support:     {pivots_data.get('analysis', {}).get('nearestPivotSupport', {}).get('label', 'N/A') if pivots_data.get('analysis', {}).get('nearestPivotSupport') else 'N/A'} @ {pivots_data.get('analysis', {}).get('nearestPivotSupport', {}).get('value', 'N/A') if pivots_data.get('analysis', {}).get('nearestPivotSupport') else 'N/A'}
Distance to Resistance:    {pivots_data.get('analysis', {}).get('distToResistance', 'N/A')}%
Distance to Support:       {pivots_data.get('analysis', {}).get('distToSupport', 'N/A')}%
At Inflection Point:       {pivots_data.get('analysis', {}).get('atInflectionPoint', False)}
Inflection Level:          {pivots_data.get('analysis', {}).get('inflectionLevel', {}).get('label', 'None') if pivots_data.get('analysis', {}).get('inflectionLevel') else 'None'} @ {pivots_data.get('analysis', {}).get('inflectionLevel', {}).get('value', 'N/A') if pivots_data.get('analysis', {}).get('inflectionLevel') else 'N/A'}
"""
    else:
        pivot_section = "--- PIVOT POINTS ---\nNot available\n"

    return f"""Perform a complete market analysis for the following data.

=== MARKET DATA ===
Symbol:       {data.get('symbol')}
Timeframe:    {data.get('timeframe')}
Price:        {data.get('price')}
Change:       {data.get('change')}%
Volume:       {data.get('volume')}

=== INDICATORS ===
RSI (14):     {data.get('rsi')}
EMA 20:       {data.get('ema20')}
EMA 50:       {data.get('ema50')}
MACD Line:    {data.get('macd', {}).get('macd')}
Signal Line:  {data.get('macd', {}).get('signal')}
Histogram:    {data.get('macd', {}).get('histogram')}

=== PRICE STRUCTURE ===
Swing Highs:        {json.dumps(data.get('swingHighs', []))}
Swing Lows:         {json.dumps(data.get('swingLows', []))}
Nearest Support:    {data.get('support')}
Nearest Resistance: {data.get('resistance')}
Last 5 Closes:      {json.dumps(data.get('recentCloses', []))}
Last 5 Volumes:     {json.dumps(data.get('recentVolumes', []))}

=== ORDER FLOW ===
OBI:              {data.get('obi', 'N/A') or 'N/A'}
TFI:              {data.get('tfi', 'N/A') or 'N/A'}
Funding Rate:     {data.get('fundingRate', 'N/A') or 'N/A'}
OI Delta:         {data.get('oiDelta', 'N/A') or 'N/A'}

{pivot_section}

=== CONFLUENCE CHECK ===
Check if any pivot level is within 0.5% of:
- EMA20 ({data.get('ema20')})
- EMA50 ({data.get('ema50')})
- Any swing high: {json.dumps(data.get('swingHighs', [])[:3])}
- Any swing low:  {json.dumps(data.get('swingLows', [])[:3])}
Flag each match as a confluence in your analysis.

Return the complete JSON analysis object now."""

def build_verification_message(data):
    return f"""Review your analysis carefully before finalizing.

Verify these specific points:

1. PIVOT CONSISTENCY
   - Does session_bias match the price vs PP relationship?
   - Price is {data.get('price')}, PP is {data.get('pivots', {}).get('classic', {}).get('PP', 'unknown')}.
   - Are pivot_target_bull and pivot_target_bear actual pivot levels from the data?
   - Did you correctly identify all confluences within 0.5%?

2. SIGNAL CONSISTENCY
   - Does your overall bias match the combined RSI + MACD + EMA signals?
   - If signals conflict, is confidence score appropriately reduced?
   - Is the suggested_bias consistent with primary_trend and momentum?

3. PRICE LEVEL ACCURACY
   - Are invalidation levels real numbers from the data?
   - Are support/resistance levels taken directly from the provided data?
   - No invented price levels.

4. ANOMALY CHECK
   - Is RSI diverging from price direction?
   - Is there unusual volume relative to recent candles?
   - Is price at a high-confluence inflection point?

CRITICAL: DO NOT WRITE ANY TEXT OR REASONING TO VERIFY. YOU MUST IMMEDIATELY START YOUR RESPONSE WITH THE JSON OBJECT STARTING WITH '{{'. Failure to do so will break the system.

If any of the above are wrong in your first response, correct them directly in the output JSON.
Return the final corrected and complete JSON object only."""

def analyze_market(market_data):
    system_prompt = build_system_prompt()
    first_user_msg = build_first_user_message(market_data)
    second_user_msg = build_verification_message(market_data)

    # Turn 1
    turn1_response = requests.post(
        OPENROUTER_URL,
        json={
            "model": MODEL,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": first_user_msg }
            ],
            "temperature": 0.1,
            "max_tokens": 8192
        },
        headers=BASE_HEADERS,
        timeout=300
    )
    turn1_response.raise_for_status()
    
    turn1_data = turn1_response.json()
    with open('/tmp/openrouter_logs.txt', 'a') as f:
        f.write("TURN 1:\\n" + turn1_response.text + "\\n")
    print("TURN 1 RESPONSE:", json.dumps(turn1_data, indent=2))
    
    choices = turn1_data.get("choices", [])
    if not choices:
        raise ValueError("Turn 1 failed. No choices returned. Raw response: " + turn1_response.text)
        
    assistant_msg = choices[0].get("message", {})
    turn1_content = assistant_msg.get("content") or ""

    # Preserve reasoning_details or thought if passed by OpenRouter
    conversation_history = [
        { "role": "system", "content": system_prompt },
        { "role": "user", "content": first_user_msg },
        {
            "role": "assistant",
            "content": turn1_content
        },
        { "role": "user", "content": second_user_msg }
    ]
    
    # Check for OpenRouter specific thought/reasoning objects
    if "reasoning" in assistant_msg:
        conversation_history[2]["reasoning"] = assistant_msg["reasoning"]

    # Turn 2: Assistant Prefill Hack
    # Force the model to skip reasoning and start outputting JSON immediately
    turn2_history = conversation_history.copy()
    turn2_history.append({"role": "assistant", "content": "```json\n{"})

    # Turn 2
    turn2_response = requests.post(
        OPENROUTER_URL,
        json={
            "model": MODEL,
            "messages": turn2_history,
            "temperature": 0.1,
            "max_tokens": 4096
        },
        headers=BASE_HEADERS,
        timeout=60
    )
    turn2_response.raise_for_status()

    turn2_data = turn2_response.json()
    with open('/tmp/openrouter_logs.txt', 'a') as f:
        f.write("TURN 2:\\n" + turn2_response.text + "\\n")
    print("TURN 2 RESPONSE:", json.dumps(turn2_data, indent=2))
    
    choices = turn2_data.get("choices", [])
    if not choices:
        raise ValueError("Turn 2 failed. No choices returned. Raw response: " + turn2_response.text)
        
    final_content = choices[0].get("message", {}).get("content") or ""
    
    try:
        parsed = extract_json(final_content)
    except ValueError as e:
        print(f"Turn 2 failed to parse JSON: {e}. Falling back to Turn 1 output.")
        parsed = extract_json(turn1_content)

    # Attach reasoning summary for frontend display
    parsed["_meta"] = {
        "model": MODEL,
        "reasoning_used": True,
        "turns": 2,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "turn1_reasoning_tokens": len(turn1_content)
    }

    return parsed

def check_openrouter_health():
    try:
        # We need an API key to reach models effectively but checking models works.
        response = requests.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=10
        )
        response.raise_for_status()
        
        models_data = response.json().get("data", [])
        models = [m.get("id") for m in models_data]
        model_available = MODEL in models

        if model_available:
            print(f"✅ OpenRouter ready — {MODEL} available")
        else:
            print(f"⚠️ Model {MODEL} not found in OpenRouter")
            print("Available free models:", [m for m in models if "free" in m.lower()])
            
    except requests.exceptions.HTTPError as err:
        if err.response.status_code == 401:
            print("❌ OpenRouter API key invalid")
        else:
            print(f"❌ Cannot reach OpenRouter: {err}")
    except Exception as e:
        print(f"❌ Cannot reach OpenRouter: {e}")
