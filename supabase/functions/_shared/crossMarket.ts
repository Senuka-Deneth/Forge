/**
 * Cross-market context: how the traded symbol relates to BTC.
 *
 * Most altcoin price action is BTC beta, not idiosyncratic signal — when BTC breaks down, high-beta
 * alts tend to break down harder regardless of how clean their own chart looks. A trader analyzing
 * ETHUSDT or SOLUSDT in isolation is missing the single biggest risk factor in the trade. This module
 * measures that relationship (correlation, beta) and BTC's own regime/trend, so `applyRegimeGating`
 * can refuse — or discount — an alt long into a BTC breakdown, the same way it already refuses a
 * setup when multiple higher timeframes disagree.
 */

import { type Candle, enrichCandles } from "./indicators.ts";
import { derivePrimaryTrend } from "./marketStructure.ts";
import { deriveRegime, type MarketRegime } from "./regime.ts";
import { fetchBinanceKlines } from "./binance.ts";
import { sliceClosedCandles } from "./candles.ts";

export type DominanceDirection = "btc_leading" | "alts_leading" | "neutral";

export type DominanceProxy = {
  /** BTC close / ETH close, latest bar. Not true market-cap dominance — Binance's public API has
   * no dominance endpoint, so this proxies it from the two largest pairs it does expose. */
  ratio: number | null;
  changePct: number | null;
  direction: DominanceDirection;
};

export type CrossMarketContext = {
  available: boolean;
  /** True when the traded symbol *is* BTC or ETH — cross-market gating does not apply to itself. */
  isBtcOrEth: boolean;
  btcRegime: MarketRegime | null;
  btcTrend: "bullish" | "bearish" | "sideways" | null;
  btcPrice: number | null;
  /** Pearson correlation of log returns against BTC over the sample window, -1..1. */
  correlationToBtc: number | null;
  /** Regression beta of the symbol's returns on BTC's returns. >1 means the symbol amplifies BTC's
   * moves; <1 dampens them. This, not correlation, is what determines how hard a BTC move actually
   * hits the symbol. */
  betaToBtc: number | null;
  sampleSize: number;
  dominance: DominanceProxy;
};

/** Canonical "no cross-market data" value, exported so callers (aiContext.ts's non-network
 * default, tests) never hand-roll the shape and drift when fields are added here. */
export const UNAVAILABLE_CROSS_MARKET_CONTEXT: CrossMarketContext = {
  available: false,
  isBtcOrEth: false,
  btcRegime: null,
  btcTrend: null,
  btcPrice: null,
  correlationToBtc: null,
  betaToBtc: null,
  sampleSize: 0,
  dominance: { ratio: null, changePct: null, direction: "neutral" },
};

function round6(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(6));
}

/** Log returns from a close series. One shorter than the input, as usual. */
export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev > 0 && curr > 0) out.push(Math.log(curr / prev));
  }
  return out;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/**
 * Whether a series' variance is small enough, relative to the series' own scale, to treat as
 * constant. A strict `variance <= 0` check is not sufficient: most log-return inputs are decimals
 * like 0.05 that binary floating point cannot represent exactly, so summing several identical
 * literals leaves a residual variance around 1e-18 — nonzero, but pure representation noise. Left
 * unguarded, that noise becomes the denominator of a ratio (correlation or beta), and dividing one
 * near-zero noise term by another produces a finite-looking number that is actually meaningless —
 * the same failure mode as an unguarded variance-ratio calculation on a constant series.
 */
function varianceIsNegligible(values: number[], variance: number, epsilon = 1e-9): boolean {
  if (variance <= 0) return true;
  const scale = mean(values.map(Math.abs)) || 1;
  return Math.sqrt(variance) < scale * epsilon;
}

/** Pearson correlation coefficient of two equal-length series. Null if either has no real variance. */
export function pearsonCorrelation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = mean(x);
  const my = mean(y);

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varianceIsNegligible(x, varX) || varianceIsNegligible(y, varY)) return null;
  return cov / Math.sqrt(varX * varY);
}

/** Regression beta of `a` on `b`: cov(a,b) / var(b). Null if `b` has no real variance to regress on. */
export function regressionBeta(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = mean(x);
  const my = mean(y);

  let cov = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (x[i] - mx) * (y[i] - my);
    varY += (y[i] - my) ** 2;
  }
  if (varianceIsNegligible(y, varY)) return null;
  return cov / varY;
}

/**
 * Align two candle series by timestamp and return their paired closes, oldest first.
 *
 * Klines for two different symbols on the same interval are not guaranteed to share every
 * timestamp (a new listing, an exchange outage, or differing history length can all produce gaps),
 * so pairing by array index would silently misalign the two series. Pairing by time is the only
 * correct approach.
 */
