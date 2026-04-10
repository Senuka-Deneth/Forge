"""
Pivot Point Calculator
Computes Classic and Fibonacci pivot levels from OHLCV candle data.
"""

from datetime import datetime, timezone, timedelta


def calculate_classic_pivots(high, low, close):
    """Calculate Classic (Floor) Pivot Points."""
    pp = (high + low + close) / 3

    return {
        "PP": round(pp, 2),
        "R1": round(2 * pp - low, 2),
        "R2": round(pp + (high - low), 2),
        "R3": round(high + 2 * (pp - low), 2),
        "S1": round(2 * pp - high, 2),
        "S2": round(pp - (high - low), 2),
        "S3": round(low - 2 * (high - pp), 2),
    }


def calculate_fibonacci_pivots(high, low, close):
    """Calculate Fibonacci Pivot Points."""
    pp = (high + low + close) / 3
    range_ = high - low

    return {
        "PP": round(pp, 2),
        "R1": round(pp + 0.382 * range_, 2),
        "R2": round(pp + 0.618 * range_, 2),
        "R3": round(pp + 1.000 * range_, 2),
        "S1": round(pp - 0.382 * range_, 2),
        "S2": round(pp - 0.618 * range_, 2),
        "S3": round(pp - 1.000 * range_, 2),
    }


def calculate_traditional_pivots(high, low, close):
    """Calculate TradingView/Exchange-style Traditional pivot points with extended levels."""
    pp = (high + low + close) / 3
    range_ = high - low

    r1 = pp * 2 - low
    r2 = pp + range_
    r3 = pp * 2 + (high - 2 * low)
    r4 = r3 + range_
    r5 = r4 + range_

    s1 = pp * 2 - high
    s2 = pp - range_
    s3 = pp * 2 - (2 * high - low)
    s4 = s3 - range_
    s5 = s4 - range_

    return {
        "PP": round(pp, 2),
        "R1": round(r1, 2),
        "R2": round(r2, 2),
        "R3": round(r3, 2),
        "R4": round(r4, 2),
        "R5": round(r5, 2),
        "S1": round(s1, 2),
        "S2": round(s2, 2),
        "S3": round(s3, 2),
        "S4": round(s4, 2),
        "S5": round(s5, 2),
    }


def get_pivot_period(timeframe):
    """
    Determine which candle to use as 'previous period' based on the chart timeframe.
    4H chart → weekly pivot (last completed weekly candle)
    1H chart → daily pivot (last completed daily candle)
    1D chart → monthly pivot (last completed monthly candle)
    """
    mapping = {
        "1m": "daily", "3m": "daily", "5m": "daily",
        "15m": "daily", "30m": "daily",
        "1h": "daily", "2h": "daily",
        "4h": "weekly", "6h": "weekly", "8h": "weekly",
        "12h": "weekly",
        "1d": "monthly", "3d": "monthly",
        "1w": "quarterly",
    }
    return mapping.get(timeframe, "daily")


def get_last_completed_period_candle(candles, period):
    """
    Find the last completed period candle from a list of candles.
    Groups candles by period and returns the aggregated OHLC of the
    second-to-last group (the last COMPLETED period).
    """
    groups = {}

    def period_bucket_start(dt, period_name):
        if period_name == "daily":
            return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)

        if period_name == "weekly":
            # Monday 00:00 UTC
            start = dt.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=dt.weekday())
            return start

        if period_name == "monthly":
            return datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)

        if period_name == "quarterly":
            quarter_start_month = ((dt.month - 1) // 3) * 3 + 1
            return datetime(dt.year, quarter_start_month, 1, tzinfo=timezone.utc)

        return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)

    for c in candles:
        # c["time"] is Unix timestamp in seconds
        d = datetime.fromtimestamp(c["time"], tz=timezone.utc)

        key = period_bucket_start(d, period)

        if key not in groups:
            groups[key] = []
        groups[key].append(c)

    sorted_keys = sorted(groups.keys())

    if len(sorted_keys) < 2:
        return None

    # Last key is current (possibly incomplete) period
    # Use second-to-last as the completed period
    completed_key = sorted_keys[-2]
    period_candles = sorted(groups[completed_key], key=lambda x: x["time"])

    high = max(c["high"] for c in period_candles)
    low = min(c["low"] for c in period_candles)
    close = period_candles[-1]["close"]

    return {
        "high": high,
        "low": low,
        "close": close,
        "period": completed_key.isoformat(),
    }


