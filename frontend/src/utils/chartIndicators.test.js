import { describe, it, expect } from 'vitest'
import { computeChartOverlays } from './chartIndicators'

/** Trending series with pullbacks, enough bars for Ichimoku's 52+26 requirement. */
function buildCandles(length = 200) {
  const candles = []
  let close = 100
  for (let i = 0; i < length; i += 1) {
    close += i % 7 === 0 ? -2.5 : 1.2
    candles.push({
      time: 1700000000 + i * 3600,
      open: close - 0.4,
      high: close + 1.5,
      low: close - 1.5,
      close,
      volume: 1000 + (i % 11) * 120,
      rsi14: 50,
    })
  }
  return candles
}

describe('computeChartOverlays', () => {
  it('returns empty structures below the minimum bar count', () => {
    const result = computeChartOverlays(buildCandles(20))
    expect(result.keltner.upper).toEqual([])
    expect(result.anchoredVwaps).toEqual([])
    expect(result.volumeProfile).toBeNull()
  })

  it('handles non-array input without throwing', () => {
    expect(computeChartOverlays(null).stochRsi.k).toEqual([])
    expect(computeChartOverlays(undefined).fairValueGaps).toEqual([])
  })

  it('produces chart-ready points with no nulls', () => {
    const result = computeChartOverlays(buildCandles())
    const series = [
      result.keltner.upper,
      result.keltner.lower,
      result.donchian.upper,
      result.supertrend.line,
      result.ichimoku.tenkan,
      result.chandelier.long,
      result.stochRsi.k,
    ]

    for (const points of series) {
      expect(points.length).toBeGreaterThan(0)
      for (const point of points) {
        // Lightweight Charts rejects null/NaN values outright.
        expect(Number.isFinite(point.value)).toBe(true)
        expect(Number.isFinite(point.time)).toBe(true)
      }
    }
  })

  it('returns points in ascending time order', () => {
    const result = computeChartOverlays(buildCandles())
    for (const points of [result.keltner.middle, result.stochRsi.d, result.supertrend.line]) {
      for (let i = 1; i < points.length; i += 1) {
        expect(points[i].time).toBeGreaterThan(points[i - 1].time)
      }
    }
  })

  it('keeps Keltner bands ordered around the middle line', () => {
    const result = computeChartOverlays(buildCandles())
    const byTime = new Map(result.keltner.middle.map((p) => [p.time, p.value]))

    for (const upper of result.keltner.upper) {
      const middle = byTime.get(upper.time)
      if (middle == null) continue
      expect(upper.value).toBeGreaterThan(middle)
    }
  })

  it('labels anchored VWAPs with their anchor kind', () => {
    const result = computeChartOverlays(buildCandles())
    expect(result.anchoredVwaps.length).toBeGreaterThan(0)

    for (const vwap of result.anchoredVwaps) {
      expect(['swing_high', 'swing_low', 'high_volume', 'custom']).toContain(vwap.kind)
      expect(vwap.vwap.length).toBeGreaterThan(0)
      // Bands must bracket the mean.
      const meanByTime = new Map(vwap.vwap.map((p) => [p.time, p.value]))
      for (const band of vwap.upper1) {
        const mean = meanByTime.get(band.time)
        if (mean == null) continue
        expect(band.value).toBeGreaterThanOrEqual(mean)
      }
    }
  })

  it('exposes liquidity levels and a volume profile for the overlay layer', () => {
    const result = computeChartOverlays(buildCandles())

    expect(Array.isArray(result.fairValueGaps)).toBe(true)
    expect(Array.isArray(result.orderBlocks)).toBe(true)
    expect(result.volumeProfile).not.toBeNull()
    expect(result.volumeProfile.poc).toBeGreaterThan(0)

    for (const gap of result.fairValueGaps) {
      expect(gap.top).toBeGreaterThan(gap.bottom)
      expect(['bullish', 'bearish']).toContain(gap.direction)
    }
  })

  it('reports a squeeze flag for every bar', () => {
    const candles = buildCandles()
    const result = computeChartOverlays(candles)
    expect(result.squeeze.flags).toHaveLength(candles.length)
    for (const flag of result.squeeze.flags) {
      expect(typeof flag.inSqueeze).toBe('boolean')
    }
  })

  it('keeps StochRSI within 0-100', () => {
    const result = computeChartOverlays(buildCandles())
    for (const point of [...result.stochRsi.k, ...result.stochRsi.d]) {
      expect(point.value).toBeGreaterThanOrEqual(0)
      expect(point.value).toBeLessThanOrEqual(100)
    }
  })
})
