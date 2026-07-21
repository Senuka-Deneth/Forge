import { Component, useEffect, useMemo, useRef, useState } from 'react'
import { LazyMotion, MotionConfig, domAnimation, m } from 'framer-motion'
import HeaderControls from './components/HeaderControls'
import StatusBar from './components/StatusBar'
import ChartPanel from './components/ChartPanel'
import AnalysisPanel from './components/AnalysisPanel'
import AIAnalysisPanel from './components/AIAnalysisPanel'
import AccuracyPanel from './components/AccuracyPanel'
import EducationPanel from './components/EducationPanel'
import JournalPanel from './components/JournalPanel'
import { useAuth } from './hooks/useAuth'
import {
  EDGE_FUNCTION_UNAVAILABLE_MESSAGE,
  invokeFunction,
  isEdgeFunctionUnavailableError,
} from './supabaseClient'
import { buildPivotData, sanitizePivotTimeframe } from '@forge/pivot'
import { buildMarketStructure } from '@forge/market-structure'
import {
  DEFAULT_CHART_PREFERENCES,
  sanitizePreferences,
} from './utils/userPreferences'
import { patchLastCandleIndicators, extractClosedIndicatorState, computeSeriesIndicators } from './utils/incrementalIndicators'
import { deriveSignalAgreement } from './utils/signalAgreement'

const COMMON_QUOTES = ['USDT', 'BUSD', 'BTC', 'ETH', 'FDUSD']
const BINANCE_KLINES_URL = 'https://api.binance.com/api/v3/klines'
const WS_MAX_RECONNECT_DELAY_MS = 30000
const WS_WATCHDOG_TIMEOUT_MS = 30000
const AI_COOLDOWN_MS = 8000
const LOCAL_PREFERENCES_PREFIX = 'forge_chart_preferences'

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

async function fetchBinanceCandles(symbol, interval, limit) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 12000)

  try {
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

      const response = await fetch(url, { signal: controller.signal })
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
    return computeSeriesIndicators(candles)
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Binance request timed out')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchMarketCandles(symbol, interval, limit) {
  const clampedLimit = Math.min(1500, limit)
  try {
    const data = await invokeFunction('get-market-data', { symbol, interval, limit: clampedLimit })
    if (Array.isArray(data) && data.length) return data
    throw new Error('Market data function returned no candles.')
  } catch (edgeError) {
    console.warn('Supabase market data failed; using Binance fallback:', edgeError)
    return fetchBinanceCandles(symbol, interval, clampedLimit)
  }
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

// The edge function only needs recent candles for current price + ATR(14);
// sending the full 4000-candle history per request is wasted bandwidth.
const PIVOT_REQUEST_CANDLES = 200

// Guards against a stale deployed calculate-pivots build: the current contract
// always includes the in-progress period flagged isCurrent.
function hasCurrentPivotPeriod(data) {
  const items = data?.standardPeriods?.items
  return Array.isArray(items) && items.some((item) => item?.isCurrent === true)
}

async function fetchPivotData(symbol, timeframe, candles, pivotType = 'traditional', chartPrefs = DEFAULT_CHART_PREFERENCES) {
  const prefs = { ...chartPrefs, pivotType }
  const recentCandles = candles.slice(-PIVOT_REQUEST_CANDLES)
  try {
    const data = await invokeFunction('calculate-pivots', {
      symbol,
      timeframe,
      candles: recentCandles,
      pivotType,
      pivotTimeframe: sanitizePivotTimeframe(chartPrefs.pivotTimeframe),
      pivotsBack: chartPrefs.pivotsBack || 15,
      showHistoricalPivots: chartPrefs.showHistoricalPivots !== false,
    })
    if (data?.success && hasCurrentPivotPeriod(data)) return { ...data, symbol }
    throw new Error(data?.error || 'Pivot function returned a stale or incomplete payload.')
  } catch (edgeError) {
    console.warn('Supabase pivot calculation failed; using local fallback:', edgeError)
    return buildPivotData(recentCandles, timeframe, symbol, prefs)
  }
}

function buildTechnicalAnalysis(candles, selectedSymbol, selectedInterval) {
  if (candles.length < 60) throw new Error('Not enough candles for analysis.')

  const latest = candles[candles.length - 1]
  const rsiSeries = candles.map((c) => c.rsi14 ?? null)
  const structure = buildMarketStructure(candles, rsiSeries)
  const { nearestSupport, nearestResistance, swingHighs, swingLows, divergence } = structure

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

  // The bull case dies below support; the bear case dies above resistance. These are genuinely
  // different levels and must never share one string — showing the same invalidation on both
  // scenario cards tells the trader their downside stop also protects an upside idea.
  const invalidationBull = nearestSupport
    ? `Bullish idea fails on a decisive close below support near ${nearestSupport.price.toFixed(2)}.`
    : 'No confirmed support below price yet — no bullish invalidation level.'

  const invalidationBear = nearestResistance
    ? `Bearish idea fails on a decisive close above resistance near ${nearestResistance.price.toFixed(2)}.`
    : 'No confirmed resistance above price yet — no bearish invalidation level.'

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
    swingHighs: swingHighs.slice(-5).map((s) => ({ time: s.time, price: s.price })),
    swingLows: swingLows.slice(-5).map((s) => ({ time: s.time, price: s.price })),
    divergence,
    bullishScenario,
    bearishScenario,
    invalidationBull,
    invalidationBear,
  }
}

