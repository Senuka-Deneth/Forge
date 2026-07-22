/**
 * Volatility, trend-quality and regime-transition indicators.
 *
 * Deliberately kept out of `enrichCandles`/the `Candle` type: indicators.ts already imports atr.ts,
 * and folding these back into the Candle shape would create an import cycle and a 40-field candle
 * object. These are computed as a separate feature block by the context builder instead.
 */

import { calculateEMA, calculateRSI, calculateSMA } from "./indicators.ts";
import { calculateATR } from "./atr.ts";

type OHLC = { high: number; low: number; close: number };
type OHLCV = OHLC & { open: number; volume: number };

function round6(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(6));
}

/** Rolling highest of `values` over `period` bars, null until the window is full. */
export function rollingMax(values: number[], period: number): Array<number | null> {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    let max = -Infinity;
    for (let j = i - period + 1; j <= i; j += 1) max = Math.max(max, values[j]);
    return max;
  });
}

/** Rolling lowest of `values` over `period` bars, null until the window is full. */
export function rollingMin(values: number[], period: number): Array<number | null> {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    let min = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) min = Math.min(min, values[j]);
    return min;
  });
}

// ---------------------------------------------------------------------------
// Keltner Channels + TTM squeeze
// ---------------------------------------------------------------------------

export type KeltnerChannels = {
  middle: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
};

/** Keltner Channels: EMA middle with ATR-scaled envelopes (Carter's 20/20/1.5 by default). */
export function calculateKeltnerChannels(
  candles: OHLC[],
  emaPeriod = 20,
  atrPeriod = 20,
  multiplier = 1.5,
): KeltnerChannels {
  const closes = candles.map((c) => c.close);
  const middle = calculateEMA(closes, emaPeriod);
  const { series: atr } = calculateATR(candles, atrPeriod);

  const upper = middle.map((m, i) => (m != null && atr[i] != null ? m + multiplier * (atr[i] as number) : null));
  const lower = middle.map((m, i) => (m != null && atr[i] != null ? m - multiplier * (atr[i] as number) : null));

  return { middle, upper, lower };
}

export type SqueezeState = "squeeze" | "fired" | "expanded" | "unknown";

export type SqueezeResult = {
  /** True while Bollinger Bands sit entirely inside the Keltner Channels. */
  inSqueeze: boolean[];
  state: SqueezeState[];
  momentum: Array<number | null>;
  latest: {
    state: SqueezeState;
    /** Consecutive bars the squeeze has been on (0 when not squeezing). */
    barsInSqueeze: number;
    momentum: number | null;
    momentumRising: boolean | null;
  };
};

/**
 * TTM squeeze: volatility compression detector.
 *
 * When Bollinger Bands contract inside the Keltner Channels, realised volatility has fallen below
 * the ATR-implied baseline — the market is coiling. The tradable event is not the squeeze itself
 * but its release ("fired"), and the momentum oscillator supplies the direction the release is
 * likely to take. This is the cleanest regime-transition signal available from data Forge already
 * computes, and it fires *before* ADX confirms a trend rather than after.
 */
