import { useEffect, useMemo, useRef, useState } from 'react'
import HeaderControls from './components/HeaderControls'
import StatusBar from './components/StatusBar'
import ChartPanel from './components/ChartPanel'
import AnalysisPanel from './components/AnalysisPanel'
import AIAnalysisPanel from './components/AIAnalysisPanel'
import EducationPanel from './components/EducationPanel'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:5050'
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

export default function App() {
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

  const logout = () => {
    localStorage.removeItem('vcb_auth_token')
    localStorage.removeItem('vcb_user')
    sessionStorage.removeItem('vcb_auth_token')
    sessionStorage.removeItem('vcb_user')
    window.location.href = 'welcome.html'
  }

  return (
    <>
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <a href="welcome.html" className="sidebar-brand">
            <div className="brand-icon-wrap">
              <svg viewBox="0 0 24 24"><path d="M3 3v18h18M9 15l3-3 4 4 5-5"/></svg>
            </div>
            <span className="brand-name">Vision Chart</span>
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
          <a className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>
            <span className="nav-item-text">Dashboard</span>
          </a>
          <a className={`nav-item ${activeTab === 'analysis' ? 'active' : ''}`} onClick={() => setActiveTab('analysis')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path><path d="M5 3v4"></path><path d="M19 17v4"></path><path d="M3 5h4"></path><path d="M17 19h4"></path></svg>
            <span className="nav-item-text">Analysis</span>
          </a>
          <a className={`nav-item ${activeTab === 'learning' ? 'active' : ''}`} onClick={() => setActiveTab('learning')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
            <span className="nav-item-text">Learning</span>
          </a>
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

      <div className="main-content" style={{ padding: activeTab === 'learning' ? 0 : undefined }}>
        {activeTab !== 'learning' && (
          <>
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
          </>
        )}

        {activeTab === 'dashboard' && (
          <div className="dashboard-grid">
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