export function alignClosesByTime(
  a: Array<{ time: number; close: number }>,
  b: Array<{ time: number; close: number }>,
): { a: number[]; b: number[] } {
  const bByTime = new Map(b.map((c) => [c.time, c.close]));
  const alignedA: number[] = [];
  const alignedB: number[] = [];
  for (const candle of a) {
    const match = bByTime.get(candle.time);
    if (match == null) continue;
    alignedA.push(candle.close);
    alignedB.push(match);
  }
  return { a: alignedA, b: alignedB };
}

function computeDominance(btcCloses: number[], ethCloses: number[]): DominanceProxy {
  const n = Math.min(btcCloses.length, ethCloses.length);
  if (n < 2) return { ratio: null, changePct: null, direction: "neutral" };

  const ratios: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (ethCloses[i] > 0) ratios.push(btcCloses[i] / ethCloses[i]);
  }
  if (ratios.length < 2) return { ratio: null, changePct: null, direction: "neutral" };

  const latest = ratios[ratios.length - 1];
  const first = ratios[0];
  const changePct = first > 0 ? ((latest - first) / first) * 100 : null;

  // A move under ~0.5% over the window is noise, not a dominance shift.
  let direction: DominanceDirection = "neutral";
  if (changePct != null) {
    if (changePct >= 0.5) direction = "btc_leading";
    else if (changePct <= -0.5) direction = "alts_leading";
  }

  return { ratio: round6(latest), changePct: round6(changePct), direction };
}

/**
 * Build cross-market context from already-fetched candle series (used by the backtest CLI and
 * tests, so the pure alignment/statistics logic never needs a live network call to exercise).
 */
export function buildCrossMarketContext(
  symbol: string,
  symbolCandles: Array<{ time: number; close: number }>,
  btcCandles: Candle[],
  ethCandles: Candle[] | null,
  sampleSize = 100,
): CrossMarketContext {
  const isBtcOrEth = symbol === "BTCUSDT" || symbol === "ETHUSDT";
  if (!btcCandles.length) return { ...UNAVAILABLE_CROSS_MARKET_CONTEXT, isBtcOrEth };

  const btcPrimaryTrend = derivePrimaryTrend(
    btcCandles[btcCandles.length - 1]?.close ?? null,
    btcCandles[btcCandles.length - 1]?.ema20 ?? null,
    btcCandles[btcCandles.length - 1]?.ema50 ?? null,
  );
  const btcRegimeInfo = deriveRegime(btcCandles, true);

  if (isBtcOrEth) {
    // Still report BTC's own regime/trend (useful context), just no self-beta.
    return {
      ...UNAVAILABLE_CROSS_MARKET_CONTEXT,
      available: true,
      isBtcOrEth: true,
      btcRegime: btcRegimeInfo.regime,
      btcTrend: btcPrimaryTrend,
      btcPrice: btcCandles[btcCandles.length - 1]?.close ?? null,
    };
  }

  const aligned = alignClosesByTime(symbolCandles, btcCandles);
  const windowA = aligned.a.slice(-sampleSize);
  const windowB = aligned.b.slice(-sampleSize);
  const retA = logReturns(windowA);
  const retB = logReturns(windowB);

  const correlationToBtc = pearsonCorrelation(retA, retB);
  const betaToBtc = regressionBeta(retA, retB);

  const dominance = ethCandles?.length
    ? computeDominance(
      alignClosesByTime(btcCandles, ethCandles).a.slice(-sampleSize),
      alignClosesByTime(btcCandles, ethCandles).b.slice(-sampleSize),
    )
    : { ratio: null, changePct: null, direction: "neutral" as const };

  return {
    available: retA.length >= 10,
    isBtcOrEth: false,
    btcRegime: btcRegimeInfo.regime,
    btcTrend: btcPrimaryTrend,
    btcPrice: btcCandles[btcCandles.length - 1]?.close ?? null,
    correlationToBtc: round6(correlationToBtc),
    betaToBtc: round6(betaToBtc),
    sampleSize: retA.length,
    dominance,
  };
}

/**
 * Fetch and build cross-market context for a live symbol/interval. Never throws — a failed BTC/ETH
 * fetch degrades to `available: false` exactly like the other optional context blocks
 * (futures, liquidation, order book).
 */
export type CrossMarketPrefetch = {
  btc: Candle[];
  eth: Candle[];
};

