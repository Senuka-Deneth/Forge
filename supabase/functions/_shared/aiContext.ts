import type { Candle as IndicatorCandle } from "./indicators.ts";
import {
  EMPTY_ORDER_BOOK,
  type FuturesContext,
  type OrderBookImbalance,
  type Ticker24hr,
  fetchBinanceKlines,
  fetchFuturesContext,
  fetchOrderBookImbalance,
  fetchTicker24hr,
  getConfluenceTimeframes,
} from "./binance.ts";
import { sliceClosedCandles } from "./candles.ts";
import {
  buildMarketStructure,
  computeSignalAgreement,
  derivePrimaryTrend,
  detectMacdDivergence,
  type SrZone,
} from "./marketStructure.ts";
import { classifyMarketStructure } from "./indicators.ts";
import {
  buildPivotDataFromHtf,
  fetchBinanceHtfKlines,
  getBinanceIntervalForPeriod,
  getHtfFetchLimit,
  resolvePivotPeriod,
  type PivotDataResponse,
} from "./pivotPoints.ts";
import { gatherMarketFeatures, type MarketFeatures } from "./features.ts";
import { enrichCandles } from "./indicators.ts";
import { deriveRegime, type MarketRegime } from "./regime.ts";
import { fetchLiquidationContext, type LiquidationContext } from "./liquidation.ts";

export const PRIMARY_CANDLE_LIMIT = 500;
export const MTF_CANDLE_LIMIT = 150;
export const SERIES_WINDOW = 12;
const DAILY_PLUS_INTERVALS = new Set(["1d", "3d", "1w", "1M"]);

export type MtfRead = {
  interval: string;
  trend: "bullish" | "bearish" | "mixed";
  rsi: number | null;
};

export type MarketContext = {
  symbol: string;
  interval: string;
  price: number;
  latest: IndicatorCandle;
  series: {
    closes: number[];
    rsi: Array<number | null>;
    macdHist: Array<number | null>;
    atrPct: Array<number | null>;
    obv: number[];
    cvd: Array<number | null>;
    volume: number[];
  };
  ticker24h: Ticker24hr;
  volatilityState: "low" | "medium" | "high";
  trendStrength: number;
  regime: MarketRegime;
  htfBias: "bullish" | "bearish" | "mixed";
  vwapRelation: "above" | "below" | "at" | "unknown";
  swingHighs: Array<{ index: number; price: number; time?: number }>;
  swingLows: Array<{ index: number; price: number; time?: number }>;
  structure: {
    breakOfStructure: "bullish" | "bearish" | "none";
    trendBias: "uptrend" | "downtrend" | "ranging";
    lastSwingHighLabel: string;
    lastSwingLowLabel: string;
    supportZones: SrZone[];
    resistanceZones: SrZone[];
  };
  rsiDivergence: { type: string; description: string };
  macdDivergence: { type: string; description: string };
  orderFlow: OrderBookImbalance;
  cvdTrend: "buying" | "selling" | "neutral";
  futures: FuturesContext;
  liquidation: LiquidationContext;
  pivots: PivotDataResponse;
  nearestSupport: { label: string; value: number } | null;
  nearestResistance: { label: string; value: number } | null;
  mtf: MtfRead[];
  confluenceScore: number;
  signalAgreement: number;
  confluenceBreakdown: {
    mtf_confluence: number;
    mtf_sample_size: number;
    signal_agreement: number;
  };
  features: MarketFeatures;
};

export type BuildContextOptions = {
  orderFlow?: OrderBookImbalance | null;
  futures?: FuturesContext | null;
  liquidation?: LiquidationContext | null;
  ticker24h?: Ticker24hr | null;
  mtfDepthCandles?: Array<{ interval: string; candles: IndicatorCandle[] }>;
  rawPrimary?: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
};

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function seriesTrend(alignment: "bullish" | "bearish" | "mixed", macdHist: number | null): "bullish" | "bearish" | "mixed" {
  if (alignment !== "mixed") return alignment;
  if (macdHist != null) return macdHist > 0 ? "bullish" : macdHist < 0 ? "bearish" : "mixed";
  return "mixed";
}

function readTrendFromCandles(candles: IndicatorCandle[]): MtfRead["trend"] {
  const latest = candles[candles.length - 1];
  if (!latest) return "mixed";
  const { close, ema20, ema50, macdHist } = latest;
  let alignment: "bullish" | "bearish" | "mixed" = "mixed";
  if (ema20 != null && ema50 != null) {
    if (close > ema20 && ema20 > ema50) alignment = "bullish";
    else if (close < ema20 && ema20 < ema50) alignment = "bearish";
  }
  return seriesTrend(alignment, macdHist);
}

