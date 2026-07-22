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
import { intervalDurationMs } from "./candles.ts";
import {
  calculateChandelierExit,
  calculateDonchian,
  calculateIchimoku,
  calculateKeltnerChannels,
  calculatePersistence,
  calculateRealizedVolatility,
  calculateSqueeze,
  calculateStochRsi,
  calculateSupertrend,
  type ChandelierExit,
  type DonchianChannels,
  type IchimokuResult,
  type PersistenceResult,
  type RealizedVolatility,
  type SqueezeResult,
  type StochRsiResult,
  type SupertrendResult,
} from "./volatility.ts";
import {
  buildAnchoredVwaps,
  classifyVwapRelation,
  type AnchoredVwap,
  type VwapRelation,
} from "./vwap.ts";
import { buildLiquidityMap, type LiquidityMap } from "./liquidityMap.ts";
import {
  buildVolumeProfileResult,
  classifyValueAreaRelation,
  type ValueAreaRelation,
  type VolumeProfileResult,
} from "./volumeProfile.ts";
import {
  fetchCrossMarketContext,
  UNAVAILABLE_CROSS_MARKET_CONTEXT,
  type CrossMarketContext,
} from "./crossMarket.ts";
import {
  checkEventBlackout,
  computeFundingWindow,
  computeSessionRanges,
  findLatestCmeGap,
  sessionRangesForPrompt,
  type BlackoutCheck,
  type CmeGap,
  type FundingWindow,
  type SessionRange,
} from "./sessions.ts";
import {
  buildConfluenceMap,
  nearestConfluenceClusters,
  topConfluenceClusters,
  type ConfluenceCluster,
  type LevelInput,
} from "./confluence.ts";

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

  // --- Phase 1/2 additions: deeper indicators, cross-market context, confluence ---

  volatility: {
    keltner: { upper: number | null; middle: number | null; lower: number | null };
    squeeze: SqueezeResult["latest"];
    stochRsi: StochRsiResult["latest"];
    supertrend: SupertrendResult["latest"];
    donchian: DonchianChannels["latest"];
    ichimoku: IchimokuResult["latest"];
    chandelier: ChandelierExit["latest"];
    realizedVol: RealizedVolatility;
    persistence: PersistenceResult;
  };
  /** Auto-anchored VWAPs (swing high / swing low / volume spike), latest snapshot only — the full
   * per-bar series is chart-only data and would bloat the prompt for no analytical benefit. */
  anchoredVwaps: Array<{
    kind: AnchoredVwap["kind"];
    anchorPrice: number | null;
    anchorTime: number | null;
    latest: AnchoredVwap["latest"];
    zScore: number | null;
    relation: VwapRelation | "unknown";
  }>;
  liquidity: LiquidityMap;
  volumeProfileDetail: VolumeProfileResult & { valueAreaRelation: ValueAreaRelation };
  crossMarket: CrossMarketContext;
  sessions: {
    ranges: SessionRange[];
    cmeGap: CmeGap | null;
    fundingWindow: FundingWindow;
    eventBlackout: BlackoutCheck;
  };
  confluence: {
    clusters: ConfluenceCluster[];
    nearestSupport: ConfluenceCluster | null;
    nearestResistance: ConfluenceCluster | null;
  };
};

