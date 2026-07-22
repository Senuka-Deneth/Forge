import type { Candle } from "./indicators.ts";
import { fetchWithTimeout } from "./http.ts";
import { buildVolumeProfile, type VolumeProfile } from "./volumeProfile.ts";

export type { VolumeProfile };

const BINANCE_FUTURES_BASE = "https://fapi.binance.com";

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
    // buildVolumeProfile (volumeProfile.ts) spreads each candle's volume across its full traded
    // range rather than dumping it all at the midpoint — see that module's docstring for why the
    // old approach here biased the point of control toward wherever wide bars happened to sit.
    volumeProfile: buildVolumeProfile(primaryCandles),
    mtfDepth: buildMtfDepth(mtfCandles),
  };
}
