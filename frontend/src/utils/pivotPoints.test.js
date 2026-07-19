import { describe, it, expect } from 'vitest'
import {
  calculatePivotsGeneric,
  getPivotPeriodAuto,
  resolvePivotPeriod,
  getBinanceIntervalForPeriod,
  getHtfFetchLimit,
  analyzePriceVsPivots,
  buildPivotDataFromHtf,
  aggregateMonthlyToYearly,
  htfCandlesToGroupedPeriods,
  isMondayUtc,
  sanitizePivotTimeframe,
  projectPivotPeriodEnd,
  resolvePeriodEndTime,
  countPivotLevelsForType,
  maxPivotsBackForType,
  PIVOT_SEGMENT_CAP,
} from '@forge/pivot'

const OHLC = { high: 110, low: 90, close: 100, open: 95 }

describe('calculatePivotsGeneric — golden formulas', () => {
  const { high, low, close, open } = OHLC

  it('traditional', () => {
    const p = calculatePivotsGeneric(high, low, close, open, null, 'traditional')
    expect(p.PP).toBe(100)
    expect(p.R1).toBe(110)
    expect(p.S1).toBe(90)
    expect(p.R2).toBe(120)
    expect(p.S2).toBe(80)
    expect(p.R5).toBe(150)
    expect(p.S5).toBe(50)
  })

  it('fibonacci', () => {
    const p = calculatePivotsGeneric(high, low, close, open, null, 'fibonacci')
    expect(p.PP).toBe(100)
    expect(p.R1).toBe(107.64)
    expect(p.S1).toBe(92.36)
    expect(p.R3).toBe(120)
    expect(p.R4).toBeNull()
    expect(p.R5).toBeNull()
  })

  it('woodie', () => {
    const p = calculatePivotsGeneric(high, low, close, open, 98, 'woodie')
    expect(p.PP).toBe(99)
    expect(p.R1).toBe(108)
    expect(p.S1).toBe(88)
  })

  it('classic', () => {
    const p = calculatePivotsGeneric(high, low, close, open, null, 'classic')
    expect(p.PP).toBe(100)
    expect(p.R1).toBe(110)
    expect(p.R4).toBe(160)
    expect(p.S4).toBe(40)
  })

  it('dm', () => {
    const p = calculatePivotsGeneric(high, low, close, 95, null, 'dm')
    expect(p.PP).toBe(102.5)
    expect(p.R1).toBe(115)
    expect(p.S1).toBe(95)
    expect(p.R2).toBeNull()
    expect(p.S2).toBeNull()
  })

  it('camarilla', () => {
    const p = calculatePivotsGeneric(high, low, close, open, null, 'camarilla')
    expect(p.PP).toBe(100)
    expect(p.R1).toBeCloseTo(101.83, 1)
    expect(p.R5).toBeCloseTo(122.22, 1)
  })
})

describe('getPivotPeriodAuto / resolvePivotPeriod', () => {
  it('maps <=15m to daily', () => {
    expect(getPivotPeriodAuto('15m')).toBe('daily')
    expect(getPivotPeriodAuto('1m')).toBe('daily')
  })

  it('maps 30m–12h to weekly', () => {
    expect(getPivotPeriodAuto('30m')).toBe('weekly')
    expect(getPivotPeriodAuto('1h')).toBe('weekly')
    expect(getPivotPeriodAuto('2h')).toBe('weekly')
    expect(getPivotPeriodAuto('12h')).toBe('weekly')
  })

  it('maps >=1d to monthly', () => {
    expect(getPivotPeriodAuto('1d')).toBe('monthly')
    expect(getPivotPeriodAuto('1w')).toBe('monthly')
    expect(getPivotPeriodAuto('1M')).toBe('monthly')
  })

  it('respects explicit override', () => {
    expect(resolvePivotPeriod('1h', 'daily')).toBe('daily')
    expect(resolvePivotPeriod('1d', 'weekly')).toBe('weekly')
    expect(resolvePivotPeriod('15m', 'yearly')).toBe('yearly')
  })

  it('sanitizes invalid pivotTimeframe to auto', () => {
    expect(sanitizePivotTimeframe('invalid')).toBe('auto')
    expect(sanitizePivotTimeframe('weekly')).toBe('weekly')
  })
})

