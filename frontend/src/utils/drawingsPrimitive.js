/**
 * Canvas primitive for user drawings. Attached once to the candlestick series;
 * updated via setDrawings() / setPreview() / setSelection().
 *
 * Coordinate fallback: times that fall in post-last-bar whitespace (or across
 * interval changes) are extrapolated from barSpacing + intervalSeconds so rays
 * and anchors never silently disappear.
 */

import {
  fibLevelPrices,
  fibExtensionPrices,
  positionMetrics,
  channelOppositeLine,
  measureMetrics,
} from './drawingTools.js'

function formatPrice(value) {
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value) >= 1000) return value.toFixed(2)
  if (Math.abs(value) >= 1) return value.toFixed(4).replace(/\.?0+$/, '')
  return value.toPrecision(4)
}

function applyLineDash(context, style, pixelRatio) {
  const unit = Math.max(1, pixelRatio)
  if (style === 'dashed') context.setLineDash([6 * unit, 4 * unit])
  else if (style === 'dotted') context.setLineDash([2 * unit, 3 * unit])
  else context.setLineDash([])
}

class DrawingPriceAxisView {
  constructor(owner, drawingId) {
    this._owner = owner
    this._drawingId = drawingId
    this._y = 0
    this._text = ''
    this._color = '#4a9eff'
    this._visible = false
  }

  update() {
    const drawing = this._owner._drawings.find((d) => d.id === this._drawingId)
      ?? (this._owner._preview?.id === this._drawingId ? this._owner._preview : null)
    const series = this._owner._series
    if (!drawing || !series || drawing.type !== 'horizontal') {
      this._visible = false
      return
    }
    const price = drawing.points[0]?.price
    const y = series.priceToCoordinate(price)
    if (y == null || !Number.isFinite(price)) {
      this._visible = false
      return
    }
    this._y = y
    this._text = formatPrice(price)
    this._color = drawing.color || '#4a9eff'
    this._visible = true
  }

  coordinate() {
    return this._y
  }

  text() {
    return this._text
  }

  textColor() {
    return '#ffffff'
  }

  backColor() {
    return this._color
  }

  visible() {
    return this._visible
  }
}

class DrawingsPaneRenderer {
  constructor(owner) {
    this._owner = owner
  }

  draw(target) {
    const chart = this._owner._chart
    const series = this._owner._series
    if (!chart || !series) return
    if (this._owner._hidden) return

    const drawings = this._owner._drawings
    const preview = this._owner._preview
    const selectedId = this._owner._selectedId
    const avwapCache = this._owner._avwapCache

    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio, verticalPixelRatio }) => {
      const paneWidth = bitmapSize.width / horizontalPixelRatio
      const paneHeight = bitmapSize.height / verticalPixelRatio
      const ctx = {
        context,
        hpr: horizontalPixelRatio,
        vpr: verticalPixelRatio,
        paneWidth,
        paneHeight,
        chart,
        series,
        owner: this._owner,
      }

      for (const drawing of drawings) {
        drawOne(ctx, drawing, drawing.id === selectedId, avwapCache.get(drawing.id))
      }
      if (preview) {
        drawOne(ctx, preview, false, avwapCache.get(preview.id), true)
      }
    })
  }
}

function timeToX(owner, chart, time) {
  const timeScale = chart.timeScale()
  const direct = timeScale.timeToCoordinate(time)
  if (direct != null) return direct

  const candles = owner._candles
  if (!candles?.length) return null

  const first = candles[0]
  const last = candles[candles.length - 1]
  const barSpacing = timeScale.options().barSpacing || 6
  const interval = owner._intervalSeconds || 60

  if (time > last.time) {
    const xLast = timeScale.timeToCoordinate(last.time)
    if (xLast == null) return null
    const bars = (time - last.time) / interval
    return xLast + bars * barSpacing
  }
  if (time < first.time) {
    const xFirst = timeScale.timeToCoordinate(first.time)
    if (xFirst == null) return null
    const bars = (first.time - time) / interval
    return xFirst - bars * barSpacing
  }

  // Between bars but coordinate null (whitespace gap) — interpolate nearest
  let nearest = first
  let best = Math.abs(first.time - time)
  for (const c of candles) {
    const d = Math.abs(c.time - time)
    if (d < best) {
      best = d
      nearest = c
    }
  }
  const xNear = timeScale.timeToCoordinate(nearest.time)
  if (xNear == null) return null
  return xNear + ((time - nearest.time) / interval) * barSpacing
}

