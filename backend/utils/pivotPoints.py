"""
Pivot Point Calculator
Computes Classic and Fibonacci pivot levels from OHLCV candle data.
"""

from datetime import datetime, timezone


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

    for c in candles:
        # c["time"] is Unix timestamp in seconds
        d = datetime.fromtimestamp(c["time"], tz=timezone.utc)

        if period == "daily":
            key = f"{d.year}-{d.month}-{d.day}"
        elif period == "weekly":
            day_of_week = d.weekday()  # Monday=0
            # Adjust to start of week (Monday)
            start = d.day - day_of_week
            key = f"{d.year}-{d.month}-{start}"
        elif period == "monthly":
            key = f"{d.year}-{d.month}"
        elif period == "quarterly":
            quarter = (d.month - 1) // 3
            key = f"{d.year}-Q{quarter}"
        else:
            key = f"{d.year}-{d.month}-{d.day}"

        if key not in groups:
            groups[key] = []
        groups[key].append(c)

    sorted_keys = sorted(groups.keys())

    if len(sorted_keys) < 2:
        return None

    # Last key is current (possibly incomplete) period
    # Use second-to-last as the completed period
    completed_key = sorted_keys[-2]
    period_candles = groups[completed_key]

    high = max(c["high"] for c in period_candles)
    low = min(c["low"] for c in period_candles)
    close = period_candles[-1]["close"]

    return {"high": high, "low": low, "close": close, "period": completed_key}


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
    r1, r2, r3 = pivots["R1"], pivots["R2"], pivots["R3"]
    s1, s2, s3 = pivots["S1"], pivots["S2"], pivots["S3"]

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

    # All levels sorted
    all_levels = [
        {"label": "S3", "value": s3},
        {"label": "S2", "value": s2},
        {"label": "S1", "value": s1},
        {"label": "PP", "value": pp},
        {"label": "R1", "value": r1},
        {"label": "R2", "value": r2},
        {"label": "R3", "value": r3},
    ]

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