export function calculateSqueeze(
  candles: OHLC[],
  bbPeriod = 20,
  bbMultiplier = 2,
  kcPeriod = 20,
  kcMultiplier = 1.5,
): SqueezeResult {
  const closes = candles.map((c) => c.close);
  const bbMiddle = calculateSMA(closes, bbPeriod);
  const kc = calculateKeltnerChannels(candles, kcPeriod, kcPeriod, kcMultiplier);

  const bbUpper: Array<number | null> = closes.map(() => null);
  const bbLower: Array<number | null> = closes.map(() => null);
  for (let i = 0; i < closes.length; i += 1) {
    const mid = bbMiddle[i];
    if (mid == null) continue;
    const window = closes.slice(i - bbPeriod + 1, i + 1);
    const variance = window.reduce((sum, v) => sum + (v - mid) ** 2, 0) / bbPeriod;
    const sd = Math.sqrt(variance);
    bbUpper[i] = mid + bbMultiplier * sd;
    bbLower[i] = mid - bbMultiplier * sd;
  }

  const inSqueeze = closes.map((_, i) => {
    const bu = bbUpper[i];
    const bl = bbLower[i];
    const ku = kc.upper[i];
    const kl = kc.lower[i];
    if (bu == null || bl == null || ku == null || kl == null) return false;
    return bu < ku && bl > kl;
  });

  // Carter's momentum: close relative to the midpoint of the Donchian mid and the SMA, smoothed by
  // a linear-regression slope over the same window.
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const hh = rollingMax(highs, kcPeriod);
  const ll = rollingMin(lows, kcPeriod);
  const sma = calculateSMA(closes, kcPeriod);

  const raw: Array<number | null> = closes.map((close, i) => {
    if (hh[i] == null || ll[i] == null || sma[i] == null) return null;
    const donchianMid = ((hh[i] as number) + (ll[i] as number)) / 2;
    const baseline = (donchianMid + (sma[i] as number)) / 2;
    return close - baseline;
  });

  const momentum = linearRegressionSlopeSeries(raw, kcPeriod);

  const state: SqueezeState[] = inSqueeze.map((squeezing, i) => {
    if (bbUpper[i] == null || kc.upper[i] == null) return "unknown";
    if (squeezing) return "squeeze";
    return i > 0 && inSqueeze[i - 1] ? "fired" : "expanded";
  });

  let barsInSqueeze = 0;
  for (let i = inSqueeze.length - 1; i >= 0; i -= 1) {
    if (!inSqueeze[i]) break;
    barsInSqueeze += 1;
  }

  const lastIdx = closes.length - 1;
  const latestMomentum = momentum[lastIdx] ?? null;
  const prevMomentum = lastIdx > 0 ? momentum[lastIdx - 1] ?? null : null;

  return {
    inSqueeze,
    state,
    momentum: momentum.map(round6),
    latest: {
      state: state[lastIdx] ?? "unknown",
      barsInSqueeze,
      momentum: round6(latestMomentum),
      momentumRising: latestMomentum != null && prevMomentum != null
        ? latestMomentum > prevMomentum
        : null,
    },
  };
}

/** Rolling least-squares slope-fit value at the end of each window (Carter's momentum smoothing). */
function linearRegressionSlopeSeries(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const window = values.slice(i - period + 1, i + 1);
    if (window.some((v) => v == null)) return null;
    const ys = window as number[];
    const n = ys.length;
    const meanX = (n - 1) / 2;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let x = 0; x < n; x += 1) {
      num += (x - meanX) * (ys[x] - meanY);
      den += (x - meanX) ** 2;
    }
    if (den === 0) return null;
    const slope = num / den;
    // Value of the fitted line at the most recent bar.
    return meanY + slope * (n - 1 - meanX);
  });
}

// ---------------------------------------------------------------------------
// Stochastic RSI
// ---------------------------------------------------------------------------

export type StochRsiResult = {
  k: Array<number | null>;
  d: Array<number | null>;
  latest: { k: number | null; d: number | null; state: "overbought" | "oversold" | "neutral" };
};

/**
 * Stochastic RSI — where RSI sits within its own recent range, rather than within 0–100.
 *
 * In a strong trend RSI can sit at 60–70 for weeks and never signal anything; StochRSI still
 * resolves pullbacks inside that band, which is what makes it the better entry timer for range and
 * retracement setups. It is correspondingly noisier, so it is a timing tool, not a bias tool.
 */
export function calculateStochRsi(
  closes: number[],
  rsiPeriod = 14,
  stochPeriod = 14,
  smoothK = 3,
  smoothD = 3,
): StochRsiResult {
  const rsi = calculateRSI(closes, rsiPeriod);

  const rawStoch: Array<number | null> = rsi.map((value, i) => {
    if (value == null || i < rsiPeriod + stochPeriod - 1) return null;
    const window = rsi.slice(i - stochPeriod + 1, i + 1).filter((v): v is number => v != null);
    if (window.length < stochPeriod) return null;
    const min = Math.min(...window);
    const max = Math.max(...window);
    // A flat RSI window has no range to be relative to, so the position is genuinely undefined.
    // Returning a midpoint here would report "neutral" during the exact conditions that pin RSI
    // (an unbroken run), which is the opposite of the truth — so report nothing instead.
    if (max === min) return null;
    return ((value - min) / (max - min)) * 100;
  });

  const k = smoothNullable(rawStoch, smoothK);
  const d = smoothNullable(k, smoothD);

  const lastK = k[k.length - 1] ?? null;
  const lastD = d[d.length - 1] ?? null;
  const state = lastK == null ? "neutral" : lastK >= 80 ? "overbought" : lastK <= 20 ? "oversold" : "neutral";

  return { k: k.map(round6), d: d.map(round6), latest: { k: round6(lastK), d: round6(lastD), state } };
}

