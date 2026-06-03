export function round2(value) {
  return value == null ? null : Number(value.toFixed(2))
}

export function calculatePivotsGeneric(prevHigh, prevLow, prevClose, prevOpen = null, currOpen = null, pivotType = 'traditional') {
  const levels = {
    PP: null,
    R1: null, R2: null, R3: null, R4: null, R5: null,
    S1: null, S2: null, S3: null, S4: null, S5: null,
  }

  if (pivotType === 'traditional') {
    const pp = (prevHigh + prevLow + prevClose) / 3
    levels.PP = pp
    levels.R1 = pp * 2 - prevLow
    levels.S1 = pp * 2 - prevHigh
    levels.R2 = pp + (prevHigh - prevLow)
    levels.S2 = pp - (prevHigh - prevLow)
    levels.R3 = pp * 2 + (prevHigh - 2 * prevLow)
    levels.S3 = pp * 2 - (2 * prevHigh - prevLow)
    levels.R4 = pp * 3 + (prevHigh - 3 * prevLow)
    levels.S4 = pp * 3 - (3 * prevHigh - prevLow)
    levels.R5 = pp * 4 + (prevHigh - 4 * prevLow)
    levels.S5 = pp * 4 - (4 * prevHigh - prevLow)
  } else if (pivotType === 'fibonacci') {
    const pp = (prevHigh + prevLow + prevClose) / 3
    levels.PP = pp
    levels.R1 = pp + 0.382 * (prevHigh - prevLow)
    levels.S1 = pp - 0.382 * (prevHigh - prevLow)
    levels.R2 = pp + 0.618 * (prevHigh - prevLow)
    levels.S2 = pp - 0.618 * (prevHigh - prevLow)
    levels.R3 = pp + (prevHigh - prevLow)
    levels.S3 = pp - (prevHigh - prevLow)
  } else if (pivotType === 'woodie') {
    const co = currOpen ?? prevClose
    const pp = (prevHigh + prevLow + 2 * co) / 4
    levels.PP = pp
    levels.R1 = 2 * pp - prevLow
    levels.S1 = 2 * pp - prevHigh
    levels.R2 = pp + (prevHigh - prevLow)
    levels.S2 = pp - (prevHigh - prevLow)
    levels.R3 = prevHigh + 2 * (pp - prevLow)
    levels.S3 = prevLow - 2 * (prevHigh - pp)
    levels.R4 = (levels.R3 ?? 0) + (prevHigh - prevLow)
    levels.S4 = (levels.S3 ?? 0) - (prevHigh - prevLow)
  } else if (pivotType === 'classic') {
    const pp = (prevHigh + prevLow + prevClose) / 3
    levels.PP = pp
    levels.R1 = 2 * pp - prevLow
    levels.S1 = 2 * pp - prevHigh
    levels.R2 = pp + (prevHigh - prevLow)
    levels.S2 = pp - (prevHigh - prevLow)
    levels.R3 = pp + 2 * (prevHigh - prevLow)
    levels.S3 = pp - 2 * (prevHigh - prevLow)
    levels.R4 = pp + 3 * (prevHigh - prevLow)
    levels.S4 = pp - 3 * (prevHigh - prevLow)
  } else if (pivotType === 'dm') {
    const po = prevOpen ?? prevClose
    let X = 0
    if (po === prevClose) {
      X = prevHigh + prevLow + 2 * prevClose
    } else if (prevClose > po) {
      X = 2 * prevHigh + prevLow + prevClose
    } else {
      X = 2 * prevLow + prevHigh + prevClose
    }
    const pp = X / 4
    levels.PP = pp
    levels.R1 = X / 2 - prevLow
    levels.S1 = X / 2 - prevHigh
  } else if (pivotType === 'camarilla') {
    const pp = (prevHigh + prevLow + prevClose) / 3
    levels.PP = pp
    levels.R1 = prevClose + 1.1 * (prevHigh - prevLow) / 12
    levels.S1 = prevClose - 1.1 * (prevHigh - prevLow) / 12
    levels.R2 = prevClose + 1.1 * (prevHigh - prevLow) / 6
    levels.S2 = prevClose - 1.1 * (prevHigh - prevLow) / 6
    levels.R3 = prevClose + 1.1 * (prevHigh - prevLow) / 4
    levels.S3 = prevClose - 1.1 * (prevHigh - prevLow) / 4
    levels.R4 = prevClose + 1.1 * (prevHigh - prevLow) / 2
    levels.S4 = prevClose - 1.1 * (prevHigh - prevLow) / 2
    levels.R5 = (prevHigh / prevLow) * prevClose
    levels.S5 = prevClose - (levels.R5 - prevClose)
  }

  for (const key of Object.keys(levels)) {
    const val = levels[key]
    if (val !== null && val !== undefined) {
      levels[key] = round2(val)
    }
  }

  return levels
}

