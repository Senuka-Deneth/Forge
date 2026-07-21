export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
};

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

export function enrichCandles(candles: Omit<Candle, "ema20" | "ema50" | "rsi14" | "macd" | "macdSignal" | "macdHist">[]): Candle[] {
  const closes = candles.map((c) => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);
  const { macdLine, signalLine, histogram } = calculateMACD(closes);

  return candles.map((c, i) => ({
    ...c,
    ema20: round6(ema20[i]),
    ema50: round6(ema50[i]),
    rsi14: round6(rsi14[i]),
    macd: round6(macdLine[i]),
    macdSignal: round6(signalLine[i]),
    macdHist: round6(histogram[i]),
  }));
}
