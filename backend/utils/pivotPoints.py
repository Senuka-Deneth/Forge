"""
Pivot Point Calculator
Computes TradingView Standard pivot levels from OHLCV candle data.
Supports: Traditional, Fibonacci, Woodie, Classic, DM (DeMark), Camarilla.
"""

from datetime import datetime, timezone, timedelta


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


def calculate_pivots_generic(prev_high, prev_low, prev_close, prev_open=None, curr_open=None, pivot_type="traditional"):
    """
    Calculate TradingView Pivot Points Standard levels.
    Returns a dict with PP, R1-R5, S1-S5. If a level is not defined, it is None.
    """
    levels = {
        "PP": None,
        "R1": None, "R2": None, "R3": None, "R4": None, "R5": None,
        "S1": None, "S2": None, "S3": None, "S4": None, "S5": None
    }

    if pivot_type == "traditional":
        pp = (prev_high + prev_low + prev_close) / 3
        levels["PP"] = pp
        levels["R1"] = pp * 2 - prev_low
        levels["S1"] = pp * 2 - prev_high
        levels["R2"] = pp + (prev_high - prev_low)
        levels["S2"] = pp - (prev_high - prev_low)
        levels["R3"] = pp * 2 + (prev_high - 2 * prev_low)
        levels["S3"] = pp * 2 - (2 * prev_high - prev_low)
        levels["R4"] = pp * 3 + (prev_high - 3 * prev_low)
        levels["S4"] = pp * 3 - (3 * prev_high - prev_low)
        levels["R5"] = pp * 4 + (prev_high - 4 * prev_low)
        levels["S5"] = pp * 4 - (4 * prev_high - prev_low)

    elif pivot_type == "fibonacci":
        pp = (prev_high + prev_low + prev_close) / 3
        levels["PP"] = pp
        levels["R1"] = pp + 0.382 * (prev_high - prev_low)
        levels["S1"] = pp - 0.382 * (prev_high - prev_low)
        levels["R2"] = pp + 0.618 * (prev_high - prev_low)
        levels["S2"] = pp - 0.618 * (prev_high - prev_low)
        levels["R3"] = pp + (prev_high - prev_low)
        levels["S3"] = pp - (prev_high - prev_low)

    elif pivot_type == "woodie":
        if curr_open is None:
            curr_open = prev_close  # fallback
        pp = (prev_high + prev_low + 2 * curr_open) / 4
        levels["PP"] = pp
        levels["R1"] = 2 * pp - prev_low
        levels["S1"] = 2 * pp - prev_high
        levels["R2"] = pp + (prev_high - prev_low)
        levels["S2"] = pp - (prev_high - prev_low)
        levels["R3"] = prev_high + 2 * (pp - prev_low)
        levels["S3"] = prev_low - 2 * (prev_high - pp)
        levels["R4"] = levels["R3"] + (prev_high - prev_low)
        levels["S4"] = levels["S3"] - (prev_high - prev_low)

    elif pivot_type == "classic":
        pp = (prev_high + prev_low + prev_close) / 3
        levels["PP"] = pp
        levels["R1"] = 2 * pp - prev_low
        levels["S1"] = 2 * pp - prev_high
        levels["R2"] = pp + (prev_high - prev_low)
        levels["S2"] = pp - (prev_high - prev_low)
        levels["R3"] = pp + 2 * (prev_high - prev_low)
        levels["S3"] = pp - 2 * (prev_high - prev_low)
        levels["R4"] = pp + 3 * (prev_high - prev_low)
        levels["S4"] = pp - 3 * (prev_high - prev_low)

    elif pivot_type == "dm":
        if prev_open is None:
            prev_open = prev_close  # fallback
        if prev_open == prev_close:
            X = prev_high + prev_low + 2 * prev_close
        elif prev_close > prev_open:
            X = 2 * prev_high + prev_low + prev_close
        else:
            X = 2 * prev_low + prev_high + prev_close
        pp = X / 4
        levels["PP"] = pp
        levels["R1"] = X / 2 - prev_low
        levels["S1"] = X / 2 - prev_high

    elif pivot_type == "camarilla":
        pp = (prev_high + prev_low + prev_close) / 3
        levels["PP"] = pp
        levels["R1"] = prev_close + 1.1 * (prev_high - prev_low) / 12
        levels["S1"] = prev_close - 1.1 * (prev_high - prev_low) / 12
        levels["R2"] = prev_close + 1.1 * (prev_high - prev_low) / 6
        levels["S2"] = prev_close - 1.1 * (prev_high - prev_low) / 6
        levels["R3"] = prev_close + 1.1 * (prev_high - prev_low) / 4
        levels["S3"] = prev_close - 1.1 * (prev_high - prev_low) / 4
        levels["R4"] = prev_close + 1.1 * (prev_high - prev_low) / 2
        levels["S4"] = prev_close - 1.1 * (prev_high - prev_low) / 2
        levels["R5"] = (prev_high / prev_low) * prev_close
        levels["S5"] = prev_close - (levels["R5"] - prev_close)

    # Round all calculated values
    for k, v in levels.items():
        if v is not None:
            levels[k] = round(v, 2)

    return levels


