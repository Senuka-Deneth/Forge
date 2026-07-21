/**
 * Canonical Wilder ATR — textbook implementation.
 * Excludes synthetic TR[0] from seed; first ATR value at index `period`.
 */

export type AtrResult = {
  value: number | null;
  series: (number | null)[];
};

type OHLC = { high: number; low: number; close: number };

/** Wilder-smoothed ATR from OHLC candles. */
export function calculateATR(candles: OHLC[], period = 14): AtrResult {
  const series: (number | null)[] = candles.map(() => null);
  if (candles.length < period + 1) return { value: null, series };

  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      const prevClose = candles[i - 1].close;
      tr.push(Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prevClose),
        Math.abs(candles[i].low - prevClose),
      ));
    }
  }

  let atr = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  series[period] = atr;

  for (let i = period + 1; i < candles.length; i++) {
    atr = ((atr * (period - 1)) + tr[i]) / period;
    series[i] = atr;
  }

  const last = series[candles.length - 1];
  return { value: last ?? null, series };
}

/** True range series (index 0 uses high-low only). */
export function trueRangeSeries(candles: OHLC[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
}

/** Wilder smoothing seeded at index `period - 1` with simple average of first `period` values. */
export function wilderSmooth(values: number[], period: number): Array<number | null> {
  const out = values.map(() => null as number | null);
  if (values.length < period + 1) return out;

  let seed = values.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = seed;

  for (let i = period + 1; i < values.length; i++) {
    seed = (seed * (period - 1) + values[i]) / period;
    out[i] = seed;
  }
  return out;
}