export function getPivotPeriod(timeframe) {
  const mapping = {
    '1m': 'daily', '3m': 'daily', '5m': 'daily', '15m': 'daily', '30m': 'daily',
    '1h': 'daily', '2h': 'daily',
    '4h': 'weekly', '6h': 'weekly', '8h': 'weekly', '12h': 'weekly',
    '1d': 'monthly', '3d': 'monthly',
    '1w': 'quarterly',
  }
  return mapping[timeframe] ?? 'daily'
}

export function getPivotPeriodLabel(periodType) {
  const labels = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
  }
  return labels[periodType] ?? periodType
}

function bucketStart(timestampSeconds, period) {
  const date = new Date(timestampSeconds * 1000)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  if (period === 'weekly') {
    const dayOfWeek = date.getUTCDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    return new Date(Date.UTC(year, month, day + mondayOffset)).toISOString()
  }
  if (period === 'monthly') return new Date(Date.UTC(year, month, 1)).toISOString()
  if (period === 'quarterly') return new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1)).toISOString()
  return new Date(Date.UTC(year, month, day)).toISOString()
}

export function groupPeriodCandles(candles, period) {
  const groups = new Map()
  candles.forEach((candle) => {
    const key = bucketStart(candle.time, period)
    groups.set(key, [...(groups.get(key) ?? []), candle])
  })

  const keys = [...groups.keys()].sort()
  return keys.map((key, idx) => {
    const periodCandles = [...groups.get(key)].sort((a, b) => a.time - b.time)
    return {
      high: Math.max(...periodCandles.map((c) => c.high)),
      low: Math.min(...periodCandles.map((c) => c.low)),
      close: periodCandles[periodCandles.length - 1].close,
      open: periodCandles[0].open,
      period: key,
      startTime: periodCandles[0].time,
      endTime: periodCandles[periodCandles.length - 1].time,
      isCurrent: idx === keys.length - 1,
    }
  })
}

function getBarIntervalSeconds(candles) {
  if (candles.length < 2) return 24 * 60 * 60
  return Math.max(60, candles[candles.length - 1].time - candles[candles.length - 2].time)
}

/** TradingView-style period end: next bucket start minus one bar, or latest candle for current period */
export function resolvePeriodEndTime(currCandle, nextCandle, latestCandleTime, barInterval) {
  if (currCandle.isCurrent) {
    return latestCandleTime
  }
  if (nextCandle) {
    return nextCandle.startTime - barInterval
  }
  return currCandle.endTime
}

export function getCurrentPeriodOpen(candles, period) {
  const grouped = groupPeriodCandles(candles, period)
  if (!grouped.length) return null
  return grouped[grouped.length - 1].open
}

function withPivotMeta(levels, type, period, basedOn) {
  return { ...levels, type, period, basedOn, generatedAt: new Date().toISOString() }
}

export function analyzePriceVsPivots(currentPrice, pivots) {
  const pp = Number(pivots.PP)
  const r1 = Number(pivots.R1)
  const r2 = Number(pivots.R2)
  const r3 = Number(pivots.R3)
  const s1 = Number(pivots.S1)
  const s2 = Number(pivots.S2)
  const s3 = Number(pivots.S3)

  let zone = 'below_S3'
  if (currentPrice > r3) zone = 'above_R3'
  else if (currentPrice > r2) zone = 'between_R2_R3'
  else if (currentPrice > r1) zone = 'between_R1_R2'
  else if (currentPrice > pp) zone = 'between_PP_R1'
  else if (currentPrice > s1) zone = 'between_S1_PP'
  else if (currentPrice > s2) zone = 'between_S2_S1'
  else if (currentPrice > s3) zone = 'between_S3_S2'

  const order = { S5: 1, S4: 2, S3: 3, S2: 4, S1: 5, PP: 6, R1: 7, R2: 8, R3: 9, R4: 10, R5: 11 }
  const excluded = new Set(['type', 'period', 'basedOn', 'generatedAt'])
  const allLevels = Object.entries(pivots)
    .filter(([label, value]) => !excluded.has(label) && typeof value === 'number')
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => (order[a.label] ?? 999) - (order[b.label] ?? 999))

  const above = allLevels.filter((level) => level.value > currentPrice).sort((a, b) => a.value - b.value)
  const below = allLevels.filter((level) => level.value < currentPrice).sort((a, b) => b.value - a.value)
  const nearestResistance = above[0] ?? null
  const nearestSupport = below[0] ?? null
  const nearestLevel = allLevels
    .map((level) => ({ ...level, dist: Math.abs(currentPrice - level.value) / currentPrice }))
    .sort((a, b) => a.dist - b.dist)[0]
  const atInflectionPoint = nearestLevel ? nearestLevel.dist < 0.003 : false

  return {
    zone,
    bias: currentPrice > pp ? 'bullish' : currentPrice < pp ? 'bearish' : 'neutral',
    nearestResistance,
    nearestSupport,
    distToResistance: nearestResistance ? Number((((nearestResistance.value - currentPrice) / currentPrice) * 100).toFixed(3)) : null,
    distToSupport: nearestSupport ? Number((((currentPrice - nearestSupport.value) / currentPrice) * 100).toFixed(3)) : null,
    atInflectionPoint,
    inflectionLevel: atInflectionPoint ? { label: nearestLevel.label, value: nearestLevel.value } : null,
    sessionBullish: currentPrice > pp,
    allLevels,
  }
}

