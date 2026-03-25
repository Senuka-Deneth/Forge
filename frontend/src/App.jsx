import { useEffect, useMemo, useRef, useState } from 'react'
import HeaderControls from './components/HeaderControls'
import StatusBar from './components/StatusBar'
import ChartPanel from './components/ChartPanel'
import AnalysisPanel from './components/AnalysisPanel'

const BACKEND_URL = 'http://127.0.0.1:5000'
const COMMON_QUOTES = ['USDT', 'BUSD', 'BTC', 'ETH', 'FDUSD']

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

  const [analysis, setAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')

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
            if (next.length > 500) {
              next = next.slice(next.length - 500)
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

  const runAnalysis = async (selectedSymbol = symbol, selectedInterval = interval) => {
    setAnalysisLoading(true)
    setAnalysisError('')

    try {
      const url = `${BACKEND_URL}/api/analyze?symbol=${selectedSymbol}&interval=${selectedInterval}&limit=300`
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
    closeSocket()

    try {
      const url = `${BACKEND_URL}/api/klines?symbol=${cleaned}&interval=${selectedInterval}&limit=300`
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
    } catch (err) {
      setError(err.message || 'Something went wrong while loading data.')
      setStatus('Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadChart('BTCUSDT', '4h')
    return () => closeSocket()
  }, [])

  return (
    <div className="app-shell">
      <HeaderControls
        symbolInput={symbolInput}
        setSymbolInput={setSymbolInput}
        interval={interval}
        setInterval={setInterval}
        onLoad={() => loadChart(symbolInput, interval)}
        onAnalyze={() => runAnalysis(symbol, interval)}
        loading={loading}
        analysisLoading={analysisLoading}
        isLive={isLive}
      />

      <StatusBar
        symbol={symbol}
        interval={interval}
        latestPrice={latestPrice}
        priceChange={priceChange}
        latestCandle={latestCandle}
        status={status}
        loading={loading}
        error={error}
      />

      <main className="main-layout">
        <section className="chart-section">
          <ChartPanel candles={candles} loading={loading} error={error} analysis={analysis} />
        </section>

        <aside className="side-panel">
          <AnalysisPanel
            symbol={symbol}
            interval={interval}
            latestCandle={latestCandle}
            analysis={analysis}
            loading={analysisLoading}
            error={analysisError}
          />
        </aside>
      </main>
    </div>
  )
}