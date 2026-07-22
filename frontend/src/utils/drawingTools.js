/**
 * Chart drawing tools — pure model, geometry, and localStorage persistence.
 * No React, no chart objects. Coordinate mapping that needs a live chart lives in ChartPanel.
 */

export const DRAWING_STORAGE_PREFIX = 'forge_chart_drawings'
export const MAX_DRAWINGS_PER_SYMBOL = 200
export const HIT_TOLERANCE_PX = 6
export const MAGNET_TOLERANCE_PX = 8

export const DRAWING_PALETTE = [
  '#4a9eff',
  '#ef5350',
  '#26a69a',
  '#ffb74d',
  '#ab47bc',
  '#78909c',
  '#ec407a',
  '#66bb6a',
]

export const FIB_LEVELS = [
  { ratio: 0, label: '0' },
  { ratio: 0.236, label: '0.236' },
  { ratio: 0.382, label: '0.382' },
  { ratio: 0.5, label: '0.5' },
  { ratio: 0.618, label: '0.618', heavy: true },
  { ratio: 0.786, label: '0.786' },
  { ratio: 1, label: '1' },
]

export const FIB_EXTENSION_LEVELS = [
  { ratio: 0.618, label: '0.618' },
  { ratio: 1.0, label: '1.0' },
  { ratio: 1.272, label: '1.272' },
  { ratio: 1.618, label: '1.618', heavy: true },
  { ratio: 2.0, label: '2.0' },
]

/** Tools that appear in the rail. `points` is how many anchors to commit. */
export const DRAWING_TOOLS = {
  pointer: { id: 'pointer', label: 'Select', points: 0, ephemeral: false },
  horizontal: { id: 'horizontal', label: 'Horizontal', points: 1 },
  vertical: { id: 'vertical', label: 'Vertical', points: 1 },
  trendline: { id: 'trendline', label: 'Trend / Ray', points: 2 },
  fib: { id: 'fib', label: 'Fib Retracement', points: 2 },
  rect: { id: 'rect', label: 'Rectangle', points: 2 },
  measure: { id: 'measure', label: 'Measure', points: 2, ephemeral: true },
  position: { id: 'position', label: 'Long / Short', points: 3 },
  avwap: { id: 'avwap', label: 'Anchored VWAP', points: 1 },
  'fib-extension': { id: 'fib-extension', label: 'Fib Extension', points: 3 },
  channel: { id: 'channel', label: 'Parallel Channel', points: 3 },
  text: { id: 'text', label: 'Text', points: 1 },
}

const VALID_TYPES = new Set(Object.keys(DRAWING_TOOLS).filter((id) => id !== 'pointer' && id !== 'measure'))
const VALID_LINE_STYLES = new Set(['solid', 'dashed', 'dotted'])

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `dw_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  }
  return `dw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function sanitizePoint(point) {
  if (!point || typeof point !== 'object') return null
  const time = Number(point.time)
  const price = Number(point.price)
  if (!isFiniteNumber(time) || !isFiniteNumber(price)) return null
  return { time, price }
}

function sanitizeColor(color, fallback = DRAWING_PALETTE[0]) {
  if (typeof color !== 'string') return fallback
  const trimmed = color.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1)
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return fallback
}

function sanitizeMeta(type, meta) {
  const src = meta && typeof meta === 'object' ? meta : {}
  const out = {}

  if (type === 'horizontal' || type === 'trendline' || type === 'channel') {
    out.extendRight = Boolean(src.extendRight)
  }
  if (type === 'trendline' || type === 'channel') {
    out.extendLeft = Boolean(src.extendLeft)
  }
  if (type === 'horizontal') {
    // Ray-right from the bar it formed on (default off = full-width level).
    if (src.extendRight == null && src.rayRight != null) out.extendRight = Boolean(src.rayRight)
  }
  if (type === 'fib' || type === 'fib-extension') {
    out.showLabels = src.showLabels !== false
  }
  if (type === 'avwap') {
    out.showBands = src.showBands !== false
    if (isFiniteNumber(Number(src.anchorIndex))) out.anchorIndex = Math.max(0, Math.floor(Number(src.anchorIndex)))
  }
  if (type === 'position') {
    out.side = src.side === 'short' ? 'short' : 'long'
    const accountSize = Number(src.accountSize)
    const riskPct = Number(src.riskPct)
    if (isFiniteNumber(accountSize) && accountSize > 0) out.accountSize = accountSize
    if (isFiniteNumber(riskPct) && riskPct > 0 && riskPct <= 100) out.riskPct = riskPct
  }
  if (type === 'text') {
    const text = typeof src.text === 'string' ? src.text.slice(0, 200) : ''
    out.text = text || 'Note'
  }
  if (src.locked != null) {
    // locked lives on the drawing root; ignore here
  }
  return out
}

