/**
 * Canvas primitive drawing a volume-at-price histogram against the right edge of the price pane,
 * with the point of control and value area highlighted.
 *
 * Volume profile answers a question the volume histogram at the bottom of the chart cannot: not
 * "when did people trade?" but "at what price?". Those are the levels price returns to.
 *
 * Same contract as PivotSegmentsPrimitive: attached/detached/paneViews/updateAllViews plus a
 * setter that calls requestUpdate.
 */

class VolumeProfilePaneRenderer {
  constructor(owner) {
    this._owner = owner
  }

  draw(target) {
    const series = this._owner._series
    const profile = this._owner._profile
    const style = this._owner._style
    if (!series || !profile?.bins?.length) return

    const maxVolume = Math.max(...profile.bins.map((b) => b.volume))
    if (!(maxVolume > 0)) return

    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio, verticalPixelRatio }) => {
      // Occupy a fixed share of the pane so the histogram never swallows the price action.
      const maxWidth = bitmapSize.width * (style.widthRatio ?? 0.16)
      const rightEdge = bitmapSize.width

      context.save()

      for (const bin of profile.bins) {
        const yTop = series.priceToCoordinate(bin.priceHigh)
        const yBottom = series.priceToCoordinate(bin.priceLow)
        if (yTop === null || yBottom === null) continue

        const top = Math.round(Math.min(yTop, yBottom) * verticalPixelRatio)
        const bottom = Math.round(Math.max(yTop, yBottom) * verticalPixelRatio)
        // Leave a hairline gap between bars so adjacent bins stay readable.
        const height = Math.max(1, bottom - top - Math.round(verticalPixelRatio))
        const width = Math.max(1, (bin.volume / maxVolume) * maxWidth)

        const inValueArea = bin.priceHigh >= profile.val && bin.priceLow <= profile.vah
        context.fillStyle = bin.isPoc
          ? style.poc
          : inValueArea
            ? style.valueArea
            : style.outside

        context.globalAlpha = bin.isPoc ? 0.95 : inValueArea ? 0.55 : 0.3
        context.fillRect(rightEdge - width, top, width, height)
      }

      // POC line across the full pane — it is a level, not just the longest bar.
      const pocY = series.priceToCoordinate(profile.poc)
      if (pocY !== null) {
        context.globalAlpha = 0.9
        context.strokeStyle = style.poc
        context.lineWidth = Math.max(1, horizontalPixelRatio)
        context.setLineDash([6 * horizontalPixelRatio, 4 * horizontalPixelRatio])
        context.beginPath()
        context.moveTo(0, Math.round(pocY * verticalPixelRatio))
        context.lineTo(rightEdge, Math.round(pocY * verticalPixelRatio))
        context.stroke()
        context.setLineDash([])

        const fontSize = Math.round(10 * verticalPixelRatio)
        context.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`
        context.fillStyle = style.poc
        context.textBaseline = 'bottom'
        context.textAlign = 'left'
        context.globalAlpha = 1
        context.fillText('POC', Math.round(4 * horizontalPixelRatio), Math.round(pocY * verticalPixelRatio) - 2)
      }

      context.restore()
    })
  }
}

class VolumeProfilePaneView {
  constructor(owner) {
    this._owner = owner
  }

  renderer() {
    return this._owner._profile?.bins?.length ? new VolumeProfilePaneRenderer(this._owner) : null
  }

  /**
   * Draw beneath the candles. The histogram hugs the right edge, which is exactly where the most
   * recent — and most important — price action sits; drawn on top it hides the bars you are
   * actually trading.
   */
  zOrder() {
    return 'bottom'
  }
}

export class VolumeProfilePrimitive {
  constructor() {
    this._profile = null
    this._style = {}
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new VolumeProfilePaneView(this)
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

  setProfile(profile, style = {}) {
    this._profile = profile
    this._style = style
    this._requestUpdate?.()
  }

  clear() {
    this.setProfile(null, {})
  }
}

/**
 * Rebuild a drawable bin list from candles and a computed profile.
 *
 * The shared volumeProfile module returns POC/VAH/VAL and the notable nodes, but not the full
 * histogram — it has no reason to ship 60 bins to an LLM prompt. The chart does need them, so the
 * distribution is recomputed here using the same range-spreading rule.
 */
export function buildProfileBins(candles, profile, binCount = 60) {
  if (!candles?.length || !profile || profile.poc == null) return null

  const minPrice = Math.min(...candles.map((c) => c.low))
  const maxPrice = Math.max(...candles.map((c) => c.high))
  if (!(maxPrice > minPrice)) return null

  const binSize = (maxPrice - minPrice) / binCount
  const volumes = new Array(binCount).fill(0)

  for (const candle of candles) {
    const volume = Number.isFinite(candle.volume) && candle.volume > 0 ? candle.volume : 0
    if (volume <= 0) continue

    const lowBin = Math.min(binCount - 1, Math.max(0, Math.floor((candle.low - minPrice) / binSize)))
    const highBin = Math.min(binCount - 1, Math.max(0, Math.floor((candle.high - minPrice) / binSize)))
    const span = highBin - lowBin + 1
    const perBin = volume / span
    for (let b = lowBin; b <= highBin; b += 1) volumes[b] += perBin
  }

  let pocIndex = 0
  for (let i = 1; i < binCount; i += 1) {
    if (volumes[i] > volumes[pocIndex]) pocIndex = i
  }

  return {
    poc: profile.poc,
    vah: profile.vah,
    val: profile.val,
    bins: volumes.map((volume, i) => ({
      priceLow: minPrice + i * binSize,
      priceHigh: minPrice + (i + 1) * binSize,
      volume,
      isPoc: i === pocIndex,
    })),
  }
}