export type BuildContextOptions = {
  orderFlow?: OrderBookImbalance | null;
  futures?: FuturesContext | null;
  liquidation?: LiquidationContext | null;
  ticker24h?: Ticker24hr | null;
  mtfDepthCandles?: Array<{ interval: string; candles: IndicatorCandle[] }>;
  rawPrimary?: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  /**
   * Cross-market context (BTC beta/regime). Unlike orderFlow/futures/liquidation this is not
   * fetched inside buildContextFromCandles itself — it requires two extra klines calls (BTC + ETH),
   * and buildContextFromCandles is also the function scripts/backtest.ts calls once per simulated
   * bar. Fetching cross-market data unconditionally there would add two API calls per backtest
   * step for no reason the backtest currently uses. gatherMarketContext (the live path) fetches it
   * and passes it in here; callers that don't supply it get `available: false`, which
   * applyCrossMarketGating already treats as "skip this check" — never a silent wrong answer.
   */
  crossMarket?: CrossMarketContext | null;
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

/**
 * Inputs to the unified confluence map, gathered from every level-producing module the context
 * builder already runs. Kept as an explicit parts object (rather than operating on the finished
 * MarketContext) so it stays testable without needing a full context fixture.
 */
export type ConfluenceInputParts = {
  latest: IndicatorCandle;
  pivots: PivotDataResponse;
  /** Full clustered zone lists, not the nearest-3 slice stored on ctx.structure. */
  supportZones: SrZone[];
  resistanceZones: SrZone[];
  donchian: DonchianChannels["latest"];
  ichimoku: IchimokuResult["latest"];
  anchoredVwaps: MarketContext["anchoredVwaps"];
  volumeProfile: VolumeProfileResult;
  liquidity: LiquidityMap;
  sessionRanges: SessionRange[];
  cmeGap: CmeGap | null;
};

function pushPivotLevels(out: LevelInput[], pivots: Record<string, unknown>, source: LevelInput["source"]): void {
  for (const [label, value] of Object.entries(pivots)) {
    if (typeof value === "number" && Number.isFinite(value)) out.push({ price: value, source, label });
  }
}

/** Build the raw level list for buildConfluenceMap from every source the context builder computes. */
export function buildLevelInputsFromContext(parts: ConfluenceInputParts): LevelInput[] {
  const out: LevelInput[] = [];

  pushPivotLevels(out, parts.pivots.classic.pivots as Record<string, unknown>, "pivot_classic");
  pushPivotLevels(out, parts.pivots.fibonacci.pivots as Record<string, unknown>, "pivot_fibonacci");
  pushPivotLevels(out, parts.pivots.traditional.pivots as Record<string, unknown>, "pivot_traditional");

  for (const zone of parts.supportZones) {
    out.push({ price: zone.mid, source: "swing_support", label: `touches=${zone.touches}` });
  }
  for (const zone of parts.resistanceZones) {
    out.push({ price: zone.mid, source: "swing_resistance", label: `touches=${zone.touches}` });
  }

  if (parts.latest.ema20 != null) out.push({ price: parts.latest.ema20, source: "ema20", label: "EMA20" });
  if (parts.latest.ema50 != null) out.push({ price: parts.latest.ema50, source: "ema50", label: "EMA50" });
  if (parts.latest.vwap != null) out.push({ price: parts.latest.vwap, source: "vwap", label: "session VWAP" });

  if (parts.donchian.upper != null) out.push({ price: parts.donchian.upper, source: "donchian_upper", label: "Donchian upper" });
  if (parts.donchian.lower != null) out.push({ price: parts.donchian.lower, source: "donchian_lower", label: "Donchian lower" });

  if (parts.ichimoku.cloudTop != null) out.push({ price: parts.ichimoku.cloudTop, source: "ichimoku_cloud", label: "cloud top" });
  if (parts.ichimoku.cloudBottom != null) out.push({ price: parts.ichimoku.cloudBottom, source: "ichimoku_cloud", label: "cloud bottom" });

  for (const vwap of parts.anchoredVwaps) {
    const bandLabel = `aVWAP (${vwap.kind})`;
    if (vwap.latest.vwap != null) out.push({ price: vwap.latest.vwap, source: "vwap", label: bandLabel });
    if (vwap.latest.upper1 != null) out.push({ price: vwap.latest.upper1, source: "vwap_band", label: `${bandLabel} +1σ` });
    if (vwap.latest.lower1 != null) out.push({ price: vwap.latest.lower1, source: "vwap_band", label: `${bandLabel} -1σ` });
    if (vwap.latest.upper2 != null) out.push({ price: vwap.latest.upper2, source: "vwap_band", label: `${bandLabel} +2σ` });
    if (vwap.latest.lower2 != null) out.push({ price: vwap.latest.lower2, source: "vwap_band", label: `${bandLabel} -2σ` });
  }

  const vp = parts.volumeProfile.composite;
  if (vp.poc != null) out.push({ price: vp.poc, source: "volume_profile_poc", label: "POC" });
  if (vp.vah != null) out.push({ price: vp.vah, source: "volume_profile_va", label: "VAH" });
  if (vp.val != null) out.push({ price: vp.val, source: "volume_profile_va", label: "VAL" });
  for (const node of vp.hvn) out.push({ price: node.price, source: "volume_profile_hvn", label: "HVN" });
  for (const node of vp.lvn) out.push({ price: node.price, source: "volume_profile_lvn", label: "LVN" });
  for (const naked of parts.volumeProfile.nakedPocs) {
    out.push({ price: naked.price, source: "volume_profile_naked_poc", label: `naked POC (${naked.barsAgo}b ago)` });
  }

  for (const gap of parts.liquidity.fairValueGaps) {
    out.push({ price: (gap.top + gap.bottom) / 2, source: "fvg", label: `${gap.direction} FVG ${Math.round(gap.fillProgress * 100)}% filled` });
  }
  for (const block of parts.liquidity.orderBlocks) {
    out.push({ price: (block.top + block.bottom) / 2, source: "order_block", label: `${block.direction} OB` });
  }
  // A swept pool's resting liquidity has already been consumed — it is history, not an active
  // level, so (matching the chart's own treatment of stop pools) only unswept ones count here.
  for (const pool of parts.liquidity.pools) {
    if (pool.swept) continue;
    out.push({ price: pool.price, source: "liquidity_pool", label: `${pool.side} x${pool.touches}` });
  }

  for (const range of parts.sessionRanges) {
    out.push({ price: range.high, source: "session_high", label: `${range.session} high` });
    out.push({ price: range.low, source: "session_low", label: `${range.session} low` });
  }

  if (parts.cmeGap && !parts.cmeGap.filled) {
    out.push({ price: parts.cmeGap.fridayClose, source: "cme_gap", label: "CME gap (Friday close)" });
    out.push({ price: parts.cmeGap.mondayOpen, source: "cme_gap", label: "CME gap (Monday open)" });
  }

  return out;
}

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

  // --- Phase 1: deeper indicators. All pure, computed directly from primaryCandles, so these are
  // safe to run unconditionally without inflating the backtest's network traffic (see the
  // BuildContextOptions.crossMarket comment for the one piece of Phase 2 that IS network-bound). ---
  const keltnerRaw = calculateKeltnerChannels(primaryCandles);
  const squeeze = calculateSqueeze(primaryCandles);
  const stochRsi = calculateStochRsi(primaryCandles.map((c) => c.close));
  const supertrend = calculateSupertrend(primaryCandles);
  const donchian = calculateDonchian(primaryCandles);
  const ichimoku = calculateIchimoku(primaryCandles);
  const chandelier = calculateChandelierExit(primaryCandles);
  const realizedVol = calculateRealizedVolatility(primaryCandles);
  const persistence = calculatePersistence(primaryCandles.map((c) => c.close));

  const anchoredVwapsRaw = buildAnchoredVwaps(primaryCandles, mktStruct.swingHighs, mktStruct.swingLows);
  const anchoredVwaps: MarketContext["anchoredVwaps"] = anchoredVwapsRaw.map((v) => ({
    kind: v.kind,
    anchorPrice: v.anchorPrice,
    anchorTime: v.anchorTime,
    latest: v.latest,
    zScore: v.latestZScore,
    relation: classifyVwapRelation(price, v.latest),
  }));

  const liquidity = buildLiquidityMap(primaryCandles, mktStruct.swingHighs, mktStruct.swingLows);
  const volumeProfileResult = buildVolumeProfileResult(primaryCandles);
  const volumeProfileDetail = {
    ...volumeProfileResult,
    valueAreaRelation: classifyValueAreaRelation(price, volumeProfileResult.composite),
  };

  // Session ranges and the CME gap are pure derivations of the candle series; funding-window
  // proximity reads from the already-optional `futures` block and degrades to nulls with it.
  const intervalMs = intervalDurationMs(interval);
  const sessionRanges = computeSessionRanges(rawPrimary);
  const cmeGap = intervalMs != null ? findLatestCmeGap(rawPrimary, intervalMs / 1000) : null;
  const fundingWindow = computeFundingWindow(futures.nextFundingTime);
  const eventBlackout = checkEventBlackout();

  const confluenceLevels = buildLevelInputsFromContext({
    latest,
    pivots: pivotPayload,
    supportZones: mktStruct.srZones.supports,
    resistanceZones: mktStruct.srZones.resistances,
    donchian: donchian.latest,
    ichimoku: ichimoku.latest,
    anchoredVwaps,
    volumeProfile: volumeProfileResult,
    liquidity,
    sessionRanges,
    cmeGap,
  });
  const confluenceClusters = topConfluenceClusters(buildConfluenceMap(confluenceLevels, latest.atr14, price));
  const { support: confluenceSupport, resistance: confluenceResistance } = nearestConfluenceClusters(confluenceClusters, price);

  // --- Phase 2: cross-market (BTC beta) context. Network-bound, so it is only ever what the
  // caller injected via opts.crossMarket (see BuildContextOptions) — gatherMarketContext fetches
  // it live; buildContextFromCandles never fetches it itself. ---
  const crossMarket = opts.crossMarket ?? UNAVAILABLE_CROSS_MARKET_CONTEXT;

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
    volatility: {
      keltner: keltnerRaw.upper.length
        ? {
          upper: keltnerRaw.upper[keltnerRaw.upper.length - 1],
          middle: keltnerRaw.middle[keltnerRaw.middle.length - 1],
          lower: keltnerRaw.lower[keltnerRaw.lower.length - 1],
        }
        : { upper: null, middle: null, lower: null },
      squeeze: squeeze.latest,
      stochRsi: stochRsi.latest,
      supertrend: supertrend.latest,
      donchian: donchian.latest,
      ichimoku: ichimoku.latest,
      chandelier: chandelier.latest,
      realizedVol,
      persistence,
    },
    anchoredVwaps,
    liquidity,
    volumeProfileDetail,
    crossMarket,
    sessions: {
      ranges: sessionRanges,
      cmeGap,
      fundingWindow,
      eventBlackout,
    },
    confluence: {
      clusters: confluenceClusters,
      nearestSupport: confluenceSupport,
      nearestResistance: confluenceResistance,
    },
  };
}