/** Prefetch BTC + ETH klines once per scan/interval so watchlist symbols share the major-pair fetch. */
export async function fetchBtcEthKlines(
  interval: string,
  limit = 300,
): Promise<CrossMarketPrefetch> {
  const [btcRaw, ethRaw] = await Promise.all([
    fetchBinanceKlines("BTCUSDT", interval, limit),
    fetchBinanceKlines("ETHUSDT", interval, limit),
  ]);
  const btcClosed = sliceClosedCandles(btcRaw, interval);
  const ethClosed = sliceClosedCandles(ethRaw, interval);
  return {
    btc: enrichCandles(btcClosed.length ? btcClosed : btcRaw),
    eth: enrichCandles(ethClosed.length ? ethClosed : ethRaw),
  };
}

export async function fetchCrossMarketContext(
  symbol: string,
  interval: string,
  symbolCandles: Array<{ time: number; close: number }>,
  limit = 300,
  prefetched: CrossMarketPrefetch | null = null,
): Promise<CrossMarketContext> {
  try {
    if (symbol === "BTCUSDT") {
      // BTC's own history doubles as "BTC candles" here — no second fetch needed.
      const selfCandles = enrichCandles(
        symbolCandles.map((c) => ({ ...c, open: c.close, high: c.close, low: c.close, volume: 0 })),
      );
      return buildCrossMarketContext(symbol, symbolCandles, selfCandles, prefetched?.eth ?? null);
    }

    const btcCandles = prefetched?.btc ?? enrichCandles(
      await (async () => {
        const btcRaw = await fetchBinanceKlines("BTCUSDT", interval, limit);
        const closed = sliceClosedCandles(btcRaw, interval);
        return closed.length ? closed : btcRaw;
      })(),
    );
    const ethCandles = prefetched?.eth ?? (
      symbol === "ETHUSDT" ? null : enrichCandles(
        await (async () => {
          const ethRaw = await fetchBinanceKlines("ETHUSDT", interval, limit);
          const closed = sliceClosedCandles(ethRaw, interval);
          return closed.length ? closed : ethRaw;
        })(),
      )
    );

    return buildCrossMarketContext(
      symbol,
      symbolCandles,
      btcCandles,
      ethCandles,
    );
  } catch {
    return { ...UNAVAILABLE_CROSS_MARKET_CONTEXT, isBtcOrEth: symbol === "BTCUSDT" || symbol === "ETHUSDT" };
  }
}

export type CrossMarketGateResult = {
  bias: "long" | "short" | "neutral";
  confidence: number;
  /** True when cross-market context was the reason bias or confidence changed, for the rationale. */
  applied: boolean;
  reason: string | null;
};

/** Beta above this is "amplifies BTC enough to matter" — see calibration note in crossMarket_test.ts. */
export const HIGH_BETA_THRESHOLD = 0.7;

/**
 * Apply BTC-beta gating to a proposed bias.
 *
 * Mirrors the shape of the existing HTF-contradiction rule in applyRegimeGating: a hard block when
 * the contradiction is strong and unambiguous (BTC itself trending against the trade), a softer
 * confidence haircut when it is present but weaker. Beta gating is skipped entirely for BTC/ETH
 * themselves and for low-beta symbols, where BTC's own regime is not a meaningful risk factor.
 */
export function applyCrossMarketGating(
  bias: "long" | "short" | "neutral",
  confidence: number,
  crossMarket: CrossMarketContext,
  betaThreshold = HIGH_BETA_THRESHOLD,
): CrossMarketGateResult {
  if (bias === "neutral" || crossMarket.isBtcOrEth || !crossMarket.available) {
    return { bias, confidence, applied: false, reason: null };
  }
  if (crossMarket.betaToBtc == null || crossMarket.betaToBtc < betaThreshold) {
    return { bias, confidence, applied: false, reason: null };
  }
  if (crossMarket.btcTrend == null) {
    return { bias, confidence, applied: false, reason: null };
  }

  const expected = bias === "long" ? "bullish" : "bearish";
  const contradicted = crossMarket.btcTrend !== expected && crossMarket.btcTrend !== "sideways";
  if (!contradicted) {
    return { bias, confidence, applied: false, reason: null };
  }

  const betaLabel = crossMarket.betaToBtc.toFixed(2);
  if (crossMarket.btcRegime === "trending") {
    return {
      bias: "neutral",
      confidence,
      applied: true,
      reason: `BTC is trending ${crossMarket.btcTrend} against this ${bias} and the symbol's beta to BTC is ${betaLabel} — the trade is effectively a BTC bet in disguise.`,
    };
  }

  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return {
    bias,
    confidence: clamp(confidence - 12),
    applied: true,
    reason: `BTC trend (${crossMarket.btcTrend}) contradicts this ${bias} at beta ${betaLabel}; confidence reduced since BTC is not itself trending.`,
  };
}
