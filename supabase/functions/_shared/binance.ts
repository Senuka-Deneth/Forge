import { type Candle, enrichCandles } from "./indicators.ts";
import { fetchWithTimeout } from "./http.ts";

const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";

export async function fetchBinanceKlines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  let remaining = limit;
  let currentEndTime: number | null = null;
  let allRawData: unknown[][] = [];

  while (remaining > 0) {
    const fetchLimit = Math.min(remaining, 1000);
    const url = new URL(BINANCE_KLINES_URL);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(fetchLimit));
    if (currentEndTime != null) url.searchParams.set("endTime", String(currentEndTime));

    const response = await fetchWithTimeout(url, {}, { timeoutMs: 10000, retries: 1 });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Binance request failed: ${response.status} ${body}`);
    }

    const rawData = await response.json();
    if (!Array.isArray(rawData) || rawData.length === 0) break;

    allRawData = [...rawData, ...allRawData];
    currentEndTime = Number(rawData[0][0]) - 1;
    remaining -= rawData.length;
    if (rawData.length < fetchLimit) break;
  }

  const candles = allRawData.map((item) => ({
    time: Math.trunc(Number(item[0]) / 1000),
    open: Number(item[1]),
    high: Number(item[2]),
    low: Number(item[3]),
    close: Number(item[4]),
    volume: Number(item[5]),
  })).slice(-limit);

  return enrichCandles(candles);
}