describe('Binance HTF helpers', () => {
  it('selects correct Binance interval', () => {
    expect(getBinanceIntervalForPeriod('daily')).toBe('1d')
    expect(getBinanceIntervalForPeriod('weekly')).toBe('1w')
    expect(getBinanceIntervalForPeriod('monthly')).toBe('1M')
    expect(getBinanceIntervalForPeriod('yearly')).toBe('1M')
  })

  it('fetch limit is pivotsBack + 2', () => {
    expect(getHtfFetchLimit(15, 'daily')).toBe(17)
    expect(getHtfFetchLimit(15, 'weekly')).toBe(17)
    expect(getHtfFetchLimit(15, 'yearly')).toBe(17 * 12)
  })

  it('weekly kline Monday anchor check', () => {
    expect(isMondayUtc(1783900800)).toBe(true)
  })
})

describe('aggregateMonthlyToYearly', () => {
  it('aggregates monthly candles into yearly OHLC', () => {
    const monthly = [
      { time: 1735689600, open: 100, high: 120, low: 90, close: 110 },
      { time: 1738368000, open: 110, high: 130, low: 100, close: 125 },
      { time: 1767225600, open: 200, high: 220, low: 180, close: 210 },
    ]
    const yearly = aggregateMonthlyToYearly(monthly)
    expect(yearly).toHaveLength(2)
    expect(yearly[0].high).toBe(130)
    expect(yearly[0].low).toBe(90)
    expect(yearly[1].open).toBe(200)
  })
})

describe('analyzePriceVsPivots — sparse levels (DM)', () => {
  const dmPivots = calculatePivotsGeneric(110, 90, 100, 95, null, 'dm')

  it('classifies above R1 correctly (not above_R3)', () => {
    const analysis = analyzePriceVsPivots(120, dmPivots)
    expect(analysis.zone).toBe('above_R1')
    expect(Number.isNaN(analysis.bias)).toBe(false)
  })

  it('classifies below S1 correctly (not below_S3)', () => {
    const analysis = analyzePriceVsPivots(80, dmPivots)
    expect(analysis.zone).toBe('below_S1')
  })

  it('fibonacci missing R4 does not produce NaN zones', () => {
    const fib = calculatePivotsGeneric(110, 90, 100, 95, null, 'fibonacci')
    const analysis = analyzePriceVsPivots(115, fib)
    expect(analysis.zone).not.toBe('below_S3')
    expect(analysis.zone).not.toContain('NaN')
  })
})

describe('projectPivotPeriodEnd / resolvePeriodEndTime', () => {
  const dailyStart = 1704067200 // 2024-01-01 UTC

  it('projects daily period end +1 day', () => {
    const end = projectPivotPeriodEnd(dailyStart, 'daily')
    expect(end).toBe(dailyStart + 86400)
  })

  it('projects weekly period end +7 days', () => {
    const end = projectPivotPeriodEnd(dailyStart, 'weekly')
    expect(end).toBe(dailyStart + 7 * 86400)
  })

  it('historical segment ends at next period start', () => {
    const curr = {
      startTime: 1704067200,
      endTime: 1704067200,
      isCurrent: false,
      high: 1, low: 1, close: 1, open: 1, period: 'a',
    }
    const next = {
      startTime: 1706745600,
      endTime: 1706745600,
      isCurrent: false,
      high: 1, low: 1, close: 1, open: 1, period: 'b',
    }
    expect(resolvePeriodEndTime(curr, next, 'monthly')).toBe(1706745600)
    expect(resolvePeriodEndTime(curr, next, 'monthly')).toBeGreaterThan(curr.startTime)
  })

  it('current period ends at projected calendar boundary', () => {
    const curr = {
      startTime: dailyStart,
      endTime: dailyStart,
      isCurrent: true,
      high: 1, low: 1, close: 1, open: 1, period: 'current',
    }
    expect(resolvePeriodEndTime(curr, null, 'daily')).toBe(dailyStart + 86400)
  })
})