def get_recent_completed_period_candles(candles, period, count=3):
    """Return up to `count` completed aggregated period candles, oldest to newest."""
    groups = {}

    def period_bucket_start(dt, period_name):
        if period_name == "daily":
            return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)

        if period_name == "weekly":
            # Monday 00:00 UTC
            start = dt.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=dt.weekday())
            return start

        if period_name == "monthly":
            return datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)

        if period_name == "quarterly":
            quarter_start_month = ((dt.month - 1) // 3) * 3 + 1
            return datetime(dt.year, quarter_start_month, 1, tzinfo=timezone.utc)

        return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)

    for c in candles:
        d = datetime.fromtimestamp(c["time"], tz=timezone.utc)
        key = period_bucket_start(d, period)
        if key not in groups:
            groups[key] = []
        groups[key].append(c)

    sorted_keys = sorted(groups.keys())
    if len(sorted_keys) < 2:
        return []

    completed_keys = sorted_keys[:-1]
    selected_keys = completed_keys[-count:]
    result = []

    for key in selected_keys:
        period_candles = sorted(groups[key], key=lambda x: x["time"])
        high = max(c["high"] for c in period_candles)
        low = min(c["low"] for c in period_candles)
        close = period_candles[-1]["close"]
        start_time = period_candles[0]["time"]
        end_time = period_candles[-1]["time"]

        result.append({
            "high": high,
            "low": low,
            "close": close,
            "period": key.isoformat(),
            "startTime": start_time,
            "endTime": end_time,
        })

    return result


def compute_pivots(candles, timeframe, pivot_type="classic"):
    """Compute pivot points for the given candles and timeframe."""
    period = get_pivot_period(timeframe)
    period_candle = get_last_completed_period_candle(candles, period)

    if not period_candle:
        return None

    high = period_candle["high"]
    low = period_candle["low"]
    close = period_candle["close"]

    if pivot_type == "fibonacci":
        levels = calculate_fibonacci_pivots(high, low, close)
    elif pivot_type == "traditional":
        levels = calculate_traditional_pivots(high, low, close)
    else:
        levels = calculate_classic_pivots(high, low, close)

    return {
        **levels,
        "type": pivot_type,
        "period": period,
        "basedOn": period_candle,
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(),
    }


def analyze_price_vs_pivots(current_price, pivots):
    """Analyze current price position relative to pivot levels."""
    pp = pivots["PP"]
    r1, r2, r3 = pivots.get("R1"), pivots.get("R2"), pivots.get("R3")
    s1, s2, s3 = pivots.get("S1"), pivots.get("S2"), pivots.get("S3")

    # Determine price zone
    if current_price > r3:
        zone = "above_R3"
    elif current_price > r2:
        zone = "between_R2_R3"
    elif current_price > r1:
        zone = "between_R1_R2"
    elif current_price > pp:
        zone = "between_PP_R1"
    elif current_price > s1:
        zone = "between_S1_PP"
    elif current_price > s2:
        zone = "between_S2_S1"
    elif current_price > s3:
        zone = "between_S3_S2"
    else:
        zone = "below_S3"

    # All levels sorted, including extended R4/R5/S4/S5 when present.
    all_levels = []
    for label, value in pivots.items():
        if label == "type" or label == "period" or label == "basedOn" or label == "generatedAt":
            continue
        if value is None:
            continue
        all_levels.append({"label": label, "value": value})

    order = {"S5": 1, "S4": 2, "S3": 3, "S2": 4, "S1": 5, "PP": 6, "R1": 7, "R2": 8, "R3": 9, "R4": 10, "R5": 11}
    all_levels.sort(key=lambda x: order.get(x["label"], 999))

    above = sorted(
        [l for l in all_levels if l["value"] > current_price],
        key=lambda x: x["value"]
    )
    below = sorted(
        [l for l in all_levels if l["value"] < current_price],
        key=lambda x: -x["value"]
    )

    nearest_resistance = above[0] if above else None
    nearest_support = below[0] if below else None

    # Distance as percentage
    dist_to_resistance = (
        round((nearest_resistance["value"] - current_price) / current_price * 100, 3)
        if nearest_resistance else None
    )
    dist_to_support = (
        round((current_price - nearest_support["value"]) / current_price * 100, 3)
        if nearest_support else None
    )

    # Proximity alert: price within 0.3% of any level
    proximity_threshold = 0.003
    levels_with_dist = [
        {**l, "dist": abs(current_price - l["value"]) / current_price}
        for l in all_levels
    ]
    levels_with_dist.sort(key=lambda x: x["dist"])
    nearest_level = levels_with_dist[0]

    at_inflection_point = nearest_level["dist"] < proximity_threshold

    # Bias
    if current_price > pp:
        bias = "bullish"
    elif current_price < pp:
        bias = "bearish"
    else:
        bias = "neutral"

    return {
        "zone": zone,
        "bias": bias,
        "nearestResistance": nearest_resistance,
        "nearestSupport": nearest_support,
        "distToResistance": dist_to_resistance,
        "distToSupport": dist_to_support,
        "atInflectionPoint": at_inflection_point,
        "inflectionLevel": {
            "label": nearest_level["label"],
            "value": nearest_level["value"],
        } if at_inflection_point else None,
        "sessionBullish": current_price > pp,
        "allLevels": all_levels,
    }