function majorityHtfBias(mtf: MtfRead[]): "bullish" | "bearish" | "mixed" {
  const votes = { bullish: 0, bearish: 0, mixed: 0 };
  for (const read of mtf) votes[read.trend] += 1;
  if (votes.bullish > votes.bearish && votes.bullish > votes.mixed) return "bullish";
  if (votes.bearish > votes.bullish && votes.bearish > votes.mixed) return "bearish";
  return "mixed";
}

function volatilityStateFromAtr(atrPctSeries: Array<number | null>): "low" | "medium" | "high" {
  const recent = atrPctSeries.filter((v): v is number => v != null).slice(-50);
  if (!recent.length) return "medium";
  const current = recent[recent.length - 1];
  const sorted = [...recent].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median === 0) return "medium";
  const ratio = current / median;
  if (ratio >= 1.3) return "high";
  if (ratio <= 0.7) return "low";
  return "medium";
}

function trendStrengthFromAdx(adx: number | null): number {
  if (adx == null) return 35;
  return clamp(Math.round(adx * 2), 0, 100);
}

function nearestZones(price: number, zones: SrZone[], count = 3): SrZone[] {
  return [...zones]
    .sort((a, b) => Math.abs(a.mid - price) - Math.abs(b.mid - price))
    .slice(0, count);
}

function labelSwing(points: Array<{ price: number }>, kind: "high" | "low"): string {
  if (points.length < 2) return kind === "high" ? "HH" : "LL";
  const prev = points[points.length - 2].price;
  const last = points[points.length - 1].price;
  if (kind === "high") return last > prev ? "HH" : "LH";
  return last > prev ? "HL" : "LL";
}

function divergenceToLegacy(type: "bullish" | "bearish" | "none"): { type: string; description: string } {
  if (type === "bullish") return { type: "bullish", description: "Filtered RSI bullish divergence detected." };
  if (type === "bearish") return { type: "bearish", description: "Filtered RSI bearish divergence detected." };
  return { type: "none", description: "No significant RSI divergence." };
}

function macdDivergenceToLegacy(type: "bullish" | "bearish" | "none"): { type: string; description: string } {
  if (type === "bullish") return { type: "bullish", description: "Filtered MACD bullish divergence detected." };
  if (type === "bearish") return { type: "bearish", description: "Filtered MACD bearish divergence detected." };
  return { type: "none", description: "No significant MACD divergence." };
}

const EMPTY_TICKER: Ticker24hr = {
  priceChangePercent: null,
  volume: null,
  quoteVolume: null,
  highPrice: null,
  lowPrice: null,
};

const EMPTY_ORDER_FLOW: OrderBookImbalance = EMPTY_ORDER_BOOK;
const EMPTY_FUTURES: FuturesContext = {
  available: false,
  fundingRate: null,
  nextFundingTime: null,
  openInterest: null,
  longShortRatio: null,
  longAccountPct: null,
  shortAccountPct: null,
  markPrice: null,
  indexPrice: null,
  markBasisPct: null,
};

