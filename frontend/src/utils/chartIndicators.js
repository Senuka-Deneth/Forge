/**
 * Extended indicator series for the chart.
 *
 * Everything here is computed by the same shared modules the edge functions use, imported through
 * the `@forge/*` Vite aliases. That is deliberate: the AI panel reasons over roughly thirty
 * features while the chart historically drew six, so a trader could not visually verify the thing
 * they were being asked to trust. Recomputing the math a second time in JavaScript would reopen
 * exactly that gap the moment one side changed.
 *
 * `incrementalIndicators.js` stays as-is and keeps the live-bar fast path for EMA/RSI/MACD. These
 * are recomputed on bar close instead — they are either cheap or unsuited to incremental update.
 */

import {
  calculateChandelierExit,
  calculateDonchian,
  calculateIchimoku,
  calculateKeltnerChannels,
  calculateSqueeze,
  calculateStochRsi,
  calculateSupertrend,
} from '@forge/volatility'
import { buildAnchoredVwaps } from '@forge/vwap'
import { buildLiquidityMap } from '@forge/liquidity-map'
import { buildVolumeProfile } from '@forge/volume-profile'
import { buildMarketStructure } from '@forge/market-structure'

/** Lightweight Charts rejects null values, so every series is filtered to defined points. */
function toLine(candles, values) {
  const out = []
  for (let i = 0; i < candles.length; i += 1) {
    const value = values[i]
    if (value == null || !Number.isFinite(value)) continue
    out.push({ time: candles[i].time, value })
  }
  return out
}

/**
 * Compute every extended overlay from a candle series.
 *
 * Returns plain arrays keyed by overlay id so ChartPanel can stay declarative about what it draws.
 * Guards on length: most of these need 50+ bars before they produce anything, and Ichimoku needs
 * 78 (52-period span B displaced 26 forward).
 */
export function computeChartOverlays(candles) {
  const empty = {
    keltner: { upper: [], middle: [], lower: [] },
    supertrend: { line: [], direction: null },
    donchian: { upper: [], middle: [], lower: [] },
    ichimoku: { tenkan: [], kijun: [], senkouA: [], senkouB: [] },
    chandelier: { long: [], short: [] },
    stochRsi: { k: [], d: [] },
    squeeze: { momentum: [], flags: [] },
    anchoredVwaps: [],
    fairValueGaps: [],
    orderBlocks: [],
    liquidityPools: [],
    sweeps: [],
    volumeProfile: null,
  }

  if (!Array.isArray(candles) || candles.length < 60) return empty

  const closes = candles.map((c) => c.close)

  const keltnerRaw = calculateKeltnerChannels(candles)
  const supertrendRaw = calculateSupertrend(candles)
  const donchianRaw = calculateDonchian(candles)
  const ichimokuRaw = calculateIchimoku(candles)
  const chandelierRaw = calculateChandelierExit(candles)
  const stochRaw = calculateStochRsi(closes)
  const squeezeRaw = calculateSqueeze(candles)

  const structure = buildMarketStructure(candles, candles.map((c) => c.rsi14 ?? null))
  const liquidity = buildLiquidityMap(candles, structure.swingHighs, structure.swingLows)

  // Anchored VWAPs carry their own metadata (anchor kind and bar) so the legend can name them.
  const anchoredVwaps = buildAnchoredVwaps(candles, structure.swingHighs, structure.swingLows).map((v) => ({
    kind: v.kind,
    anchorIndex: v.anchorIndex,
    anchorTime: v.anchorTime,
    latest: v.latest,
    zScore: v.latestZScore,
    vwap: toLine(candles, v.series.map((p) => p.vwap)),
    upper1: toLine(candles, v.series.map((p) => p.upper1)),
    lower1: toLine(candles, v.series.map((p) => p.lower1)),
    upper2: toLine(candles, v.series.map((p) => p.upper2)),
    lower2: toLine(candles, v.series.map((p) => p.lower2)),
  }))

  return {
    keltner: {
      upper: toLine(candles, keltnerRaw.upper),
      middle: toLine(candles, keltnerRaw.middle),
      lower: toLine(candles, keltnerRaw.lower),
    },
    supertrend: {
      line: toLine(candles, supertrendRaw.value),
      direction: supertrendRaw.latest.direction,
      // Direction per bar lets the renderer colour the line by trend side.
      directions: supertrendRaw.direction,
    },
    donchian: {
      upper: toLine(candles, donchianRaw.upper),
      middle: toLine(candles, donchianRaw.middle),
      lower: toLine(candles, donchianRaw.lower),
    },
    ichimoku: {
      tenkan: toLine(candles, ichimokuRaw.tenkan),
      kijun: toLine(candles, ichimokuRaw.kijun),
      senkouA: toLine(candles, ichimokuRaw.senkouA),
      senkouB: toLine(candles, ichimokuRaw.senkouB),
      latest: ichimokuRaw.latest,
    },
    chandelier: {
      long: toLine(candles, chandelierRaw.long),
      short: toLine(candles, chandelierRaw.short),
    },
    stochRsi: {
      k: toLine(candles, stochRaw.k),
      d: toLine(candles, stochRaw.d),
      latest: stochRaw.latest,
    },
    squeeze: {
      momentum: toLine(candles, squeezeRaw.momentum),
      // Squeeze on/off per bar, drawn as dots on the zero line.
      flags: candles.map((c, i) => ({ time: c.time, inSqueeze: squeezeRaw.inSqueeze[i] })),
      latest: squeezeRaw.latest,
    },
    anchoredVwaps,
    fairValueGaps: liquidity.fairValueGaps,
    orderBlocks: liquidity.orderBlocks,
    liquidityPools: liquidity.pools,
    sweeps: liquidity.sweeps,
    volumeProfile: buildVolumeProfile(candles, 60),
  }
}

/** Human-readable anchor names for the chart legend. */
export const VWAP_ANCHOR_LABELS = {
  swing_high: 'aVWAP (swing high)',
  swing_low: 'aVWAP (swing low)',
  high_volume: 'aVWAP (volume spike)',
  custom: 'aVWAP',
}
