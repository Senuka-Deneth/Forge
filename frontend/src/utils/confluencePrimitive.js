/**
 * Canvas primitive for confluence clusters — horizontal price bands whose opacity reflects
 * cluster score. Attached once to the candlestick series; updated via setClusters().
 *
 * Follows the same contract as ZoneBoxPrimitive / PivotSegmentsPrimitive:
 * attached/detached/paneViews/updateAllViews plus a setter that calls requestUpdate.
 */

function topSourceLabel(cluster) {
  const labels = Array.isArray(cluster.labels) ? cluster.labels.filter(Boolean) : [];
  if (labels.length) return labels.slice(0, 2).join(' · ');
  const sources = Array.isArray(cluster.sources) ? cluster.sources.filter(Boolean) : [];
  if (sources.length) return sources.slice(0, 2).join(' · ');
  if (cluster.score != null && Number.isFinite(cluster.score)) {
    return `score ${Number(cluster.score).toFixed(1)}`;
  }
  return '';
}

class ConfluenceBandPaneRenderer {
  constructor(owner) {
    this._owner = owner
  }

  draw(target) {
    const chart = this._owner._chart
    const series = this._owner._series
    const bands = this._owner._bands
    if (!chart || !series || !bands.length) return

    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio, verticalPixelRatio }) => {
      for (const band of bands) {
        const yTop = series.priceToCoordinate(band.high)
        const yBottom = series.priceToCoordinate(band.low)
        if (yTop === null || yBottom === null) continue

        const top = Math.round(Math.min(yTop, yBottom) * verticalPixelRatio)
        const bottom = Math.round(Math.max(yTop, yBottom) * verticalPixelRatio)
        const height = Math.max(1, bottom - top)
        const width = bitmapSize.width

        context.save()
        context.globalAlpha = band.opacity ?? 0.35

        if (band.fill) {
          context.fillStyle = band.fill
          context.fillRect(0, top, width, height)
        }

        if (band.border) {
          context.strokeStyle = band.border
          context.lineWidth = Math.max(1, horizontalPixelRatio)
          context.strokeRect(0, top, width, height)
        }

        if (band.label) {
          const fontSize = Math.round(10 * verticalPixelRatio)
          context.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`
          context.fillStyle = band.border || band.fill
          context.textBaseline = 'top'
          context.textAlign = 'left'
          context.globalAlpha = 1
          const pad = Math.round(6 * horizontalPixelRatio)
          context.fillText(band.label, pad, top + pad)
        }

        context.restore()
      }
    })
  }
}

class ConfluenceBandPaneView {
  constructor(owner) {
    this._owner = owner
  }

  renderer() {
    return this._owner._bands.length ? new ConfluenceBandPaneRenderer(this._owner) : null
  }

  zOrder() {
    return 'bottom'
  }
}

export class ConfluencePrimitive {
  constructor() {
    this._bands = []
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new ConfluenceBandPaneView(this)
  }

  attached(param) {
    this._chart = param.chart
    this._series = param.series
    this._requestUpdate = param.requestUpdate
  }

  detached() {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }

  paneViews() {
    return [this._paneView]
  }

  updateAllViews() {}

  setClusters(clusters, themeOrOpts = {}) {
    const theme = themeOrOpts?.confluenceFill || themeOrOpts?.vwap
      ? themeOrOpts
      : themeOrOpts?.theme ?? themeOrOpts
    this._bands = buildConfluenceBands(clusters, theme)
    this._requestUpdate?.()
  }

  clear() {
    this.setClusters([])
  }
}

/**
 * Map server/client confluence clusters to drawable horizontal bands.
 *
 * Opacity scales with score relative to the strongest cluster in the set so a chart with one
 * dominant level and several weak ones reads at a glance.
 */
export function buildConfluenceBands(clusters, theme = {}) {
  if (!Array.isArray(clusters) || !clusters.length) return []

  const scores = clusters
    .map((cluster) => Number(cluster.score))
    .filter((score) => Number.isFinite(score) && score > 0)
  const maxScore = scores.length ? Math.max(...scores) : 1

  const fill = theme.confluenceFill ?? theme.vwapBand ?? 'hsla(190, 45%, 58%, 0.35)'
  const border = theme.confluenceBorder ?? theme.vwap ?? 'hsl(190, 45%, 58%)'

  return clusters
    .filter((cluster) => Number.isFinite(cluster.low) && Number.isFinite(cluster.high))
    .map((cluster) => {
      const score = Number.isFinite(cluster.score) ? Number(cluster.score) : 0
      const norm = maxScore > 0 ? score / maxScore : 0
      return {
        low: cluster.low,
        high: cluster.high,
        mid: cluster.mid,
        fill,
        border,
        opacity: 0.12 + norm * 0.55,
        label: topSourceLabel(cluster),
      }
    })
}