export async function gatherMarketContext(symbol: string, interval: string): Promise<MarketContext> {
  const rawPrimary = await fetchBinanceKlines(symbol, interval, PRIMARY_CANDLE_LIMIT);
  if (!rawPrimary.length) throw new Error("No candle data returned for this symbol/interval.");

  const closedPrimary = sliceClosedCandles(rawPrimary, interval);
  const analysisCandles = closedPrimary.length ? closedPrimary : rawPrimary.slice(0, -1);

  const [orderFlow, futures, ticker24h, crossMarket] = await Promise.all([
    fetchOrderBookImbalance(symbol),
    fetchFuturesContext(symbol),
    fetchTicker24hr(symbol),
    fetchCrossMarketContext(symbol, interval, analysisCandles),
  ]);

  const ctx = await buildContextFromCandles(symbol, interval, analysisCandles, {
    orderFlow,
    futures,
    ticker24h,
    rawPrimary,
    crossMarket,
  });

  const latestSwingHigh = ctx.swingHighs[ctx.swingHighs.length - 1]?.price ?? null;
  const latestSwingLow = ctx.swingLows[ctx.swingLows.length - 1]?.price ?? null;
  const liquidation = await fetchLiquidationContext(symbol, futures, latestSwingHigh, latestSwingLow);

  return { ...ctx, liquidation };
}