/** Simple moving average over a nullable series, skipping windows that contain gaps. */
function smoothNullable(values: Array<number | null>, period: number): Array<number | null> {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const window = values.slice(i - period + 1, i + 1);
    if (window.some((v) => v == null)) return null;
    return (window as number[]).reduce((a, b) => a + b, 0) / period;
  });
}

// ---------------------------------------------------------------------------
// Supertrend and Chandelier Exit — the trailing-stop engines
// ---------------------------------------------------------------------------

export type SupertrendResult = {
  value: Array<number | null>;
  direction: Array<1 | -1 | null>;
  latest: { value: number | null; direction: 1 | -1 | null; flippedBarsAgo: number | null };
};

/**
 * Supertrend: an ATR-offset trailing line that only ever moves in the direction of the trend.
 *
 * Used here as a stop-management rule rather than an entry signal — it answers "where does this
 * trade stop being valid, given current volatility?" without the fixed-percentage arbitrariness of
 * a hand-placed stop.
 */
export function calculateSupertrend(
  candles: OHLC[],
  period = 10,
  factor = 3,
): SupertrendResult {
  const { series: atr } = calculateATR(candles, period);
  const value: Array<number | null> = candles.map(() => null);
  const direction: Array<1 | -1 | null> = candles.map(() => null);

  let finalUpper: number | null = null;
  let finalLower: number | null = null;
  let trend: 1 | -1 | null = null;

  for (let i = 0; i < candles.length; i += 1) {
    const a = atr[i];
    if (a == null) continue;

    const mid = (candles[i].high + candles[i].low) / 2;
    const basicUpper = mid + factor * a;
    const basicLower = mid - factor * a;
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;

    finalUpper = finalUpper == null || basicUpper < finalUpper || prevClose > finalUpper
      ? basicUpper
      : finalUpper;
    finalLower = finalLower == null || basicLower > finalLower || prevClose < finalLower
      ? basicLower
      : finalLower;

    const close = candles[i].close;
    if (trend == null) {
      trend = close >= mid ? 1 : -1;
    } else if (close > finalUpper) {
      trend = 1;
    } else if (close < finalLower) {
      trend = -1;
    }

    direction[i] = trend;
    value[i] = round6(trend === 1 ? finalLower : finalUpper);
  }

  const lastIdx = candles.length - 1;
  let flippedBarsAgo: number | null = null;
  const lastDirection = direction[lastIdx] ?? null;
  if (lastDirection != null) {
    flippedBarsAgo = 0;
    for (let i = lastIdx; i > 0; i -= 1) {
      if (direction[i - 1] !== lastDirection) break;
      flippedBarsAgo += 1;
    }
  }

  return {
    value,
    direction,
    latest: { value: value[lastIdx] ?? null, direction: lastDirection, flippedBarsAgo },
  };
}

export type ChandelierExit = {
  long: Array<number | null>;
  short: Array<number | null>;
  latest: { long: number | null; short: number | null };
};

/**
 * Chandelier Exit: hang a stop an ATR multiple below the highest high since entry (or above the
 * lowest low for shorts). Ratchets with the trade and never loosens.
 */
export function calculateChandelierExit(
  candles: OHLC[],
  period = 22,
  factor = 3,
): ChandelierExit {
  const { series: atr } = calculateATR(candles, period);
  const hh = rollingMax(candles.map((c) => c.high), period);
  const ll = rollingMin(candles.map((c) => c.low), period);

  const long = candles.map((_, i) =>
    hh[i] != null && atr[i] != null ? round6((hh[i] as number) - factor * (atr[i] as number)) : null
  );
  const short = candles.map((_, i) =>
    ll[i] != null && atr[i] != null ? round6((ll[i] as number) + factor * (atr[i] as number)) : null
  );

  const lastIdx = candles.length - 1;
  return { long, short, latest: { long: long[lastIdx] ?? null, short: short[lastIdx] ?? null } };
}