export function defaultMetaForType(type) {
  switch (type) {
    case 'horizontal':
      return { extendRight: false }
    case 'trendline':
      return { extendRight: true, extendLeft: false }
    case 'channel':
      return { extendRight: true, extendLeft: false }
    case 'fib':
    case 'fib-extension':
      return { showLabels: true }
    case 'avwap':
      return { showBands: true }
    case 'position':
      return { side: 'long' }
    case 'text':
      return { text: 'Note' }
    default:
      return {}
  }
}

export function createDrawing(type, points, options = {}) {
  if (!VALID_TYPES.has(type) && type !== 'measure') {
    throw new Error(`Unknown drawing type: ${type}`)
  }
  const tool = DRAWING_TOOLS[type]
  const required = tool?.points ?? points.length
  const cleaned = (points || []).map(sanitizePoint).filter(Boolean)
  if (cleaned.length < required && type !== 'measure') {
    throw new Error(`${type} needs ${required} points`)
  }

  const color = sanitizeColor(options.color, options.defaultColor || DRAWING_PALETTE[0])
  const lineWidth = Math.max(1, Math.min(4, Math.round(Number(options.lineWidth) || 1)))
  const lineStyle = VALID_LINE_STYLES.has(options.lineStyle) ? options.lineStyle : 'solid'

  return {
    id: options.id || randomId(),
    type,
    points: cleaned.slice(0, Math.max(required, cleaned.length)),
    color,
    lineWidth,
    lineStyle,
    locked: Boolean(options.locked),
    meta: { ...defaultMetaForType(type), ...sanitizeMeta(type, options.meta) },
  }
}

/** Fib retracement prices: p0 + (p1 - p0) * r */
export function fibLevelPrices(p0, p1, levels = FIB_LEVELS) {
  if (!p0 || !p1 || !isFiniteNumber(p0.price) || !isFiniteNumber(p1.price)) return []
  const range = p1.price - p0.price
  return levels.map((level) => ({
    ...level,
    price: p0.price + range * level.ratio,
  }))
}

/** Fib extension off A-B-C: p2 + (p1 - p0) * r */
export function fibExtensionPrices(p0, p1, p2, levels = FIB_EXTENSION_LEVELS) {
  if (!p0 || !p1 || !p2) return []
  if (![p0, p1, p2].every((p) => isFiniteNumber(p.price))) return []
  const leg = p1.price - p0.price
  return levels.map((level) => ({
    ...level,
    price: p2.price + leg * level.ratio,
  }))
}

/**
 * Position metrics from entry / stop / target.
 * points: [entry, stop, target]
 */
export function positionMetrics(drawing) {
  const [entry, stop, target] = drawing?.points || []
  if (!entry || !stop || !target) return null
  if (![entry, stop, target].every((p) => isFiniteNumber(p.price))) return null

  const risk = Math.abs(entry.price - stop.price)
  const reward = Math.abs(target.price - entry.price)
  if (risk <= 0) return null

  const side = drawing.meta?.side === 'short' ? 'short' : 'long'
  // Sanity: long wants stop below entry; short wants stop above. Still compute either way.
  const riskPct = (risk / entry.price) * 100
  const rewardPct = (reward / entry.price) * 100
  const rr = reward / risk

  let positionSize = null
  const accountSize = Number(drawing.meta?.accountSize)
  const accountRiskPct = Number(drawing.meta?.riskPct)
  if (isFiniteNumber(accountSize) && accountSize > 0 && isFiniteNumber(accountRiskPct) && accountRiskPct > 0) {
    const dollarsAtRisk = accountSize * (accountRiskPct / 100)
    positionSize = dollarsAtRisk / risk
  }

  return {
    side,
    entry: entry.price,
    stop: stop.price,
    target: target.price,
    risk,
    reward,
    riskPct,
    rewardPct,
    rr,
    positionSize,
  }
}

/** Ephemeral measure readout. */
export function measureMetrics(p0, p1, candles = []) {
  if (!p0 || !p1) return null
  const deltaPrice = p1.price - p0.price
  const deltaPct = p0.price !== 0 ? (deltaPrice / p0.price) * 100 : 0
  const deltaTime = p1.time - p0.time
  const barCount = estimateBarCount(p0.time, p1.time, candles)
  const last = candles[candles.length - 1]
  const atr = Number(last?.atr14)
  const atrMultiple = isFiniteNumber(atr) && atr > 0 ? Math.abs(deltaPrice) / atr : null

  return {
    deltaPrice,
    deltaPct,
    deltaTime,
    barCount,
    atrMultiple,
    elapsedLabel: formatElapsed(deltaTime),
  }
}

