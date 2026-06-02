import { Component, useEffect, useMemo, useRef, useState } from 'react'
import HeaderControls from './components/HeaderControls'
import StatusBar from './components/StatusBar'
import ChartPanel from './components/ChartPanel'
import AnalysisPanel from './components/AnalysisPanel'
import AIAnalysisPanel from './components/AIAnalysisPanel'
import EducationPanel from './components/EducationPanel'
import { useAuth } from './hooks/useAuth'
import {
  EDGE_FUNCTION_UNAVAILABLE_MESSAGE,
  invokeFunction,
  isEdgeFunctionUnavailableError,
} from './supabaseClient'

const COMMON_QUOTES = ['USDT', 'BUSD', 'BTC', 'ETH', 'FDUSD']
const BINANCE_KLINES_URL = 'https://api.binance.com/api/v3/klines'
const LOCAL_PREFERENCES_PREFIX = 'forge_chart_preferences'
const DEFAULT_CHART_PREFERENCES = {
  showCandles: true,
  showEma20: false,
  showEma50: false,
  showRsi: false,
  showMacd: false,
  showSupport: false,
  showResistance: false,
  showStandardPivots: false,
  showHistoricalPivots: true,
  pivotType: 'traditional',
  pivotsBack: 15,
}

class ChartPanelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('Chart panel rendering error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="chart-card">
          <div className="chart-state-overlay error">
            <div className="chart-state-title">Chart temporarily unavailable</div>
            <div className="chart-state-copy">
              We hit a chart rendering issue. Please reload or toggle indicators to retry.
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.body.setAttribute('data-theme', theme)
  localStorage.setItem('forge_theme', theme)
  
  // Dispatch custom event to tell chart panels to update colors
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }))
}

function initTheme() {
  const saved = localStorage.getItem('forge_theme') || 'dark'
  applyTheme(saved)
  return saved
}

function round6(value) {
  return value == null ? null : Number(value.toFixed(6))
}

function round2(value) {
  return value == null ? null : Number(value.toFixed(2))
}

function calculateEMA(values, period) {
  if (!values.length) return []
  if (period <= 0) return values.map(() => null)
  if (values.length < period) return values.map(() => null)

  const ema = values.map(() => null)
  const multiplier = 2 / (period + 1)

  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  ema[period - 1] = seed

  for (let i = period; i < values.length; i++) {
    ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1]
  }

  return ema
}

function calculateRSI(values, period = 14) {
  if (values.length < 2) return Array(values.length).fill(null)

  const gains = [0]
  const losses = [0]

  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1]
    gains.push(Math.max(change, 0))
    losses.push(Math.abs(Math.min(change, 0)))
  }

  const rsi = Array(values.length).fill(null)
  if (values.length <= period) return rsi

  let avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period

  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))

  for (let i = period + 1; i < values.length; i++) {
    avgGain = ((avgGain * (period - 1)) + gains[i]) / period
    avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))
  }

  return rsi
}

function calculateMACD(values, fast = 12, slow = 26, signal = 9) {
  const fastEma = calculateEMA(values, fast)
  const slowEma = calculateEMA(values, slow)

  const macd = values.map((_, i) => (
    fastEma[i] != null && slowEma[i] != null ? fastEma[i] - slowEma[i] : null
  ))

  const compactMacd = macd.filter((v) => v != null)
  const compactSignal = calculateEMA(compactMacd, signal)

  const signalLine = values.map(() => null)
  const hist = values.map(() => null)
  let compactIdx = 0

  for (let i = 0; i < macd.length; i++) {
    if (macd[i] == null) continue
    const sig = compactSignal[compactIdx]
    signalLine[i] = sig
    hist[i] = sig != null ? macd[i] - sig : null
    compactIdx += 1
  }

  return { macd, signalLine, hist }
}

function validateBinanceSymbol(input) {
  const cleaned = input.trim().toUpperCase()

  if (!/^[A-Z0-9]{5,20}$/.test(cleaned)) {
    return 'Use only letters and numbers. Example: BTCUSDT'
  }

  const hasKnownQuote = COMMON_QUOTES.some((quote) => cleaned.endsWith(quote))
  if (!hasKnownQuote) {
    return 'This symbol looks unusual. Try symbols like BTCUSDT or ETHUSDT.'
  }

  return ''
}

