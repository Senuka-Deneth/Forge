const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "8h": 28_800_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  "3d": 259_200_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000,
};

/** True when the kline's open time + interval duration is at or before `nowMs`. */
export function isCandleClosed(openTimeSeconds: number, interval: string, nowMs = Date.now()): boolean {
  const durationMs = INTERVAL_MS[interval];
  if (!durationMs) return true;
  return openTimeSeconds * 1000 + durationMs <= nowMs;
}

/** Drop the in-progress last candle when its bar has not closed yet. */
export function sliceClosedCandles<T extends { time: number }>(candles: T[], interval: string, nowMs = Date.now()): T[] {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  if (isCandleClosed(last.time, interval, nowMs)) return candles;
  return candles.slice(0, -1);
}

export function intervalDurationMs(interval: string): number | null {
  return INTERVAL_MS[interval] ?? null;
}