const EMPTY_LIQUIDATION: LiquidationContext = {
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

export async function buildContextFromCandles(
  symbol: string,
  interval: string,
  analysisCandles: IndicatorCandle[],
  opts: BuildContextOptions = {},
): Promise<MarketContext> {
  if (!analysisCandles.length) throw new Error("Not enough closed candles for analysis.");

  const primaryCandles = enrichCandles(analysisCandles.map((c) => ({ ...c })));
  const latest = primaryCandles[primaryCandles.length - 1];
  const rawPrimary = opts.rawPrimary ?? analysisCandles;

  const orderFlow = opts.orderFlow ?? EMPTY_ORDER_FLOW;
  const futures = opts.futures ?? EMPTY_FUTURES;
  const liquidation = opts.liquidation ?? EMPTY_LIQUIDATION;
  const ticker24h = opts.ticker24h ?? EMPTY_TICKER;

  const price = ticker24h.highPrice != null && ticker24h.lowPrice != null
    ? (rawPrimary[rawPrimary.length - 1]?.close ?? latest.close)
    : latest.close;

  const period = resolvePivotPeriod(interval, "auto");
  const binanceInterval = getBinanceIntervalForPeriod(period);
  const htfCandles = await fetchBinanceHtfKlines(symbol, binanceInterval, getHtfFetchLimit(15, period));
  const pivotPayload = buildPivotDataFromHtf({
    htfCandles,
    chartCandles: rawPrimary.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
    chartInterval: interval,
    symbol,
    chartPrefs: { pivotType: "traditional", pivotsBack: 15 },
  });
  if (!pivotPayload) throw new Error("Unable to compute pivot data.");

  const mtfResults = await Promise.all(
    getConfluenceTimeframes(interval).map(async (tf) => {
      try {
        const raw = await fetchBinanceKlines(symbol, tf, MTF_CANDLE_LIMIT);
        const closed = sliceClosedCandles(raw, tf);
        const candles = enrichCandles((closed.length ? closed : raw.slice(0, -1)).map((c) => ({ ...c })));
        return {
          interval: tf,
          trend: readTrendFromCandles(candles),
          rsi: candles[candles.length - 1]?.rsi14 ?? null,
          candles,
        };
      } catch {
        return { interval: tf, trend: "mixed" as const, rsi: null, candles: [] as IndicatorCandle[] };
      }
    }),
  );

  const mktStruct = buildMarketStructure(
    primaryCandles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
    primaryCandles.map((c) => c.rsi14),
  );

  const supportZones = nearestZones(price, mktStruct.srZones.supports);
  const resistanceZones = nearestZones(price, mktStruct.srZones.resistances);

  const classicAnalysis = pivotPayload.classic.analysis;
  const primaryTrend = derivePrimaryTrend(price, latest.ema20, latest.ema50);
  const signalAgreement = computeSignalAgreement({
    price,
    ema20: latest.ema20,
    ema50: latest.ema50,
    rsi: latest.rsi14,
    macdLine: latest.macd,
    signalLine: latest.macdSignal,
    primaryTrend,
    pivotSessionBias: classicAnalysis.bias,
    hasSupportZone: supportZones.length > 0,
    hasResistanceZone: resistanceZones.length > 0,
    divergence: mktStruct.divergence,
    atInflectionPoint: classicAnalysis.atInflectionPoint,
  });

  const mtfReads: MtfRead[] = mtfResults.map(({ interval: tf, trend, rsi }) => ({ interval: tf, trend, rsi }));
  const htfBias = majorityHtfBias(mtfReads);
  const primaryTrendRead = readTrendFromCandles(primaryCandles);
  const agreeing = mtfReads.filter((r) => r.trend === primaryTrendRead).length;
  const mtfConfluence = mtfReads.length ? Math.round((agreeing / mtfReads.length) * 100) : 50;
  const confluenceScore = Math.round((mtfConfluence + signalAgreement) / 2);

  const recentCvd = primaryCandles.slice(-10).map((c) => c.cvd).filter((v): v is number => v != null);
  const cvdTrend: MarketContext["cvdTrend"] = recentCvd.length >= 2
    ? (recentCvd[recentCvd.length - 1] > recentCvd[0] ? "buying" : recentCvd[recentCvd.length - 1] < recentCvd[0] ? "selling" : "neutral")
    : "neutral";

  const atrPctSeries = primaryCandles.map((c) => c.atrPct);
  const adxSeries = primaryCandles.map((c) => c.adx14);
  const latestAdx = adxSeries[adxSeries.length - 1] ?? null;
  const regimeInfo = deriveRegime(primaryCandles, htfBias !== "mixed");

  if (DAILY_PLUS_INTERVALS.has(interval)) {
    latest.vwap = null;
  }

  let vwapRelation: MarketContext["vwapRelation"] = "unknown";
  if (latest.vwap != null) {
    const tol = Math.abs(price) * 0.0005;
    vwapRelation = Math.abs(price - latest.vwap) <= tol ? "at" : price > latest.vwap ? "above" : "below";
  }

  const rsiDiv = divergenceToLegacy(mktStruct.divergence);
  const macdDivType = detectMacdDivergence(
    primaryCandles,
    primaryCandles.map((c) => c.macd),
  );
  const macdDiv = macdDivergenceToLegacy(macdDivType);

  const classified = classifyMarketStructure(
    primaryCandles,
    mktStruct.swingHighs.map((s) => ({ index: s.index, time: s.time ?? 0, price: s.price })),
    mktStruct.swingLows.map((s) => ({ index: s.index, time: s.time ?? 0, price: s.price })),
  );

  const mtfDepthCandles = opts.mtfDepthCandles ?? mtfResults
    .filter((r) => r.candles.length)
    .map((r) => ({ interval: r.interval, candles: r.candles }));
  const enrichedFeatures = await gatherMarketFeatures(symbol, primaryCandles, mtfDepthCandles);

  return {
    symbol,
    interval,
    price,
    latest,
    series: {
      closes: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.close),
      rsi: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.rsi14),
      macdHist: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.macdHist),
      atrPct: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.atrPct),
      obv: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.obv ?? 0),
      cvd: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.cvd),
      volume: primaryCandles.slice(-SERIES_WINDOW).map((c) => c.volume),
    },
    ticker24h,
    volatilityState: volatilityStateFromAtr(atrPctSeries),
    trendStrength: trendStrengthFromAdx(latestAdx),
    regime: regimeInfo.regime,
    htfBias,
    vwapRelation,
    swingHighs: mktStruct.swingHighs.slice(-5),
    swingLows: mktStruct.swingLows.slice(-5),
    structure: {
      breakOfStructure: classified.breakOfStructure,
      trendBias: classified.trendBias,
      lastSwingHighLabel: classified.lastSwingHighLabel ?? labelSwing(mktStruct.swingHighs, "high"),
      lastSwingLowLabel: classified.lastSwingLowLabel ?? labelSwing(mktStruct.swingLows, "low"),
      supportZones,
      resistanceZones,
    },
    rsiDivergence: rsiDiv,
    macdDivergence: macdDiv,
    orderFlow,
    cvdTrend,
    futures,
    liquidation,
    pivots: pivotPayload,
    nearestSupport: classicAnalysis.nearestSupport,
    nearestResistance: classicAnalysis.nearestResistance,
    mtf: mtfReads,
    confluenceScore,
    signalAgreement,
    confluenceBreakdown: {
      mtf_confluence: mtfConfluence,
      mtf_sample_size: mtfReads.length,
      signal_agreement: signalAgreement,
    },
    features: enrichedFeatures,
  };
}