function estimateBarCount(t0, t1, candles) {
  if (!candles?.length) return null
  const lo = Math.min(t0, t1)
  const hi = Math.max(t0, t1)
  let count = 0
  for (const c of candles) {
    if (c.time >= lo && c.time <= hi) count += 1
  }
  if (count > 0) return Math.max(1, count - 1)
  // Whitespace / no bars between — estimate from interval.
  if (candles.length >= 2) {
    const step = candles[candles.length - 1].time - candles[candles.length - 2].time
    if (step > 0) return Math.max(1, Math.round(Math.abs(t1 - t0) / step))
  }
  return null
}

function formatElapsed(seconds) {
  const abs = Math.abs(seconds)
  if (abs < 60) return `${Math.round(abs)}s`
  if (abs < 3600) return `${Math.round(abs / 60)}m`
  if (abs < 86400) return `${(abs / 3600).toFixed(1)}h`
  return `${(abs / 86400).toFixed(1)}d`
}

/**
 * Snap price (and time) to nearest candle OHLC within pixel tolerance.
 * `priceToY` converts a price to screen Y; without it, snap uses absolute price distance
 * ranked by OHLC only (tests / non-chart callers).
 */
export function snapToCandle(point, candles, options = {}) {
  if (!point || !candles?.length) return point
  const { priceToY = null, tolerancePx = MAGNET_TOLERANCE_PX } = options

  let candle = null
  let bestTimeDist = Infinity
  for (const c of candles) {
    const dist = Math.abs(c.time - point.time)
    if (dist < bestTimeDist) {
      bestTimeDist = dist
      candle = c
    }
  }
  if (!candle) return point

  const members = [
    { key: 'open', price: candle.open },
    { key: 'high', price: candle.high },
    { key: 'low', price: candle.low },
    { key: 'close', price: candle.close },
  ].filter((m) => isFiniteNumber(m.price))

  if (!members.length) return { time: candle.time, price: point.price }

  let best = members[0]
  let bestDist = Infinity

  if (typeof priceToY === 'function') {
    const y = priceToY(point.price)
    if (y == null) return { time: candle.time, price: point.price }
    for (const m of members) {
      const my = priceToY(m.price)
      if (my == null) continue
      const dist = Math.abs(my - y)
      if (dist < bestDist) {
        bestDist = dist
        best = m
      }
    }
    if (bestDist > tolerancePx) return { time: candle.time, price: point.price }
  } else {
    for (const m of members) {
      const dist = Math.abs(m.price - point.price)
      if (dist < bestDist) {
        bestDist = dist
        best = m
      }
    }
  }

  return { time: candle.time, price: best.price, snappedTo: best.key }
}

export function sanitizeDrawing(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = String(raw.type || '')
  if (!VALID_TYPES.has(type)) return null

  const points = (Array.isArray(raw.points) ? raw.points : [])
    .map(sanitizePoint)
    .filter(Boolean)
  const required = DRAWING_TOOLS[type]?.points ?? 1
  if (points.length < required) return null

  try {
    return createDrawing(type, points.slice(0, Math.max(required, points.length)), {
      id: typeof raw.id === 'string' && raw.id ? raw.id : undefined,
      color: raw.color,
      lineWidth: raw.lineWidth,
      lineStyle: raw.lineStyle,
      locked: raw.locked,
      meta: raw.meta,
    })
  } catch {
    return null
  }
}

export function sanitizeDrawings(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const drawing = sanitizeDrawing(item)
    if (!drawing) continue
    if (seen.has(drawing.id)) continue
    seen.add(drawing.id)
    out.push(drawing)
    if (out.length >= MAX_DRAWINGS_PER_SYMBOL) break
  }
  return out
}

function storageKey(userKey) {
  return `${DRAWING_STORAGE_PREFIX}:${userKey || 'guest'}`
}

function sanitizeStore(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { _defaults: {} }
  }
  const out = { _defaults: {} }
  if (raw._defaults && typeof raw._defaults === 'object') {
    for (const [type, color] of Object.entries(raw._defaults)) {
      if (VALID_TYPES.has(type) || type === 'measure') {
        out._defaults[type] = sanitizeColor(color)
      }
    }
  }
  for (const [symbol, drawings] of Object.entries(raw)) {
    if (symbol === '_defaults') continue
    if (typeof symbol !== 'string' || !symbol) continue
    out[symbol] = sanitizeDrawings(drawings)
  }
  return out
}