const PROMPT_CONFLUENCE_TOP = 5;
const PROMPT_LIQUIDITY_MAX = 5;
const PROMPT_VP_NODE_MAX = 3;

function promptPriceDecimals(refPrice: number): number {
  if (refPrice >= 10_000) return 0;
  if (refPrice >= 100) return 1;
  if (refPrice >= 1) return 2;
  return 4;
}

function roundPromptPrice(value: number | null | undefined, refPrice: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(promptPriceDecimals(refPrice)));
}

function roundPromptScore(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}

function roundPromptPct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}

type PromptConfluenceCluster = {
  mid: number | null;
  low: number | null;
  high: number | null;
  score: number | null;
  sourceCount: number;
  sources: ConfluenceCluster["sources"];
  dist_pct: number | null;
};

function compactConfluenceCluster(
  cluster: ConfluenceCluster | null,
  refPrice: number,
): PromptConfluenceCluster | null {
  if (!cluster) return null;
  return {
    mid: roundPromptPrice(cluster.mid, refPrice),
    low: roundPromptPrice(cluster.low, refPrice),
    high: roundPromptPrice(cluster.high, refPrice),
    score: roundPromptScore(cluster.score),
    sourceCount: cluster.sourceCount,
    sources: cluster.sources,
    dist_pct: roundPromptPct(cluster.distancePct),
  };
}

