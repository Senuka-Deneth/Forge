import type { FuturesContext } from "./binance.ts";
import { fetchWithTimeout } from "./http.ts";

const BINANCE_FUTURES_BASE = "https://fapi.binance.com";
const COINGLASS_BASE = "https://open-api-v3.coinglass.com";
const LEVERAGE_TIERS = [10, 25, 50, 100] as const;

export type LiquidationCluster = {
  price: number;
  side: "long" | "short";
  strength: number;
};

export type LiquidationPressure =
  | "long_squeeze_risk"
  | "short_squeeze_risk"
  | "balanced"
  | "unknown";

export type LiquidationContext = {
  available: boolean;
  oiDelta1h: number | null;
  oiDelta4h: number | null;
  markBasisPct: number | null;
  fundingRate: number | null;
  longShortRatio: number | null;
  pressure: LiquidationPressure;
  estClusters: LiquidationCluster[];
  source: "estimate" | "coinglass";
};

const EMPTY: LiquidationContext = {
  available: false,
  oiDelta1h: null,
  oiDelta4h: null,
  markBasisPct: null,
  fundingRate: null,
  longShortRatio: null,
  pressure: "unknown",
  estClusters: [],
  source: "estimate",
};

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Pure estimator: leverage-tier liquidation bands anchored at recent swing extremes.
 * Long-liq below swingLow·(1−1/L); short-liq above swingHigh·(1+1/L).
 * Strength is weighted by OI-delta sign and long/short account skew.
 */
export function estimateLiquidationClusters(
  swingHigh: number | null,
  swingLow: number | null,
  oiDelta: number | null,
  longShortRatio: number | null,
): LiquidationCluster[] {
  if (swingHigh == null || swingLow == null || swingHigh <= 0 || swingLow <= 0) return [];

  const oiBoost = oiDelta == null ? 1 : clamp(1 + Math.abs(oiDelta) / 100, 0.5, 2);
  const lsRatio = longShortRatio ?? 1;
  const longSkew = clamp(lsRatio / 1.2, 0.5, 2);
  const shortSkew = clamp(1.2 / Math.max(lsRatio, 0.01), 0.5, 2);

  const clusters: LiquidationCluster[] = [];

  for (const leverage of LEVERAGE_TIERS) {
    const tierWeight = leverage / 100;
    const longPrice = swingLow * (1 - 1 / leverage);
    const shortPrice = swingHigh * (1 + 1 / leverage);

    if (longPrice > 0) {
      clusters.push({
        price: round6(longPrice),
        side: "long",
        strength: round6(clamp(tierWeight * oiBoost * longSkew, 0.05, 1)),
      });
    }
    if (shortPrice > 0) {
      clusters.push({
        price: round6(shortPrice),
        side: "short",
        strength: round6(clamp(tierWeight * oiBoost * shortSkew, 0.05, 1)),
      });
    }
  }

  return clusters.sort((a, b) => b.strength - a.strength);
}

function derivePressure(
  fundingRate: number | null,
  longShortRatio: number | null,
  oiDelta4h: number | null,
): LiquidationPressure {
  if (fundingRate == null && longShortRatio == null && oiDelta4h == null) return "unknown";

  let longScore = 0;
  let shortScore = 0;

  if (longShortRatio != null) {
    if (longShortRatio >= 1.15) longScore += 1;
    if (longShortRatio <= 0.85) shortScore += 1;
  }
  if (fundingRate != null) {
    if (fundingRate > 0.0001) longScore += 1;
    if (fundingRate < -0.0001) shortScore += 1;
  }
  if (oiDelta4h != null && Math.abs(oiDelta4h) >= 2) {
    if (oiDelta4h > 0 && longShortRatio != null && longShortRatio >= 1) longScore += 0.5;
    if (oiDelta4h > 0 && longShortRatio != null && longShortRatio <= 1) shortScore += 0.5;
  }

  if (longScore >= 1.5 && longScore > shortScore) return "long_squeeze_risk";
  if (shortScore >= 1.5 && shortScore > longScore) return "short_squeeze_risk";
  if (longScore > 0 || shortScore > 0) return "balanced";
  return "unknown";
}

