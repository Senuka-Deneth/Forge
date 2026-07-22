/**
 * Declarative management of the extended price-pane overlays.
 *
 * ChartPanel already carries a named ref per series (ema20SeriesRef, macdHistSeriesRef, …). That
 * pattern is fine for six series and unmanageable for twenty, so the new overlays are described as
 * data and their lifecycle is driven from that description. Adding an overlay is a spec entry, not
 * another ref plus another effect plus another teardown branch.
 */

import { LineSeries, LineStyle } from 'lightweight-charts'

/**
 * Each spec maps one preference flag to one or more line series.
 * `data` pulls the matching point arrays out of computeChartOverlays() output.
 */
export const PRICE_OVERLAY_SPECS = [
  {
    id: 'keltner',
    pref: 'showKeltner',
    lines: [
      { key: 'upper', color: (t) => t.keltner, width: 1, style: LineStyle.Solid },
      { key: 'middle', color: (t) => t.keltner, width: 1, style: LineStyle.Dotted },
      { key: 'lower', color: (t) => t.keltner, width: 1, style: LineStyle.Solid },
    ],
    data: (o) => o.keltner,
  },
  {
    id: 'donchian',
    pref: 'showDonchian',
    lines: [
      { key: 'upper', color: (t) => t.donchian, width: 1, style: LineStyle.Solid },
      { key: 'middle', color: (t) => t.donchian, width: 1, style: LineStyle.Dotted },
      { key: 'lower', color: (t) => t.donchian, width: 1, style: LineStyle.Solid },
    ],
    data: (o) => o.donchian,
  },
  {
    id: 'supertrend',
    pref: 'showSupertrend',
    lines: [{ key: 'line', color: (t, o) => (o?.supertrend?.direction === -1 ? t.supertrendDown : t.supertrendUp), width: 2, style: LineStyle.Solid }],
    data: (o) => ({ line: o.supertrend.line }),
  },
  {
    id: 'chandelier',
    pref: 'showChandelier',
    lines: [
      { key: 'long', color: (t) => t.chandelier, width: 1, style: LineStyle.Dashed },
      { key: 'short', color: (t) => t.chandelier, width: 1, style: LineStyle.Dashed },
    ],
    data: (o) => o.chandelier,
  },
  {
    id: 'ichimoku',
    pref: 'showIchimoku',
    lines: [
      { key: 'tenkan', color: (t) => t.ichimoku.tenkan, width: 1, style: LineStyle.Solid },
      { key: 'kijun', color: (t) => t.ichimoku.kijun, width: 2, style: LineStyle.Solid },
      { key: 'senkouA', color: (t) => t.ichimoku.tenkan, width: 1, style: LineStyle.Dotted },
      { key: 'senkouB', color: (t) => t.ichimoku.kijun, width: 1, style: LineStyle.Dotted },
    ],
    data: (o) => o.ichimoku,
  },
]

function seriesKey(specId, lineKey) {
  return `${specId}:${lineKey}`
}

/**
 * Create, update and destroy overlay series to match the current preferences.
 *
 * Series are added and removed rather than merely hidden: an invisible series still holds its data
 * and still participates in the chart's autoscale, so twenty hidden overlays would quietly distort
 * the price scale of a chart showing none of them.
 */