/** Trim Phase-2 context fields for the LLM prompt without touching the full MarketContext. */
export function compactForPrompt(ctx: MarketContext) {
  const price = ctx.price;
  const developing = ctx.volumeProfileDetail.developing;

  return {
    anchoredVwaps: ctx.anchoredVwaps.map((v) => ({
      anchor: v.kind,
      vwap: roundPromptPrice(v.latest.vwap, price),
      z: roundPromptScore(v.zScore),
      relation: v.relation,
    })),
    liquidity: {
      unsweptPools: ctx.liquidity.pools
        .filter((p) => !p.swept)
        .slice(0, PROMPT_LIQUIDITY_MAX)
        .map((p) => ({
          side: p.side,
          price: roundPromptPrice(p.price, price),
          touches: p.touches,
        })),
      recentSweeps: ctx.liquidity.sweeps.slice(0, PROMPT_LIQUIDITY_MAX).map((s) => ({
        side: s.side,
        level: roundPromptPrice(s.level, price),
        reclaimed: s.reclaimed,
        penetrationAtr: roundPromptScore(s.penetrationAtr),
      })),
      nearestBuySidePool: ctx.liquidity.nearestBuySidePool
        ? {
          side: ctx.liquidity.nearestBuySidePool.side,
          price: roundPromptPrice(ctx.liquidity.nearestBuySidePool.price, price),
          touches: ctx.liquidity.nearestBuySidePool.touches,
        }
        : null,
      nearestSellSidePool: ctx.liquidity.nearestSellSidePool
        ? {
          side: ctx.liquidity.nearestSellSidePool.side,
          price: roundPromptPrice(ctx.liquidity.nearestSellSidePool.price, price),
          touches: ctx.liquidity.nearestSellSidePool.touches,
        }
        : null,
      unfilledFvgs: ctx.liquidity.fairValueGaps.slice(0, PROMPT_LIQUIDITY_MAX).map((g) => ({
        direction: g.direction,
        top: roundPromptPrice(g.top, price),
        bottom: roundPromptPrice(g.bottom, price),
        fillProgress: roundPromptScore(g.fillProgress),
      })),
      orderBlocks: ctx.liquidity.orderBlocks.slice(0, PROMPT_LIQUIDITY_MAX).map((b) => ({
        direction: b.direction,
        top: roundPromptPrice(b.top, price),
        bottom: roundPromptPrice(b.bottom, price),
        mitigated: b.mitigated,
      })),
    },
    volumeProfile: {
      composite: {
        poc: roundPromptPrice(ctx.volumeProfileDetail.composite.poc, price),
        vah: roundPromptPrice(ctx.volumeProfileDetail.composite.vah, price),
        val: roundPromptPrice(ctx.volumeProfileDetail.composite.val, price),
        hvn: ctx.volumeProfileDetail.composite.hvn.slice(0, PROMPT_VP_NODE_MAX).map((n) => ({
          price: roundPromptPrice(n.price, price),
          share: roundPromptPct(n.share * 100),
        })),
        lvn: (ctx.volumeProfileDetail.composite.lvn ?? []).slice(0, PROMPT_VP_NODE_MAX).map((n) => ({
          price: roundPromptPrice(n.price, price),
          share: roundPromptPct(n.share * 100),
        })),
      },
      developing: developing
        ? {
          poc: roundPromptPrice(developing.poc, price),
          vah: roundPromptPrice(developing.vah, price),
          val: roundPromptPrice(developing.val, price),
          valueAreaRelation: classifyValueAreaRelation(price, developing),
        }
        : null,
      nakedPocs: (ctx.volumeProfileDetail.nakedPocs ?? []).map((n) => ({
        price: roundPromptPrice(n.price, price),
        barsAgo: n.barsAgo,
      })),
      valueAreaRelation: ctx.volumeProfileDetail.valueAreaRelation,
    },
    sessionRanges: sessionRangesForPrompt(ctx.sessions.ranges).map((r) => ({
      session: r.session,
      high: roundPromptPrice(r.high, price),
      low: roundPromptPrice(r.low, price),
      isDeveloping: r.isDeveloping,
    })),
    confluence: {
      topClusters: ctx.confluence.clusters
        .slice(0, PROMPT_CONFLUENCE_TOP)
        .map((c) => compactConfluenceCluster(c, price)!),
      nearestSupport: compactConfluenceCluster(ctx.confluence.nearestSupport, price),
      nearestResistance: compactConfluenceCluster(ctx.confluence.nearestResistance, price),
    },
  };
}

