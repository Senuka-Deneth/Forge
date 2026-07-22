/**
 * Canvas primitive for price *zones* — fair value gaps, order blocks, and support/resistance
 * bands. Attached once to the candlestick series and updated via setZones().
 *
 * Follows the same contract as PivotSegmentsPrimitive (attached/detached/paneViews/updateAllViews
 * plus a setter that calls requestUpdate).
 *
 * A zone is a rectangle in price-time space:
 *   { startTime, endTime|null, top, bottom, fill, border, label, dashed, opacity }
 * A null endTime extends the box to the right edge, which is how an unfilled gap or an unmitigated
 * block should read — it is still live.
 */

class ZoneBoxPaneRenderer {
  constructor(owner) {
    this._owner = owner
  }

  draw(target) {
    const chart = this._owner._chart
    const series = this._owner._series
    const zones = this._owner._zones
    if (!chart || !series || !zones.length) return

    const timeScale = chart.timeScale()

    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio, verticalPixelRatio }) => {
      for (const zone of zones) {
        const yTop = series.priceToCoordinate(zone.top)
        const yBottom = series.priceToCoordinate(zone.bottom)
        if (yTop === null || yBottom === null) continue

        const x1 = timeScale.timeToCoordinate(zone.startTime)
        // A live zone runs to the right edge; a closed one stops at its end bar.
        const x2 = zone.endTime == null
          ? bitmapSize.width / horizontalPixelRatio
          : timeScale.timeToCoordinate(zone.endTime)
        if (x1 === null || x2 === null) continue

        const left = Math.round(Math.min(x1, x2) * horizontalPixelRatio)
        const right = Math.round(Math.max(x1, x2) * horizontalPixelRatio)
        const top = Math.round(Math.min(yTop, yBottom) * verticalPixelRatio)
        const bottom = Math.round(Math.max(yTop, yBottom) * verticalPixelRatio)

        const width = Math.max(1, right - left)
        const height = Math.max(1, bottom - top)

        context.save()
        context.globalAlpha = zone.opacity ?? 1

        if (zone.fill) {
          context.fillStyle = zone.fill
          context.fillRect(left, top, width, height)
        }

        if (zone.border) {
          context.strokeStyle = zone.border
          context.lineWidth = Math.max(1, horizontalPixelRatio)
          if (zone.dashed) context.setLineDash([4 * horizontalPixelRatio, 4 * horizontalPixelRatio])
          context.strokeRect(left, top, width, height)
          context.setLineDash([])
        }

        if (zone.label) {
          const fontSize = Math.round(10 * verticalPixelRatio)
          context.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`
          context.fillStyle = zone.border || zone.fill
          context.textBaseline = 'bottom'
          context.textAlign = 'left'
          context.globalAlpha = 1
          const pad = Math.round(4 * horizontalPixelRatio)
          // Sit the label just above the box, or inside it when it would clip off the top.
          const labelY = top - pad < fontSize ? top + fontSize + pad : top - pad
          context.fillText(zone.label, left + pad, labelY)
        }

        context.restore()
      }
    })
  }
}

class ZoneBoxPaneView {
  constructor(owner) {
    this._owner = owner
  }

  renderer() {
    return this._owner._zones.length ? new ZoneBoxPaneRenderer(this._owner) : null
  }

  /** Zones are background context — the candles that formed them must stay legible on top. */
  zOrder() {
    return 'bottom'
  }
}

export class ZoneBoxPrimitive {
  constructor() {
    this._zones = []
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new ZoneBoxPaneView(this)
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

  setZones(zones) {
    this._zones = Array.isArray(zones) ? zones : []
    this._requestUpdate?.()
  }

  clear() {
    this.setZones([])
  }
}

/**
 * Translate liquidity-map output into drawable zones.
 *
 * Unfilled gaps and unmitigated blocks extend to the right edge and are drawn solid; ones that have
 * already been traded through fade and stop at the bar that consumed them, so the chart
 * distinguishes "still live" from "already did its job" at a glance.
 */
export function buildLiquidityZones({ candles, fairValueGaps = [], orderBlocks = [], theme }) {
  if (!candles?.length) return []

  const timeAt = (index) => candles[Math.max(0, Math.min(index, candles.length - 1))]?.time
  const zones = []

  for (const gap of fairValueGaps) {
    const bullish = gap.direction === 'bullish'
    zones.push({
      startTime: timeAt(gap.index),
      endTime: gap.filled ? timeAt(gap.index + 6) : null,
      top: gap.top,
      bottom: gap.bottom,
      fill: bullish ? theme.fvgBullFill : theme.fvgBearFill,
      border: bullish ? theme.fvgBullBorder : theme.fvgBearBorder,
      // Partial fills fade proportionally — a gap 80% consumed is barely a level any more.
      opacity: 0.85 - (gap.fillProgress ?? 0) * 0.55,
      label: `FVG${gap.fillProgress > 0 ? ` ${Math.round(gap.fillProgress * 100)}%` : ''}`,
    })
  }

  for (const block of orderBlocks) {
    const bullish = block.direction === 'bullish'
    zones.push({
      startTime: timeAt(block.index),
      endTime: block.mitigated ? timeAt(block.index + 6) : null,
      top: block.top,
      bottom: block.bottom,
      fill: bullish ? theme.obBullFill : theme.obBearFill,
      border: bullish ? theme.obBullBorder : theme.obBearBorder,
      opacity: block.mitigated ? 0.3 : 0.75,
      dashed: block.mitigated,
      label: 'OB',
    })
  }

  return zones
}
