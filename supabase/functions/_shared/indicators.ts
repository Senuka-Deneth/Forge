export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume: number | null;
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  atr14: number | null;
  atrPct: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  bbPercentB: number | null;
  bbBandwidth: number | null;
  vwap: number | null;
  adx14: number | null;
  plusDI14: number | null;
  minusDI14: number | null;
  obv: number | null;
  cvd: number | null;
  relativeVolume: number | null;
};

export type SwingPoint = { index: number; time: number; price: number };

export type SwingLabel = "HH" | "HL" | "LH" | "LL";

export function round6(value: number | null): number | null {
  return value == null ? null : Number(value.toFixed(6));
}

export function calculateEMA(values: number[], period: number): Array<number | null> {
  if (!values.length || period <= 0 || values.length < period) {
    return values.map(() => null);
  }

  const ema = values.map(() => null as number | null);
  const multiplier = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema[period - 1] = seed;

  for (let i = period; i < values.length; i += 1) {
    ema[i] = (values[i] - (ema[i - 1] as number)) * multiplier + (ema[i - 1] as number);
  }
  return ema;
}

export function calculateSMA(values: number[], period: number): Array<number | null> {
  if (!values.length || period <= 0) return values.map(() => null);
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const window = values.slice(i - period + 1, i + 1);
    return window.reduce((a, b) => a + b, 0) / period;
  });
}

export function calculateRSI(values: number[], period = 14): Array<number | null> {
  if (values.length < 2) return values.map(() => null);

  const gains = [0];
  const losses = [0];
  for (let i = 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.abs(Math.min(change, 0)));
  }

  const rsi = values.map(() => null as number | null);
  if (values.length <= period) return rsi;

  let avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < values.length; i += 1) {
    avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
    avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

export function calculateMACD(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = calculateEMA(values, fast);
  const emaSlow = calculateEMA(values, slow);
  const macdLine = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null
  );
  const compactMacd = macdLine.filter((v): v is number => v != null);
  const compactSignal = calculateEMA(compactMacd, signal);
  const signalLine = values.map(() => null as number | null);
  const histogram = values.map(() => null as number | null);

  let compactIdx = 0;
  for (let i = 0; i < macdLine.length; i += 1) {
    if (macdLine[i] == null) continue;
    const sig = compactSignal[compactIdx];
    signalLine[i] = sig;
    if (sig != null) histogram[i] = (macdLine[i] as number) - sig;
    compactIdx += 1;
  }
  return { macdLine, signalLine, histogram };
}

type OHLC = { high: number; low: number; close: number };

function trueRangeSeries(candles: OHLC[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
}

// Wilder's smoothing: seed with a simple average over the first `period` values, then apply the
// recursive (prev*(period-1)+value)/period smoothing used by ATR/ADX/RSI in the original indicator.
function wilderSmooth(values: number[], period: number): Array<number | null> {
  const out = values.map(() => null as number | null);
  if (values.length < period) return out;
  let seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;
  for (let i = period; i < values.length; i += 1) {
    seed = (seed * (period - 1) + values[i]) / period;
    out[i] = seed;
  }
  return out;
}

/** Average True Range (Wilder, period 14 by default). Returns ATR and ATR as % of close (volatility). */
export function calculateATR(candles: OHLC[], period = 14) {
  const tr = trueRangeSeries(candles);
  const atr = wilderSmooth(tr, period);
  const atrPct = candles.map((c, i) => (atr[i] != null && c.close ? ((atr[i] as number) / c.close) * 100 : null));
  return { tr, atr, atrPct };
}

/** Bollinger Bands: middle SMA, +/- stdDevMultiplier standard deviations, %B, and bandwidth. */
export function calculateBollingerBands(closes: number[], period = 20, stdDevMultiplier = 2) {
  const middle = calculateSMA(closes, period);
  const upper: Array<number | null> = closes.map(() => null);
  const lower: Array<number | null> = closes.map(() => null);
  const percentB: Array<number | null> = closes.map(() => null);
  const bandwidth: Array<number | null> = closes.map(() => null);

  for (let i = 0; i < closes.length; i += 1) {
    const mid = middle[i];
    if (mid == null) continue;
    const window = closes.slice(i - period + 1, i + 1);
    const variance = window.reduce((sum, v) => sum + (v - mid) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    const u = mid + stdDevMultiplier * stdDev;
    const l = mid - stdDevMultiplier * stdDev;
    upper[i] = u;
    lower[i] = l;
    percentB[i] = u !== l ? (closes[i] - l) / (u - l) : null;
    bandwidth[i] = mid !== 0 ? (u - l) / mid : null;
  }

  return { middle, upper, lower, percentB, bandwidth };
}

/** Daily-anchored VWAP: resets the cumulative sums at each UTC day boundary. */
export function calculateVWAP(candles: Array<OHLC & { time: number; volume: number }>) {
  const vwap: Array<number | null> = candles.map(() => null);
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  let currentDay: number | null = null;

  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    const day = Math.floor(c.time / 86400);
    if (day !== currentDay) {
      currentDay = day;
      cumulativePV = 0;
      cumulativeVolume = 0;
    }
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativePV += typicalPrice * c.volume;
    cumulativeVolume += c.volume;
    vwap[i] = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : null;
  }

  return vwap;
}

/** ADX / +DI / -DI (Wilder, period 14 by default) — a genuine trend-strength measure. */
export function calculateADX(candles: OHLC[] & Array<{ high: number; low: number }>, period = 14) {
  const tr = trueRangeSeries(candles);
  const plusDM: number[] = candles.map(() => 0);
  const minusDM: number[] = candles.map(() => 0);

  for (let i = 1; i < candles.length; i += 1) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  const smoothedTR = wilderSmooth(tr, period);
  const smoothedPlusDM = wilderSmooth(plusDM, period);
  const smoothedMinusDM = wilderSmooth(minusDM, period);

  const plusDI = candles.map((_, i) => {
    const t = smoothedTR[i];
    const p = smoothedPlusDM[i];
    return t != null && p != null && t !== 0 ? (p / t) * 100 : null;
  });
  const minusDI = candles.map((_, i) => {
    const t = smoothedTR[i];
    const m = smoothedMinusDM[i];
    return t != null && m != null && t !== 0 ? (m / t) * 100 : null;
  });

  const dx = candles.map((_, i) => {
    const p = plusDI[i];
    const m = minusDI[i];
    if (p == null || m == null || p + m === 0) return null;
    return (Math.abs(p - m) / (p + m)) * 100;
  });

  const dxValues = dx.filter((v): v is number => v != null);
  const compactAdx = wilderSmooth(dxValues, period);
  const adx: Array<number | null> = candles.map(() => null);
  let compactIdx = 0;
  for (let i = 0; i < dx.length; i += 1) {
    if (dx[i] == null) continue;
    adx[i] = compactAdx[compactIdx];
    compactIdx += 1;
  }

  return { plusDI, minusDI, adx };
}

/** On-Balance Volume — a running total of volume signed by the direction of each candle's close. */
export function calculateOBV(candles: Array<{ close: number; volume: number }>): number[] {
  const obv: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    if (i === 0) {
      obv.push(0);
      continue;
    }
    const prev = obv[i - 1];
    if (candles[i].close > candles[i - 1].close) obv.push(prev + candles[i].volume);
    else if (candles[i].close < candles[i - 1].close) obv.push(prev - candles[i].volume);
    else obv.push(prev);
  }
  return obv;
}

