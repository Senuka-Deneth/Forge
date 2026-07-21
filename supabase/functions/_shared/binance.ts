import { type Candle, enrichCandles } from "./indicators.ts";
import { fetchWithTimeout } from "./http.ts";

const BINANCE_SPOT_BASE = "https://api.binance.com";
const BINANCE_FUTURES_BASE = "https://fapi.binance.com";

export type FetchKlinesOptions = {
  startTime?: number;
};

export async function fetchBinanceKlines(
  symbol: string,
  interval: string,
  limit: number,
  options: FetchKlinesOptions = {},
): Promise<Candle[]> {
  let remaining = limit;
  let currentEndTime: number | null = null;
  let allRawData: unknown[][] = [];
  const startTimeMs = options.startTime != null ? options.startTime * 1000 : null;

  while (remaining > 0) {
    const fetchLimit = Math.min(remaining, 1000);
    const url = new URL(`${BINANCE_SPOT_BASE}/api/v3/klines`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(fetchLimit));
    if (currentEndTime != null) url.searchParams.set("endTime", String(currentEndTime));
    if (startTimeMs != null && currentEndTime == null) url.searchParams.set("startTime", String(startTimeMs));

    const response = await fetchWithTimeout(url, {}, { timeoutMs: 10000, retries: 2 });
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
    takerBuyVolume: Number(item[9]),
  })).slice(-limit);

  return enrichCandles(candles);
}

export type OrderBookImbalance = {
  obi: number | null;
  bidVolume: number;
  askVolume: number;
  midPrice: number | null;
};

/**
 * Order-book imbalance: (bid volume - ask volume) / total volume, restricted to price levels
 * within `depthPct` of the mid price so it reflects liquidity actually near the market rather
 * than resting orders far away. Returns nulls (not a thrown error) if the book can't be read.
 */