def calculate_classic_pivots(high, low, close):
    """Calculate Classic (Floor) Pivot Points (Backward compatible)."""
    return calculate_pivots_generic(high, low, close, pivot_type="classic")


def calculate_fibonacci_pivots(high, low, close):
    """Calculate Fibonacci Pivot Points (Backward compatible)."""
    return calculate_pivots_generic(high, low, close, pivot_type="fibonacci")


def calculate_traditional_pivots(high, low, close):
    """Calculate Traditional Pivot Points (Backward compatible)."""
    return calculate_pivots_generic(high, low, close, pivot_type="traditional")


def get_pivot_period(timeframe):
    """
    Determine which candle to use as 'previous period' based on the chart timeframe.
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
    """
    groups = {}

    for c in candles:
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
    open_val = period_candles[0]["open"]

    return {
        "high": high,
        "low": low,
        "close": close,
        "open": open_val,
        "period": completed_key.isoformat(),
    }


def get_current_period_open(candles, period):
    """
    Get the opening price of the current active period.
    """
    if not candles:
        return None
    groups = {}
    for c in candles:
        d = datetime.fromtimestamp(c["time"], tz=timezone.utc)
        key = period_bucket_start(d, period)
        if key not in groups:
            groups[key] = []
        groups[key].append(c)
    sorted_keys = sorted(groups.keys())
    if not sorted_keys:
        return None
    current_key = sorted_keys[-1]
    current_candles = sorted(groups[current_key], key=lambda x: x["time"])
    return current_candles[0]["open"]


def get_recent_completed_period_candles(candles, period, count=3):
    """Return up to `count` completed aggregated period candles, oldest to newest."""
    groups = {}

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
        open_val = period_candles[0]["open"]
        start_time = period_candles[0]["time"]
        end_time = period_candles[-1]["time"]

        result.append({
            "high": high,
            "low": low,
            "close": close,
            "open": open_val,
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
    open_val = period_candle["open"]
    curr_open = get_current_period_open(candles, period)

    levels = calculate_pivots_generic(
        prev_high=high,
        prev_low=low,
        prev_close=close,
        prev_open=open_val,
        curr_open=curr_open,
        pivot_type=pivot_type
    )

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
    r1 = pivots.get("R1")
    r2 = pivots.get("R2")
    r3 = pivots.get("R3")
    s1 = pivots.get("S1")
    s2 = pivots.get("S2")
    s3 = pivots.get("S3")

    # Determine price zone
    if pp is None:
        zone = "unknown"
    elif r3 is not None and current_price > r3:
        zone = "above_R3"
    elif r2 is not None and r3 is not None and current_price > r2:
        zone = "between_R2_R3"
    elif r1 is not None and r2 is not None and current_price > r1:
        zone = "between_R1_R2"
    elif r1 is not None and current_price > pp:
        zone = "between_PP_R1"
    elif s1 is not None and current_price > s1:
        zone = "between_S1_PP"
    elif s1 is not None and s2 is not None and current_price > s2:
        zone = "between_S2_S1"
    elif s2 is not None and s3 is not None and current_price > s3:
        zone = "between_S3_S2"
    else:
        zone = "below_S3"

    # All levels sorted, including extended R4/R5/S4/S5 when present.
    all_levels = []
    for label, value in pivots.items():
        if label in ("type", "period", "basedOn", "generatedAt"):
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
    nearest_level = levels_with_dist[0] if levels_with_dist else None

    at_inflection_point = nearest_level["dist"] < proximity_threshold if nearest_level else False

    # Bias
    if pp is None:
        bias = "neutral"
    elif current_price > pp:
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
        } if at_inflection_point and nearest_level else None,
        "sessionBullish": current_price > pp if pp is not None else False,
        "allLevels": all_levels,
    }
