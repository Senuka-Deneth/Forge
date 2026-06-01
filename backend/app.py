from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import re
import os
import json
from pathlib import Path
from services.openrouter_service import analyze_market, check_openrouter_health
from utils.pivotPoints import (
    compute_pivots,
    analyze_price_vs_pivots,
    get_pivot_period,
    get_recent_completed_period_candles,
    calculate_traditional_pivots,
    calculate_pivots_generic,
)

app = Flask(__name__)
CORS(app)

BACKEND_HOST = os.getenv("BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "5050"))

# Check OpenRouter availability at startup
check_openrouter_health()

BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"

ALLOWED_INTERVALS = {
    "1m", "5m", "15m", "30m",
    "1h", "2h", "4h", "6h", "8h", "12h",
    "1d", "3d", "1w", "1M"
}

SYMBOL_REGEX = re.compile(r"^[A-Z0-9]{5,20}$")
USER_KEY_REGEX = re.compile(r"^[a-zA-Z0-9_.@-]{3,128}$")
PREFERENCES_FILE = Path(__file__).resolve().parent / "data" / "user_preferences.json"

DEFAULT_CHART_PREFERENCES = {
    "showCandles": True,
    "showEma20": False,
    "showEma50": False,
    "showRsi": False,
    "showMacd": False,
    "showSupport": False,
    "showResistance": False,
    "showPivots": False,
    "showStandardPivots": False,
    "pivotType": "traditional",
}


def normalize_user_key(user_key_raw: str) -> str:
    user_key = (user_key_raw or "").strip().lower()
    if not USER_KEY_REGEX.fullmatch(user_key):
        return "guest"
    return user_key


def load_preferences_store():
    if not PREFERENCES_FILE.exists():
        return {}

    try:
        with PREFERENCES_FILE.open("r", encoding="utf-8") as f:
            content = json.load(f)
            if isinstance(content, dict):
                return content
    except Exception:
        return {}

    return {}


def save_preferences_store(store):
    PREFERENCES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with PREFERENCES_FILE.open("w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=True, indent=2)


def sanitize_preferences(payload):
    if not isinstance(payload, dict):
        return DEFAULT_CHART_PREFERENCES.copy()

    sanitized = DEFAULT_CHART_PREFERENCES.copy()
    for key in DEFAULT_CHART_PREFERENCES:
        if key in payload:
            if key == "pivotType":
                sanitized[key] = str(payload[key])
            else:
                sanitized[key] = bool(payload[key])
    return sanitized


def validate_symbol(symbol: str) -> bool:
    return bool(SYMBOL_REGEX.fullmatch(symbol))


def calculate_ema(values, period):
    if not values:
        return []

    if period <= 0:
        raise ValueError("EMA period must be greater than 0")

    if len(values) < period:
        return [None] * len(values)

    ema = [None] * len(values)
    multiplier = 2 / (period + 1)

    # Standard EMA seed uses SMA(period) at index period-1.
    seed = sum(values[:period]) / period
    ema[period - 1] = seed

    for i in range(period, len(values)):
        ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1]

    return ema


def calculate_rsi(values, period=14):
    if len(values) < 2:
        return [None] * len(values)

    gains = [0]
    losses = [0]

    for i in range(1, len(values)):
        change = values[i] - values[i - 1]
        gains.append(max(change, 0))
        losses.append(abs(min(change, 0)))

    rsi = [None] * len(values)

    if len(values) <= period:
        return rsi

    avg_gain = sum(gains[1:period + 1]) / period
    avg_loss = sum(losses[1:period + 1]) / period

    rsi[period] = 100 if avg_loss == 0 else 100 - (100 / (1 + (avg_gain / avg_loss)))

    for i in range(period + 1, len(values)):
        avg_gain = ((avg_gain * (period - 1)) + gains[i]) / period
        avg_loss = ((avg_loss * (period - 1)) + losses[i]) / period
        rsi[i] = 100 if avg_loss == 0 else 100 - (100 / (1 + (avg_gain / avg_loss)))

    return rsi


def calculate_macd(values, fast=12, slow=26, signal=9):
    ema_fast = calculate_ema(values, fast)
    ema_slow = calculate_ema(values, slow)

    macd_line = [
        (ema_fast[i] - ema_slow[i]) if ema_fast[i] is not None and ema_slow[i] is not None else None
        for i in range(len(values))
    ]

    compact_macd = [v for v in macd_line if v is not None]
    compact_signal = calculate_ema(compact_macd, signal)

    signal_line = [None] * len(values)
    histogram = [None] * len(values)
    compact_idx = 0

    for i in range(len(values)):
        if macd_line[i] is None:
            continue

        sig = compact_signal[compact_idx]
        signal_line[i] = sig
        if sig is not None:
            histogram[i] = macd_line[i] - sig
        compact_idx += 1

    return macd_line, signal_line, histogram


def enrich_candles(candles):
    closes = [c["close"] for c in candles]

    ema20 = calculate_ema(closes, 20)
    ema50 = calculate_ema(closes, 50)
    rsi14 = calculate_rsi(closes, 14)
    macd_line, signal_line, macd_hist = calculate_macd(closes)

    for i in range(len(candles)):
        candles[i]["ema20"] = round(ema20[i], 6) if ema20[i] is not None else None
        candles[i]["ema50"] = round(ema50[i], 6) if ema50[i] is not None else None
        candles[i]["rsi14"] = round(rsi14[i], 6) if rsi14[i] is not None else None
        candles[i]["macd"] = round(macd_line[i], 6) if macd_line[i] is not None else None
        candles[i]["macdSignal"] = round(signal_line[i], 6) if signal_line[i] is not None else None
        candles[i]["macdHist"] = round(macd_hist[i], 6) if macd_hist[i] is not None else None

    return candles


def fetch_binance_klines(symbol, interval, limit):
    all_raw_data = []
    current_end_time = None
    remaining = limit

    while remaining > 0:
        fetch_limit = min(remaining, 1000)
        params = {
            "symbol": symbol,
            "interval": interval,
            "limit": fetch_limit
        }
        if current_end_time:
            params["endTime"] = current_end_time

        response = requests.get(BINANCE_KLINES_URL, params=params, timeout=10)

        if response.status_code != 200:
            raise ValueError(f"Binance request failed: {response.status_code} {response.text}")

        raw_data = response.json()
        if not raw_data:
            break

        all_raw_data = raw_data + all_raw_data
        current_end_time = raw_data[0][0] - 1
        remaining -= len(raw_data)

        if len(raw_data) < fetch_limit:
            break

    candles = []
    for item in all_raw_data:
        candles.append({
            "time": int(item[0] / 1000),
            "open": float(item[1]),
            "high": float(item[2]),
            "low": float(item[3]),
            "close": float(item[4]),
            "volume": float(item[5]),
        })

    candles = candles[-limit:]
    
    if not candles:
        return []

    return enrich_candles(candles)


def find_swings(candles, lookback=2):
    swing_highs = []
    swing_lows = []

    if len(candles) < (lookback * 2 + 1):
        return swing_highs, swing_lows

    for i in range(lookback, len(candles) - lookback):
        current_high = candles[i]["high"]
        current_low = candles[i]["low"]

        left_highs = [candles[j]["high"] for j in range(i - lookback, i)]
        right_highs = [candles[j]["high"] for j in range(i + 1, i + lookback + 1)]

        left_lows = [candles[j]["low"] for j in range(i - lookback, i)]
        right_lows = [candles[j]["low"] for j in range(i + 1, i + lookback + 1)]

        if current_high > max(left_highs) and current_high > max(right_highs):
            swing_highs.append({
                "time": candles[i]["time"],
                "price": current_high
            })

        if current_low < min(left_lows) and current_low < min(right_lows):
            swing_lows.append({
                "time": candles[i]["time"],
                "price": current_low
            })

    return swing_highs, swing_lows


def nearest_support_resistance(current_price, swing_highs, swing_lows):
    supports = [s for s in swing_lows if s["price"] < current_price]
    resistances = [r for r in swing_highs if r["price"] > current_price]

    nearest_support = max(supports, key=lambda x: x["price"]) if supports else None
    nearest_resistance = min(resistances, key=lambda x: x["price"]) if resistances else None

    return nearest_support, nearest_resistance


def get_trend(latest):
    close = latest["close"]
    ema20 = latest["ema20"]
    ema50 = latest["ema50"]

    if ema20 is None or ema50 is None:
        return "unknown"

    if close > ema20 > ema50:
        return "bullish"
    if close < ema20 < ema50:
        return "bearish"
    return "mixed"


def get_momentum(latest):
    rsi = latest["rsi14"]
    macd = latest["macd"]
    macd_signal = latest["macdSignal"]

    if rsi is None or macd is None or macd_signal is None:
        return "unknown"

    if rsi >= 70 and macd > macd_signal:
        return "strong bullish but overbought"
    if rsi <= 30 and macd < macd_signal:
        return "strong bearish but oversold"
    if macd > macd_signal and rsi > 50:
        return "bullish"
    if macd < macd_signal and rsi < 50:
        return "bearish"
    return "neutral"


def get_rsi_state(rsi):
    if rsi is None:
        return "unknown"
    if rsi >= 70:
        return "overbought"
    if rsi <= 30:
        return "oversold"
    if rsi >= 55:
        return "bullish zone"
    if rsi <= 45:
        return "bearish zone"
    return "neutral zone"


def get_macd_state(macd, signal):
    if macd is None or signal is None:
        return "unknown"
    if macd > signal:
        return "bullish crossover bias"
    if macd < signal:
        return "bearish crossover bias"
    return "neutral"


def build_scenarios(latest, trend, momentum, nearest_support, nearest_resistance):
    close = latest["close"]
    ema20 = latest["ema20"]

    bullish = "Need more confirmation."
    bearish = "Need more confirmation."
    invalidation = "No clear invalidation level yet."

    if nearest_resistance and ema20 is not None:
        bullish = (
            f"Bullish continuation becomes stronger if price holds above EMA20 ({ema20:.2f}) "
            f"and breaks resistance near {nearest_resistance['price']:.2f}."
        )
    elif ema20 is not None:
        bullish = f"Bullish continuation becomes stronger if price holds above EMA20 ({ema20:.2f})."

    if nearest_support:
        bearish = (
            f"Bearish continuation becomes stronger if price loses support near "
            f"{nearest_support['price']:.2f}."
        )
        invalidation = (
            f"If using the bearish idea, invalidation is a clean reclaim above the latest broken "
            f"support/resistance area."
        )

    if trend == "bullish" and nearest_support:
        invalidation = (
            f"If using the bullish idea, invalidation is a break below support near "
            f"{nearest_support['price']:.2f}."
        )

    if trend == "mixed" and momentum == "neutral":
        bullish = "Market is mixed. Bullish case needs a strong reclaim of key moving averages and resistance."
        bearish = "Market is mixed. Bearish case needs a rejection and loss of nearby support."

    return bullish, bearish, invalidation


def get_confidence(trend, momentum, nearest_support, nearest_resistance):
    score = 50

    if trend in ("bullish", "bearish"):
        score += 15
    if momentum in ("bullish", "bearish"):
        score += 15
    if nearest_support is not None:
        score += 10
    if nearest_resistance is not None:
        score += 10

    return min(score, 95)


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "Forge backend is running",
        "available_routes": [
            "/api/health",
            "/api/klines?symbol=BTCUSDT&interval=4h&limit=300",
            "/api/analyze?symbol=BTCUSDT&interval=4h&limit=300"
        ],
        "base_url": f"http://{BACKEND_HOST}:{BACKEND_PORT}"
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "message": "Forge backend is running"
    })