export function buildUserMessage(ctx: MarketContext): string {
  const c = ctx.pivots.classic.pivots;
  const f = ctx.pivots.fibonacci.pivots;
  const t = ctx.pivots.traditional.pivots;
  const prompt = compactForPrompt(ctx);

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
PIVOT_ANALYSIS: ${JSON.stringify(ctx.pivots.classic.analysis)}

VOLATILITY & TREND QUALITY:
- keltner_channels: ${JSON.stringify(ctx.volatility.keltner)}
- ttm_squeeze: ${JSON.stringify(ctx.volatility.squeeze)} (in_squeeze = volatility compression; the release, not the squeeze itself, is the tradable event)
- stoch_rsi: ${JSON.stringify(ctx.volatility.stochRsi)}
- supertrend: ${JSON.stringify(ctx.volatility.supertrend)}
- donchian_20: ${JSON.stringify(ctx.volatility.donchian)}
- ichimoku: ${JSON.stringify(ctx.volatility.ichimoku)}
- chandelier_exit: ${JSON.stringify(ctx.volatility.chandelier)}
- realized_volatility: ${JSON.stringify(ctx.volatility.realizedVol)}
- persistence (Hurst/variance-ratio — trending vs mean-reverting, independent of ADX): ${JSON.stringify(ctx.volatility.persistence)}

ANCHORED VWAP (mean price paid since each anchor; z = σ distance from VWAP):
${JSON.stringify(prompt.anchoredVwaps)}

LIQUIDITY STRUCTURE (stop pools, sweeps, imbalances — see education for how to read these):
- unswept_pools (resting stops; a reclaimed sweep of one is a stronger reversal signal than a plain breakout): ${JSON.stringify(prompt.liquidity.unsweptPools)}
- recent_sweeps: ${JSON.stringify(prompt.liquidity.recentSweeps)}
- nearest_buy_side_pool: ${JSON.stringify(prompt.liquidity.nearestBuySidePool)}
- nearest_sell_side_pool: ${JSON.stringify(prompt.liquidity.nearestSellSidePool)}
- unfilled_fair_value_gaps: ${JSON.stringify(prompt.liquidity.unfilledFvgs)}
- unmitigated_order_blocks: ${JSON.stringify(prompt.liquidity.orderBlocks)}

VOLUME PROFILE (composite over last ${PRIMARY_CANDLE_LIMIT} closed candles, plus the still-forming session):
- composite: ${JSON.stringify(prompt.volumeProfile.composite)}
- developing_session: ${JSON.stringify(prompt.volumeProfile.developing)}
- naked_pocs (untested prior points of control — these act as magnets): ${JSON.stringify(prompt.volumeProfile.nakedPocs)}
- price_vs_value_area: ${prompt.volumeProfile.valueAreaRelation}

CROSS-MARKET (BTC beta — most altcoin moves are BTC beta, not idiosyncratic signal):
${JSON.stringify(ctx.crossMarket)}
${ctx.crossMarket.available && !ctx.crossMarket.isBtcOrEth ? "gating_rule: if beta_to_btc >= 0.7 and BTC trend contradicts the proposed bias, treat this the same as an unresolved HTF contradiction — wait if BTC is itself trending against the trade, otherwise lower confidence." : ""}

SESSIONS & CALENDAR:
- session_ranges (developing + latest completed per session, UTC — see education; London/New York deliberately overlap): ${JSON.stringify(prompt.sessionRanges)}
- cme_btc_futures_gap (estimated from spot candles, not a measured CME print — see education): ${JSON.stringify(ctx.sessions.cmeGap)}
- funding_window: ${JSON.stringify(ctx.sessions.fundingWindow)}${ctx.sessions.fundingWindow.imminent ? " — a funding settlement is imminent; do not let this alone drive the bias, but mention it as a timing risk." : ""}
- event_blackout: ${JSON.stringify(ctx.sessions.eventBlackout)}

CONFLUENCE MAP (every price level the system tracks, clustered and scored by source diversity — a level five independent analyses agree on outranks one repeated by a single analysis):
- top_clusters: ${JSON.stringify(prompt.confluence.topClusters)}
- nearest_support_cluster: ${JSON.stringify(prompt.confluence.nearestSupport)}
- nearest_resistance_cluster: ${JSON.stringify(prompt.confluence.nearestResistance)}
- confluence_gating_rule: base stop_loss and targets on these clusters (and the swing structure / ATR already provided) ahead of a lone pivot level when a higher-scored cluster sits nearby.`;
}