export function loadDrawingsStore(userKey) {
  try {
    const raw = localStorage.getItem(storageKey(userKey))
    if (!raw) return { _defaults: {} }
    return sanitizeStore(JSON.parse(raw))
  } catch {
    return { _defaults: {} }
  }
}

export function loadDrawings(userKey, symbol) {
  const store = loadDrawingsStore(userKey)
  const key = String(symbol || '').toUpperCase()
  return {
    drawings: sanitizeDrawings(store[key] || []),
    defaults: { ...(store._defaults || {}) },
  }
}

export function saveDrawings(userKey, symbol, drawings, defaults = null) {
  try {
    const store = loadDrawingsStore(userKey)
    const key = String(symbol || '').toUpperCase()
    store[key] = sanitizeDrawings(drawings)
    if (defaults && typeof defaults === 'object') {
      store._defaults = { ...store._defaults, ...defaults }
      for (const [type, color] of Object.entries(store._defaults)) {
        store._defaults[type] = sanitizeColor(color)
      }
    }
    localStorage.setItem(storageKey(userKey), JSON.stringify(store))
  } catch {
    // Private-mode / quota — swallow.
  }
}

// ── Geometry / hit-testing ──────────────────────────────────────────────

function distPointToPoint(ax, ay, bx, by) {
  const dx = ax - bx
  const dy = ay - by
  return Math.hypot(dx, dy)
}

/** Shortest distance from point P to segment AB (or infinite line if extend flags). */
export function distPointToSegment(px, py, ax, ay, bx, by, { extendLeft = false, extendRight = false } = {}) {
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby
  if (len2 === 0) return distPointToPoint(px, py, ax, ay)

  let t = ((px - ax) * abx + (py - ay) * aby) / len2
  if (!extendLeft) t = Math.max(0, t)
  if (!extendRight) t = Math.min(1, t)
  if (!extendLeft && !extendRight) t = Math.max(0, Math.min(1, t))

  const cx = ax + t * abx
  const cy = ay + t * aby
  return distPointToPoint(px, py, cx, cy)
}

function distToHorizontal(px, py, y, xStart, xEnd) {
  if (px < Math.min(xStart, xEnd) - HIT_TOLERANCE_PX || px > Math.max(xStart, xEnd) + HIT_TOLERANCE_PX) {
    // Still allow hit near the line if within y tolerance and roughly in pane — for full-width,
    // xStart/xEnd span the pane so this rarely triggers.
  }
  const withinX = px >= Math.min(xStart, xEnd) - HIT_TOLERANCE_PX && px <= Math.max(xStart, xEnd) + HIT_TOLERANCE_PX
  if (!withinX) return Infinity
  return Math.abs(py - y)
}

function distToVertical(px, py, x, yTop, yBottom) {
  const withinY = py >= Math.min(yTop, yBottom) - HIT_TOLERANCE_PX && py <= Math.max(yTop, yBottom) + HIT_TOLERANCE_PX
  if (!withinY) return Infinity
  return Math.abs(px - x)
}

function distToRectEdge(px, py, left, top, right, bottom) {
  const insideX = px >= left && px <= right
  const insideY = py >= top && py <= bottom
  if (insideX && insideY) {
    return Math.min(px - left, right - px, py - top, bottom - py)
  }
  // Outside — distance to nearest edge segment
  const clampedX = Math.max(left, Math.min(right, px))
  const clampedY = Math.max(top, Math.min(bottom, py))
  if (insideX) return Math.min(Math.abs(py - top), Math.abs(py - bottom))
  if (insideY) return Math.min(Math.abs(px - left), Math.abs(px - right))
  return distPointToPoint(px, py, clampedX, clampedY)
}

/**
 * Project drawing anchors to screen via `projectPoint(point) -> {x,y}|null`.
 * `pane` supplies { width, height } for full-span lines.
 */
export function hitTestDrawings(drawings, { x, y }, projectPoint, pane = {}, tolerance = HIT_TOLERANCE_PX) {
  if (!drawings?.length || typeof projectPoint !== 'function') return null

  const paneWidth = pane.width ?? 0
  const paneHeight = pane.height ?? 0
  let best = null
  let bestDist = tolerance

  // Topmost (last drawn) wins on ties — iterate reverse.
  for (let i = drawings.length - 1; i >= 0; i -= 1) {
    const drawing = drawings[i]
    if (drawing.locked) continue
    const dist = distanceToDrawing(drawing, x, y, projectPoint, paneWidth, paneHeight)
    if (dist <= bestDist) {
      bestDist = dist
      best = drawing
    }
  }
  return best
}