@app.route("/api/klines", methods=["GET"])
def get_klines():
    try:
        symbol = request.args.get("symbol", "BTCUSDT").upper().strip()
        interval = request.args.get("interval", "4h").strip()
        limit_raw = request.args.get("limit", "300").strip()

        if not validate_symbol(symbol):
            return jsonify({"error": "Invalid symbol format."}), 400

        if interval not in ALLOWED_INTERVALS:
            return jsonify({"error": "Invalid interval."}), 400

        try:
            limit = int(limit_raw)
        except ValueError:
            return jsonify({"error": "Limit must be an integer."}), 400

        if limit < 50 or limit > 10000:
            return jsonify({"error": "Limit must be between 50 and 10000."}), 400

        candles = fetch_binance_klines(symbol, interval, limit)
        return jsonify(candles)

    except Exception as exc:
        return jsonify({
            "error": "Unexpected backend error",
            "details": str(exc)
        }), 500


@app.route("/api/analyze", methods=["GET"])
def analyze():
    try:
        symbol = request.args.get("symbol", "BTCUSDT").upper().strip()
        interval = request.args.get("interval", "4h").strip()
        limit_raw = request.args.get("limit", "300").strip()

        if not validate_symbol(symbol):
            return jsonify({"error": "Invalid symbol format."}), 400

        if interval not in ALLOWED_INTERVALS:
            return jsonify({"error": "Invalid interval."}), 400

        try:
            limit = int(limit_raw)
        except ValueError:
            return jsonify({"error": "Limit must be an integer."}), 400

        if limit < 50 or limit > 10000:
            return jsonify({"error": "Limit must be between 50 and 10000."}), 400

        candles = fetch_binance_klines(symbol, interval, limit)

        if len(candles) < 60:
            return jsonify({"error": "Not enough candles for analysis."}), 400

        latest = candles[-1]
        swing_highs, swing_lows = find_swings(candles, lookback=2)
        nearest_support, nearest_resistance = nearest_support_resistance(
            latest["close"], swing_highs, swing_lows
        )

        trend = get_trend(latest)
        momentum = get_momentum(latest)
        rsi_state = get_rsi_state(latest["rsi14"])
        macd_state = get_macd_state(latest["macd"], latest["macdSignal"])
        bullish_scenario, bearish_scenario, invalidation = build_scenarios(
            latest, trend, momentum, nearest_support, nearest_resistance
        )
        confidence = get_confidence(trend, momentum, nearest_support, nearest_resistance)

        response = {
            "symbol": symbol,
            "interval": interval,
            "latestPrice": latest["close"],
            "trend": trend,
            "momentum": momentum,
            "rsi": latest["rsi14"],
            "rsiState": rsi_state,
            "macd": latest["macd"],
            "macdSignal": latest["macdSignal"],
            "macdHist": latest["macdHist"],
            "macdState": macd_state,
            "ema20": latest["ema20"],
            "ema50": latest["ema50"],
            "nearestSupport": nearest_support,
            "nearestResistance": nearest_resistance,
            "swingHighs": swing_highs[-5:],
            "swingLows": swing_lows[-5:],
            "bullishScenario": bullish_scenario,
            "bearishScenario": bearish_scenario,
            "invalidation": invalidation,
            "confidence": confidence
        }

        return jsonify(response)

    except Exception as exc:
        return jsonify({
            "error": "Unexpected backend error",
            "details": str(exc)
        }), 500