export function syncPriceOverlays(chart, overlayMap, { overlays, preferences, hiddenIndicators = [], theme }) {
  if (!chart || !overlays) return

  for (const spec of PRICE_OVERLAY_SPECS) {
    const wanted = Boolean(preferences?.[spec.pref]) && !hiddenIndicators.includes(spec.id)
    const payload = spec.data(overlays) ?? {}

    for (const line of spec.lines) {
      const key = seriesKey(spec.id, line.key)
      const existing = overlayMap.get(key)
      const points = payload[line.key] ?? []

      if (!wanted || !points.length) {
        if (existing) {
          try {
            chart.removeSeries(existing)
          } catch {
            // Chart may already be torn down; the map entry is dropped either way.
          }
          overlayMap.delete(key)
        }
        continue
      }

      if (existing) {
        existing.applyOptions({ color: line.color(theme, overlays) })
        existing.setData(points)
        continue
      }

      const series = chart.addSeries(LineSeries, {
        color: line.color(theme, overlays),
        lineWidth: line.width,
        lineStyle: line.style,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      series.setData(points)
      overlayMap.set(key, series)
    }
  }
}

/**
 * Anchored VWAPs are handled apart from the spec list because their count is data-dependent — one
 * per detected anchor, and the anchors move as new swings form.
 */
export function syncAnchoredVwaps(chart, overlayMap, { overlays, preferences, hiddenIndicators = [], theme }) {
  if (!chart || !overlays) return

  const wanted = Boolean(preferences?.showAnchoredVwap) && !hiddenIndicators.includes('anchored-vwap')
  const withBands = wanted && Boolean(preferences?.showVwapBands)
  const vwaps = wanted ? overlays.anchoredVwaps ?? [] : []

  const liveKeys = new Set()

  vwaps.forEach((vwap, index) => {
    const lines = [
      { key: 'vwap', points: vwap.vwap, color: theme.vwap, width: 2, style: LineStyle.Solid },
      ...(withBands
        ? [
          { key: 'upper1', points: vwap.upper1, color: theme.vwapBand, width: 1, style: LineStyle.Dotted },
          { key: 'lower1', points: vwap.lower1, color: theme.vwapBand, width: 1, style: LineStyle.Dotted },
          { key: 'upper2', points: vwap.upper2, color: theme.vwapBand, width: 1, style: LineStyle.Dashed },
          { key: 'lower2', points: vwap.lower2, color: theme.vwapBand, width: 1, style: LineStyle.Dashed },
        ]
        : []),
    ]

    for (const line of lines) {
      if (!line.points?.length) continue
      const key = `vwap${index}:${line.key}`
      liveKeys.add(key)

      const existing = overlayMap.get(key)
      if (existing) {
        existing.applyOptions({ color: line.color })
        existing.setData(line.points)
        continue
      }

      const series = chart.addSeries(LineSeries, {
        color: line.color,
        lineWidth: line.width,
        lineStyle: line.style,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      series.setData(line.points)
      overlayMap.set(key, series)
    }
  })

  // Drop VWAP series whose anchor no longer exists.
  for (const key of [...overlayMap.keys()]) {
    if (!key.startsWith('vwap') || liveKeys.has(key)) continue
    try {
      chart.removeSeries(overlayMap.get(key))
    } catch {
      // Already removed with the chart.
    }
    overlayMap.delete(key)
  }
}

/** Remove every managed overlay series. Called on teardown and on symbol change. */
export function clearPriceOverlays(chart, overlayMap) {
  for (const series of overlayMap.values()) {
    try {
      chart?.removeSeries(series)
    } catch {
      // Chart already disposed.
    }
  }
  overlayMap.clear()
}

/**
 * Markers for liquidity sweeps and unswept stop pools.
 *
 * A reclaimed sweep is the highest-signal event the liquidity map produces, so it gets an explicit
 * marker rather than being left for the trader to spot in a wick.
 */
export function buildLiquidityMarkers({ overlays, preferences, theme }) {
  const markers = []
  if (!overlays) return markers

  if (preferences?.showSweeps) {
    for (const sweep of overlays.sweeps ?? []) {
      const buySide = sweep.side === 'buy_side'
      markers.push({
        time: sweep.time,
        position: buySide ? 'aboveBar' : 'belowBar',
        color: sweep.reclaimed ? theme.supertrendDown : theme.paneLabel,
        shape: buySide ? 'arrowDown' : 'arrowUp',
        // Only a reclaim is a sweep in the tradable sense; a breach that held is a breakout.
        text: sweep.reclaimed ? 'sweep' : 'break',
      })
    }
  }

  return markers.sort((a, b) => a.time - b.time)
}
