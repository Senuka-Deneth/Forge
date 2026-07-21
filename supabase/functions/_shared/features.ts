import type { Candle } from "./indicators.ts";
import { fetchWithTimeout } from "./http.ts";

const BINANCE_FUTURES_BASE = "https://fapi.binance.com";

export type VolumeProfile = {
  poc: number | null;
  vah: number | null;
  val: number | null;
};

export type OiHistory = {
  delta4hPct: number | null;
  delta24hPct: number | null;
  slope: number | null;
};

export type FundingSignal = {
  latest: number | null;
  zScore: number | null;
  crowding: "long_crowded" | "short_crowded" | "neutral" | null;
};

export type TakerRatioSignal = {
  latest: number | null;
  trend24h: "rising" | "falling" | "flat" | null;
};

export type MtfDepth = Array<{
  interval: string;
  rsi: Array<number | null>;
  macdHist: Array<number | null>;
}>;

export type MarketFeatures = {
  oi: OiHistory | null;
  funding: FundingSignal | null;
  takerRatio: TakerRatioSignal | null;
  volumeProfile: VolumeProfile | null;
  mtfDepth: MtfDepth;
};

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function computeVolumeProfile(candles: Candle[], bins = 40): VolumeProfile {
  if (!candles.length) return { poc: null, vah: null, val: null };

  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  if (maxPrice <= minPrice) return { poc: null, vah: null, val: null };

  const bucketSize = (maxPrice - minPrice) / bins;
  const hist = new Array(bins).fill(0);

  for (const c of candles) {
    const mid = (c.high + c.low) / 2;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((mid - minPrice) / bucketSize)));
    hist[idx] += c.volume;
  }

  const totalVol = hist.reduce((a, b) => a + b, 0);
  if (totalVol <= 0) return { poc: null, vah: null, val: null };

  let pocIdx = 0;
  for (let i = 1; i < bins; i += 1) {
    if (hist[i] > hist[pocIdx]) pocIdx = i;
  }
  const poc = minPrice + (pocIdx + 0.5) * bucketSize;

  const target = totalVol * 0.7;
  let acc = hist[pocIdx];
  let lo = pocIdx;
  let hi = pocIdx;
  while (acc < target && (lo > 0 || hi < bins - 1)) {
    const expandLo = lo > 0 ? hist[lo - 1] : -1;
    const expandHi = hi < bins - 1 ? hist[hi + 1] : -1;
    if (expandHi >= expandLo) {
      hi += 1;
      acc += hist[hi];
    } else {
      lo -= 1;
      acc += hist[lo];
    }
  }

  return {
    poc: Number(poc.toFixed(6)),
    val: Number((minPrice + lo * bucketSize).toFixed(6)),
    vah: Number((minPrice + (hi + 1) * bucketSize).toFixed(6)),
  };
}

async function fetchJson(url: URL): Promise<unknown | null> {
  try {
    const response = await fetchWithTimeout(url, {}, { timeoutMs: 8000, retries: 0 });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchOiHistory(symbol: string): Promise<OiHistory | null> {
  const url = new URL(`${BINANCE_FUTURES_BASE}/futures/data/openInterestHist`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("period", "1h");
  url.searchParams.set("limit", "30");
  const data = await fetchJson(url);
  if (!Array.isArray(data) || data.length < 5) return null;

  const values = data.map((row) => Number((row as Record<string, unknown>).sumOpenInterest)).filter(Number.isFinite);
  if (values.length < 5) return null;

  const latest = values[values.length - 1];
  const idx4h = Math.max(0, values.length - 5);
  const idx24h = Math.max(0, values.length - 25);
  const v4h = values[idx4h];
  const v24h = values[idx24h];

  const delta4hPct = v4h > 0 ? ((latest - v4h) / v4h) * 100 : null;
  const delta24hPct = v24h > 0 ? ((latest - v24h) / v24h) * 100 : null;

  const recent = values.slice(-12);
  const slope = recent.length >= 2
    ? (recent[recent.length - 1] - recent[0]) / recent.length
    : null;

  return {
    delta4hPct: delta4hPct != null ? Number(delta4hPct.toFixed(3)) : null,
    delta24hPct: delta24hPct != null ? Number(delta24hPct.toFixed(3)) : null,
    slope: slope != null ? Number(slope.toFixed(6)) : null,
  };
}

export async function fetchFundingSignal(symbol: string): Promise<FundingSignal | null> {
  const url = new URL(`${BINANCE_FUTURES_BASE}/fapi/v1/fundingRate`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("limit", "100");
  const data = await fetchJson(url);
  if (!Array.isArray(data) || !data.length) return null;

  const rates = data.map((row) => Number((row as Record<string, unknown>).fundingRate)).filter(Number.isFinite);
  if (!rates.length) return null;

  const latest = rates[rates.length - 1];
  const m = mean(rates);
  const sd = stddev(rates);
  const zScore = sd > 0 ? (latest - m) / sd : 0;

  let crowding: FundingSignal["crowding"] = "neutral";
  if (zScore >= 1.5) crowding = "long_crowded";
  else if (zScore <= -1.5) crowding = "short_crowded";

  return {
    latest: Number(latest.toFixed(8)),
    zScore: Number(zScore.toFixed(3)),
    crowding,
  };
}

export async function fetchTakerRatioSignal(symbol: string): Promise<TakerRatioSignal | null> {
  const url = new URL(`${BINANCE_FUTURES_BASE}/futures/data/takerlongshortRatio`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("period", "1h");
  url.searchParams.set("limit", "24");
  const data = await fetchJson(url);
  if (!Array.isArray(data) || !data.length) return null;

  const ratios = data.map((row) => Number((row as Record<string, unknown>).buySellRatio)).filter(Number.isFinite);
  if (!ratios.length) return null;

  const latest = ratios[ratios.length - 1];
  let trend24h: TakerRatioSignal["trend24h"] = "flat";
  if (ratios.length >= 2) {
    const delta = latest - ratios[0];
    if (delta > 0.02) trend24h = "rising";
    else if (delta < -0.02) trend24h = "falling";
  }

  return { latest: Number(latest.toFixed(4)), trend24h };
}

export function buildMtfDepth(
  mtfCandles: Array<{ interval: string; candles: Candle[] }>,
): MtfDepth {
  return mtfCandles.map(({ interval, candles }) => ({
    interval,
    rsi: candles.slice(-5).map((c) => c.rsi14 ?? null),
    macdHist: candles.slice(-5).map((c) => c.macdHist ?? null),
  }));
}

export async function gatherMarketFeatures(
  symbol: string,
  primaryCandles: Candle[],
  mtfCandles: Array<{ interval: string; candles: Candle[] }>,
): Promise<MarketFeatures> {
  const [oi, funding, takerRatio] = await Promise.all([
    fetchOiHistory(symbol),
    fetchFundingSignal(symbol),
    fetchTakerRatioSignal(symbol),
  ]);

  return {
    oi,
    funding,
    takerRatio,
    volumeProfile: computeVolumeProfile(primaryCandles),
    mtfDepth: buildMtfDepth(mtfCandles),
  };
}
