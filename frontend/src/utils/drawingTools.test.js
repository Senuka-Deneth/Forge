import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createDrawing,
  sanitizeDrawings,
  sanitizeDrawing,
  fibLevelPrices,
  fibExtensionPrices,
  positionMetrics,
  snapToCandle,
  hitTestDrawings,
  distPointToSegment,
  measureMetrics,
  loadDrawings,
  saveDrawings,
  MAX_DRAWINGS_PER_SYMBOL,
  FIB_LEVELS,
} from './drawingTools.js'

describe('sanitizeDrawings', () => {
  it('round-trips a valid set and drops malformed entries', () => {
    const raw = [
      createDrawing('horizontal', [{ time: 100, price: 50 }], { color: '#4a9eff' }),
      { type: 'nope', points: [{ time: 1, price: 2 }] },
      { type: 'trendline', points: [{ time: 1, price: 2 }] }, // missing 2nd point
      createDrawing('fib', [
        { time: 10, price: 100 },
        { time: 20, price: 200 },
      ], { color: '#ef5350', lineWidth: 2 }),
      null,
      'junk',
    ]
    const cleaned = sanitizeDrawings(raw)
    expect(cleaned).toHaveLength(2)
    expect(cleaned[0].type).toBe('horizontal')
    expect(cleaned[1].type).toBe('fib')
    expect(cleaned[1].color).toBe('#ef5350')
  })

  it('caps oversized input', () => {
    const many = Array.from({ length: MAX_DRAWINGS_PER_SYMBOL + 50 }, (_, i) =>
      createDrawing('vertical', [{ time: i, price: 1 }], { id: `dw_${i}` }),
    )
    expect(sanitizeDrawings(many)).toHaveLength(MAX_DRAWINGS_PER_SYMBOL)
  })

  it('normalizes short hex colors and clamps width', () => {
    const d = sanitizeDrawing({
      type: 'horizontal',
      points: [{ time: 1, price: 2 }],
      color: '#f00',
      lineWidth: 99,
      lineStyle: 'dashed',
    })
    expect(d.color).toBe('#ff0000')
    expect(d.lineWidth).toBe(4)
    expect(d.lineStyle).toBe('dashed')
  })
})

describe('fibLevelPrices', () => {
  it('retracement on an up-leg', () => {
    const levels = fibLevelPrices({ price: 100 }, { price: 200 })
    const byRatio = Object.fromEntries(levels.map((l) => [l.ratio, l.price]))
    expect(byRatio[0]).toBe(100)
    expect(byRatio[1]).toBe(200)
    expect(byRatio[0.5]).toBe(150)
    expect(byRatio[0.618]).toBeCloseTo(161.8, 5)
    expect(levels.find((l) => l.ratio === 0.618).heavy).toBe(true)
    expect(levels).toHaveLength(FIB_LEVELS.length)
  })

  it('retracement on a down-leg', () => {
    const levels = fibLevelPrices({ price: 200 }, { price: 100 })
    expect(levels.find((l) => l.ratio === 0.5).price).toBe(150)
    expect(levels.find((l) => l.ratio === 0.618).price).toBeCloseTo(138.2, 5)
  })
})

describe('fibExtensionPrices', () => {
  it('projects A-B-C extension levels', () => {
    // A=100, B=200 (leg +100), C=180 → 1.618 at 180+161.8
    const levels = fibExtensionPrices(
      { price: 100 },
      { price: 200 },
      { price: 180 },
    )
    expect(levels.find((l) => l.ratio === 1.0).price).toBe(280)
    expect(levels.find((l) => l.ratio === 1.618).price).toBeCloseTo(341.8, 5)
    expect(levels.find((l) => l.ratio === 1.272).price).toBeCloseTo(307.2, 5)
  })
})

describe('positionMetrics', () => {
  it('long R:R', () => {
    const drawing = createDrawing('position', [
      { time: 1, price: 100 },
      { time: 1, price: 90 },
      { time: 1, price: 130 },
    ], { meta: { side: 'long' } })
    const m = positionMetrics(drawing)
    expect(m.rr).toBe(3)
    expect(m.riskPct).toBeCloseTo(10)
    expect(m.rewardPct).toBeCloseTo(30)
  })

  it('short R:R with position size', () => {
    const drawing = createDrawing('position', [
      { time: 1, price: 100 },
      { time: 1, price: 110 },
      { time: 1, price: 70 },
    ], { meta: { side: 'short', accountSize: 10_000, riskPct: 1 } })
    const m = positionMetrics(drawing)
    expect(m.rr).toBe(3)
    expect(m.positionSize).toBeCloseTo(10) // $100 risk / $10 stop distance
  })
})

