import { useEffect, useMemo, useRef, useState } from 'react'
import HeaderControls from './components/HeaderControls'
import StatusBar from './components/StatusBar'
import ChartPanel from './components/ChartPanel'
import AnalysisPanel from './components/AnalysisPanel'
import AIAnalysisPanel from './components/AIAnalysisPanel'

const BACKEND_URL = 'http://127.0.0.1:5000'
const COMMON_QUOTES = ['USDT', 'BUSD', 'BTC', 'ETH', 'FDUSD']

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.body.setAttribute('data-theme', theme)
  localStorage.setItem('visionchartbot_theme', theme)
  
  // Dispatch custom event to tell chart panels to update colors
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }))
}

function initTheme() {
  const saved = localStorage.getItem('visionchartbot_theme') || 'dark'
  applyTheme(saved)
  return saved
}

function calculateEMA(values, period) {
  if (!values.length) return []
  const ema = []
  const multiplier = 2 / (period + 1)

  for (let i = 0; i < values.length; i++) {
    if (i === 0) ema.push(values[i])
    else ema.push((values[i] - ema[i - 1]) * multiplier + ema[i - 1])
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
  const macd = values.map((_, i) => fastEma[i] - slowEma[i])
  const signalLine = calculateEMA(macd, signal)
  const hist = macd.map((v, i) => v - signalLine[i])
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

export default function App() {
  const [symbolInput, setSymbolInput] = useState('BTCUSDT')
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [interval, setInterval] = useState('4h')

  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Idle')
  const [isLive, setIsLive] = useState(false)

  const [activeTab, setActiveTab] = useState('dashboard')

  const [analysis, setAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')

  const [aiAnalysis, setAIAnalysis] = useState(null)
  const [aiLoading, setAILoading] = useState(false)
  const [aiError, setAIError] = useState('')
  const lastAICallRef = useRef(0)

  // Pivot state
  const [pivotData, setPivotData] = useState(null)
  const [showPivots, setShowPivots] = useState(false)

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
      const res = await fetch(
        `${BACKEND_URL}/api/pivots?symbol=${selectedSymbol}&timeframe=${selectedTimeframe}`
      )
      const data = await res.json()
      if (data.success) {
        setPivotData(data)
        return data
      }
    } catch (err) {
      console.error('Failed to fetch pivots:', err)
    }
    return null
  }

  const handleTogglePivots = () => {
    setShowPivots((prev) => !prev)
  }

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
        analysis: {
          zone: pivotAnalysis.zone,
          bias: pivotAnalysis.bias,
          nearestPivotResistance: pivotAnalysis.nearestResistance,
          nearestPivotSupport: pivotAnalysis.nearestSupport,
          distToResistance: pivotAnalysis.distToResistance,
          distToSupport: pivotAnalysis.distToSupport,
          atInflectionPoint: pivotAnalysis.atInflectionPoint,
          inflectionLevel: pivotAnalysis.inflectionLevel,
          sessionBullish: pivotAnalysis.sessionBullish,
        },
      } : null,
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/ai-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        setAIAnalysis(data.analysis)
        lastAICallRef.current = Date.now()
      } else {
        setAIError(data.error || data.fallback || 'AI analysis failed.')
      }
    } catch (err) {
      setAIError('Failed to reach AI service. Is the backend running?')
    } finally {
      setAILoading(false)
    }
  }

  const runAnalysis = async (selectedSymbol = symbol, selectedInterval = interval) => {
    setAnalysisLoading(true)
    setAnalysisError('')

    try {
      const url = `${BACKEND_URL}/api/analyze?symbol=${selectedSymbol}&interval=${selectedInterval}&limit=4000`
      const res = await fetch(url)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze chart.')
      }

      setAnalysis(data)
    } catch (err) {
      setAnalysisError(err.message || 'Analysis failed.')
      setAnalysis(null)
    } finally {
      setAnalysisLoading(false)
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
    setAnalysisError('')
    setPivotData(null)
    closeSocket()

    try {
      const url = `${BACKEND_URL}/api/klines?symbol=${cleaned}&interval=${selectedInterval}&limit=4000`
      const res = await fetch(url)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load candles.')
      }

      setCandles(data)
      setSymbol(cleaned)
      setInterval(selectedInterval)
      setStatus('Historical candles loaded')
      startWebSocket(cleaned, selectedInterval)
      runAnalysis(cleaned, selectedInterval)
      fetchPivots(cleaned, selectedInterval)
    } catch (err) {
      setError(err.message || 'Something went wrong while loading data.')
      setStatus('Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadChart('BTCUSDT', '4h')
    const initialTheme = initTheme()
    setTheme(initialTheme)
    return () => closeSocket()
  }, [])

  const [theme, setTheme] = useState('dark')

  const toggleTheme = () => {
    const currentTheme = document.body.getAttribute('data-theme') || 'dark'
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark'
    applyTheme(newTheme)
    setTheme(newTheme)
  }

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-text" style={{ paddingLeft: '8px' }}>
            <span className="brand-name">Vision Chart</span>
            <span className="brand-sub">Binance Spot · AI Analysis</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">MAIN</div>
          <a 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} 
            onClick={() => setActiveTab('dashboard')}
            style={{ cursor: 'pointer' }}
          >
            <svg viewBox="0 0 24 24"><path d="M4 4h4v4H4zm12 0h4v4h-4zM4 16h4v4H4zm12 0h4v4h-4zM10 4h4v4h-4zm0 12h4v4h-4zm-6-6h4v4H4zm12 0h4v4h-4zm-6 0h4v4h-4z"/></svg>
            <span>Dashboard</span>
          </a>
          <a 
            className={`nav-item ${activeTab === 'analysis' ? 'active' : ''}`} 
            onClick={() => setActiveTab('analysis')}
            style={{ cursor: 'pointer' }}
          >
            <svg viewBox="0 0 24 24"><path d="M3 3v18h18M9 15l3-3 4 4 5-5"/></svg>
            <span>Analysis</span>
          </a>
          <a 
            className={`nav-item ${activeTab === 'signals' ? 'active' : ''}`} 
            onClick={() => setActiveTab('signals')}
            style={{ cursor: 'pointer' }}
          >
            <svg viewBox="0 0 24 24"><path d="M4 2v20h16V2H4zm14 18H6V4h12v16zM8 6h8v2H8V6zm0 4h8v2H8v-2zm0 4h5v2H8v-2z"/></svg>
            <span>Signals</span>
          </a>
        </nav>

        <div className="sidebar-footer">
          <div className="theme-toggle-wrap">
            <button className="theme-toggle" id="theme-toggle-btn" onClick={toggleTheme} style={{ justifyContent: 'center' }}>
              <span className="theme-toggle-label" id="theme-toggle-label">{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="main-content">
        <HeaderControls
          symbolInput={symbolInput}
          setSymbolInput={setSymbolInput}
          interval={interval}
          setInterval={setInterval}
          onLoad={() => loadChart(symbolInput, interval)}
          isLive={isLive}
          toggleTheme={toggleTheme}
          theme={theme}
        />

        <StatusBar
          latestPrice={latestPrice}
          priceChange={priceChange}
          latestCandle={latestCandle}
          aiAnalysis={aiAnalysis}
        />

        {activeTab === 'dashboard' && (
          <div className="dashboard-grid glass-layout">
            <div className="charts-column">
              <ChartPanel
                symbol={symbol}
                interval={interval}
                candles={candles}
                loading={loading}
                error={error}
                analysis={analysis}
                pivotData={pivotData}
                showPivots={showPivots}
                onTogglePivots={handleTogglePivots}
              />
            </div>

            <div className="analysis-column-fullwidth">
              <AnalysisPanel
                symbol={symbol}
                interval={interval}
                analysis={analysis}
                loading={analysisLoading}
                error={analysisError}
                pivotData={pivotData}
              />
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="dashboard-grid glass-layout">
            <AIAnalysisPanel
              aiAnalysis={aiAnalysis}
              aiLoading={aiLoading}
              aiError={aiError}
              onRefresh={() => runAIAnalysis(candles)}
            />
          </div>
        )}

        {activeTab === 'signals' && (
          <div className="dashboard-grid glass-layout" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-muted)' }}>
            <h2>Signals Module Coming Soon</h2>
          </div>
        )}
      </div>
    </>
  )
}