// ---------------------------------------------------------------------------
// Donchian channels — objective breakout levels
// ---------------------------------------------------------------------------

export type DonchianChannels = {
  upper: Array<number | null>;
  lower: Array<number | null>;
  middle: Array<number | null>;
  latest: { upper: number | null; lower: number | null; middle: number | null; positionPct: number | null };
};

/**
 * Donchian channels: the highest high and lowest low of the last N bars.
 *
 * These are the levels a breakout setup actually breaks. Forge classifies setups as "breakout"
 * without previously defining any breakout level, so a plan could be labelled a breakout while its
 * targets came from pivots that had nothing to do with the range being broken.
 */
export function calculateDonchian(candles: OHLC[], period = 20): DonchianChannels {
  const upper = rollingMax(candles.map((c) => c.high), period);
  const lower = rollingMin(candles.map((c) => c.low), period);
  const middle = upper.map((u, i) => (u != null && lower[i] != null ? (u + (lower[i] as number)) / 2 : null));

  const lastIdx = candles.length - 1;
  const u = upper[lastIdx] ?? null;
  const l = lower[lastIdx] ?? null;
  const close = candles[lastIdx]?.close ?? null;
  const positionPct = u != null && l != null && close != null && u > l
    ? round6(((close - l) / (u - l)) * 100)
    : null;

  return {
    upper,
    lower,
    middle,
    latest: { upper: round6(u), lower: round6(l), middle: round6(middle[lastIdx] ?? null), positionPct },
  };
}

// ---------------------------------------------------------------------------
// Ichimoku
// ---------------------------------------------------------------------------

export type IchimokuResult = {
  tenkan: Array<number | null>;
  kijun: Array<number | null>;
  /** Already displaced forward by `displacement`, so index i is what is drawn at bar i. */
  senkouA: Array<number | null>;
  senkouB: Array<number | null>;
  latest: {
    tenkan: number | null;
    kijun: number | null;
    cloudTop: number | null;
    cloudBottom: number | null;
    /** Cloud thickness as a fraction of price — thicker cloud, stronger the barrier. */
    cloudThicknessPct: number | null;
    priceVsCloud: "above" | "inside" | "below" | "unknown";
    tkCross: "bullish" | "bearish" | "none";
  };
};

/**
 * Ichimoku Kinko Hyo. Widely used for higher-timeframe bias in crypto, and unlike a moving average
 * the cloud gives a *zone* of support/resistance whose thickness encodes how much agreement is
 * behind it.
 */
export function calculateIchimoku(
  candles: OHLC[],
  conversionPeriod = 9,
  basePeriod = 26,
  spanBPeriod = 52,
  displacement = 26,
): IchimokuResult {
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const midpoint = (period: number): Array<number | null> => {
    const hh = rollingMax(highs, period);
    const ll = rollingMin(lows, period);
    return hh.map((h, i) => (h != null && ll[i] != null ? (h + (ll[i] as number)) / 2 : null));
  };

  const tenkan = midpoint(conversionPeriod);
  const kijun = midpoint(basePeriod);
  const spanBRaw = midpoint(spanBPeriod);
  const spanARaw = tenkan.map((t, i) => (t != null && kijun[i] != null ? (t + (kijun[i] as number)) / 2 : null));

  // Displace forward: what is drawn at bar i was computed at bar i - displacement.
  const displace = (series: Array<number | null>): Array<number | null> =>
    series.map((_, i) => (i - displacement >= 0 ? series[i - displacement] : null));

  const senkouA = displace(spanARaw);
  const senkouB = displace(spanBRaw);

  const lastIdx = candles.length - 1;
  const a = senkouA[lastIdx] ?? null;
  const b = senkouB[lastIdx] ?? null;
  const cloudTop = a != null && b != null ? Math.max(a, b) : null;
  const cloudBottom = a != null && b != null ? Math.min(a, b) : null;
  const close = candles[lastIdx]?.close ?? null;

  let priceVsCloud: IchimokuResult["latest"]["priceVsCloud"] = "unknown";
  if (close != null && cloudTop != null && cloudBottom != null) {
    priceVsCloud = close > cloudTop ? "above" : close < cloudBottom ? "below" : "inside";
  }

  let tkCross: IchimokuResult["latest"]["tkCross"] = "none";
  const t0 = tenkan[lastIdx];
  const k0 = kijun[lastIdx];
  const t1 = lastIdx > 0 ? tenkan[lastIdx - 1] : null;
  const k1 = lastIdx > 0 ? kijun[lastIdx - 1] : null;
  if (t0 != null && k0 != null && t1 != null && k1 != null) {
    if (t1 <= k1 && t0 > k0) tkCross = "bullish";
    else if (t1 >= k1 && t0 < k0) tkCross = "bearish";
  }

  return {
    tenkan,
    kijun,
    senkouA,
    senkouB,
    latest: {
      tenkan: round6(t0 ?? null),
      kijun: round6(k0 ?? null),
      cloudTop: round6(cloudTop),
      cloudBottom: round6(cloudBottom),
      cloudThicknessPct: cloudTop != null && cloudBottom != null && close
        ? round6(((cloudTop - cloudBottom) / close) * 100)
        : null,
      priceVsCloud,
      tkCross,
    },
  };
}