export function buildPivotData(candles, timeframe, selectedSymbol, chartPrefs = {}) {
  if (!Array.isArray(candles) || candles.length < 2) return null

  const period = getPivotPeriod(timeframe)
  const groupedPeriods = groupPeriodCandles(candles, period)
  if (groupedPeriods.length < 2) return null
  const completed = groupedPeriods[groupedPeriods.length - 2]
  if (!completed) return null

  const currentPrice = candles[candles.length - 1].close
  const latestCandleTime = candles[candles.length - 1].time
  const barInterval = getBarIntervalSeconds(candles)
  const currOpen = getCurrentPeriodOpen(candles, period)
  const pivotType = chartPrefs.pivotType || 'traditional'
  const pivotsBack = Math.max(1, Math.min(50, Number(chartPrefs.pivotsBack) || 15))
  const showHistoricalPivots = chartPrefs.showHistoricalPivots !== false

  const classicPivots = withPivotMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, 'classic'), 'classic', period, completed)
  const fibonacciPivots = withPivotMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, 'fibonacci'), 'fibonacci', period, completed)
  const traditionalPivots = withPivotMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, 'traditional'), 'traditional', period, completed)
  const woodiePivots = withPivotMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, 'woodie'), 'woodie', period, completed)
  const dmPivots = withPivotMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, 'dm'), 'dm', period, completed)
  const camarillaPivots = withPivotMeta(calculatePivotsGeneric(completed.high, completed.low, completed.close, completed.open, currOpen, 'camarilla'), 'camarilla', period, completed)

  const displayPeriods = groupedPeriods.slice(-(pivotsBack + 1))
  const standardPeriods = []
  for (let i = 1; i < displayPeriods.length; i++) {
    const prevCandle = displayPeriods[i - 1]
    const currCandle = displayPeriods[i]
    const nextCandle = displayPeriods[i + 1] ?? null
    const endTime = resolvePeriodEndTime(currCandle, nextCandle, latestCandleTime, barInterval)

    standardPeriods.push({
      period: currCandle.period,
      startTime: currCandle.startTime,
      endTime,
      isCurrent: Boolean(currCandle.isCurrent),
      sourcePeriod: prevCandle.period,
      pivots: calculatePivotsGeneric(prevCandle.high, prevCandle.low, prevCandle.close, prevCandle.open, currCandle.open, pivotType),
    })
  }
  const visibleStandardPeriods = showHistoricalPivots
    ? standardPeriods
    : (standardPeriods.length ? [standardPeriods[standardPeriods.length - 1]] : [])

  return {
    success: true,
    symbol: selectedSymbol,
    timeframe,
    currentPrice,
    classic: { pivots: classicPivots, analysis: analyzePriceVsPivots(currentPrice, classicPivots) },
    fibonacci: { pivots: fibonacciPivots, analysis: analyzePriceVsPivots(currentPrice, fibonacciPivots) },
    traditional: { pivots: traditionalPivots, analysis: analyzePriceVsPivots(currentPrice, traditionalPivots) },
    woodie: { pivots: woodiePivots, analysis: analyzePriceVsPivots(currentPrice, woodiePivots) },
    dm: { pivots: dmPivots, analysis: analyzePriceVsPivots(currentPrice, dmPivots) },
    camarilla: { pivots: camarillaPivots, analysis: analyzePriceVsPivots(currentPrice, camarillaPivots) },
    binance: { pivots: traditionalPivots, analysis: analyzePriceVsPivots(currentPrice, traditionalPivots) },
    standardPeriods: {
      periodType: period,
      requestedCount: pivotsBack,
      availableCount: visibleStandardPeriods.length,
      items: visibleStandardPeriods,
    },
  }
}