export async function fetchOrderBookImbalance(symbol: string, depthPct = 0.01): Promise<OrderBookImbalance> {
  const empty: OrderBookImbalance = { obi: null, bidVolume: 0, askVolume: 0, midPrice: null };
  try {
    const url = new URL(`${BINANCE_SPOT_BASE}/api/v3/depth`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("limit", "500");
    const response = await fetchWithTimeout(url, {}, { timeoutMs: 8000, retries: 1 });
    if (!response.ok) return empty;

    const data = await response.json();
    const bids: [string, string][] = Array.isArray(data.bids) ? data.bids : [];
    const asks: [string, string][] = Array.isArray(data.asks) ? data.asks : [];
    if (!bids.length || !asks.length) return empty;

    const bestBid = Number(bids[0][0]);
    const bestAsk = Number(asks[0][0]);
    if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return empty;
    const midPrice = (bestBid + bestAsk) / 2;
    const lowerBound = midPrice * (1 - depthPct);
    const upperBound = midPrice * (1 + depthPct);

    const bidVolume = bids
      .filter(([price]) => Number(price) >= lowerBound)
      .reduce((sum, [, qty]) => sum + Number(qty), 0);
    const askVolume = asks
      .filter(([price]) => Number(price) <= upperBound)
      .reduce((sum, [, qty]) => sum + Number(qty), 0);

    const total = bidVolume + askVolume;
    const obi = total > 0 ? (bidVolume - askVolume) / total : null;

    return { obi, bidVolume, askVolume, midPrice };
  } catch {
    return empty;
  }
}

export type FuturesContext = {
  available: boolean;
  fundingRate: number | null;
  nextFundingTime: number | null;
  openInterest: number | null;
  longShortRatio: number | null;
  longAccountPct: number | null;
  shortAccountPct: number | null;
};

/**
 * Futures positioning context (funding rate, open interest, long/short account ratio). Many
 * symbols only trade on spot, so every field degrades to null (available: false) rather than
 * throwing when the futures endpoints 404 or a request fails.
 */
export async function fetchFuturesContext(symbol: string): Promise<FuturesContext> {
  const empty: FuturesContext = {
    available: false,
    fundingRate: null,
    nextFundingTime: null,
    openInterest: null,
    longShortRatio: null,
    longAccountPct: null,
    shortAccountPct: null,
  };

  const premiumUrl = new URL(`${BINANCE_FUTURES_BASE}/fapi/v1/premiumIndex`);
  premiumUrl.searchParams.set("symbol", symbol);
  const oiUrl = new URL(`${BINANCE_FUTURES_BASE}/fapi/v1/openInterest`);
  oiUrl.searchParams.set("symbol", symbol);
  const ratioUrl = new URL(`${BINANCE_FUTURES_BASE}/futures/data/globalLongShortAccountRatio`);
  ratioUrl.searchParams.set("symbol", symbol);
  ratioUrl.searchParams.set("period", "1h");
  ratioUrl.searchParams.set("limit", "1");

  const [premiumRes, oiRes, ratioRes] = await Promise.allSettled([
    fetchWithTimeout(premiumUrl, {}, { timeoutMs: 8000, retries: 0 }),
    fetchWithTimeout(oiUrl, {}, { timeoutMs: 8000, retries: 0 }),
    fetchWithTimeout(ratioUrl, {}, { timeoutMs: 8000, retries: 0 }),
  ]);

  const result = { ...empty };

  if (premiumRes.status === "fulfilled" && premiumRes.value.ok) {
    try {
      const data = await premiumRes.value.json();
      result.fundingRate = Number(data.lastFundingRate);
      result.nextFundingTime = Number(data.nextFundingTime);
      if (Number.isFinite(result.fundingRate)) result.available = true;
      else result.fundingRate = null;
      if (!Number.isFinite(result.nextFundingTime)) result.nextFundingTime = null;
    } catch { /* leave nulls */ }
  }

  if (oiRes.status === "fulfilled" && oiRes.value.ok) {
    try {
      const data = await oiRes.value.json();
      const oi = Number(data.openInterest);
      if (Number.isFinite(oi)) {
        result.openInterest = oi;
        result.available = true;
      }
    } catch { /* leave null */ }
  }

  if (ratioRes.status === "fulfilled" && ratioRes.value.ok) {
    try {
      const data = await ratioRes.value.json();
      const latest = Array.isArray(data) ? data[data.length - 1] : null;
      if (latest) {
        const ratio = Number(latest.longShortRatio);
        const longPct = Number(latest.longAccount);
        const shortPct = Number(latest.shortAccount);
        if (Number.isFinite(ratio)) result.longShortRatio = ratio;
        if (Number.isFinite(longPct)) result.longAccountPct = longPct;
        if (Number.isFinite(shortPct)) result.shortAccountPct = shortPct;
        if (Number.isFinite(ratio)) result.available = true;
      }
    } catch { /* leave nulls */ }
  }

  return result;
}

export type Ticker24hr = {
  priceChangePercent: number | null;
  volume: number | null;
  quoteVolume: number | null;
  highPrice: number | null;
  lowPrice: number | null;
};

/** Real 24-hour rolling stats from Binance's ticker endpoint (not a single candle's change/volume). */
export async function fetchTicker24hr(symbol: string): Promise<Ticker24hr> {
  const empty: Ticker24hr = { priceChangePercent: null, volume: null, quoteVolume: null, highPrice: null, lowPrice: null };
  try {
    const url = new URL(`${BINANCE_SPOT_BASE}/api/v3/ticker/24hr`);
    url.searchParams.set("symbol", symbol);
    const response = await fetchWithTimeout(url, {}, { timeoutMs: 8000, retries: 1 });
    if (!response.ok) return empty;
    const data = await response.json();
    const priceChangePercent = Number(data.priceChangePercent);
    const volume = Number(data.volume);
    const quoteVolume = Number(data.quoteVolume);
    const highPrice = Number(data.highPrice);
    const lowPrice = Number(data.lowPrice);
    return {
      priceChangePercent: Number.isFinite(priceChangePercent) ? priceChangePercent : null,
      volume: Number.isFinite(volume) ? volume : null,
      quoteVolume: Number.isFinite(quoteVolume) ? quoteVolume : null,
      highPrice: Number.isFinite(highPrice) ? highPrice : null,
      lowPrice: Number.isFinite(lowPrice) ? lowPrice : null,
    };
  } catch {
    return empty;
  }
}

/** Higher timeframes to pull for multi-timeframe confluence, keyed by the chart's active interval. */
export function getConfluenceTimeframes(interval: string): string[] {
  const ladder: Record<string, string[]> = {
    "1m": ["15m", "1h"],
    "3m": ["15m", "1h"],
    "5m": ["1h", "4h"],
    "15m": ["4h", "1d"],
    "30m": ["4h", "1d"],
    "1h": ["4h", "1d"],
    "2h": ["1d", "1w"],
    "4h": ["1d", "1w"],
    "6h": ["1d", "1w"],
    "8h": ["1d", "1w"],
    "12h": ["1d", "1w"],
    "1d": ["1w"],
    "3d": ["1w"],
    "1w": [],
    "1M": [],
  };
  return ladder[interval] ?? ["4h", "1d"];
}