function project(owner, chart, series, point) {
  if (!point) return null
  const x = timeToX(owner, chart, point.time)
  const y = series.priceToCoordinate(point.price)
  if (x == null || y == null) return null
  return { x, y }
}

function strokeLine(ctx, x1, y1, x2, y2, { color, lineWidth, lineStyle, alpha = 1 }) {
  const { context, hpr, vpr } = ctx
  context.save()
  context.globalAlpha = alpha
  context.strokeStyle = color
  context.lineWidth = Math.max(1, (lineWidth || 1) * hpr)
  applyLineDash(context, lineStyle, hpr)
  context.beginPath()
  context.moveTo(Math.round(x1 * hpr), Math.round(y1 * vpr))
  context.lineTo(Math.round(x2 * hpr), Math.round(y2 * vpr))
  context.stroke()
  context.setLineDash([])
  context.restore()
}

function fillText(ctx, text, x, y, color, { align = 'left', baseline = 'bottom', alpha = 1 } = {}) {
  const { context, hpr, vpr } = ctx
  const fontSize = Math.round(10 * vpr)
  context.save()
  context.globalAlpha = alpha
  context.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`
  context.fillStyle = color
  context.textAlign = align
  context.textBaseline = baseline
  context.fillText(text, Math.round(x * hpr + 4 * hpr), Math.round(y * vpr - 3 * vpr))
  context.restore()
}

function drawHandle(ctx, x, y, color) {
  const { context, hpr, vpr } = ctx
  const r = Math.max(3, 4 * hpr)
  context.save()
  context.fillStyle = '#ffffff'
  context.strokeStyle = color
  context.lineWidth = Math.max(1, hpr)
  context.beginPath()
  context.arc(Math.round(x * hpr), Math.round(y * vpr), r, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.restore()
}

function extendRay(x1, y1, x2, y2, paneWidth, paneHeight, extendLeft, extendRight) {
  // Return clipped endpoints for drawing, extending to pane edges as requested.
  const dx = x2 - x1
  const dy = y2 - y1
  let ax = x1
  let ay = y1
  let bx = x2
  let by = y2

  const extend = (fromX, fromY, dirX, dirY) => {
    if (dirX === 0 && dirY === 0) return { x: fromX, y: fromY }
    // Intersect with pane bounds in the given direction
    let tMax = Infinity
    if (dirX > 0) tMax = Math.min(tMax, (paneWidth - fromX) / dirX)
    else if (dirX < 0) tMax = Math.min(tMax, (0 - fromX) / dirX)
    if (dirY > 0) tMax = Math.min(tMax, (paneHeight - fromY) / dirY)
    else if (dirY < 0) tMax = Math.min(tMax, (0 - fromY) / dirY)
    if (!Number.isFinite(tMax) || tMax < 0) tMax = Math.max(paneWidth, paneHeight) * 2
    return { x: fromX + dirX * tMax, y: fromY + dirY * tMax }
  }

  if (extendRight) {
    const end = extend(x2, y2, dx, dy)
    bx = end.x
    by = end.y
  }
  if (extendLeft) {
    const start = extend(x1, y1, -dx, -dy)
    ax = start.x
    ay = start.y
  }
  return { x1: ax, y1: ay, x2: bx, y2: by }
}

function drawOne(ctx, drawing, selected, avwapSeries, isPreview = false) {
  const alpha = isPreview ? 0.55 : 1
  const { color, lineWidth, lineStyle } = drawing
  const style = { color, lineWidth, lineStyle, alpha }
  const pts = drawing.points.map((p) => project(ctx.owner, ctx.chart, ctx.series, p))

  switch (drawing.type) {
    case 'horizontal': {
      const p = pts[0]
      if (!p) break
      const x0 = drawing.meta?.extendRight ? p.x : 0
      const x1 = ctx.paneWidth
      strokeLine(ctx, x0, p.y, x1, p.y, style)
      if (selected) drawHandle(ctx, drawing.meta?.extendRight ? p.x : Math.min(40, ctx.paneWidth * 0.1), p.y, color)
      break
    }
    case 'vertical': {
      const p = pts[0]
      if (!p) break
      strokeLine(ctx, p.x, 0, p.x, ctx.paneHeight, style)
      if (selected) drawHandle(ctx, p.x, Math.min(40, ctx.paneHeight * 0.1), color)
      break
    }
    case 'trendline': {
      const [a, b] = pts
      if (!a || !b) break
      const ext = extendRay(a.x, a.y, b.x, b.y, ctx.paneWidth, ctx.paneHeight,
        Boolean(drawing.meta?.extendLeft), Boolean(drawing.meta?.extendRight))
      strokeLine(ctx, ext.x1, ext.y1, ext.x2, ext.y2, style)
      if (selected) {
        drawHandle(ctx, a.x, a.y, color)
        drawHandle(ctx, b.x, b.y, color)
      }
      break
    }
    case 'fib': {
      const [a, b] = pts
      if (!a || !b) break
      strokeLine(ctx, a.x, a.y, b.x, b.y, { ...style, lineWidth: 1, lineStyle: 'dotted', alpha: alpha * 0.7 })
      const levels = fibLevelPrices(drawing.points[0], drawing.points[1])
      const xLeft = Math.min(a.x, b.x)
      const xRight = Math.max(a.x, b.x)
      for (const level of levels) {
        const y = ctx.series.priceToCoordinate(level.price)
        if (y == null) continue
        const heavy = level.heavy
        strokeLine(ctx, xLeft, y, xRight, y, {
          color,
          lineWidth: heavy ? Math.max(2, lineWidth) : lineWidth,
          lineStyle: heavy ? 'solid' : lineStyle,
          alpha,
        })
        if (drawing.meta?.showLabels !== false) {
          fillText(ctx, `${level.label} (${formatPrice(level.price)})`, xRight, y, color, { alpha })
        }
      }
      if (selected) {
        drawHandle(ctx, a.x, a.y, color)
        drawHandle(ctx, b.x, b.y, color)
      }
      break
    }
    case 'fib-extension': {
      const [a, b, c] = pts
      if (!a || !b) break
      strokeLine(ctx, a.x, a.y, b.x, b.y, { ...style, lineWidth: 1, lineStyle: 'dotted', alpha: alpha * 0.7 })
      if (c) strokeLine(ctx, b.x, b.y, c.x, c.y, { ...style, lineWidth: 1, lineStyle: 'dotted', alpha: alpha * 0.7 })
      if (!drawing.points[2]) break
      const levels = fibExtensionPrices(drawing.points[0], drawing.points[1], drawing.points[2])
      const x0 = c?.x ?? b.x
      const x1 = Math.min(ctx.paneWidth, x0 + Math.max(80, Math.abs((b?.x ?? 0) - (a?.x ?? 0))))
      for (const level of levels) {
        const y = ctx.series.priceToCoordinate(level.price)
        if (y == null) continue
        strokeLine(ctx, x0, y, x1, y, {
          color,
          lineWidth: level.heavy ? Math.max(2, lineWidth) : lineWidth,
          lineStyle: level.heavy ? 'solid' : lineStyle,
          alpha,
        })
        if (drawing.meta?.showLabels !== false) {
          fillText(ctx, `${level.label} (${formatPrice(level.price)})`, x1, y, color, { alpha })
        }
      }
      if (selected) {
        for (const p of pts) if (p) drawHandle(ctx, p.x, p.y, color)
      }
      break
    }
    case 'rect': {
      const [a, b] = pts
      if (!a || !b) break
      const left = Math.round(Math.min(a.x, b.x) * ctx.hpr)
      const right = Math.round(Math.max(a.x, b.x) * ctx.hpr)
      const top = Math.round(Math.min(a.y, b.y) * ctx.vpr)
      const bottom = Math.round(Math.max(a.y, b.y) * ctx.vpr)
      const { context } = ctx
      context.save()
      context.globalAlpha = 0.15 * alpha
      context.fillStyle = color
      context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top))
      context.globalAlpha = alpha
      context.strokeStyle = color
      context.lineWidth = Math.max(1, (lineWidth || 1) * ctx.hpr)
      applyLineDash(context, lineStyle, ctx.hpr)
      context.strokeRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top))
      context.setLineDash([])
      context.restore()
      if (selected) {
        drawHandle(ctx, a.x, a.y, color)
        drawHandle(ctx, b.x, b.y, color)
      }
      break
    }
    case 'channel': {
      const [a, b, c] = pts
      if (!a || !b) break
      const ext1 = extendRay(a.x, a.y, b.x, b.y, ctx.paneWidth, ctx.paneHeight,
        Boolean(drawing.meta?.extendLeft), Boolean(drawing.meta?.extendRight))
      strokeLine(ctx, ext1.x1, ext1.y1, ext1.x2, ext1.y2, style)
      if (c && drawing.points[2]) {
        const opp = channelOppositeLine(drawing.points[0], drawing.points[1], drawing.points[2])
        const oa = project(ctx.owner, ctx.chart, ctx.series, opp.a)
        const ob = project(ctx.owner, ctx.chart, ctx.series, opp.b)
        if (oa && ob) {
          const ext2 = extendRay(oa.x, oa.y, ob.x, ob.y, ctx.paneWidth, ctx.paneHeight,
            Boolean(drawing.meta?.extendLeft), Boolean(drawing.meta?.extendRight))
          strokeLine(ctx, ext2.x1, ext2.y1, ext2.x2, ext2.y2, style)
          // Fill between
          const { context } = ctx
          context.save()
          context.globalAlpha = 0.08 * alpha
          context.fillStyle = color
          context.beginPath()
          context.moveTo(ext1.x1 * ctx.hpr, ext1.y1 * ctx.vpr)
          context.lineTo(ext1.x2 * ctx.hpr, ext1.y2 * ctx.vpr)
          context.lineTo(ext2.x2 * ctx.hpr, ext2.y2 * ctx.vpr)
          context.lineTo(ext2.x1 * ctx.hpr, ext2.y1 * ctx.vpr)
          context.closePath()
          context.fill()
          context.restore()
        }
      }
      if (selected) {
        for (const p of pts) if (p) drawHandle(ctx, p.x, p.y, color)
      }
      break
    }
    case 'position': {
      const [entry, stop, target] = pts
      if (!entry) break
      const metrics = positionMetrics(drawing)
      const bandLeft = entry.x
      const bandRight = Math.min(ctx.paneWidth, entry.x + 120)
      if (stop) {
        // Risk zone
        const { context } = ctx
        const top = Math.min(entry.y, stop.y)
        const bot = Math.max(entry.y, stop.y)
        context.save()
        context.globalAlpha = 0.18 * alpha
        context.fillStyle = '#ef5350'
        context.fillRect(bandLeft * ctx.hpr, top * ctx.vpr, (bandRight - bandLeft) * ctx.hpr, (bot - top) * ctx.vpr)
        context.restore()
        strokeLine(ctx, bandLeft, stop.y, bandRight, stop.y, { color: '#ef5350', lineWidth, lineStyle, alpha })
      }
      if (target) {
        const { context } = ctx
        const top = Math.min(entry.y, target.y)
        const bot = Math.max(entry.y, target.y)
        context.save()
        context.globalAlpha = 0.18 * alpha
        context.fillStyle = '#26a69a'
        context.fillRect(bandLeft * ctx.hpr, top * ctx.vpr, (bandRight - bandLeft) * ctx.hpr, (bot - top) * ctx.vpr)
        context.restore()
        strokeLine(ctx, bandLeft, target.y, bandRight, target.y, { color: '#26a69a', lineWidth, lineStyle, alpha })
      }
      strokeLine(ctx, bandLeft, entry.y, bandRight, entry.y, { color, lineWidth: Math.max(2, lineWidth), lineStyle: 'solid', alpha })
      if (metrics) {
        let label = `${metrics.side.toUpperCase()}  R:R ${metrics.rr.toFixed(2)}`
        if (metrics.positionSize != null) label += `  sz ${metrics.positionSize.toFixed(4)}`
        fillText(ctx, label, bandRight, entry.y, color, { alpha })
        fillText(ctx, `risk ${metrics.riskPct.toFixed(2)}%  rew ${metrics.rewardPct.toFixed(2)}%`, bandRight, entry.y + 14, color, { alpha })
      }
      if (selected) {
        for (const p of pts) if (p) drawHandle(ctx, p.x, p.y, color)
      }
      break
    }
    case 'avwap': {
      const anchor = pts[0]
      if (!anchor) break
      drawHandle(ctx, anchor.x, anchor.y, color)
      if (avwapSeries?.length) {
        const drawSeries = (points, width, dash) => {
          const coords = []
          for (const pt of points) {
            if (pt.value == null) continue
            const x = timeToX(ctx.owner, ctx.chart, pt.time)
            const y = ctx.series.priceToCoordinate(pt.value)
            if (x == null || y == null) continue
            coords.push({ x, y })
          }
          if (coords.length < 2) return
          const { context } = ctx
          context.save()
          context.globalAlpha = alpha
          context.strokeStyle = color
          context.lineWidth = Math.max(1, width * ctx.hpr)
          applyLineDash(context, dash, ctx.hpr)
          context.beginPath()
          context.moveTo(coords[0].x * ctx.hpr, coords[0].y * ctx.vpr)
          for (let i = 1; i < coords.length; i += 1) {
            context.lineTo(coords[i].x * ctx.hpr, coords[i].y * ctx.vpr)
          }
          context.stroke()
          context.setLineDash([])
          context.restore()
        }
        drawSeries(avwapSeries.map((p) => ({ time: p.time, value: p.vwap })), Math.max(2, lineWidth), 'solid')
        if (drawing.meta?.showBands !== false) {
          drawSeries(avwapSeries.map((p) => ({ time: p.time, value: p.upper1 })), 1, 'dotted')
          drawSeries(avwapSeries.map((p) => ({ time: p.time, value: p.lower1 })), 1, 'dotted')
          drawSeries(avwapSeries.map((p) => ({ time: p.time, value: p.upper2 })), 1, 'dashed')
          drawSeries(avwapSeries.map((p) => ({ time: p.time, value: p.lower2 })), 1, 'dashed')
        }
      }
      break
    }
    case 'text': {
      const p = pts[0]
      if (!p) break
      const text = drawing.meta?.text || 'Note'
      const { context } = ctx
      const fontSize = Math.round(12 * ctx.vpr)
      context.save()
      context.globalAlpha = alpha
      context.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`
      context.fillStyle = color
      context.textBaseline = 'middle'
      context.textAlign = 'left'
      context.fillText(text, Math.round(p.x * ctx.hpr + 6 * ctx.hpr), Math.round(p.y * ctx.vpr))
      context.restore()
      if (selected) drawHandle(ctx, p.x, p.y, color)
      break
    }
    case 'measure': {
      const [a, b] = pts
      if (!a || !b) break
      strokeLine(ctx, a.x, a.y, b.x, b.y, { color, lineWidth: 1, lineStyle: 'dashed', alpha })
      const metrics = measureMetrics(drawing.points[0], drawing.points[1], ctx.owner._candles)
      if (metrics) {
        const midX = (a.x + b.x) / 2
        const midY = (a.y + b.y) / 2
        const parts = [
          `${metrics.deltaPrice >= 0 ? '+' : ''}${formatPrice(metrics.deltaPrice)}`,
          `${metrics.deltaPct >= 0 ? '+' : ''}${metrics.deltaPct.toFixed(2)}%`,
        ]
        if (metrics.barCount != null) parts.push(`${metrics.barCount} bars`)
        if (metrics.atrMultiple != null) parts.push(`${metrics.atrMultiple.toFixed(2)} ATR`)
        parts.push(metrics.elapsedLabel)
        fillText(ctx, parts.join(' · '), midX, midY, color, { align: 'center', alpha })
      }
      drawHandle(ctx, a.x, a.y, color)
      drawHandle(ctx, b.x, b.y, color)
      break
    }
    default:
      break
  }
}

