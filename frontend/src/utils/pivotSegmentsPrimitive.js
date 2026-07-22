/**
 * Canvas primitive for historical pivot segments and level labels.
 * Attached once to the candlestick series; updated via setSegments().
 */

function formatPivotPrice(value) {
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value) >= 1000) return value.toFixed(2)
  if (Math.abs(value) >= 1) return value.toFixed(4).replace(/\.?0+$/, '')
  return value.toPrecision(4)
}

class PivotSegmentsPaneRenderer {
  constructor(owner) {
    this._owner = owner
  }

  draw(target) {
    const chart = this._owner._chart
    const series = this._owner._series
    const segments = this._owner._segments
    const style = this._owner._styleOpts
    if (!chart || !series || !segments.length) return

    const timeScale = chart.timeScale()
    const showLabels = style.showLabels !== false
    const showPrices = style.showPrices === true
    const labelsPosition = style.labelsPosition === 'right' ? 'right' : 'left'

    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      for (const seg of segments) {
        const x1 = timeScale.timeToCoordinate(seg.startTime)
        const x2 = timeScale.timeToCoordinate(seg.endTime)
        const y = series.priceToCoordinate(seg.price)
        if (x1 === null || x2 === null || y === null) continue

        const scaledX1 = Math.round(x1 * horizontalPixelRatio)
        const scaledX2 = Math.round(x2 * horizontalPixelRatio)
        const scaledY = Math.round(y * verticalPixelRatio)
        const lineWidth = Math.max(1, (seg.lineWidth ?? 1) * horizontalPixelRatio)

        if (seg.drawLine) {
          context.strokeStyle = seg.color
          context.lineWidth = lineWidth
          context.beginPath()
          context.moveTo(scaledX1, scaledY)
          context.lineTo(scaledX2, scaledY)
          context.stroke()
        }

        if (showLabels) {
          let text = seg.label
          if (showPrices) {
            text = `${text} ${formatPivotPrice(seg.price)}`
          }
          const fontSize = Math.round(10 * verticalPixelRatio)
          context.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`
          context.fillStyle = seg.color
          context.textBaseline = 'bottom'
          const pad = Math.round(4 * horizontalPixelRatio)
          const labelY = scaledY - Math.round(3 * verticalPixelRatio)
          if (labelsPosition === 'left') {
            context.textAlign = 'left'
            context.fillText(text, scaledX1 + pad, labelY)
          } else {
            context.textAlign = 'right'
            context.fillText(text, scaledX2 - pad, labelY)
          }
        }
      }
    })
  }
}

class PivotSegmentsPaneView {
  constructor(owner) {
    this._owner = owner
  }

  renderer() {
    return this._owner._segments.length ? new PivotSegmentsPaneRenderer(this._owner) : null
  }
}

export class PivotSegmentsPrimitive {
  constructor() {
    this._segments = []
    this._styleOpts = {}
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new PivotSegmentsPaneView(this)
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

  setSegments(segments, styleOpts = {}) {
    this._segments = segments
    this._styleOpts = styleOpts
    this._requestUpdate?.()
  }

  clear() {
    this.setSegments([], {})
  }
}