function enrichCandles(candles) {
  const closes = candles.map((c) => c.close)
  const ema20 = calculateEMA(closes, 20)
  const ema50 = calculateEMA(closes, 50)
  const rsi14 = calculateRSI(closes, 14)
  const { macd, signalLine, hist } = calculateMACD(closes)

  return candles.map((c, i) => ({
    ...c,
    ema20: round6(ema20[i]),
    ema50: round6(ema50[i]),
    rsi14: round6(rsi14[i]),
    macd: round6(macd[i]),
    macdSignal: round6(signalLine[i]),
    macdHist: round6(hist[i]),
  }))
}

async function fetchBinanceCandles(symbol, interval, limit) {
  let remaining = limit
  let currentEndTime = null
  let allRawData = []

  while (remaining > 0) {
    const fetchLimit = Math.min(remaining, 1000)
    const url = new URL(BINANCE_KLINES_URL)
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('interval', interval)
    url.searchParams.set('limit', String(fetchLimit))
    if (currentEndTime != null) url.searchParams.set('endTime', String(currentEndTime))

    const response = await fetch(url)
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Binance request failed: ${response.status}${body ? ` ${body}` : ''}`)
    }

    const rawData = await response.json()
    if (!Array.isArray(rawData) || rawData.length === 0) break

    allRawData = [...rawData, ...allRawData]
    currentEndTime = Number(rawData[0][0]) - 1
    remaining -= rawData.length
    if (rawData.length < fetchLimit) break
  }

  const candles = allRawData.map((item) => ({
    time: Math.trunc(Number(item[0]) / 1000),
    open: Number(item[1]),
    high: Number(item[2]),
    low: Number(item[3]),
    close: Number(item[4]),
    volume: Number(item[5]),
  })).filter((c) => (
    Number.isFinite(c.time) &&
    Number.isFinite(c.open) &&
    Number.isFinite(c.high) &&
    Number.isFinite(c.low) &&
    Number.isFinite(c.close) &&
    Number.isFinite(c.volume)
  )).slice(-limit)

  if (!candles.length) throw new Error('No candle data returned for this symbol and interval.')
  return enrichCandles(candles)
}

async function fetchMarketCandles(symbol, interval, limit) {
  try {
    const data = await invokeFunction('get-market-data', { symbol, interval, limit })
    if (Array.isArray(data) && data.length) return data
    throw new Error('Market data function returned no candles.')
  } catch (edgeError) {
    console.warn('Supabase market data failed; using Binance fallback:', edgeError)
    return fetchBinanceCandles(symbol, interval, limit)
  }
}

function sanitizePreferences(payload) {
  const sanitized = { ...DEFAULT_CHART_PREFERENCES }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return sanitized
  Object.keys(DEFAULT_CHART_PREFERENCES).forEach((key) => {
    if (key in payload) {
      if (key === 'pivotType') {
        sanitized[key] = String(payload[key])
      } else if (key === 'pivotsBack') {
        sanitized[key] = Math.max(1, Math.min(50, Number(payload[key]) || 15))
      } else {
        sanitized[key] = Boolean(payload[key])
      }
    }
  })
  return sanitized
}

function localPreferencesKey(userKey) {
  return `${LOCAL_PREFERENCES_PREFIX}:${userKey || 'guest'}`
}

function loadLocalPreferences(userKey) {
  try {
    const raw = localStorage.getItem(localPreferencesKey(userKey))
    return raw ? sanitizePreferences(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function saveLocalPreferences(userKey, preferences) {
  try {
    localStorage.setItem(localPreferencesKey(userKey), JSON.stringify(sanitizePreferences(preferences)))
  } catch {
    // Local storage may be unavailable in private contexts.
  }
}

function calculatePivotsGeneric(prevHigh, prevLow, prevClose, prevOpen = null, currOpen = null, pivotType = 'traditional') {
  const levels = {
    PP: null,
    R1: null, R2: null, R3: null, R4: null, R5: null,
    S1: null, S2: null, S3: null, S4: null, S5: null
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

  // Round values
  for (const key of Object.keys(levels)) {
    const val = levels[key]
    if (val !== null && val !== undefined) {
      levels[key] = round2(val)
    }
  }

  return levels
}

function getPivotPeriod(timeframe) {
  const mapping = {
    '1m': 'daily', '5m': 'daily', '15m': 'daily', '30m': 'daily',
    '1h': 'daily', '2h': 'daily',
    '4h': 'weekly', '6h': 'weekly', '8h': 'weekly', '12h': 'weekly',
    '1d': 'monthly', '3d': 'monthly',
    '1w': 'quarterly',
  }
  return mapping[timeframe] ?? 'daily'
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

function groupPeriodCandles(candles, period) {
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

function getCurrentPeriodOpen(candles, period) {
  const grouped = groupPeriodCandles(candles, period)
  if (!grouped.length) return null
  return grouped[grouped.length - 1].open
}

function withPivotMeta(levels, type, period, basedOn) {
  return { ...levels, type, period, basedOn, generatedAt: new Date().toISOString() }
}

function analyzePriceVsPivots(currentPrice, pivots) {
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

function buildPivotData(candles, timeframe, selectedSymbol, chartPrefs = DEFAULT_CHART_PREFERENCES) {
  if (!Array.isArray(candles) || candles.length < 2) return null

  const period = getPivotPeriod(timeframe)
  const groupedPeriods = groupPeriodCandles(candles, period)
  if (groupedPeriods.length < 2) return null
  const completed = groupedPeriods[groupedPeriods.length - 2]
  if (!completed) return null

  const currentPrice = candles[candles.length - 1].close
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
    standardPeriods.push({
      period: currCandle.period,
      startTime: currCandle.startTime,
      endTime: currCandle.endTime,
      isCurrent: Boolean(currCandle.isCurrent),
      sourcePeriod: prevCandle.period,
      pivots: calculatePivotsGeneric(prevCandle.high, prevCandle.low, prevCandle.close, prevCandle.open, currCandle.open, pivotType),
    })
  }
  const visibleStandardPeriods = showHistoricalPivots ? standardPeriods : (standardPeriods.length ? [standardPeriods[standardPeriods.length - 1]] : [])

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

async function fetchPivotData(symbol, timeframe, candles, pivotType = 'traditional', chartPrefs = DEFAULT_CHART_PREFERENCES) {
  try {
    const data = await invokeFunction('calculate-pivots', {
      symbol,
      timeframe,
      candles,
      pivotType,
      pivotsBack: chartPrefs.pivotsBack || 15,
      showHistoricalPivots: chartPrefs.showHistoricalPivots !== false,
    })
    if (data?.success) return { ...data, symbol }
    throw new Error(data?.error || 'Pivot function returned no pivot data.')
  } catch (edgeError) {
    console.warn('Supabase pivot calculation failed; using local fallback:', edgeError)
    return buildPivotData(candles, timeframe, symbol, { ...chartPrefs, pivotType })
  }
}

function findSwings(candles, lookback = 2) {
  const swingHighs = []
  const swingLows = []

  if (candles.length < lookback * 2 + 1) return { swingHighs, swingLows }

  for (let i = lookback; i < candles.length - lookback; i++) {
    const currentHigh = candles[i].high
    const currentLow = candles[i].low
    const leftHighs = candles.slice(i - lookback, i).map((c) => c.high)
    const rightHighs = candles.slice(i + 1, i + lookback + 1).map((c) => c.high)
    const leftLows = candles.slice(i - lookback, i).map((c) => c.low)
    const rightLows = candles.slice(i + 1, i + lookback + 1).map((c) => c.low)

    if (currentHigh > Math.max(...leftHighs) && currentHigh > Math.max(...rightHighs)) {
      swingHighs.push({ time: candles[i].time, price: currentHigh })
    }
    if (currentLow < Math.min(...leftLows) && currentLow < Math.min(...rightLows)) {
      swingLows.push({ time: candles[i].time, price: currentLow })
    }
  }

  return { swingHighs, swingLows }
}

function nearestSupportResistance(currentPrice, swingHighs, swingLows) {
  const supports = swingLows.filter((s) => s.price < currentPrice)
  const resistances = swingHighs.filter((r) => r.price > currentPrice)
  const nearestSupport = supports.length ? supports.reduce((best, item) => (item.price > best.price ? item : best), supports[0]) : null
  const nearestResistance = resistances.length ? resistances.reduce((best, item) => (item.price < best.price ? item : best), resistances[0]) : null
  return { nearestSupport, nearestResistance }
}

function buildTechnicalAnalysis(candles, selectedSymbol, selectedInterval) {
  if (candles.length < 60) throw new Error('Not enough candles for analysis.')

  const latest = candles[candles.length - 1]
  const { swingHighs, swingLows } = findSwings(candles, 2)
  const { nearestSupport, nearestResistance } = nearestSupportResistance(latest.close, swingHighs, swingLows)

  const trend = latest.ema20 == null || latest.ema50 == null
    ? 'unknown'
    : latest.close > latest.ema20 && latest.ema20 > latest.ema50
      ? 'bullish'
      : latest.close < latest.ema20 && latest.ema20 < latest.ema50
        ? 'bearish'
        : 'mixed'

  const momentum = latest.rsi14 == null || latest.macd == null || latest.macdSignal == null
    ? 'unknown'
    : latest.rsi14 >= 70 && latest.macd > latest.macdSignal
      ? 'strong bullish but overbought'
      : latest.rsi14 <= 30 && latest.macd < latest.macdSignal
        ? 'strong bearish but oversold'
        : latest.macd > latest.macdSignal && latest.rsi14 > 50
          ? 'bullish'
          : latest.macd < latest.macdSignal && latest.rsi14 < 50
            ? 'bearish'
            : 'neutral'

  const rsiState = latest.rsi14 == null
    ? 'unknown'
    : latest.rsi14 >= 70
      ? 'overbought'
      : latest.rsi14 <= 30
        ? 'oversold'
        : latest.rsi14 >= 55
          ? 'bullish zone'
          : latest.rsi14 <= 45
            ? 'bearish zone'
            : 'neutral zone'

  const macdState = latest.macd == null || latest.macdSignal == null
    ? 'unknown'
    : latest.macd > latest.macdSignal
      ? 'bullish crossover bias'
      : latest.macd < latest.macdSignal
        ? 'bearish crossover bias'
        : 'neutral'

  const bullishScenario = nearestResistance && latest.ema20 != null
    ? `Bullish continuation becomes stronger if price holds above EMA20 (${latest.ema20.toFixed(2)}) and breaks resistance near ${nearestResistance.price.toFixed(2)}.`
    : latest.ema20 != null
      ? `Bullish continuation becomes stronger if price holds above EMA20 (${latest.ema20.toFixed(2)}).`
      : 'Need more confirmation.'

  const bearishScenario = nearestSupport
    ? `Bearish continuation becomes stronger if price loses support near ${nearestSupport.price.toFixed(2)}.`
    : 'Need more confirmation.'

  const invalidation = trend === 'bullish' && nearestSupport
    ? `If using the bullish idea, invalidation is a break below support near ${nearestSupport.price.toFixed(2)}.`
    : nearestSupport
      ? 'If using the bearish idea, invalidation is a clean reclaim above the latest broken support/resistance area.'
      : 'No clear invalidation level yet.'

  let confidence = 50
  if (trend === 'bullish' || trend === 'bearish') confidence += 15
  if (momentum === 'bullish' || momentum === 'bearish') confidence += 15
  if (nearestSupport) confidence += 10
  if (nearestResistance) confidence += 10

  return {
    symbol: selectedSymbol,
    interval: selectedInterval,
    latestPrice: latest.close,
    trend,
    momentum,
    rsi: latest.rsi14,
    rsiState,
    macd: latest.macd,
    macdSignal: latest.macdSignal,
    macdHist: latest.macdHist,
    macdState,
    ema20: latest.ema20,
    ema50: latest.ema50,
    nearestSupport,
    nearestResistance,
    swingHighs: swingHighs.slice(-5),
    swingLows: swingLows.slice(-5),
    bullishScenario,
    bearishScenario,
    invalidation,
    confidence: Math.min(confidence, 95),
  }
}

export default function App() {
  const { user, signOut } = useAuth()
  const currentUserId = user?.id || 'guest'
  const [symbolInput, setSymbolInput] = useState('BTCUSDT')
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [interval, setInterval] = useState('4h')

  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Idle')
  const [isLive, setIsLive] = useState(false)

  const getInitialTab = () => {
    const params = new URLSearchParams(window.location.search);
    const tabName = params.get('tab');
    return tabName && ['dashboard', 'analysis', 'learning'].includes(tabName) ? tabName : 'dashboard';
  };
  const [activeTab, setActiveTabState] = useState(getInitialTab);

  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('tab', tab);
    window.history.replaceState(null, '', newUrl.toString());
  };

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)
  const [isChartMaximized, setIsChartMaximized] = useState(false)

  const [analysis, setAnalysis] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('forge_theme') || 'dark')

  const [aiAnalysis, setAIAnalysis] = useState(null)
  const [aiLoading, setAILoading] = useState(false)
  const [aiError, setAIError] = useState('')

  const [pivotData, setPivotData] = useState(null)
  const [chartPreferences, setChartPreferences] = useState(DEFAULT_CHART_PREFERENCES)
  const [chartPrefsReady, setChartPrefsReady] = useState(false)
  const [preferencesSyncError, setPreferencesSyncError] = useState('')
  const userKeyRef = useRef(currentUserId)
  const preferencesCloudUnavailableRef = useRef(false)

  const wsRef = useRef(null)

  const latestCandle = candles.length ? candles[candles.length - 1] : null
  const latestPrice = latestCandle?.close ?? null
  const previousPrice = candles.length > 1 ? candles[candles.length - 2].close : null

  const priceChange = useMemo(() => {
    if (latestPrice == null || previousPrice == null || previousPrice === 0) return null
    return ((latestPrice - previousPrice) / previousPrice) * 100
  }, [latestPrice, previousPrice])

  const closeSocket = () => {
    if (wsRef.current) {
      const socket = wsRef.current
      wsRef.current = null

      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close()
      }
    }

    setIsLive(false)
  }

  const recalculateIndicators = (data) => {
    const closes = data.map((c) => c.close)
    const ema20 = calculateEMA(closes, 20)
    const ema50 = calculateEMA(closes, 50)
    const rsi14 = calculateRSI(closes, 14)
    const { macd, signalLine, hist } = calculateMACD(closes)

    return data.map((c, i) => ({
      ...c,
      ema20: ema20[i],
      ema50: ema50[i],
      rsi14: rsi14[i],
      macd: macd[i],
      macdSignal: signalLine[i],
      macdHist: hist[i]
    }))
  }

  const startWebSocket = (selectedSymbol, selectedInterval) => {
    closeSocket()

    const streamName = `${selectedSymbol.toLowerCase()}@kline_${selectedInterval}`
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`)

    wsRef.current = ws

    ws.onopen = () => {
      if (wsRef.current !== ws) return
      setStatus('Live stream connected')
      setIsLive(true)
    }

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return

      try {
        const msg = JSON.parse(event.data)
        const k = msg.k

        const liveCandle = {
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v)
        }

        setCandles((prev) => {
          if (!prev.length) {
            return recalculateIndicators([liveCandle])
          }

          let next = [...prev]
          const last = next[next.length - 1]

          if (last.time === liveCandle.time) {
            next[next.length - 1] = { ...next[next.length - 1], ...liveCandle }
          } else if (liveCandle.time > last.time) {
            next.push(liveCandle)
            if (next.length > 4000) {
              next = next.slice(next.length - 4000)
            }
          } else {
            return prev
          }

          return recalculateIndicators(next)
        })
      } catch {
        setStatus('Live update parse error')
      }
    }

    ws.onerror = () => {
      if (wsRef.current !== ws) return
      setStatus('WebSocket error')
      setIsLive(false)
    }

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null
        setStatus('Live stream disconnected')
        setIsLive(false)
      }
    }
  }

  const fetchPivots = async (selectedSymbol, selectedTimeframe) => {
    try {
      const sourceCandles = selectedSymbol === symbol && selectedTimeframe === interval ? candles : null
      const marketCandles = sourceCandles?.length
        ? sourceCandles
        : await fetchMarketCandles(selectedSymbol, selectedTimeframe, 4000)
      const nextPivotData = await fetchPivotData(selectedSymbol, selectedTimeframe, marketCandles, chartPreferences.pivotType || 'traditional', chartPreferences)
      if (nextPivotData?.success) {
        setPivotData(nextPivotData)
        return nextPivotData
      }
    } catch (err) {
      console.error('Failed to fetch pivots:', err)
    }
    return null
  }

  useEffect(() => {
    userKeyRef.current = currentUserId
    setChartPrefsReady(false)

    const fetchPreferences = async () => {
      const localPreferences = loadLocalPreferences(userKeyRef.current)
      if (localPreferences) {
        setChartPreferences((prev) => ({ ...prev, ...localPreferences }))
      }

      try {
        const data = await invokeFunction('user-preferences', {
          action: 'get',
          user_id: userKeyRef.current,
        })
        if (data && data.success === false) {
          const detail = [data.error, data.hint].filter(Boolean).join(' ')
          preferencesCloudUnavailableRef.current = true
          setPreferencesSyncError(detail || 'Cloud chart settings are unavailable. Local settings are active.')
          return
        }
        preferencesCloudUnavailableRef.current = false
        setPreferencesSyncError('')
        if (data?.success && data.preferences) {
          const preferences = sanitizePreferences(data.preferences)
          setChartPreferences((prev) => ({ ...prev, ...preferences }))
          saveLocalPreferences(userKeyRef.current, preferences)
        }
      } catch (err) {
        if (isEdgeFunctionUnavailableError(err)) {
          preferencesCloudUnavailableRef.current = true
          setPreferencesSyncError(EDGE_FUNCTION_UNAVAILABLE_MESSAGE)
        } else {
          setPreferencesSyncError(`Cloud chart settings are unavailable. Local settings are active. ${err.message || ''}`.trim())
        }
      } finally {
        setChartPrefsReady(true)
      }
    }

    fetchPreferences()
  }, [currentUserId])

  useEffect(() => {
    if (!chartPrefsReady) return

    const saveTimer = setTimeout(async () => {
      saveLocalPreferences(userKeyRef.current, chartPreferences)

      if (preferencesCloudUnavailableRef.current) {
        setPreferencesSyncError(EDGE_FUNCTION_UNAVAILABLE_MESSAGE)
        return
      }

      try {
        const data = await invokeFunction('user-preferences', {
          action: 'upsert',
          user_id: userKeyRef.current,
          preferences: chartPreferences,
        })
        if (data && data.success === false) {
          const detail = [data.error, data.hint].filter(Boolean).join(' ')
          preferencesCloudUnavailableRef.current = true
          setPreferencesSyncError(detail || 'Cloud chart settings are unavailable. Local settings were saved.')
          return
        }
        preferencesCloudUnavailableRef.current = false
        setPreferencesSyncError('')
      } catch (err) {
        if (isEdgeFunctionUnavailableError(err)) {
          preferencesCloudUnavailableRef.current = true
          setPreferencesSyncError(EDGE_FUNCTION_UNAVAILABLE_MESSAGE)
        } else {
          setPreferencesSyncError(`Cloud chart settings are unavailable. Local settings were saved. ${err.message || ''}`.trim())
        }
      }
    }, 250)

    return () => clearTimeout(saveTimer)
  }, [chartPreferences, chartPrefsReady, currentUserId])

  useEffect(() => {
    if (!candles.length) return
    fetchPivotData(symbol, interval, candles, chartPreferences.pivotType || 'traditional', chartPreferences).then((pivotResponse) => {
      if (pivotResponse?.success) setPivotData({ ...pivotResponse, symbol })
    }).catch((err) => {
      console.error('Failed to fetch pivots on preference change:', err)
    })
  }, [chartPreferences.pivotType, chartPreferences.pivotsBack, chartPreferences.showHistoricalPivots, symbol, interval])

  const runAIAnalysis = async (currentCandles = null) => {
    const candleData = currentCandles
    if (!candleData || candleData.length < 2) return

    setAILoading(true)
    setAIError('')

    // Fetch fresh pivots if not already available
    let currentPivotData = pivotData
    if (!currentPivotData) {
      currentPivotData = await fetchPivots(symbol, interval)
    }

    const latest = candleData[candleData.length - 1]
    const prev = candleData[candleData.length - 2]
    const priceChg =
      prev && prev.close !== 0
        ? (((latest.close - prev.close) / prev.close) * 100).toFixed(4)
        : 0

    // Compute swing highs / lows (simplified: local peaks over last 50 candles)
    const slice = candleData.slice(-50)
    const swingHighs = []
    const swingLows = []
    for (let i = 2; i < slice.length - 2; i++) {
      if (
        slice[i].high > slice[i - 1].high &&
        slice[i].high > slice[i - 2].high &&
        slice[i].high > slice[i + 1].high &&
        slice[i].high > slice[i + 2].high
      ) {
        swingHighs.push(slice[i].high)
      }
      if (
        slice[i].low < slice[i - 1].low &&
        slice[i].low < slice[i - 2].low &&
        slice[i].low < slice[i + 1].low &&
        slice[i].low < slice[i + 2].low
      ) {
        swingLows.push(slice[i].low)
      }
    }

    const last5 = candleData.slice(-5)

    const pivots = currentPivotData?.classic?.pivots ?? null
    const pivotAnalysis = currentPivotData?.classic?.analysis ?? null
    const fibPivots = currentPivotData?.fibonacci?.pivots ?? null
    const traditionalPivots = currentPivotData?.traditional?.pivots ?? currentPivotData?.binance?.pivots ?? null
    const traditionalAnalysis = currentPivotData?.traditional?.analysis ?? currentPivotData?.binance?.analysis ?? null

    const payload = {
      symbol,
      timeframe: interval,
      price: latest.close,
      change: priceChg,
      rsi: latest.rsi14 ?? null,
      ema20: latest.ema20 ?? null,
      ema50: latest.ema50 ?? null,
      macd: {
        macd: latest.macd ?? null,
        signal: latest.macdSignal ?? null,
        histogram: latest.macdHist ?? null,
      },
      volume: latest.volume ?? null,
      swingHighs: swingHighs.slice(-5),
      swingLows: swingLows.slice(-5),
      support: swingLows.length ? swingLows[swingLows.length - 1] : null,
      resistance: swingHighs.length ? swingHighs[swingHighs.length - 1] : null,
      recentCloses: last5.map((c) => c.close),
      recentVolumes: last5.map((c) => c.volume),
      obi: null,
      tfi: null,
      fundingRate: null,
      oiDelta: null,

      // Pivot data for AI
      pivots: pivots ? {
        classic: pivots,
        fibonacci: fibPivots,
        traditional: traditionalPivots,
        binance: traditionalPivots,
        analysis: pivotAnalysis ? {
          zone: pivotAnalysis.zone,
          bias: pivotAnalysis.bias,
          nearestPivotResistance: pivotAnalysis.nearestResistance,
          nearestPivotSupport: pivotAnalysis.nearestSupport,
          distToResistance: pivotAnalysis.distToResistance,
          distToSupport: pivotAnalysis.distToSupport,
          atInflectionPoint: pivotAnalysis.atInflectionPoint,
          inflectionLevel: pivotAnalysis.inflectionLevel,
          sessionBullish: pivotAnalysis.sessionBullish,
        } : null,
        binanceAnalysis: traditionalAnalysis,
      } : null,
    }

    try {
      const data = await invokeFunction('ai-analysis', payload)
      if (data?.success) {
        setAIAnalysis(data.analysis)
      } else {
        setAIError(data?.error || data?.fallback || 'AI analysis failed.')
      }
    } catch (err) {
      setAIError(err.message || 'Failed to reach AI service.')
    } finally {
      setAILoading(false)
    }
  }

  const loadChart = async (selectedSymbol = symbol, selectedInterval = interval) => {
    const cleaned = selectedSymbol.trim().toUpperCase()
    const validationError = validateBinanceSymbol(cleaned)

    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError('')
    setStatus('Loading historical candles...')
    setAnalysis(null)
    setPivotData(null)
    closeSocket()

    try {
      const data = await fetchMarketCandles(cleaned, selectedInterval, 4000)

      setCandles(data)
      setSymbol(cleaned)
      setInterval(selectedInterval)
      setStatus('Historical candles loaded')
      startWebSocket(cleaned, selectedInterval)
      setAnalysis(buildTechnicalAnalysis(data, cleaned, selectedInterval))
      fetchPivotData(cleaned, selectedInterval, data, chartPreferences.pivotType || 'traditional', chartPreferences).then((pivotResponse) => {
        if (pivotResponse?.success) setPivotData({ ...pivotResponse, symbol: cleaned })
      }).catch((err) => {
        console.error('Failed to fetch pivots:', err)
      })
    } catch (err) {
      setError(err.message || 'Something went wrong while loading data.')
      setStatus('Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadChart('BTCUSDT', '4h')
    setTheme(initTheme())
    return () => closeSocket()
  }, [])

  const toggleTheme = () => {
    const currentTheme = document.body.getAttribute('data-theme') || 'dark'
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark'
    applyTheme(newTheme)
    setTheme(newTheme)
  }

  const logout = async () => {
    const { error: signOutError } = await signOut()
    if (signOutError) {
      setError('Unable to sign out. Please try again.')
    }
  }

  return (
    <>
      {!isChartMaximized && (
        <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <a href="welcome.html" className="sidebar-brand">
            <div className="brand-icon-wrap">
              <svg viewBox="0 0 24 24"><path d="M3 3v18h18M9 15l3-3 4 4 5-5"/></svg>
            </div>
            <span className="brand-name">Forge</span>
          </a>
          <button className={`sidebar-toggle-btn ${!isSidebarCollapsed ? 'open' : ''}`} onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <line x1="3" y1="12" x2="21" y2="12" className="hamburger-line line-2" />
              <line x1="3" y1="6" x2="21" y2="6" className="hamburger-line line-1" />
              <line x1="3" y1="18" x2="21" y2="18" className="hamburger-line line-3" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          <button type="button" className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>
            <span className="nav-item-text">Dashboard</span>
          </button>
          <button type="button" className={`nav-item ${activeTab === 'analysis' ? 'active' : ''}`} onClick={() => setActiveTab('analysis')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path><path d="M5 3v4"></path><path d="M19 17v4"></path><path d="M3 5h4"></path><path d="M17 19h4"></path></svg>
            <span className="nav-item-text">Analysis</span>
          </button>
          <button type="button" className={`nav-item ${activeTab === 'learning' ? 'active' : ''}`} onClick={() => setActiveTab('learning')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
            <span className="nav-item-text">Learning</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="theme-toggle-wrap">
            <button className="theme-toggle" id="theme-toggle-btn" onClick={toggleTheme} style={{ justifyContent: 'center' }}>
              <span className="theme-toggle-label" id="theme-toggle-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
              {isSidebarCollapsed && (
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
              )}
            </button>
          </div>
          <button className="btn-logout" onClick={logout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            <span className="btn-logout-text">Sign out</span>
          </button>
        </div>
      </aside>
      )}

      <div className="main-content" style={{ padding: activeTab === 'learning' ? 0 : undefined }}>
        {activeTab !== 'learning' && !isChartMaximized && (
          <>
            <HeaderControls
              isLive={isLive}
              preferencesWarning={preferencesSyncError}
            />

            <StatusBar
              latestPrice={latestPrice}
              priceChange={priceChange}
              latestCandle={latestCandle}
              aiAnalysis={aiAnalysis}
            />
          </>
        )}

        {activeTab === 'dashboard' && (
          <div className="dashboard-grid">
            <div className="charts-column">
              <ChartPanelErrorBoundary>
                <ChartPanel
                  symbol={symbol}
                  interval={interval}
                  candles={candles}
                  loading={loading}
                  error={error}
                  status={status}
                  analysis={analysis}
                  pivotData={pivotData}
                  chartPreferences={chartPreferences}
                  onChartPreferencesChange={setChartPreferences}
                  symbolInput={symbolInput}
                  setSymbolInput={setSymbolInput}
                  setInterval={setInterval}
                  onLoadChart={loadChart}
                  isMaximized={isChartMaximized}
                  setIsMaximized={setIsChartMaximized}
                />
              </ChartPanelErrorBoundary>
            </div>

            <div className="analysis-column-fullwidth">
              <AnalysisPanel
                symbol={symbol}
                interval={interval}
                analysis={analysis}
                pivotData={pivotData}
              />
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="dashboard-grid">
            <AIAnalysisPanel
               aiAnalysis={aiAnalysis}
               aiLoading={aiLoading}
               aiError={aiError}
               onRefresh={() => runAIAnalysis(candles)}
            />
          </div>
        )}

        {activeTab === 'learning' && (
          <EducationPanel />
        )}

      </div>
    </>
  )
}