@app.route("/api/pivots", methods=["GET"])
def get_pivots():
    try:
        symbol = request.args.get("symbol", "BTCUSDT").upper().strip()
        timeframe = request.args.get("timeframe", "4h").strip()
        pivot_type = request.args.get("pivotType", "traditional").strip().lower()

        if not validate_symbol(symbol):
            return jsonify({"error": "Invalid symbol format."}), 400

        if timeframe not in ALLOWED_INTERVALS:
            return jsonify({"error": "Invalid interval."}), 400

        # Fetch enough candles to cover at least 2 full periods
        candles = fetch_binance_klines(symbol, timeframe, 200)

        if not candles:
            return jsonify({"success": False, "error": "No candle data available."}), 400

        current_price = candles[-1]["close"]

        classic_pivots = compute_pivots(candles, timeframe, "classic")
        fib_pivots = compute_pivots(candles, timeframe, "fibonacci")
        traditional_pivots = compute_pivots(candles, timeframe, "traditional")
        woodie_pivots = compute_pivots(candles, timeframe, "woodie")
        dm_pivots = compute_pivots(candles, timeframe, "dm")
        camarilla_pivots = compute_pivots(candles, timeframe, "camarilla")

        if not classic_pivots or not fib_pivots:
            return jsonify({
                "success": False,
                "error": "Not enough data to compute pivots for this timeframe."
            }), 400

        classic_analysis = analyze_price_vs_pivots(current_price, classic_pivots)
        fib_analysis = analyze_price_vs_pivots(current_price, fib_pivots)
        traditional_analysis = analyze_price_vs_pivots(current_price, traditional_pivots)
        woodie_analysis = analyze_price_vs_pivots(current_price, woodie_pivots)
        dm_analysis = analyze_price_vs_pivots(current_price, dm_pivots)
        camarilla_analysis = analyze_price_vs_pivots(current_price, camarilla_pivots)

        standard_period = get_pivot_period(timeframe)
        completed_periods = get_recent_completed_period_candles(candles, standard_period, count=4)
        standard_periods = []
        for i in range(1, len(completed_periods)):
            prev_candle = completed_periods[i - 1]
            curr_candle = completed_periods[i]

            pivots = calculate_pivots_generic(
                prev_high=prev_candle["high"],
                prev_low=prev_candle["low"],
                prev_close=prev_candle["close"],
                prev_open=prev_candle["open"],
                curr_open=curr_candle["open"],
                pivot_type=pivot_type
            )
            standard_periods.append({
                "period": curr_candle["period"],
                "startTime": curr_candle["startTime"],
                "endTime": curr_candle["endTime"],
                "pivots": pivots,
            })

        return jsonify({
            "success": True,
            "symbol": symbol,
            "timeframe": timeframe,
            "currentPrice": current_price,
            "classic": {"pivots": classic_pivots, "analysis": classic_analysis},
            "fibonacci": {"pivots": fib_pivots, "analysis": fib_analysis},
            "traditional": {"pivots": traditional_pivots, "analysis": traditional_analysis},
            "woodie": {"pivots": woodie_pivots, "analysis": woodie_analysis},
            "dm": {"pivots": dm_pivots, "analysis": dm_analysis},
            "camarilla": {"pivots": camarilla_pivots, "analysis": camarilla_analysis},
            "binance": {"pivots": traditional_pivots, "analysis": traditional_analysis},
            "standardPeriods": {
                "periodType": standard_period,
                "items": standard_periods,
            },
        })

    except Exception as exc:
        print(f"Pivot error: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/user-preferences", methods=["GET"])