/**
 * Cumulative Volume Delta from Binance's taker-buy volume field: buy-side minus sell-side taker
 * volume per candle, accumulated. Approximates aggressive buying vs. selling pressure.
 */
export function calculateCVD(candles: Array<{ volume: number; takerBuyVolume: number | null }>) {
  const delta: Array<number | null> = candles.map((c) =>
    c.takerBuyVolume == null ? null : 2 * c.takerBuyVolume - c.volume
  );
  const cvd: Array<number | null> = [];
  let running = 0;
  let hasData = false;
  for (const d of delta) {
    if (d == null) {
      cvd.push(hasData ? running : null);
      continue;
    }
    hasData = true;
    running += d;
    cvd.push(running);
  }
  return { delta, cvd };
}

export function calculateRelativeVolume(volumes: number[], period = 20): Array<number | null> {
  const avg = calculateSMA(volumes, period);
  return volumes.map((v, i) => (avg[i] != null && avg[i] !== 0 ? v / (avg[i] as number) : null));
}

export function enrichCandles(
  candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number; takerBuyVolume?: number | null }>,
): Candle[] {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);
  const { macdLine, signalLine, histogram } = calculateMACD(closes);
  const { atr, atrPct } = calculateATR(candles, 14);
  const bb = calculateBollingerBands(closes, 20, 2);
  const vwap = calculateVWAP(candles);
  const { plusDI, minusDI, adx } = calculateADX(candles, 14);
  const obv = calculateOBV(candles);
  const { cvd } = calculateCVD(candles.map((c) => ({ volume: c.volume, takerBuyVolume: c.takerBuyVolume ?? null })));
  const relativeVolume = calculateRelativeVolume(volumes, 20);

  return candles.map((c, i) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    takerBuyVolume: c.takerBuyVolume ?? null,
    ema20: round6(ema20[i]),
    ema50: round6(ema50[i]),
    rsi14: round6(rsi14[i]),
    macd: round6(macdLine[i]),
    macdSignal: round6(signalLine[i]),
    macdHist: round6(histogram[i]),
    atr14: round6(atr[i]),
    atrPct: round6(atrPct[i]),
    bbUpper: round6(bb.upper[i]),
    bbMiddle: round6(bb.middle[i]),
    bbLower: round6(bb.lower[i]),
    bbPercentB: round6(bb.percentB[i]),
    bbBandwidth: round6(bb.bandwidth[i]),
    vwap: round6(vwap[i]),
    adx14: round6(adx[i]),
    plusDI14: round6(plusDI[i]),
    minusDI14: round6(minusDI[i]),
    obv: obv[i],
    cvd: cvd[i],
    relativeVolume: round6(relativeVolume[i]),
  }));
}

