/**
 * Anchored VWAP and volume-weighted standard-deviation bands.
 *
 * Session VWAP (see calculateVWAP in indicators.ts) resets on a fixed calendar boundary, which is
 * the right anchor for an intraday trader and close to useless on a 4h chart where a UTC day is
 * six bars. Anchored VWAP instead starts from a *chosen event* — a swing high, a swing low, the
 * highest-volume bar — and answers the question that actually matters: "what is the average price
 * everyone who traded since that event paid?" Price above it means those participants are in
 * profit, below means they are underwater, and the bands measure how stretched the move is
 * relative to the volume actually transacted.
 */

export type AnchoredVwapPoint = {
  vwap: number | null;
  upper1: number | null;
  lower1: number | null;
  upper2: number | null;
  lower2: number | null;
};

export type VwapAnchorKind = "swing_high" | "swing_low" | "high_volume" | "custom";

export type AnchoredVwap = {
  kind: VwapAnchorKind;
  anchorIndex: number;
  anchorTime: number | null;
  anchorPrice: number | null;
  /** Parallel to the input candles; null before the anchor. */
  series: AnchoredVwapPoint[];
  /** Latest values, for prompt/context use without shipping the whole series. */
  latest: AnchoredVwapPoint;
  /** Where price sits relative to the anchored mean, in standard deviations. */
  latestZScore: number | null;
};

type VwapCandle = {
  time: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const EMPTY_POINT: AnchoredVwapPoint = {
  vwap: null,
  upper1: null,
  lower1: null,
  upper2: null,
  lower2: null,
};

function round6(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(6));
}

function typicalPrice(candle: VwapCandle): number {
  return (candle.high + candle.low + candle.close) / 3;
}

/**
 * VWAP anchored at `anchorIndex`, with ±1σ and ±2σ bands.
 *
 * The deviation is volume-weighted around the running VWAP rather than a plain price stdev, so a
 * band widens because meaningful size traded away from the mean, not merely because the bar range
 * was large on thin volume.
 */
export function anchoredVwap(
  candles: VwapCandle[],
  anchorIndex: number,
  kind: VwapAnchorKind = "custom",
): AnchoredVwap {
  const series: AnchoredVwapPoint[] = candles.map(() => ({ ...EMPTY_POINT }));
  const safeAnchor = Math.max(0, Math.min(anchorIndex, candles.length - 1));

  let cumulativeVolume = 0;
  let cumulativePv = 0;
  let cumulativePv2 = 0;

  for (let i = safeAnchor; i < candles.length; i += 1) {
    const candle = candles[i];
    const tp = typicalPrice(candle);
    const volume = Number.isFinite(candle.volume) && candle.volume > 0 ? candle.volume : 0;

    cumulativeVolume += volume;
    cumulativePv += tp * volume;
    cumulativePv2 += tp * tp * volume;

    if (cumulativeVolume <= 0) continue;

    const vwap = cumulativePv / cumulativeVolume;
    // Volume-weighted variance: E[p²] − E[p]². Clamped at zero because floating-point accumulation
    // over thousands of bars can drive a genuinely-zero variance slightly negative.
    const variance = Math.max(0, cumulativePv2 / cumulativeVolume - vwap * vwap);
    const sd = Math.sqrt(variance);

    series[i] = {
      vwap: round6(vwap),
      upper1: round6(vwap + sd),
      lower1: round6(vwap - sd),
      upper2: round6(vwap + 2 * sd),
      lower2: round6(vwap - 2 * sd),
    };
  }

  const latest = series[candles.length - 1] ?? { ...EMPTY_POINT };
  const lastClose = candles[candles.length - 1]?.close ?? null;
  const sd1 = latest.vwap != null && latest.upper1 != null ? latest.upper1 - latest.vwap : null;
  const latestZScore = lastClose != null && latest.vwap != null && sd1 != null && sd1 > 0
    ? round6((lastClose - latest.vwap) / sd1)
    : null;

  return {
    kind,
    anchorIndex: safeAnchor,
    anchorTime: candles[safeAnchor]?.time ?? null,
    anchorPrice: round6(candles[safeAnchor]?.close ?? null),
    series,
    latest,
    latestZScore,
  };
}

/**
 * Pick the bars worth anchoring to: the most recent significant swing high, the most recent
 * significant swing low, and the highest-volume bar in the window.
 *
 * Swings are supplied by the caller (buildMarketStructure already produces prominence-filtered
 * ones) so this module does not re-derive structure and the two cannot disagree about what counts
 * as a swing.
 */
export function selectVwapAnchors(
  candles: VwapCandle[],
  swingHighs: Array<{ index: number }>,
  swingLows: Array<{ index: number }>,
  lookback = 200,
): Array<{ kind: VwapAnchorKind; index: number }> {
  if (!candles.length) return [];

  const windowStart = Math.max(0, candles.length - lookback);
  const anchors: Array<{ kind: VwapAnchorKind; index: number }> = [];

  const lastHigh = [...swingHighs].reverse().find((s) => s.index >= windowStart);
  if (lastHigh) anchors.push({ kind: "swing_high", index: lastHigh.index });

  const lastLow = [...swingLows].reverse().find((s) => s.index >= windowStart);
  if (lastLow) anchors.push({ kind: "swing_low", index: lastLow.index });

  let volumeIdx = windowStart;
  for (let i = windowStart; i < candles.length; i += 1) {
    if ((candles[i].volume ?? 0) > (candles[volumeIdx].volume ?? 0)) volumeIdx = i;
  }
  // Only worth a separate anchor if it is not effectively the same bar as a swing anchor.
  if (!anchors.some((a) => Math.abs(a.index - volumeIdx) <= 2)) {
    anchors.push({ kind: "high_volume", index: volumeIdx });
  }

  return anchors;
}

/** Build every auto-selected anchored VWAP for a candle series. */
export function buildAnchoredVwaps(
  candles: VwapCandle[],
  swingHighs: Array<{ index: number }>,
  swingLows: Array<{ index: number }>,
  lookback = 200,
): AnchoredVwap[] {
  return selectVwapAnchors(candles, swingHighs, swingLows, lookback)
    .map((anchor) => anchoredVwap(candles, anchor.index, anchor.kind));
}

export type VwapRelation = "above_2sd" | "above_1sd" | "above" | "at" | "below" | "below_1sd" | "below_2sd";

/**
 * Where price sits against an anchored VWAP, in band terms. Beyond 2σ is the mean-reversion zone;
 * riding between the mean and 1σ is the signature of a healthy trend.
 */
export function classifyVwapRelation(price: number | null, point: AnchoredVwapPoint): VwapRelation | "unknown" {
  if (price == null || point.vwap == null) return "unknown";
  if (point.upper2 != null && price >= point.upper2) return "above_2sd";
  if (point.upper1 != null && price >= point.upper1) return "above_1sd";
  if (point.lower2 != null && price <= point.lower2) return "below_2sd";
  if (point.lower1 != null && price <= point.lower1) return "below_1sd";

  const tolerance = Math.abs(point.vwap) * 0.0005;
  if (Math.abs(price - point.vwap) <= tolerance) return "at";
  return price > point.vwap ? "above" : "below";
}
