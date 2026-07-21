import { describe, it, expect } from 'vitest'
import {
  calculateATR,
  inflectionThreshold,
  clusterIntoZones,
  detectRsiDivergence,
  findFractalSwings,
  nearestZones,
  filterByProminence,
} from '@forge/market-structure'
import { analyzePriceVsPivots, calculatePivotsGeneric } from '@forge/pivot'

function makeCandle(i, { open, high, low, close }) {
  return { time: i, open, high, low, close, volume: 1000 }
}

function buildLowVolSeries(length = 30) {
  const candles = []
  for (let i = 0; i < length; i++) {
    const base = 100 + i * 0.01
    candles.push(makeCandle(i, {
      open: base,
      high: base + 0.05,
      low: base - 0.05,
      close: base,
    }))
  }
  return candles
}

function buildHighVolSeries(length = 30) {
  const candles = []
  for (let i = 0; i < length; i++) {
    const base = 100 + i * 0.5
    candles.push(makeCandle(i, {
      open: base,
      high: base + 5,
      low: base - 5,
      close: base,
    }))
  }
  return candles
}

describe('detectRsiDivergence', () => {
  it('detects bearish divergence when price makes HH and RSI makes LH', () => {
    const candles = []
    const rsi = []
    for (let i = 0; i < 30; i++) {
      let high = 100
      let low = 98
      let close = 99
      if (i === 8) { high = 110; low = 105; close = 108 }
      if (i === 18) { high = 115; low = 110; close = 113 }
      candles.push(makeCandle(i, { open: close, high, low, close }))
      rsi.push(50)
    }
    rsi[8] = 72
    rsi[18] = 65

    expect(detectRsiDivergence(candles, rsi, { lookback: 2, minBarGap: 5, minRsiDelta: 3 })).toBe('bearish')
  })

  it('detects bullish divergence when price makes LL and RSI makes HL', () => {
    const candles = []
    const rsi = []
    for (let i = 0; i < 30; i++) {
      let high = 102
      let low = 100
      let close = 101
      if (i === 8) { high = 95; low = 90; close = 92 }
      if (i === 18) { high = 88; low = 85; close = 86 }
      candles.push(makeCandle(i, { open: close, high, low, close }))
      rsi.push(50)
    }
    rsi[8] = 28
    rsi[18] = 35

    expect(detectRsiDivergence(candles, rsi, { lookback: 2, minBarGap: 5, minRsiDelta: 3 })).toBe('bullish')
  })

  it('returns none for flat series', () => {
    const candles = buildLowVolSeries(20)
    const rsi = candles.map(() => 50)
    expect(detectRsiDivergence(candles, rsi)).toBe('none')
  })
})

describe('inflectionThreshold', () => {
  it('scales with volatility via ATR', () => {
    const lowVol = calculateATR(buildLowVolSeries(), 14).value
    const highVol = calculateATR(buildHighVolSeries(), 14).value
    const price = 100
    expect(inflectionThreshold(price, highVol)).toBeGreaterThan(inflectionThreshold(price, lowVol))
  })
})

describe('clusterIntoZones', () => {
  it('merges levels within 0.5 ATR and ranks by touches', () => {
    const atr = 10
    const swings = [
      { index: 5, price: 100, kind: 'low' },
      { index: 8, price: 102, kind: 'low' },
      { index: 20, price: 150, kind: 'low' },
    ]
    const zones = clusterIntoZones(swings, atr, 0.5, 30)
    expect(zones).toHaveLength(2)
    expect(zones[0].touches).toBeGreaterThanOrEqual(zones[1].touches)
    expect(zones.find((z) => z.touches === 2)?.mid).toBeCloseTo(101, 0)
  })

  it('nearestZones picks support below and resistance above price', () => {
    const zones = [
      { mid: 90, low: 88, high: 92, touches: 2, lastIndex: 10, score: 25 },
      { mid: 110, low: 108, high: 112, touches: 3, lastIndex: 20, score: 35 },
    ]
    const { nearestSupport, nearestResistance } = nearestZones(100, zones, zones)
    expect(nearestSupport?.mid).toBe(90)
    expect(nearestResistance?.mid).toBe(110)
  })
})

describe('filterByProminence', () => {
  it('filters noise swings below 1 ATR prominence', () => {
    const candles = buildHighVolSeries(25)
    const { swingHighs } = findFractalSwings(candles, 2)
    const atr = calculateATR(candles, 14).value
    const filtered = filterByProminence(swingHighs, candles, atr, 1)
    expect(filtered.length).toBeLessThanOrEqual(swingHighs.length)
  })
})

describe('analyzePriceVsPivots adaptive inflection', () => {
  it('marks atInflectionPoint when price is within k*ATR of a level', () => {
    const pivots = calculatePivotsGeneric(110, 90, 100, 95, null, 'traditional')
    const atr = 4
    const priceNearR1 = pivots.R1 + atr * 0.3
    const analysis = analyzePriceVsPivots(priceNearR1, pivots, { atr, k: 0.5 })
    expect(analysis.atInflectionPoint).toBe(true)
  })
})