/**
 * Fractal swing-point detection: a bar is a swing high/low if its high/low is the most extreme
 * within `wing` bars on both sides. The most recent `wing` bars can never qualify (not enough
 * bars to their right yet), which is intentional — a swing point is only confirmed in hindsight.
 */
export function detectSwingPoints(candles: Candle[], wing = 2): { swingHighs: SwingPoint[]; swingLows: SwingPoint[] } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];

  for (let i = wing; i < candles.length - wing; i += 1) {
    const windowHighs = candles.slice(i - wing, i + wing + 1).map((c) => c.high);
    const windowLows = candles.slice(i - wing, i + wing + 1).map((c) => c.low);
    if (candles[i].high === Math.max(...windowHighs)) {
      swingHighs.push({ index: i, time: candles[i].time, price: candles[i].high });
    }
    if (candles[i].low === Math.min(...windowLows)) {
      swingLows.push({ index: i, time: candles[i].time, price: candles[i].low });
    }
  }

  return { swingHighs, swingLows };
}

export type MarketStructure = {
  lastSwingHighLabel: SwingLabel | null;
  lastSwingLowLabel: SwingLabel | null;
  breakOfStructure: "bullish" | "bearish" | "none";
  trendBias: "uptrend" | "downtrend" | "ranging";
};

/**
 * Classifies the last two swing highs and lows as HH/LH and HL/LL, and flags a break of
 * structure when the latest close trades through the most recent significant swing high (bullish
 * BOS) or swing low (bearish BOS) — the standard price-action definition of a structure break.
 */
export function classifyMarketStructure(
  candles: Candle[],
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
): MarketStructure {
  const lastSwingHighLabel: SwingLabel | null = swingHighs.length >= 2
    ? (swingHighs[swingHighs.length - 1].price > swingHighs[swingHighs.length - 2].price ? "HH" : "LH")
    : null;
  const lastSwingLowLabel: SwingLabel | null = swingLows.length >= 2
    ? (swingLows[swingLows.length - 1].price > swingLows[swingLows.length - 2].price ? "HL" : "LL")
    : null;

  const latestClose = candles.length ? candles[candles.length - 1].close : null;
  const lastSwingHigh = swingHighs[swingHighs.length - 1] ?? null;
  const lastSwingLow = swingLows[swingLows.length - 1] ?? null;

  let breakOfStructure: MarketStructure["breakOfStructure"] = "none";
  if (latestClose != null && lastSwingHigh && latestClose > lastSwingHigh.price) breakOfStructure = "bullish";
  else if (latestClose != null && lastSwingLow && latestClose < lastSwingLow.price) breakOfStructure = "bearish";

  let trendBias: MarketStructure["trendBias"] = "ranging";
  if (lastSwingHighLabel === "HH" && lastSwingLowLabel === "HL") trendBias = "uptrend";
  else if (lastSwingHighLabel === "LH" && lastSwingLowLabel === "LL") trendBias = "downtrend";

  return { lastSwingHighLabel, lastSwingLowLabel, breakOfStructure, trendBias };
}

export type Divergence = {
  type: "bullish" | "bearish" | "none";
  oscillator: "rsi" | "macd";
  description: string;
};

/**
 * Classic price/oscillator divergence: price makes a higher high while the oscillator (RSI or
 * MACD histogram) makes a lower high (bearish divergence — momentum fading into new highs), or
 * price makes a lower low while the oscillator makes a higher low (bullish divergence).
 * Requires at least two confirmed swings on each side to compare.
 */
export function detectDivergence(
  candles: Candle[],
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
  oscillator: "rsi" | "macd",
): Divergence {
  const oscValue = (index: number): number | null =>
    oscillator === "rsi" ? candles[index]?.rsi14 ?? null : candles[index]?.macdHist ?? null;

  if (swingHighs.length >= 2) {
    const prev = swingHighs[swingHighs.length - 2];
    const last = swingHighs[swingHighs.length - 1];
    const prevOsc = oscValue(prev.index);
    const lastOsc = oscValue(last.index);
    if (prevOsc != null && lastOsc != null && last.price > prev.price && lastOsc < prevOsc) {
      return { type: "bearish", oscillator, description: `Price formed a higher high while ${oscillator.toUpperCase()} formed a lower high — momentum is not confirming the new high.` };
    }
  }

  if (swingLows.length >= 2) {
    const prev = swingLows[swingLows.length - 2];
    const last = swingLows[swingLows.length - 1];
    const prevOsc = oscValue(prev.index);
    const lastOsc = oscValue(last.index);
    if (prevOsc != null && lastOsc != null && last.price < prev.price && lastOsc > prevOsc) {
      return { type: "bullish", oscillator, description: `Price formed a lower low while ${oscillator.toUpperCase()} formed a higher low — downside momentum is not confirming the new low.` };
    }
  }

  return { type: "none", oscillator, description: "No divergence detected." };
}