class DrawingsPaneView {
  constructor(owner) {
    this._owner = owner
    this._renderer = new DrawingsPaneRenderer(owner)
  }

  renderer() {
    const hasContent = this._owner._drawings.length > 0 || this._owner._preview
    return hasContent && !this._owner._hidden ? this._renderer : null
  }

  zOrder() {
    return 'top'
  }
}

export class DrawingsPrimitive {
  constructor() {
    this._drawings = []
    this._preview = null
    this._selectedId = null
    this._hidden = false
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._candles = []
    this._intervalSeconds = 60
    this._avwapCache = new Map()
    this._paneView = new DrawingsPaneView(this)
    this._priceAxisViews = []
    this._priceAxisViewsRef = this._priceAxisViews
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

  priceAxisViews() {
    return this._priceAxisViewsRef
  }

  updateAllViews() {
    for (const view of this._priceAxisViews) view.update()
  }

  setContext({ candles, intervalSeconds } = {}) {
    if (candles) this._candles = candles
    if (intervalSeconds != null) this._intervalSeconds = intervalSeconds
    this._requestUpdate?.()
  }

  setAvwapSeries(drawingId, seriesPoints) {
    if (!drawingId) return
    if (!seriesPoints) this._avwapCache.delete(drawingId)
    else this._avwapCache.set(drawingId, seriesPoints)
    this._requestUpdate?.()
  }

  setDrawings(drawings) {
    this._drawings = Array.isArray(drawings) ? drawings : []
    this._rebuildAxisViews()
    this._requestUpdate?.()
  }

  setPreview(drawing) {
    this._preview = drawing || null
    this._rebuildAxisViews()
    this._requestUpdate?.()
  }

  setSelection(id) {
    this._selectedId = id || null
    this._requestUpdate?.()
  }

  setHidden(hidden) {
    this._hidden = Boolean(hidden)
    this._requestUpdate?.()
  }

  clear() {
    this._drawings = []
    this._preview = null
    this._selectedId = null
    this._avwapCache.clear()
    this._rebuildAxisViews()
    this._requestUpdate?.()
  }

  /** Expose timeToX for hit-testing from ChartPanel. */
  timeToX(time) {
    if (!this._chart) return null
    return timeToX(this, this._chart, time)
  }

  projectPoint(point) {
    if (!this._chart || !this._series) return null
    return project(this, this._chart, this._series, point)
  }

  _rebuildAxisViews() {
    const horizontals = [
      ...this._drawings.filter((d) => d.type === 'horizontal'),
      ...(this._preview?.type === 'horizontal' ? [this._preview] : []),
    ]
    const next = horizontals.map((d) => {
      const existing = this._priceAxisViews.find((v) => v._drawingId === d.id)
      if (existing) {
        existing.update()
        return existing
      }
      const view = new DrawingPriceAxisView(this, d.id)
      view.update()
      return view
    })
    const changed = next.length !== this._priceAxisViews.length
      || next.some((v, i) => v !== this._priceAxisViews[i])
    this._priceAxisViews = next
    if (changed) this._priceAxisViewsRef = this._priceAxisViews
  }
}