// ---------------------------------------------------------------------------
// Realized volatility
// ---------------------------------------------------------------------------

export type RealizedVolatility = {
  closeToClose: number | null;
  parkinson: number | null;
  garmanKlass: number | null;
  /** Standard deviation of the rolling close-to-close estimate — volatility of volatility. */
  volOfVol: number | null;
};

/**
 * Three realized-volatility estimators, all per-bar (not annualized — the caller knows the bar
 * duration). Parkinson and Garman-Klass use the full bar range and are several times more
 * efficient than close-to-close on the same sample, so a divergence between them is informative:
 * close-to-close far below Parkinson means the market is travelling intrabar and closing flat,
 * which is chop that a close-only measure would miss entirely.
 */
export function calculateRealizedVolatility(candles: OHLCV[], period = 20): RealizedVolatility {
  if (candles.length < period + 1) {
    return { closeToClose: null, parkinson: null, garmanKlass: null, volOfVol: null };
  }

  const window = candles.slice(-period);
  const prevWindow = candles.slice(-period - 1);

  const logReturns: number[] = [];
  for (let i = 1; i < prevWindow.length; i += 1) {
    const prev = prevWindow[i - 1].close;
    const curr = prevWindow[i].close;
    if (prev > 0 && curr > 0) logReturns.push(Math.log(curr / prev));
  }

  const closeToClose = logReturns.length >= 2 ? stdev(logReturns) : null;

  const parkinsonTerms = window
    .filter((c) => c.high > 0 && c.low > 0)
    .map((c) => Math.log(c.high / c.low) ** 2);
  const parkinson = parkinsonTerms.length
    ? Math.sqrt(parkinsonTerms.reduce((a, b) => a + b, 0) / (4 * Math.LN2 * parkinsonTerms.length))
    : null;

  const gkTerms = window
    .filter((c) => c.high > 0 && c.low > 0 && c.open > 0 && c.close > 0)
    .map((c) => 0.5 * Math.log(c.high / c.low) ** 2 - (2 * Math.LN2 - 1) * Math.log(c.close / c.open) ** 2);
  const gkMean = gkTerms.length ? gkTerms.reduce((a, b) => a + b, 0) / gkTerms.length : null;
  const garmanKlass = gkMean != null && gkMean > 0 ? Math.sqrt(gkMean) : null;

  // Vol-of-vol: dispersion of the rolling close-to-close estimate over the recent past.
  const rollingVols: number[] = [];
  for (let end = candles.length - period; end < candles.length; end += 1) {
    const slice = candles.slice(Math.max(0, end - period), end + 1);
    const rets: number[] = [];
    for (let i = 1; i < slice.length; i += 1) {
      const prev = slice[i - 1].close;
      const curr = slice[i].close;
      if (prev > 0 && curr > 0) rets.push(Math.log(curr / prev));
    }
    if (rets.length >= 2) rollingVols.push(stdev(rets));
  }
  const volOfVol = rollingVols.length >= 2 ? stdev(rollingVols) : null;

  return {
    closeToClose: round6(closeToClose),
    parkinson: round6(parkinson),
    garmanKlass: round6(garmanKlass),
    volOfVol: round6(volOfVol),
  };
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length);
}

// ---------------------------------------------------------------------------
// Hurst exponent / variance ratio — trending vs mean-reverting
// ---------------------------------------------------------------------------