function distanceToDrawing(drawing, x, y, projectPoint, paneWidth, paneHeight) {
  const pts = (drawing.points || []).map(projectPoint)
  if (pts.some((p) => !p || !isFiniteNumber(p.x) || !isFiniteNumber(p.y))) {
    // Partial visibility — still try with whatever we have
  }

  switch (drawing.type) {
    case 'horizontal': {
      const p = pts[0]
      if (!p) return Infinity
      const x0 = drawing.meta?.extendRight ? p.x : 0
      const x1 = paneWidth || p.x + 10000
      return distToHorizontal(x, y, p.y, x0, x1)
    }
    case 'vertical': {
      const p = pts[0]
      if (!p) return Infinity
      return distToVertical(x, y, p.x, 0, paneHeight || p.y + 10000)
    }
    case 'trendline': {
      const [a, b] = pts
      if (!a || !b) return Infinity
      return distPointToSegment(x, y, a.x, a.y, b.x, b.y, {
        extendLeft: Boolean(drawing.meta?.extendLeft),
        extendRight: Boolean(drawing.meta?.extendRight),
      })
    }
    case 'fib':
    case 'fib-extension': {
      const levels = drawing.type === 'fib'
        ? fibLevelPrices(drawing.points[0], drawing.points[1])
        : fibExtensionPrices(drawing.points[0], drawing.points[1], drawing.points[2])
      let min = Infinity
      const x0 = pts[0]?.x
      const x1 = pts[drawing.type === 'fib' ? 1 : 2]?.x ?? pts[1]?.x
      if (x0 == null || x1 == null) return Infinity
      for (const level of levels) {
        const proj = projectPoint({ time: drawing.points[0].time, price: level.price })
        if (!proj) continue
        const d = distToHorizontal(x, y, proj.y, x0, x1)
        if (d < min) min = d
      }
      // Also allow hit on the trend spine
      if (pts[0] && pts[1]) {
        min = Math.min(min, distPointToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y))
      }
      return min
    }
    case 'rect': {
      const [a, b] = pts
      if (!a || !b) return Infinity
      return distToRectEdge(x, y, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y))
    }
    case 'channel': {
      const [a, b, c] = pts
      if (!a || !b) return Infinity
      const d1 = distPointToSegment(x, y, a.x, a.y, b.x, b.y, {
        extendLeft: Boolean(drawing.meta?.extendLeft),
        extendRight: Boolean(drawing.meta?.extendRight),
      })
      if (!c) return d1
      const dx = b.x - a.x
      const dy = b.y - a.y
      // Parallel through c: offset = c - projection of c onto ab direction from a… simpler: offset vector from a to c projected perpendicular
      const c2x = c.x + dx
      const c2y = c.y + dy
      const d2 = distPointToSegment(x, y, c.x, c.y, c2x, c2y, {
        extendLeft: Boolean(drawing.meta?.extendLeft),
        extendRight: Boolean(drawing.meta?.extendRight),
      })
      return Math.min(d1, d2)
    }
    case 'position': {
      const [entry, stop, target] = pts
      let min = Infinity
      if (entry) min = Math.min(min, Math.abs(y - entry.y) + (Math.abs(x - entry.x) > 40 ? 20 : 0))
      // Hit any of the three horizontals across a band
      for (const p of [entry, stop, target]) {
        if (!p) continue
        min = Math.min(min, distToHorizontal(x, y, p.y, Math.min(entry?.x ?? p.x, target?.x ?? p.x) - 20, Math.max(entry?.x ?? p.x, target?.x ?? p.x) + 80))
      }
      return min
    }
    case 'avwap': {
      const p = pts[0]
      if (!p) return Infinity
      return distPointToPoint(x, y, p.x, p.y)
    }
    case 'text': {
      const p = pts[0]
      if (!p) return Infinity
      return distPointToPoint(x, y, p.x, p.y)
    }
    default:
      return Infinity
  }
}

/** Resolve parallel channel third point into the opposite line endpoints. */
export function channelOppositeLine(p0, p1, p2) {
  if (!p0 || !p1 || !p2) return null
  return {
    a: { time: p2.time, price: p2.price },
    b: {
      time: p2.time + (p1.time - p0.time),
      price: p2.price + (p1.price - p0.price),
    },
  }
}

export function findCandleIndexByTime(candles, time) {
  if (!candles?.length || !isFiniteNumber(time)) return -1
  let best = 0
  let bestDist = Math.abs(candles[0].time - time)
  for (let i = 1; i < candles.length; i += 1) {
    const dist = Math.abs(candles[i].time - time)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}
