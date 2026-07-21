import type { Candle } from "./indicators.ts";

export type MarketRegime = "trending" | "ranging" | "volatile_chop";

export type RegimeResult = {
  regime: MarketRegime;
  adx: number | null;
  atrPctile: number | null;
  bbwPctile: number | null;
  htfAligned: boolean;
};

function percentileRank(value: number, series: number[]): number {
  if (!series.length) return 50;
  const sorted = [...series].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < value).length;
  return (below / sorted.length) * 100;
}

export function deriveRegime(
  candles: Candle[],
  htfAligned = true,
): RegimeResult {
  const window = candles.slice(-200);
  const latest = window[window.length - 1];
  const adxSeries = window.map((c) => c.adx14).filter((v): v is number => v != null);
  const atrSeries = window.map((c) => c.atrPct).filter((v): v is number => v != null);
  const bbwSeries = window.map((c) => c.bbBandwidth).filter((v): v is number => v != null);

  const adx = latest?.adx14 ?? null;
  const prevAdx = window.length >= 2 ? window[window.length - 2]?.adx14 ?? null : null;
  const atrPctile = latest?.atrPct != null && atrSeries.length
    ? percentileRank(latest.atrPct, atrSeries)
    : null;
  const bbwPctile = latest?.bbBandwidth != null && bbwSeries.length
    ? percentileRank(latest.bbBandwidth, bbwSeries)
    : null;

  let regime: MarketRegime = "ranging";
  if (adx != null && adx >= 25 && prevAdx != null && adx >= prevAdx) {
    regime = htfAligned ? "trending" : "ranging";
  } else if (adx != null && adx < 20 && bbwPctile != null && bbwPctile < 30) {
    regime = "ranging";
  } else if (atrPctile != null && atrPctile > 80 && adx != null && adx < 25) {
    regime = "volatile_chop";
  } else if (adx != null && adx >= 25) {
    regime = htfAligned ? "trending" : "ranging";
  }

  return { regime, adx, atrPctile, bbwPctile, htfAligned };
}