export type PersistenceResult = {
  hurst: number | null;
  varianceRatio: number | null;
  interpretation: "trending" | "mean_reverting" | "random_walk" | "unknown";
};

/**
 * Rescaled-range (R/S) Hurst exponent plus a variance ratio.
 *
 * ADX measures how strong a trend has *been* and lags badly at turns. Hurst asks a different and
 * more useful question: does this series statistically persist or revert? H above 0.5 means moves
 * tend to continue, below 0.5 means they tend to reverse, 0.5 is a random walk. Used here as a
 * second, independent vote alongside ADX in regime classification, so a regime call does not rest
 * entirely on one lagging indicator.
 */
export function calculatePersistence(closes: number[], minWindow = 8): PersistenceResult {
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    if (closes[i - 1] > 0 && closes[i] > 0) logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const hurst = rescaledRangeHurst(logReturns, minWindow);
  const varianceRatio = calculateVarianceRatio(logReturns, 4);

  let interpretation: PersistenceResult["interpretation"] = "unknown";
  if (hurst != null) {
    if (hurst > 0.55) interpretation = "trending";
    else if (hurst < 0.45) interpretation = "mean_reverting";
    else interpretation = "random_walk";
  }

  return { hurst: round6(hurst), varianceRatio: round6(varianceRatio), interpretation };
}

function rescaledRangeHurst(returns: number[], minWindow: number): number | null {
  if (returns.length < minWindow * 4) return null;

  const sizes: number[] = [];
  for (let size = minWindow; size <= Math.floor(returns.length / 2); size = Math.floor(size * 1.5)) {
    sizes.push(size);
  }
  if (sizes.length < 2) return null;

  const points: Array<{ logN: number; logRs: number }> = [];

  for (const size of sizes) {
    const chunkCount = Math.floor(returns.length / size);
    const ratios: number[] = [];

    for (let c = 0; c < chunkCount; c += 1) {
      const chunk = returns.slice(c * size, (c + 1) * size);
      const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;

      let cumulative = 0;
      let min = Infinity;
      let max = -Infinity;
      for (const value of chunk) {
        cumulative += value - mean;
        min = Math.min(min, cumulative);
        max = Math.max(max, cumulative);
      }

      const range = max - min;
      const sd = stdev(chunk);
      if (sd > 0 && range > 0) ratios.push(range / sd);
    }

    if (ratios.length) {
      const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      points.push({ logN: Math.log(size), logRs: Math.log(avg) });
    }
  }

  if (points.length < 2) return null;

  // Slope of log(R/S) on log(n) is the Hurst exponent.
  const meanX = points.reduce((a, p) => a + p.logN, 0) / points.length;
  const meanY = points.reduce((a, p) => a + p.logRs, 0) / points.length;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.logN - meanX) * (p.logRs - meanY);
    den += (p.logN - meanX) ** 2;
  }
  if (den === 0) return null;

  const slope = num / den;
  return Math.max(0, Math.min(1, slope));
}

/**
 * Lo–MacKinlay style variance ratio: Var(q-bar returns) / (q · Var(1-bar returns)).
 * Above 1 means returns compound in the same direction (trending); below 1 means they offset.
 */
export function calculateVarianceRatio(returns: number[], q = 4): number | null {
  if (returns.length < q * 4) return null;

  const sd1 = stdev(returns);
  const var1 = sd1 ** 2;

  // Scale-aware degeneracy guard. An exact `=== 0` check is not enough: summing many copies of a
  // value that is inexact in binary (0.01, say) leaves a residual stdev around 1e-18, which is
  // floating-point noise but passes a strict zero test — and the ratio of two noise terms then
  // comes back as a confident-looking 1.0.
  const meanAbs = returns.reduce((a, b) => a + Math.abs(b), 0) / returns.length;
  if (!Number.isFinite(var1) || var1 <= 0 || sd1 < meanAbs * 1e-9) return null;

  const aggregated: number[] = [];
  for (let i = 0; i + q <= returns.length; i += q) {
    aggregated.push(returns.slice(i, i + q).reduce((a, b) => a + b, 0));
  }
  if (aggregated.length < 2) return null;

  const varQ = stdev(aggregated) ** 2;
  return varQ / (q * var1);
}