export async function gatherMarketContext(symbol: string, interval: string): Promise<MarketContext> {
  const rawPrimary = await fetchBinanceKlines(symbol, interval, PRIMARY_CANDLE_LIMIT);
  if (!rawPrimary.length) throw new Error("No candle data returned for this symbol/interval.");

  const closedPrimary = sliceClosedCandles(rawPrimary, interval);
  const analysisCandles = closedPrimary.length ? closedPrimary : rawPrimary.slice(0, -1);

  const [orderFlow, futures, ticker24h] = await Promise.all([
    fetchOrderBookImbalance(symbol),
    fetchFuturesContext(symbol),
    fetchTicker24hr(symbol),
  ]);

  const ctx = await buildContextFromCandles(symbol, interval, analysisCandles, {
    orderFlow,
    futures,
    ticker24h,
    rawPrimary,
  });

  const latestSwingHigh = ctx.swingHighs[ctx.swingHighs.length - 1]?.price ?? null;
  const latestSwingLow = ctx.swingLows[ctx.swingLows.length - 1]?.price ?? null;
  const liquidation = await fetchLiquidationContext(symbol, futures, latestSwingHigh, latestSwingLow);

  return { ...ctx, liquidation };
}

export function buildUserMessage(ctx: MarketContext): string {
  const c = ctx.pivots.classic.pivots;
  const f = ctx.pivots.fibonacci.pivots;
  const t = ctx.pivots.traditional.pivots;

  const vwapLine = ctx.latest.vwap != null
    ? `- vwap: ${ctx.latest.vwap} (price is ${ctx.vwapRelation} VWAP)`
    : "";

  return `Analyze this market context and return strict JSON only.

MARKET:
- symbol: ${ctx.symbol}
- timeframe: ${ctx.interval}
- price: ${ctx.price}
- 24h_change_pct: ${ctx.ticker24h.priceChangePercent}
- 24h_volume: ${ctx.ticker24h.volume}
- 24h_high: ${ctx.ticker24h.highPrice}
- 24h_low: ${ctx.ticker24h.lowPrice}

REGIME & GATING:
- detected_regime: ${ctx.regime}
- htf_bias: ${ctx.htfBias}
- gating_rules: volatile_chop => wait; ranging => only fade within 0.5×ATR of S/R; if 2+ HTF reads contradict bias => wait; if 1 contradicts => lower confidence ~15pts.

INDICATOR SERIES (last ${SERIES_WINDOW} closed candles, oldest to newest):
- closes: ${JSON.stringify(ctx.series.closes)}
- rsi14: ${JSON.stringify(ctx.series.rsi)}
- macd_histogram: ${JSON.stringify(ctx.series.macdHist)}
- atr_pct: ${JSON.stringify(ctx.series.atrPct)}
- obv: ${JSON.stringify(ctx.series.obv)}
- cumulative_volume_delta: ${JSON.stringify(ctx.series.cvd)}
- volume: ${JSON.stringify(ctx.series.volume)}

LATEST INDICATORS (last closed candle):
- ema20: ${ctx.latest.ema20}
- ema50: ${ctx.latest.ema50}
- macd: ${JSON.stringify({ macd: ctx.latest.macd, signal: ctx.latest.macdSignal, histogram: ctx.latest.macdHist })}
- bollinger: ${JSON.stringify({ upper: ctx.latest.bbUpper, middle: ctx.latest.bbMiddle, lower: ctx.latest.bbLower, percentB: ctx.latest.bbPercentB, bandwidth: ctx.latest.bbBandwidth })}
${vwapLine ? `${vwapLine}\n` : ""}- adx14: ${ctx.latest.adx14} (+DI ${ctx.latest.plusDI14} / -DI ${ctx.latest.minusDI14})
- relative_volume: ${ctx.latest.relativeVolume}
- volatility_state (ATR vs its recent median): ${ctx.volatilityState}
- adx_trend_strength_score: ${ctx.trendStrength}

MARKET STRUCTURE (prominence-filtered swings + ATR-clustered zones):
- swing_highs: ${JSON.stringify(ctx.swingHighs.map((s) => s.price))}
- swing_lows: ${JSON.stringify(ctx.swingLows.map((s) => s.price))}
- nearest_support_zones: ${JSON.stringify(ctx.structure.supportZones)}
- nearest_resistance_zones: ${JSON.stringify(ctx.structure.resistanceZones)}
- last_swing_high_label: ${ctx.structure.lastSwingHighLabel}
- last_swing_low_label: ${ctx.structure.lastSwingLowLabel}
- break_of_structure: ${ctx.structure.breakOfStructure}
- trend_bias: ${ctx.structure.trendBias}
- rsi_divergence: ${JSON.stringify(ctx.rsiDivergence)}
- macd_divergence: ${JSON.stringify(ctx.macdDivergence)}
- nearest_support: ${JSON.stringify(ctx.nearestSupport)}
- nearest_resistance: ${JSON.stringify(ctx.nearestResistance)}

ORDER FLOW:
- order_book_imbalance (-1 sell-heavy to +1 buy-heavy, within 1% of mid, null if unavailable): ${ctx.orderFlow.obi}
- cumulative_volume_delta_trend: ${ctx.cvdTrend}

FUTURES POSITIONING (null fields mean no futures market / unavailable):
- available: ${ctx.futures.available}
- funding_rate: ${ctx.futures.fundingRate}
- open_interest: ${ctx.futures.openInterest}
- long_short_account_ratio: ${ctx.futures.longShortRatio}
- mark_price: ${ctx.futures.markPrice}
- index_price: ${ctx.futures.indexPrice}
- mark_basis_pct: ${ctx.futures.markBasisPct}
- oi_history: ${JSON.stringify(ctx.features.oi)}
- funding_signal: ${JSON.stringify(ctx.features.funding)}
- taker_buy_sell_ratio: ${JSON.stringify(ctx.features.takerRatio)}

LIQUIDATION PRESSURE (estimated model output — not measured on-chain; do not over-weight):
- available: ${ctx.liquidation.available}
- source: ${ctx.liquidation.source}
- oi_delta_1h_pct: ${ctx.liquidation.oiDelta1h}
- oi_delta_4h_pct: ${ctx.liquidation.oiDelta4h}
- mark_basis_pct: ${ctx.liquidation.markBasisPct}
- funding_rate: ${ctx.liquidation.fundingRate}
- long_short_ratio: ${ctx.liquidation.longShortRatio}
- pressure: ${ctx.liquidation.pressure}
- estimated_clusters: ${JSON.stringify(ctx.liquidation.estClusters)}

VOLUME PROFILE (from last ${PRIMARY_CANDLE_LIMIT} closed candles):
${JSON.stringify(ctx.features.volumeProfile)}

MULTI-TIMEFRAME:
- reads: ${JSON.stringify(ctx.mtf)}
- mtf_depth (last 5 closed RSI/MACD-hist per HTF): ${JSON.stringify(ctx.features.mtfDepth)}
- confluence_score_pct (MTF+signal blend, NOT a probability): ${ctx.confluenceScore}
- confluence_breakdown: ${JSON.stringify(ctx.confluenceBreakdown)}
- signal_agreement_score (deterministic, not probability): ${ctx.signalAgreement}

PIVOTS (native HTF — classic / fibonacci / traditional):
${JSON.stringify({ classic: c, fibonacci: f, traditional: t })}
PIVOT_ANALYSIS: ${JSON.stringify(ctx.pivots.classic.analysis)}`;
}