export default function App() {
  const { user, signOut } = useAuth()
  const currentUserId = user?.id || 'guest'
  const [symbolInput, setSymbolInput] = useState('BTCUSDT')
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [chartInterval, setChartInterval] = useState('4h')

  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Idle')
  const [isLive, setIsLive] = useState(false)

  const getInitialTab = () => {
    const params = new URLSearchParams(window.location.search);
    const tabName = params.get('tab');
    return tabName && ['dashboard', 'analysis', 'learning', 'journal'].includes(tabName) ? tabName : 'dashboard';
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
  const chartViewStateRef = useRef(null)

  const [analysis, setAnalysis] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('forge_theme') || 'dark')

  const [aiAnalysis, setAIAnalysis] = useState(null)
  const [aiLoading, setAILoading] = useState(false)
  const [aiError, setAIError] = useState('')
  const lastAICallRef = useRef(0)
  const loadIdRef = useRef(0)
  const skipIntervalReloadRef = useRef(true)
  const intervalReloadTimerRef = useRef(null)
  const lastClosedIndicatorStateRef = useRef(null)

  const [pivotData, setPivotData] = useState(null)
  const [chartPreferences, setChartPreferences] = useState(DEFAULT_CHART_PREFERENCES)
  const [chartPrefsReady, setChartPrefsReady] = useState(false)
  const [preferencesSyncError, setPreferencesSyncError] = useState('')
  const userKeyRef = useRef(currentUserId)
  const preferencesCloudUnavailableRef = useRef(false)

  const wsRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)
  const watchdogTimeoutRef = useRef(null)
  const wsParamsRef = useRef({ symbol: null, chartInterval: null })

  const latestCandle = candles.length ? candles[candles.length - 1] : null
  const latestPrice = latestCandle?.close ?? null

  const priceChange = useMemo(() => {
    if (!candles.length || latestPrice == null) return null
    const latest = candles[candles.length - 1]
    const targetTime = latest.time - 86400
    let closest = candles[0]
    let minDiff = Math.abs(closest.time - targetTime)
    for (const candle of candles) {
      const diff = Math.abs(candle.time - targetTime)
      if (diff < minDiff) {
        minDiff = diff
        closest = candle
      }
    }
    const basePrice = closest.close
    if (basePrice == null || basePrice === 0) return null
    return ((latestPrice - basePrice) / basePrice) * 100
  }, [candles, latestPrice])

  const clearReconnectTimer = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }

  const clearWatchdog = () => {
    if (watchdogTimeoutRef.current) {
      clearTimeout(watchdogTimeoutRef.current)
      watchdogTimeoutRef.current = null
    }
  }

  const closeSocket = () => {
    wsParamsRef.current = { symbol: null, chartInterval: null }
    clearReconnectTimer()
    clearWatchdog()

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

  const scheduleReconnect = () => {
    clearWatchdog()

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

    const { symbol: pendingSymbol, chartInterval: pendingChartInterval } = wsParamsRef.current
    if (!pendingSymbol || !pendingChartInterval) return

    const attempt = reconnectAttemptsRef.current
    reconnectAttemptsRef.current = attempt + 1
    const delayMs = Math.min(1000 * 2 ** attempt, WS_MAX_RECONNECT_DELAY_MS)

    setIsLive(false)
    setStatus(`Live stream disconnected. Reconnecting in ${Math.round(delayMs / 1000)}s...`)

    clearReconnectTimer()
    reconnectTimeoutRef.current = setTimeout(() => {
      startWebSocket(pendingSymbol, pendingChartInterval)
    }, delayMs)
  }

  const recalculateIndicators = (data) => {
    const result = computeSeriesIndicators(data)
    lastClosedIndicatorStateRef.current = extractClosedIndicatorState(result)
    return result
  }

  const startWebSocket = (selectedSymbol, selectedInterval) => {
    clearReconnectTimer()
    clearWatchdog()

    if (wsRef.current) {
      const previousSocket = wsRef.current
      wsRef.current = null
      if (
        previousSocket.readyState === WebSocket.OPEN ||
        previousSocket.readyState === WebSocket.CONNECTING
      ) {
        previousSocket.close()
      }
    }

    wsParamsRef.current = { symbol: selectedSymbol, chartInterval: selectedInterval }

    const streamName = `${selectedSymbol.toLowerCase()}@kline_${selectedInterval}`
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`)

    wsRef.current = ws

    const armWatchdog = () => {
      if (wsRef.current !== ws) return
      clearWatchdog()
      watchdogTimeoutRef.current = setTimeout(() => {
        if (wsRef.current !== ws) return
        setStatus('Live stream stalled. Reconnecting...')
        scheduleReconnect()
      }, WS_WATCHDOG_TIMEOUT_MS)
    }

    ws.onopen = () => {
      if (wsRef.current !== ws) return
      reconnectAttemptsRef.current = 0
      setStatus('Live stream connected')
      setIsLive(true)
      armWatchdog()
    }

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return
      armWatchdog()

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

        const isBarClosed = Boolean(k.x)

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

          if (isBarClosed) {
            return recalculateIndicators(next)
          }

          return patchLastCandleIndicators(next, liveCandle, lastClosedIndicatorStateRef.current)
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
        scheduleReconnect()
      }
    }
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

  // Signal agreement is recomputed when pivots land rather than folded into buildTechnicalAnalysis,
  // so the expensive structure pass over 4000 candles does not rerun on every pivot refresh.
  const signalAgreement = useMemo(
    () => deriveSignalAgreement(analysis, pivotData?.classic?.analysis ?? null),
    [analysis, pivotData],
  )

  // Refresh pivots once per bar open (not on every websocket tick — intra-bar
  // ticks cannot change pivot levels, and each refresh hits Binance server-side).
  const lastBarTime = candles.length ? candles[candles.length - 1].time : null

  useEffect(() => {
    if (!candles.length) return

    let cancelled = false

    const refreshPivots = async () => {
      try {
        const pivotResponse = await fetchPivotData(
          symbol,
          chartInterval,
          candles,
          chartPreferences.pivotType || 'traditional',
          chartPreferences,
        )
        if (!cancelled && pivotResponse?.success) {
          setPivotData({ ...pivotResponse, symbol })
        }
      } catch (err) {
        if (!cancelled) console.error('Failed to refresh pivots:', err)
      }
    }

    refreshPivots()

    return () => {
      cancelled = true
    }
  }, [
    lastBarTime,
    candles.length,
    chartPreferences.pivotType,
    chartPreferences.pivotTimeframe,
    chartPreferences.pivotsBack,
    chartPreferences.showHistoricalPivots,
    symbol,
    chartInterval,
  ])

  const runAIAnalysis = async (currentCandles = null) => {
    const candleData = currentCandles
    if (!candleData || candleData.length < 2) return

    const now = Date.now()
    const elapsedSinceLastCall = now - lastAICallRef.current
    if (elapsedSinceLastCall < AI_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((AI_COOLDOWN_MS - elapsedSinceLastCall) / 1000)
      setAIError(`Please wait ${waitSeconds}s before requesting another AI analysis.`)
      return
    }
    lastAICallRef.current = now

    setAILoading(true)
    setAIError('')

    try {
      const data = await invokeFunction('ai-analysis', { symbol, interval: chartInterval })
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

  const loadChart = async (selectedSymbol = symbol, selectedInterval = chartInterval) => {
    const cleaned = selectedSymbol.trim().toUpperCase()
    const validationError = validateBinanceSymbol(cleaned)

    if (validationError) {
      setError(validationError)
      return
    }

    const loadId = ++loadIdRef.current

    setLoading(true)
    setError('')
    setStatus('Loading historical candles...')
    setAnalysis(null)
    setPivotData(null)
    closeSocket()

    try {
      const data = await fetchMarketCandles(cleaned, selectedInterval, 4000)
      if (loadId !== loadIdRef.current) return

      setCandles(data)
      setSymbol(cleaned)
      setChartInterval(selectedInterval)
      setStatus('Historical candles loaded')
      startWebSocket(cleaned, selectedInterval)
      setAnalysis(buildTechnicalAnalysis(data, cleaned, selectedInterval))
    } catch (err) {
      if (loadId !== loadIdRef.current) return
      setError(err.message || 'Something went wrong while loading data.')
      setStatus('Load failed')
    } finally {
      if (loadId === loadIdRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    loadChart('BTCUSDT', '4h')
    setTheme(initTheme())
    return () => closeSocket()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, [])

  useEffect(() => {
    if (skipIntervalReloadRef.current) {
      skipIntervalReloadRef.current = false
      return undefined
    }
    clearTimeout(intervalReloadTimerRef.current)
    intervalReloadTimerRef.current = setTimeout(() => {
      loadChart(symbol, chartInterval)
    }, 300)
    return () => clearTimeout(intervalReloadTimerRef.current)
  }, [chartInterval])

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
    <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">
      {!isChartMaximized && (
        <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <a href="/welcome.html" className="sidebar-brand">
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
          <button type="button" className={`nav-item ${activeTab === 'journal' ? 'active' : ''}`} onClick={() => setActiveTab('journal')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><line x1="8" y1="7" x2="16" y2="7"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            <span className="nav-item-text">Journal</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="theme-toggle-wrap">
            <button className="theme-toggle" id="theme-toggle-btn" onClick={toggleTheme}>
              <span className="theme-toggle-label" id="theme-toggle-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
              {isSidebarCollapsed && (
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
              )}
            </button>
          </div>
          <button className="btn-logout" onClick={logout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            <span className="btn-logout-text">Sign out</span>
          </button>
        </div>
      </aside>
      )}

      <div className="main-content" style={{ padding: activeTab === 'learning' ? 0 : undefined }}>
        {activeTab !== 'learning' && activeTab !== 'journal' && !isChartMaximized && (
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
          <m.div
            className="dashboard-grid"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <div className="charts-column">
              <ChartPanelErrorBoundary>
                <ChartPanel
                  symbol={symbol}
                  interval={chartInterval}
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
                  onIntervalChange={setChartInterval}
                  onLoadChart={loadChart}
                  isMaximized={isChartMaximized}
                  setIsMaximized={setIsChartMaximized}
                  viewStateRef={chartViewStateRef}
                />
              </ChartPanelErrorBoundary>
            </div>

            <div className="analysis-column-fullwidth">
              <AnalysisPanel
                symbol={symbol}
                interval={chartInterval}
                analysis={analysis}
                loading={loading}
                error={error}
                pivotData={pivotData}
                signalAgreement={signalAgreement}
                empiricalConfidence={aiAnalysis?.trade_plan?.empirical_confidence ?? null}
                empiricalSampleSize={aiAnalysis?._meta?.calibration?.n ?? null}
              />
            </div>
          </m.div>
        )}

        {activeTab === 'analysis' && (
          <m.div
            className="dashboard-grid"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <AIAnalysisPanel
               aiAnalysis={aiAnalysis}
               aiLoading={aiLoading}
               aiError={aiError}
               onRefresh={() => runAIAnalysis(candles)}
            />
            <AccuracyPanel />
          </m.div>
        )}

        {activeTab === 'learning' && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <EducationPanel />
          </m.div>
        )}

        {activeTab === 'journal' && (
          <m.div
            className="dashboard-grid"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <JournalPanel
              symbol={symbol}
              latestPrice={latestPrice}
              aiAnalysis={aiAnalysis}
            />
          </m.div>
        )}

      </div>
    </MotionConfig>
    </LazyMotion>
  )
}