def get_user_preferences():
    try:
        user_key = normalize_user_key(request.args.get("userKey", "guest"))
        store = load_preferences_store()
        preferences = sanitize_preferences(store.get(user_key, {}))
        return jsonify({
            "success": True,
            "userKey": user_key,
            "preferences": preferences,
        })
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/user-preferences", methods=["POST"])
def save_user_preferences():
    try:
        payload = request.get_json(silent=True) or {}
        user_key = normalize_user_key(payload.get("userKey", "guest"))
        preferences = sanitize_preferences(payload.get("preferences", {}))

        store = load_preferences_store()
        store[user_key] = preferences
        save_preferences_store(store)

        return jsonify({
            "success": True,
            "userKey": user_key,
            "preferences": preferences,
        })
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/ai-analyze", methods=["POST"])
def ai_analyze():
    try:
        market_data = request.get_json()

        if not market_data or market_data.get("price") is None:
            return jsonify({"error": "Invalid market data — price is required."}), 400

        analysis = analyze_market(market_data)
        return jsonify({"success": True, "analysis": analysis})

    except requests.exceptions.HTTPError as err:
        print(f"OpenRouter Analysis Error: {err}")
        if err.response.status_code == 401:
            return jsonify({
                "success": False,
                "error": "Invalid OpenRouter API key. Check your .env file."
            }), 500
        if err.response.status_code == 429:
            return jsonify({
                "success": False,
                "error": "Rate limit hit. Free tier has limits — wait 10 seconds and retry."
            }), 500
        return jsonify({"success": False, "error": str(err)}), 500

    except requests.exceptions.Timeout:
        return jsonify({
            "success": False,
            "error": "OpenRouter timeout. Model took too long (>60s). Try again."
        }), 500

    except Exception as exc:
        print(f"AI Analysis Error: {exc}")
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 500


def validate_env():
    import os
    required = [
        "OPENROUTER_API_KEY",
        "OPENROUTER_MODEL",
        "OPENROUTER_BASE_URL"
    ]
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        print("❌ Missing required environment variables:")
        for k in missing:
            print(f"   - {k}")
        print("Add them to your .env file and restart.")
        exit(1)
    print("✅ Environment validated")

validate_env()

if __name__ == "__main__":
    app.run(host=BACKEND_HOST, port=BACKEND_PORT, debug=True)