describe('500-segment cap helpers', () => {
  it('counts levels per pivot type', () => {
    expect(countPivotLevelsForType('traditional')).toBe(11)
    expect(countPivotLevelsForType('fibonacci')).toBe(7)
    expect(countPivotLevelsForType('dm')).toBe(3)
    expect(countPivotLevelsForType('classic')).toBe(9)
  })

  it('maxPivotsBack respects 500 segment cap', () => {
    expect(maxPivotsBackForType('traditional')).toBe(Math.floor(PIVOT_SEGMENT_CAP / 11))
    expect(maxPivotsBackForType('dm')).toBe(Math.floor(PIVOT_SEGMENT_CAP / 3))
    expect(maxPivotsBackForType('traditional', 5)).toBe(Math.floor(PIVOT_SEGMENT_CAP / 5))
  })
})

describe('buildPivotDataFromHtf — standardPeriods count', () => {
  function makeHtfCandles(count) {
    const base = 1704067200
    return Array.from({ length: count }, (_, i) => ({
      time: base + i * 86400 * 30,
      open: 100 + i,
      high: 110 + i,
      low: 90 + i,
      close: 105 + i,
    }))
  }

  const chartCandles = [
    { time: 1785542399, open: 100, high: 110, low: 90, close: 105 },
  ]

  it('returns exactly pivotsBack historical sets', () => {
    const htf = makeHtfCandles(17)
    const result = buildPivotDataFromHtf({
      htfCandles: htf,
      chartCandles,
      chartInterval: '1d',
      symbol: 'BTCUSDT',
      chartPrefs: { pivotType: 'traditional', pivotsBack: 15, showHistoricalPivots: true },
    })
    expect(result).not.toBeNull()
    expect(result.standardPeriods.requestedCount).toBe(15)
    expect(result.standardPeriods.availableCount).toBe(15)
    expect(result.standardPeriods.items).toHaveLength(15)
  })

  it('uses native HTF rows directly (no partial first bucket)', () => {
    const htf = htfCandlesToGroupedPeriods([
      { time: 1704067200, open: 100, high: 110, low: 90, close: 105 },
      { time: 1706745600, open: 105, high: 115, low: 95, close: 110 },
      { time: 1709251200, open: 110, high: 120, low: 100, close: 115 },
    ])
    expect(htf[0].high).toBe(110)
    expect(htf[0].low).toBe(90)
  })

  it('response shape is backward-compatible', () => {
    const htf = makeHtfCandles(17)
    const result = buildPivotDataFromHtf({
      htfCandles: htf,
      chartCandles,
      chartInterval: '1d',
      symbol: 'BTCUSDT',
      chartPrefs: { pivotsBack: 15 },
    })
    expect(result.success).toBe(true)
    expect(result.classic.pivots.PP).toBeDefined()
    expect(result.classic.analysis.zone).toBeDefined()
    expect(result.binance.pivots).toEqual(result.traditional.pivots)
    expect(result.standardPeriods.items[0]).toHaveProperty('startTime')
    expect(result.standardPeriods.items[0]).toHaveProperty('endTime')
    expect(result.standardPeriods.items[0]).toHaveProperty('isCurrent')
    expect(result.standardPeriods.items[0]).toHaveProperty('pivots')
  })

  it('current period endTime extends beyond last chart candle', () => {
    const htf = makeHtfCandles(17)
    const lastHtf = htf[htf.length - 1]
    const chartCandles = [
      { time: lastHtf.time + 86400, open: 100, high: 110, low: 90, close: 105 },
    ]
    const result = buildPivotDataFromHtf({
      htfCandles: htf,
      chartCandles,
      chartInterval: '1d',
      symbol: 'BTCUSDT',
      chartPrefs: { pivotsBack: 15 },
    })
    const current = result.standardPeriods.items.find((i) => i.isCurrent)
    expect(current).toBeDefined()
    expect(current.endTime).toBeGreaterThan(chartCandles[0].time)
    expect(current.endTime).toBe(projectPivotPeriodEnd(lastHtf.time, 'monthly'))
  })

  it('historical periods span start to next period start', () => {
    const htf = makeHtfCandles(17)
    const result = buildPivotDataFromHtf({
      htfCandles: htf,
      chartCandles,
      chartInterval: '1d',
      symbol: 'BTCUSDT',
      chartPrefs: { pivotsBack: 15, showHistoricalPivots: true },
    })
    const historical = result.standardPeriods.items.filter((i) => !i.isCurrent)
    expect(historical.length).toBeGreaterThan(0)
    historical.forEach((item) => {
      expect(item.endTime).toBeGreaterThan(item.startTime)
    })
  })
})