async function fetchOiDeltas(symbol: string): Promise<{ oiDelta1h: number | null; oiDelta4h: number | null }> {
  try {
    const url = new URL(`${BINANCE_FUTURES_BASE}/futures/data/openInterestHist`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("period", "1h");
    url.searchParams.set("limit", "8");
    const response = await fetchWithTimeout(url, {}, { timeoutMs: 8000, retries: 0 });
    if (!response.ok) return { oiDelta1h: null, oiDelta4h: null };

    const data = await response.json();
    if (!Array.isArray(data) || data.length < 2) return { oiDelta1h: null, oiDelta4h: null };

    const values = data
      .map((row) => Number((row as Record<string, unknown>).sumOpenInterest))
      .filter(Number.isFinite);
    if (values.length < 2) return { oiDelta1h: null, oiDelta4h: null };

    const latest = values[values.length - 1];
    const idx1h = Math.max(0, values.length - 2);
    const idx4h = Math.max(0, values.length - 5);
    const v1h = values[idx1h];
    const v4h = values[idx4h];

    const oiDelta1h = v1h > 0 ? ((latest - v1h) / v1h) * 100 : null;
    const oiDelta4h = v4h > 0 ? ((latest - v4h) / v4h) * 100 : null;

    return {
      oiDelta1h: oiDelta1h != null ? Number(oiDelta1h.toFixed(3)) : null,
      oiDelta4h: oiDelta4h != null ? Number(oiDelta4h.toFixed(3)) : null,
    };
  } catch {
    return { oiDelta1h: null, oiDelta4h: null };
  }
}

type CoinglassCluster = { price: number; side: "long" | "short"; strength: number };

async function fetchCoinglassClusters(symbol: string): Promise<CoinglassCluster[] | null> {
  const apiKey = Deno.env.get("COINGLASS_API_KEY");
  if (!apiKey) return null;

  try {
    const pair = symbol.endsWith("USDT") ? symbol : `${symbol}USDT`;
    const url = new URL(`${COINGLASS_BASE}/api/futures/liquidation/heatmap/model2`);
    url.searchParams.set("symbol", pair);
    url.searchParams.set("range", "7d");

    const response = await fetchWithTimeout(url, {
      headers: {
        "CG-API-KEY": apiKey,
        accept: "application/json",
      },
    }, { timeoutMs: 10000, retries: 0 });

    if (!response.ok) return null;

    const payload = await response.json();
    const rows = (payload as Record<string, unknown>)?.data;
    if (!Array.isArray(rows)) return null;

    const clusters: CoinglassCluster[] = [];
    for (const row of rows.slice(0, 40)) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const price = Number(record.price ?? record.liqPrice ?? record.x);
      const amount = Number(record.amount ?? record.value ?? record.y ?? record.liquidationAmount);
      const sideRaw = String(record.side ?? record.type ?? "").toLowerCase();
      if (!Number.isFinite(price) || price <= 0) continue;

      let side: "long" | "short" | null = null;
      if (sideRaw.includes("long") || sideRaw === "buy") side = "long";
      else if (sideRaw.includes("short") || sideRaw === "sell") side = "short";
      else side = amount >= 0 ? "short" : "long";

      const strength = Number.isFinite(amount) ? clamp(Math.abs(amount) / 1e8, 0.05, 1) : 0.25;
      clusters.push({ price: round6(price), side, strength: round6(strength) });
    }

    return clusters.length ? clusters.sort((a, b) => b.strength - a.strength).slice(0, 12) : null;
  } catch {
    return null;
  }
}

/**
 * Liquidation-pressure context. Follows fetchFuturesContext degradation: never throws,
 * spot-only symbols return available:false.
 */
export async function fetchLiquidationContext(
  symbol: string,
  futuresContext: FuturesContext,
  swingHigh: number | null,
  swingLow: number | null,
): Promise<LiquidationContext> {
  if (!futuresContext.available) return { ...EMPTY };

  try {
    const [oiDeltas, coinglassClusters] = await Promise.all([
      fetchOiDeltas(symbol),
      fetchCoinglassClusters(symbol),
    ]);

    const markBasisPct = futuresContext.markBasisPct;
    const fundingRate = futuresContext.fundingRate;
    const longShortRatio = futuresContext.longShortRatio;
    const oiDelta4h = oiDeltas.oiDelta4h;

    const estimated = estimateLiquidationClusters(
      swingHigh,
      swingLow,
      oiDelta4h,
      longShortRatio,
    );

    const estClusters = coinglassClusters ?? estimated;
    const source: LiquidationContext["source"] = coinglassClusters ? "coinglass" : "estimate";
    const pressure = derivePressure(fundingRate, longShortRatio, oiDelta4h);

    const hasSignal = estClusters.length > 0
      || oiDeltas.oiDelta1h != null
      || oiDeltas.oiDelta4h != null
      || markBasisPct != null
      || fundingRate != null
      || longShortRatio != null;

    return {
      available: hasSignal,
      oiDelta1h: oiDeltas.oiDelta1h,
      oiDelta4h: oiDeltas.oiDelta4h,
      markBasisPct,
      fundingRate,
      longShortRatio,
      pressure,
      estClusters,
      source,
    };
  } catch {
    return { ...EMPTY };
  }
}