describe('snapToCandle', () => {
  const candles = [
    { time: 100, open: 10, high: 20, low: 5, close: 15 },
    { time: 200, open: 15, high: 25, low: 12, close: 18 },
  ]

  it('picks the nearest OHLC member by price when no projector', () => {
    const snapped = snapToCandle({ time: 105, price: 19.5 }, candles)
    expect(snapped.time).toBe(100)
    expect(snapped.price).toBe(20)
    expect(snapped.snappedTo).toBe('high')
  })

  it('respects pixel tolerance when priceToY is provided', () => {
    const priceToY = (p) => p // 1:1
    const near = snapToCandle({ time: 200, price: 24 }, candles, { priceToY, tolerancePx: 8 })
    expect(near.price).toBe(25)
    const far = snapToCandle({ time: 200, price: 40 }, candles, { priceToY, tolerancePx: 8 })
    expect(far.price).toBe(40) // outside tolerance — keep original price, still snap time
    expect(far.time).toBe(200)
  })
})

describe('hitTestDrawings', () => {
  const project = (p) => ({ x: p.time, y: 1000 - p.price })

  it('hits a horizontal within tolerance and misses outside', () => {
    const h = createDrawing('horizontal', [{ time: 50, price: 500 }])
    const hit = hitTestDrawings([h], { x: 80, y: 500 }, project, { width: 200, height: 1000 }, 6)
    // y = 1000 - 500 = 500
    expect(hitTestDrawings([h], { x: 80, y: 500 }, project, { width: 200, height: 1000 }, 6)?.id).toBe(h.id)
    expect(hitTestDrawings([h], { x: 80, y: 520 }, project, { width: 200, height: 1000 }, 6)).toBeNull()
    expect(hit).toBeTruthy()
  })

  it('hits a trendline segment', () => {
    const t = createDrawing('trendline', [
      { time: 0, price: 1000 },
      { time: 100, price: 900 },
    ], { meta: { extendRight: false, extendLeft: false } })
    // Midpoint screen: x=50, y=50 (prices 1000→0, 900→100)
    const midY = 1000 - 950
    expect(hitTestDrawings([t], { x: 50, y: midY }, project, { width: 200, height: 1000 }, 6)?.id).toBe(t.id)
    expect(hitTestDrawings([t], { x: 50, y: midY + 20 }, project, { width: 200, height: 1000 }, 6)).toBeNull()
  })

  it('hits a rect edge', () => {
    const r = createDrawing('rect', [
      { time: 10, price: 900 },
      { time: 90, price: 800 },
    ])
    // top edge at y=100
    expect(hitTestDrawings([r], { x: 50, y: 100 }, project, { width: 200, height: 1000 }, 6)?.id).toBe(r.id)
    expect(hitTestDrawings([r], { x: 50, y: 150 }, project, { width: 200, height: 1000 }, 6)).toBeNull()
  })

  it('skips locked drawings', () => {
    const h = createDrawing('horizontal', [{ time: 1, price: 500 }], { locked: true })
    expect(hitTestDrawings([h], { x: 10, y: 500 }, project, { width: 200, height: 1000 }, 6)).toBeNull()
  })
})

describe('distPointToSegment', () => {
  it('returns 0 on the segment and respects extend flags', () => {
    expect(distPointToSegment(5, 0, 0, 0, 10, 0)).toBe(0)
    expect(distPointToSegment(15, 0, 0, 0, 10, 0, { extendRight: false })).toBe(5)
    expect(distPointToSegment(15, 0, 0, 0, 10, 0, { extendRight: true })).toBe(0)
  })
})

describe('measureMetrics', () => {
  it('reports delta %, bar count, and ATR multiple', () => {
    const candles = [
      { time: 0, atr14: 10 },
      { time: 60, atr14: 10 },
      { time: 120, atr14: 10 },
      { time: 180, atr14: 10 },
    ]
    const m = measureMetrics({ time: 0, price: 100 }, { time: 180, price: 130 }, candles)
    expect(m.deltaPrice).toBe(30)
    expect(m.deltaPct).toBeCloseTo(30)
    expect(m.barCount).toBe(3)
    expect(m.atrMultiple).toBeCloseTo(3)
  })
})

describe('loadDrawings / saveDrawings', () => {
  const mem = new Map()

  beforeEach(() => {
    mem.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)) },
      removeItem: (k) => { mem.delete(k) },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists per-symbol and restores defaults', () => {
    const drawings = [
      createDrawing('horizontal', [{ time: 1, price: 2 }], { color: '#26a69a' }),
    ]
    saveDrawings('user1', 'btcusdt', drawings, { horizontal: '#26a69a' })
    const loaded = loadDrawings('user1', 'BTCUSDT')
    expect(loaded.drawings).toHaveLength(1)
    expect(loaded.drawings[0].color).toBe('#26a69a')
    expect(loaded.defaults.horizontal).toBe('#26a69a')

    const other = loadDrawings('user1', 'ETHUSDT')
    expect(other.drawings).toHaveLength(0)
  })
})
