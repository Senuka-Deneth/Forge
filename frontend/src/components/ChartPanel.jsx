import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  CrosshairMode,
} from 'lightweight-charts'

const STANDARD_PIVOT_COLOR = 'rgba(255, 159, 67, 0.92)'

const standardPivotConfig = {
  PP: { color: STANDARD_PIVOT_COLOR, width: 2, style: LineStyle.Solid, label: 'P' },
  R1: { color: STANDARD_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'R1' },
  R2: { color: STANDARD_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'R2' },
  R3: { color: STANDARD_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'R3' },
  R4: { color: STANDARD_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'R4' },
  R5: { color: STANDARD_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'R5' },
  S1: { color: STANDARD_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'S1' },
  S2: { color: STANDARD_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'S2' },
  S3: { color: STANDARD_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'S3' },
  S4: { color: STANDARD_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'S4' },
  S5: { color: STANDARD_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'S5' },
}

function subtractFiveMonths(unixTime) {
  const date = new Date(unixTime * 1000)
  date.setUTCMonth(date.getUTCMonth() - 5)
  return Math.floor(date.getTime() / 1000)
}

const getPivotTypeName = (type) => {
  if (!type) return 'Traditional'
  const t = type.toLowerCase()
  if (t === 'dm') return 'DM (DeMark)'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const POPULAR_PAIRS = [
  { symbol: 'BTCUSDT', name: 'BTC', quote: 'USDT', fullName: 'Bitcoin', volume: '10.46B', price: '71,682.12', change: '-2.98%' },
  { symbol: 'ETHUSDT', name: 'ETH', quote: 'USDT', fullName: 'Ethereum', volume: '7.77B', price: '1,977.75', change: '-2.21%' },
  { symbol: 'BNBUSDT', name: 'BNB', quote: 'USDT', fullName: 'BNB', volume: '1.98B', price: '688.04', change: '-5.55%' },
  { symbol: 'SOLUSDT', name: 'SOL', quote: 'USDT', fullName: 'Solana', volume: '1.45B', price: '164.20', change: '+3.15%' },
  { symbol: 'XRPUSDT', name: 'XRP', quote: 'USDT', fullName: 'Ripple', volume: '629.14M', price: '1.2960', change: '-3.59%' },
  { symbol: 'ADAUSDT', name: 'ADA', quote: 'USDT', fullName: 'Cardano', volume: '182.64M', price: '0.2295', change: '-3.16%' },
  { symbol: 'DOGEUSDT', name: 'DOGE', quote: 'USDT', fullName: 'Dogecoin', volume: '345.12M', price: '0.1412', change: '+1.88%' },
  { symbol: 'LTCUSDT', name: 'LTC', quote: 'USDT', fullName: 'Litecoin', volume: '62.07M', price: '51.06', change: '-2.68%' },
  { symbol: 'LINKUSDT', name: 'LINK', quote: 'USDT', fullName: 'Chainlink', volume: '99.88M', price: '8.958', change: '-2.87%' }
]

function getCryptoIcon(symbol, size = 18) {
  const symbolUpper = symbol.toUpperCase().replace('USDT', '').replace('BUSD', '')
  const char = symbolUpper.charAt(0)
  
  if (symbolUpper === 'BTC') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: '50%', flexShrink: 0 }}>
        <rect width="32" height="32" fill="#f7931a" />
        <text x="16" y="23" fill="white" fontSize="18" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">₿</text>
      </svg>
    )
  }
  if (symbolUpper === 'ETH') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: '50%', flexShrink: 0 }}>
        <rect width="32" height="32" fill="#627eea" />
        <text x="16" y="23" fill="white" fontSize="18" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">Ξ</text>
      </svg>
    )
  }
  if (symbolUpper === 'BNB') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: '50%', flexShrink: 0 }}>
        <rect width="32" height="32" fill="#f3ba2f" />
        <path d="M16 8l5 5-5 5-5-5 5-5zm0 11l5 5-5 5-5-5 5-5z" fill="white" />
      </svg>
    )
  }
  if (symbolUpper === 'SOL') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: '50%', flexShrink: 0 }}>
        <defs>
          <linearGradient id="solGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#14f195" />
            <stop offset="100%" stopColor="#9945ff" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" fill="url(#solGrad)" />
        <path d="M10 10h12l-3 4H10v-4zm12 8H10l3-4h12v4z" fill="white" />
      </svg>
    )
  }
  if (symbolUpper === 'XRP') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: '50%', flexShrink: 0 }}>
        <rect width="32" height="32" fill="#23292f" />
        <text x="16" y="22" fill="white" fontSize="16" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">✕</text>
      </svg>
    )
  }
  if (symbolUpper === 'ADA') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: '50%', flexShrink: 0 }}>
        <rect width="32" height="32" fill="#0033ad" />
        <circle cx="16" cy="16" r="4" fill="white" />
        <circle cx="16" cy="9" r="2" fill="white" />
        <circle cx="16" cy="23" r="2" fill="white" />
        <circle cx="9" cy="16" r="2" fill="white" />
        <circle cx="23" cy="16" r="2" fill="white" />
      </svg>
    )
  }
  if (symbolUpper === 'DOGE') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: '50%', flexShrink: 0 }}>
        <rect width="32" height="32" fill="#c2a633" />
        <text x="16" y="23" fill="white" fontSize="18" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">Ð</text>
      </svg>
    )
  }
  if (symbolUpper === 'LTC') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: '50%', flexShrink: 0 }}>
        <rect width="32" height="32" fill="#345d9d" />
        <text x="16" y="23" fill="white" fontSize="18" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">Ł</text>
      </svg>
    )
  }
  if (symbolUpper === 'LINK') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: '50%', flexShrink: 0 }}>
        <rect width="32" height="32" fill="#2a6cbf" />
        <polygon points="16,6 25,11 25,21 16,26 7,21 7,11" fill="none" stroke="white" strokeWidth="2.5" />
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: '50%', flexShrink: 0 }}>
      <rect width="32" height="32" fill="#4b5563" />
      <text x="16" y="22" fill="white" fontSize="15" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">{char}</text>
    </svg>
  )
}

export default function ChartPanel({
  symbol,
  interval,
  candles,
  loading,
  error,
  status,
  analysis,
  pivotData,
  chartPreferences,
  onChartPreferencesChange,
  symbolInput,
  setSymbolInput,
  setInterval,
  onLoadChart,
  isMaximized,
  setIsMaximized,
}) {
  const priceContainerRef = useRef(null)
  const rsiContainerRef = useRef(null)
  const macdContainerRef = useRef(null)

  const priceChartRef = useRef(null)
  const rsiChartRef = useRef(null)
  const macdChartRef = useRef(null)

  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const ema20SeriesRef = useRef(null)
  const ema50SeriesRef = useRef(null)

  const rsiSeriesRef = useRef(null)
  const macdSeriesRef = useRef(null)
  const macdSignalSeriesRef = useRef(null)
  const macdHistSeriesRef = useRef(null)

  const supportLineRef = useRef(null)
  const resistanceLineRef = useRef(null)

  const standardPivotSeriesRef = useRef([])
  const standardPivotMarkerPluginsRef = useRef([])

  const hasAppliedInitialZoomRef = useRef(false)
  const isInitializedRef = useRef(false)
  const marginStateRef = useRef({ top: 0.1, bottom: 0.1 })
  const priceZoomRef = useRef({ min: null, max: null })
  const dragStartRef = useRef({ isDragging: false, startY: 0, startMin: null, startMax: null })

  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false)
  const [hiddenIndicators, setHiddenIndicators] = useState([])
  const [showPivotSettings, setShowPivotSettings] = useState(false)
  const [legendCollapsed, setLegendCollapsed] = useState(false)
  
  const pairSelectorRef = useRef(null)
  const [showPairDropdown, setShowPairDropdown] = useState(false)
  const [pairSearchQuery, setPairSearchQuery] = useState('')
  const [pairsData, setPairsData] = useState(POPULAR_PAIRS)
  const candlesRef = useRef(candles)

  useEffect(() => {
    candlesRef.current = candles
  }, [candles])

  const updatePreference = (key) => {
    onChartPreferencesChange((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }


  const clearStandardPivotSegments = () => {
    const chart = priceChartRef.current
    if (!chart) return

    standardPivotMarkerPluginsRef.current.forEach((markerPlugin) => {
      try {
        markerPlugin.detach()
      } catch {
        // Ignore stale marker plugins
      }
    })
    standardPivotMarkerPluginsRef.current = []

    standardPivotSeriesRef.current.forEach((series) => {
      try {
        chart.removeSeries(series)
      } catch {
        // Ignore stale series
      }
    })
    standardPivotSeriesRef.current = []
  }

  useEffect(() => {
    if (loading) {
      isInitializedRef.current = false
      hasAppliedInitialZoomRef.current = false
    }
  }, [loading])

  useEffect(() => {
    priceZoomRef.current = { min: null, max: null }
    if (candleSeriesRef.current) {
      try {
        candleSeriesRef.current.applyOptions({
          autoscaleInfoProvider: undefined,
        })
      } catch {
        // Ignore
      }
    }
  }, [symbol, interval])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pairSelectorRef.current && !pairSelectorRef.current.contains(event.target)) {
        setShowPairDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const fetchTickers = async () => {
      try {
        const symbolsList = POPULAR_PAIRS.map(p => p.symbol)
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbolsList))}`
        const res = await fetch(url)
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data)) {
          setPairsData(prev => {
            return prev.map(p => {
              const ticker = data.find(t => t.symbol === p.symbol)
              if (ticker) {
                const priceNum = parseFloat(ticker.lastPrice)
                const changeNum = parseFloat(ticker.priceChangePercent)
                const quoteVolNum = parseFloat(ticker.quoteVolume)
                
                let volStr = p.volume
                if (quoteVolNum >= 1e9) {
                  volStr = `${(quoteVolNum / 1e9).toFixed(2)}B`
                } else if (quoteVolNum >= 1e6) {
                  volStr = `${(quoteVolNum / 1e6).toFixed(2)}M`
                }
                
                let priceStr = priceNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })

                return {
                  ...p,
                  price: priceStr,
                  change: `${changeNum >= 0 ? '+' : ''}${changeNum.toFixed(2)}%`,
                  volume: volStr
                }
              }
              return p
            })
          })
        }
      } catch (err) {
        console.warn('Failed to fetch dynamic tickers from Binance:', err)
      }
    }
    
    fetchTickers()
    const intervalId = setInterval(fetchTickers, 10000)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!priceContainerRef.current || !rsiContainerRef.current || !macdContainerRef.current) return

    const initialTheme = document.body.getAttribute('data-theme') || 'dark'
    const isDark = initialTheme === 'dark'

    const sharedLayout = {
      background: { color: isDark ? '#161a1e' : '#ffffff' },
      textColor: isDark ? '#8b8b9e' : '#6b6b7e',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    }

    const sharedGrid = {
      vertLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' },
      horzLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' },
    }

    const sharedCrosshair = {
      vertLine: { color: '#808080', width: 1, style: LineStyle.Dashed },
      horzLine: { color: '#808080', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#808080' },
    }

    const priceChart = createChart(priceContainerRef.current, {
      width: priceContainerRef.current.clientWidth,
      height: 420,
      layout: sharedLayout,
      grid: sharedGrid,
      crosshair: { ...sharedCrosshair, mode: CrosshairMode.Normal },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
        borderVisible: true,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      },
      rightPriceScale: {
        minimumWidth: 80,
        autoScale: true,
        scaleMargins: marginStateRef.current,
        axisLineVisible: true,
        borderVisible: true,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        axisDoubleClickReset: {
          time: true,
          price: true,
        },
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    })

    const rsiChart = createChart(rsiContainerRef.current, {
      width: rsiContainerRef.current.clientWidth,
      height: 120,
      layout: sharedLayout,
      grid: sharedGrid,
      crosshair: { ...sharedCrosshair, mode: CrosshairMode.Normal },
      timeScale: { 
        visible: false,
        borderVisible: true,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      },
      rightPriceScale: { 
        minimumWidth: 80,
        borderVisible: true,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      },
    })

    const macdChart = createChart(macdContainerRef.current, {
      width: macdContainerRef.current.clientWidth,
      height: 120,
      layout: sharedLayout,
      grid: sharedGrid,
      crosshair: { ...sharedCrosshair, mode: CrosshairMode.Normal },
      timeScale: { 
        timeVisible: true, 
        secondsVisible: false,
        borderVisible: true,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      },
      rightPriceScale: { 
        minimumWidth: 80,
        borderVisible: true,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      },
    })

    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    const volumeSeries = priceChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    })

    const ema20Series = priceChart.addSeries(LineSeries, {
      color: '#60a5fa',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
    })

    const ema50Series = priceChart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
    })

    const supportLine = priceChart.addSeries(LineSeries, {
      color: '#22c55e',
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
    })

    const resistanceLine = priceChart.addSeries(LineSeries, {
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
    })

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: '#a78bfa',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
    })

    const macdSeries = macdChart.addSeries(LineSeries, {
      color: '#60a5fa',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
    })

    const macdSignalSeries = macdChart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
    })

    const macdHistSeries = macdChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
    })

    priceChartRef.current = priceChart
    rsiChartRef.current = rsiChart
    macdChartRef.current = macdChart

    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries
    ema20SeriesRef.current = ema20Series
    ema50SeriesRef.current = ema50Series

    supportLineRef.current = supportLine
    resistanceLineRef.current = resistanceLine

    rsiSeriesRef.current = rsiSeries
    macdSeriesRef.current = macdSeries
    macdSignalSeriesRef.current = macdSignalSeries
    macdHistSeriesRef.current = macdHistSeries

    let isSyncingCrosshair = false

    const getSyncValue = (series, param) => {
      if (!param.time) return 0
      const d = param.seriesData.get(series)
      if (!d) return 0
      return d.value !== undefined ? d.value : (d.close !== undefined ? d.close : 0)
    }

    const syncToTargets = (sourceParam, targets) => {
      if (isSyncingCrosshair) return
      isSyncingCrosshair = true
      const outOfBounds = !sourceParam.point || !sourceParam.time
      targets.forEach(({ chart, series }) => {
        if (outOfBounds) {
          chart.clearCrosshairPosition()
        } else {
          chart.setCrosshairPosition(getSyncValue(series, sourceParam), sourceParam.time, series)
        }
      })
      isSyncingCrosshair = false
    }

    priceChart.subscribeCrosshairMove((param) => {
      syncToTargets(param, [
        { chart: rsiChart, series: rsiSeries },
        { chart: macdChart, series: macdSeries },
      ])
    })

    rsiChart.subscribeCrosshairMove((param) => {
      syncToTargets(param, [
        { chart: priceChart, series: candleSeries },
        { chart: macdChart, series: macdSeries },
      ])
    })

    macdChart.subscribeCrosshairMove((param) => {
      syncToTargets(param, [
        { chart: priceChart, series: candleSeries },
        { chart: rsiChart, series: rsiSeries },
      ])
    })

    let isSyncing = false
    const charts = [priceChart, rsiChart, macdChart]

    charts.forEach((source) => {
      source.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
        if (isSyncing || logicalRange === null) return
        isSyncing = true
        charts.forEach((target) => {
          if (target !== source) {
            target.timeScale().setVisibleLogicalRange(logicalRange)
          }
        })
        isSyncing = false
      })
    })

    const handleResize = () => {
      if (priceChartRef.current && priceContainerRef.current) {
        priceChartRef.current.applyOptions({
          width: priceContainerRef.current.clientWidth,
          height: priceContainerRef.current.clientHeight,
        })
      }

      if (rsiChartRef.current && rsiContainerRef.current) {
        rsiChartRef.current.applyOptions({
          width: rsiContainerRef.current.clientWidth,
          height: rsiContainerRef.current.clientHeight,
        })
      }

      if (macdChartRef.current && macdContainerRef.current) {
        macdChartRef.current.applyOptions({
          width: macdContainerRef.current.clientWidth,
          height: macdContainerRef.current.clientHeight,
        })
      }
    }

    const handleThemeChange = (e) => {
      const theme = e.detail.theme
      const darkMode = theme === 'dark'
      const chartOptions = {
        layout: {
          background: { color: darkMode ? '#161a1e' : '#ffffff' },
          textColor: darkMode ? '#8b8b9e' : '#6b6b7e',
        },
        grid: {
          vertLines: { color: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' },
          horzLines: { color: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' },
        },
      }

      if (priceChartRef.current) priceChartRef.current.applyOptions(chartOptions)
      if (rsiChartRef.current) rsiChartRef.current.applyOptions(chartOptions)
      if (macdChartRef.current) macdChartRef.current.applyOptions(chartOptions)
    }

    const handlePriceWheel = (e) => {
      const container = priceContainerRef.current
      const candlesList = candlesRef.current
      if (!container || !priceChartRef.current || !candleSeriesRef.current || !candlesList.length) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const isOverPriceScale = x > rect.width - 80
      const isAltKey = e.altKey

      if (isOverPriceScale || isAltKey) {
        e.preventDefault()
        e.stopPropagation()

        // Smooth out zoom sensitivity by dynamically scaling the zoom factor relative to e.deltaY intensity
        const zoomFactor = Math.max(0.7, Math.min(1.4, 1 + e.deltaY * 0.0012))

        // Initialize manual price bounds from currently visible candles if not already zooming
        if (priceZoomRef.current.min === null || priceZoomRef.current.max === null) {
          const visibleRange = priceChartRef.current.timeScale().getVisibleRange()
          let minPrice = Infinity
          let maxPrice = -Infinity

          if (visibleRange) {
            candlesList.forEach((c) => {
              if (c.time >= visibleRange.from && c.time <= visibleRange.to) {
                if (c.low < minPrice) minPrice = c.low
                if (c.high > maxPrice) maxPrice = c.high
              }
            })
          }

          if (minPrice === Infinity || maxPrice === -Infinity) {
            const lastCandle = candlesList[candlesList.length - 1]
            minPrice = lastCandle.low
            maxPrice = lastCandle.high
          }

          // Add standard 10% vertical margins to start with
          const padding = (maxPrice - minPrice) * 0.1
          priceZoomRef.current.min = minPrice - padding
          priceZoomRef.current.max = maxPrice + padding
        }

        // Apply zoom factor around the center of the current manual price range
        const currentMin = priceZoomRef.current.min
        const currentMax = priceZoomRef.current.max
        const mid = (currentMax + currentMin) / 2
        const range = currentMax - currentMin
        const newRange = range * zoomFactor

        const nextMin = mid - newRange / 2
        const nextMax = mid + newRange / 2

        priceZoomRef.current.min = nextMin
        priceZoomRef.current.max = nextMax

        // Dynamically override autoscaleInfoProvider to stretch scale vertically infinitely
        candleSeriesRef.current.applyOptions({
          autoscaleInfoProvider: () => ({
            priceRange: {
              minValue: nextMin,
              maxValue: nextMax,
            },
          }),
        })
      }
    }

    const handleDblClick = (e) => {
      const container = priceContainerRef.current
      if (!container || !priceChartRef.current || !candleSeriesRef.current) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const isOverPriceScale = x > rect.width - 80

      if (isOverPriceScale) {
        e.preventDefault()
        e.stopPropagation()

        // Reset manual price bounds
        priceZoomRef.current = { min: null, max: null }

        // Clear custom autoscaleInfoProvider to restore automatic scaling
        candleSeriesRef.current.applyOptions({
          autoscaleInfoProvider: undefined,
        })

        // Also reset margins to default standard
        const defaultMargins = { top: 0.1, bottom: 0.1 }
        marginStateRef.current = defaultMargins
        priceChartRef.current.priceScale('right').applyOptions({
          autoScale: true,
          scaleMargins: defaultMargins,
        })
      }
    }

    const handlePriceMouseDown = (e) => {
      const container = priceContainerRef.current
      const candlesList = candlesRef.current
      if (!container || !priceChartRef.current || !candleSeriesRef.current || !candlesList.length) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const isOverPriceScale = x > rect.width - 80

      // Only drag if not clicking on the price scale itself
      if (!isOverPriceScale) {
        // Initialize price bounds if not already set (e.g. if auto-scaling was active)
        if (priceZoomRef.current.min === null || priceZoomRef.current.max === null) {
          const visibleRange = priceChartRef.current.timeScale().getVisibleRange()
          let minPrice = Infinity
          let maxPrice = -Infinity

          if (visibleRange) {
            candlesList.forEach((c) => {
              if (c.time >= visibleRange.from && c.time <= visibleRange.to) {
                if (c.low < minPrice) minPrice = c.low
                if (c.high > maxPrice) maxPrice = c.high
              }
            })
          }

          if (minPrice === Infinity || maxPrice === -Infinity) {
            const lastCandle = candlesList[candlesList.length - 1]
            minPrice = lastCandle.low
            maxPrice = lastCandle.high
          }

          const padding = (maxPrice - minPrice) * 0.1
          priceZoomRef.current.min = minPrice - padding
          priceZoomRef.current.max = maxPrice + padding
        }

        dragStartRef.current = {
          isDragging: true,
          startY: e.clientY,
          startMin: priceZoomRef.current.min,
          startMax: priceZoomRef.current.max,
        }
      }
    }

    const handlePriceMouseMove = (e) => {
      if (!dragStartRef.current.isDragging) return

      const container = priceContainerRef.current
      if (!container || !candleSeriesRef.current) return

      const dy = e.clientY - dragStartRef.current.startY
      // We drag down to shift the price scale up
      const range = dragStartRef.current.startMax - dragStartRef.current.startMin
      const height = container.clientHeight
      const priceDelta = (dy / height) * range

      // Shift the bounds
      const nextMin = dragStartRef.current.startMin + priceDelta
      const nextMax = dragStartRef.current.startMax + priceDelta

      priceZoomRef.current.min = nextMin
      priceZoomRef.current.max = nextMax

      // Apply the manual price range to autoscaleInfoProvider
      candleSeriesRef.current.applyOptions({
        autoscaleInfoProvider: () => ({
          priceRange: {
            minValue: nextMin,
            maxValue: nextMax,
          },
        }),
      })
    }

    const handlePriceMouseUp = () => {
      dragStartRef.current.isDragging = false
    }

    const priceContainer = priceContainerRef.current
    if (priceContainer) {
      priceContainer.addEventListener('wheel', handlePriceWheel, { capture: true, passive: false })
      priceContainer.addEventListener('dblclick', handleDblClick, { capture: true })
      priceContainer.addEventListener('mousedown', handlePriceMouseDown)
      window.addEventListener('mousemove', handlePriceMouseMove)
      window.addEventListener('mouseup', handlePriceMouseUp)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('themeChanged', handleThemeChange)

    return () => {
      if (priceContainer) {
        priceContainer.removeEventListener('wheel', handlePriceWheel, { capture: true })
        priceContainer.removeEventListener('dblclick', handleDblClick, { capture: true })
        priceContainer.removeEventListener('mousedown', handlePriceMouseDown)
      }
      window.removeEventListener('mousemove', handlePriceMouseMove)
      window.removeEventListener('mouseup', handlePriceMouseUp)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('themeChanged', handleThemeChange)
      priceChart.remove()
      rsiChart.remove()
      macdChart.remove()
    }
  }, [])

  useEffect(() => {
    if (!candles.length) return
    if (
      !candleSeriesRef.current ||
      !volumeSeriesRef.current ||
      !ema20SeriesRef.current ||
      !ema50SeriesRef.current ||
      !supportLineRef.current ||
      !resistanceLineRef.current ||
      !rsiSeriesRef.current ||
      !macdSeriesRef.current ||
      !macdSignalSeriesRef.current ||
      !macdHistSeriesRef.current
    ) {
      return
    }

    if (!isInitializedRef.current) {
      candleSeriesRef.current.setData(candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })))
      volumeSeriesRef.current.setData(candles.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)',
      })))
      ema20SeriesRef.current.setData(candles.filter((c) => c.ema20 != null).map((c) => ({ time: c.time, value: c.ema20 })))
      ema50SeriesRef.current.setData(candles.filter((c) => c.ema50 != null).map((c) => ({ time: c.time, value: c.ema50 })))
      rsiSeriesRef.current.setData(candles.filter((c) => c.rsi14 != null).map((c) => ({ time: c.time, value: c.rsi14 })))
      macdSeriesRef.current.setData(candles.filter((c) => c.macd != null).map((c) => ({ time: c.time, value: c.macd })))
      macdSignalSeriesRef.current.setData(candles.filter((c) => c.macdSignal != null).map((c) => ({ time: c.time, value: c.macdSignal })))
      macdHistSeriesRef.current.setData(candles.filter((c) => c.macdHist != null).map((c) => ({
        time: c.time,
        value: c.macdHist,
        color: c.macdHist >= 0 ? 'rgba(34, 197, 94, 0.55)' : 'rgba(239, 68, 68, 0.55)',
      })))
      isInitializedRef.current = true
    } else {
      const c = candles[candles.length - 1]
      candleSeriesRef.current.update({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })
      volumeSeriesRef.current.update({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)',
      })
      if (c.ema20 != null) ema20SeriesRef.current.update({ time: c.time, value: c.ema20 })
      if (c.ema50 != null) ema50SeriesRef.current.update({ time: c.time, value: c.ema50 })
      if (c.rsi14 != null) rsiSeriesRef.current.update({ time: c.time, value: c.rsi14 })
      if (c.macd != null) macdSeriesRef.current.update({ time: c.time, value: c.macd })
      if (c.macdSignal != null) macdSignalSeriesRef.current.update({ time: c.time, value: c.macdSignal })
      if (c.macdHist != null) {
        macdHistSeriesRef.current.update({
          time: c.time,
          value: c.macdHist,
          color: c.macdHist >= 0 ? 'rgba(34, 197, 94, 0.55)' : 'rgba(239, 68, 68, 0.55)',
        })
      }
    }

    if (analysis?.nearestSupport) {
      supportLineRef.current.setData([
        { time: candles[0].time, value: analysis.nearestSupport.price },
        { time: candles[candles.length - 1].time, value: analysis.nearestSupport.price },
      ])
    } else {
      supportLineRef.current.setData([])
    }

    if (analysis?.nearestResistance) {
      resistanceLineRef.current.setData([
        { time: candles[0].time, value: analysis.nearestResistance.price },
        { time: candles[candles.length - 1].time, value: analysis.nearestResistance.price },
      ])
    } else {
      resistanceLineRef.current.setData([])
    }

    if (!hasAppliedInitialZoomRef.current && priceChartRef.current && candles.length > 0) {
      const latestTime = candles[candles.length - 1].time
      const earliestTime = candles[0].time
      const from = Math.max(earliestTime, subtractFiveMonths(latestTime))
      const candleCount = candles.length
      const candleDuration = candleCount > 1 ? (candles[candleCount - 1].time - candles[candleCount - 2].time) : 24 * 60 * 60
      const to = latestTime + 15 * candleDuration
      priceChartRef.current.timeScale().setVisibleRange({ from, to })
      hasAppliedInitialZoomRef.current = true
    }
  }, [candles, analysis])

  useEffect(() => {
    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({ visible: chartPreferences.showCandles })
    }
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({ visible: chartPreferences.showCandles && !hiddenIndicators.includes('volume') })
    }
  }, [chartPreferences.showCandles, hiddenIndicators])

  useEffect(() => {
    if (ema20SeriesRef.current) ema20SeriesRef.current.applyOptions({ visible: chartPreferences.showEma20 && !hiddenIndicators.includes('ema20') })
  }, [chartPreferences.showEma20, hiddenIndicators])

  useEffect(() => {
    if (ema50SeriesRef.current) ema50SeriesRef.current.applyOptions({ visible: chartPreferences.showEma50 && !hiddenIndicators.includes('ema50') })
  }, [chartPreferences.showEma50, hiddenIndicators])

  useEffect(() => {
    if (rsiContainerRef.current) {
      rsiContainerRef.current.style.display = (chartPreferences.showRsi && !hiddenIndicators.includes('rsi')) ? 'block' : 'none'
      window.dispatchEvent(new Event('resize'))
    }
  }, [chartPreferences.showRsi, hiddenIndicators])

  useEffect(() => {
    if (macdContainerRef.current) {
      macdContainerRef.current.style.display = (chartPreferences.showMacd && !hiddenIndicators.includes('macd')) ? 'block' : 'none'
      window.dispatchEvent(new Event('resize'))
    }
  }, [chartPreferences.showMacd, hiddenIndicators])

  useEffect(() => {
    if (supportLineRef.current) supportLineRef.current.applyOptions({ visible: chartPreferences.showSupport && !hiddenIndicators.includes('support') })
  }, [chartPreferences.showSupport, hiddenIndicators])

  useEffect(() => {
    if (resistanceLineRef.current) resistanceLineRef.current.applyOptions({ visible: chartPreferences.showResistance && !hiddenIndicators.includes('resistance') })
  }, [chartPreferences.showResistance, hiddenIndicators])



  useEffect(() => {
    clearStandardPivotSegments()

    if (!chartPreferences.showStandardPivots || !pivotData?.standardPeriods?.items || !priceChartRef.current || hiddenIndicators.includes('standard-pivots')) {
      return
    }

    const items = pivotData.standardPeriods.items
    if (!items.length) return

    // Sort items by startTime to ensure stable drawing order.
    const sortedItems = [...items].sort((a, b) => a.startTime - b.startTime)

    sortedItems.forEach((periodItem) => {
      // Validate time bounds to prevent identical time points which cause chart errors.
      if (periodItem.startTime >= periodItem.endTime) {
        // Skip invalid/zero-length segments.
        return
      }

      Object.entries(standardPivotConfig).forEach(([level, cfg]) => {
        const value = periodItem.pivots?.[level]
        if (value === undefined || value === null || !Number.isFinite(value)) return

        // Render each period+level as its own series so historical pivot blocks never merge.
        const lineSeries = priceChartRef.current.addSeries(LineSeries, {
          color: cfg.color,
          lineWidth: cfg.width,
          lineStyle: cfg.style,
          priceLineVisible: false,
          lastValueVisible: Boolean(periodItem.isCurrent),
          crosshairMarkerVisible: false,
        })
        lineSeries.setData([
          { time: periodItem.startTime, value },
          { time: periodItem.endTime, value },
        ])

        const markerPlugin = createSeriesMarkers(lineSeries, [{
          time: periodItem.startTime,
          position: 'inBar',
          color: 'rgba(255, 159, 67, 0.85)',
          shape: 'circle',
          text: cfg.label,
          size: 0
        }], { autoScale: false })

        standardPivotMarkerPluginsRef.current.push(markerPlugin)
        standardPivotSeriesRef.current.push(lineSeries)
      })
    })
  }, [chartPreferences.showStandardPivots, chartPreferences.showHistoricalPivots, pivotData, chartPreferences.pivotType, hiddenIndicators])

  useEffect(() => {
    window.dispatchEvent(new Event('resize'))
  }, [isMaximized, chartPreferences.showRsi, chartPreferences.showMacd])

  const indicatorItems = [
    {
      id: 'ema20',
      label: 'EMA 20',
      description: 'Short-term trend filter',
      applied: chartPreferences.showEma20,
      href: '?tab=learning#ema',
      onToggle: () => updatePreference('showEma20'),
    },
    {
      id: 'ema50',
      label: 'EMA 50',
      description: 'Medium-term trend filter',
      applied: chartPreferences.showEma50,
      href: '?tab=learning#ema',
      onToggle: () => updatePreference('showEma50'),
    },
    {
      id: 'rsi',
      label: 'RSI 14',
      description: 'Momentum / overbought-oversold',
      applied: chartPreferences.showRsi,
      href: '?tab=learning#rsi',
      onToggle: () => updatePreference('showRsi'),
    },
    {
      id: 'macd',
      label: 'MACD',
      description: 'Trend momentum confirmation',
      applied: chartPreferences.showMacd,
      href: '?tab=learning#macd',
      onToggle: () => updatePreference('showMacd'),
    },
    {
      id: 'support',
      label: 'Support line',
      description: 'Nearest swing floor',
      applied: chartPreferences.showSupport,
      href: '?tab=learning#pivot-levels',
      onToggle: () => updatePreference('showSupport'),
    },
    {
      id: 'resistance',
      label: 'Resistance line',
      description: 'Nearest swing ceiling',
      applied: chartPreferences.showResistance,
      href: '?tab=learning#pivot-levels',
      onToggle: () => updatePreference('showResistance'),
    },

    {
      id: 'standard-pivots',
      label: 'Standard Pivots',
      description: 'Time-separated traditional pivots',
      applied: chartPreferences.showStandardPivots,
      href: '?tab=learning#binance-pivots',
      onToggle: () => updatePreference('showStandardPivots'),
    },
  ]

  return (
    <div className={`chart-card ${isMaximized ? 'chart-card-maximized' : ''}`}>
      <div className="chart-card-header" style={{ position: 'relative', padding: '4px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '16px' }}>
          
          {/* Pair & Timeframe Controls (TradingView / Binance layout style) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            
            {/* Searchable Pair Dropdown Selector */}
            <div style={{ position: 'relative' }} ref={pairSelectorRef}>
              <button
                onClick={() => setShowPairDropdown(!showPairDropdown)}
                style={{
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '12px',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  transition: 'all 0.16s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  outline: 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-medium)'}
              >
                {getCryptoIcon(symbol, 18)}
                <span>{symbol}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>▼</span>
              </button>

              {/* Searchable Pair Dropdown Panel */}
              {showPairDropdown && (
                <div className="glass-panel" style={{
                  position: 'absolute',
                  top: '38px',
                  left: '0',
                  zIndex: 200,
                  background: 'rgba(7, 12, 20, 0.98)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '16px',
                  padding: '18px',
                  width: '440px',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
                  animation: 'fadeIn 0.15s ease-out',
                  backdropFilter: 'blur(20px)',
                  fontFamily: 'var(--font-ui), sans-serif'
                }}>
                  {/* Search Input Box */}
                  <div style={{ position: 'relative', marginBottom: '14px' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '14px' }}>🔍</span>
                    <input
                      type="text"
                      placeholder="Search pair..."
                      value={pairSearchQuery}
                      onChange={(e) => setPairSearchQuery(e.target.value.toUpperCase())}
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 34px',
                        background: 'var(--bg-raised)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '10px',
                        fontSize: '14px',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        fontFamily: 'var(--font-mono)'
                      }}
                      autoFocus
                    />
                  </div>

                  {/* Tabs Row */}
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
                    {['USDⓈ-M', 'COIN-M', 'Favorites'].map(tab => (
                      <span key={tab} style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: tab === 'USDⓈ-M' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        borderBottom: tab === 'USDⓈ-M' ? '2px solid var(--accent-primary)' : 'none',
                        paddingBottom: '8px',
                        cursor: 'pointer'
                      }}>{tab}</span>
                    ))}
                  </div>

                  {/* Table Column Headers */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 1.1fr 1fr',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    padding: '0 10px 8px',
                    borderBottom: '1px solid var(--border-subtle)'
                  }}>
                    <span>Symbol / Vol</span>
                    <span style={{ textAlign: 'right' }}>Last Price</span>
                    <span style={{ textAlign: 'right' }}>24h Chg</span>
                  </div>

                  {/* Tickers Scroll Area */}
                  <div style={{ maxHeight: '250px', overflowY: 'auto', marginTop: '8px', paddingRight: '4px' }}>
                    {pairsData
                      .filter(p => p.symbol.includes(pairSearchQuery))
                      .map(p => {
                        const isBear = p.change.startsWith('-')
                        return (
                          <div
                            key={p.symbol}
                            onClick={() => {
                              setSymbolInput(p.symbol)
                              setShowPairDropdown(false)
                              onLoadChart(p.symbol, interval)
                            }}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.4fr 1.1fr 1fr',
                              alignItems: 'center',
                              padding: '10px 10px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'background 0.12s ease'
                            }}
                            className="pair-row-hover"
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {getCryptoIcon(p.symbol, 18)}
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{p.symbol}</span>
                                  <span style={{ fontSize: '9.5px', color: 'var(--accent-primary)', background: 'var(--accent-subtle)', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>Perp</span>
                                </div>
                                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.volume}</span>
                              </div>
                            </div>
                            <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{p.price}</span>
                            <span style={{
                              textAlign: 'right',
                              fontSize: '13px',
                              fontWeight: 600,
                              color: isBear ? 'var(--color-bear)' : 'var(--color-bull)',
                              fontFamily: 'var(--font-mono)'
                            }}>{p.change}</span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Timeframe Select Dropdown (TradingView-styled pill) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '12px' }}>
              <select
                id="timeframe-select-chart"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                style={{
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '12px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  outline: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                }}
              >
                <option value="15m">15m</option>
                <option value="1h">1H</option>
                <option value="4h">4H</option>
                <option value="1d">1D</option>
                <option value="1w">1W</option>
              </select>
            </div>

            {/* Premium Vibrant Green Pill Load Button (matching 1st image) */}
            <button
              onClick={() => onLoadChart(symbolInput, interval)}
              disabled={loading}
              style={{
                background: 'hsl(158, 64%, 52%)',
                color: 'hsl(212, 48%, 5%)',
                border: 'none',
                borderRadius: '9999px',
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.16s ease',
                boxShadow: '0 4px 14px hsla(158, 64%, 52%, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '8px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'hsl(158, 64%, 44%)'
                e.currentTarget.style.boxShadow = '0 6px 20px hsla(158, 64%, 52%, 0.45)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'hsl(158, 64%, 52%)'
                e.currentTarget.style.boxShadow = '0 4px 14px hsla(158, 64%, 52%, 0.3)'
              }}
            >
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>

          {/* Indicators and Screen Controls on Right */}
          <div className="chart-toggles chart-toggles-inline">
            <button
              className={`toggle-btn ${chartPreferences.showCandles ? 'active' : ''}`}
              onClick={() => updatePreference('showCandles')}
            >
              Candles
            </button>
            <button
              className={`toggle-btn ${showIndicatorPanel ? 'active' : ''}`}
              onClick={() => setShowIndicatorPanel((prev) => !prev)}
            >
              Indicators
            </button>
            <button
              className={`toggle-btn ${isMaximized ? 'active' : ''}`}
              onClick={() => setIsMaximized((prev) => !prev)}
              title={isMaximized ? 'Exit Fullscreen' : 'Fullscreen'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.16s ease',
                border: 'none',
                background: 'transparent',
                color: isMaximized ? 'var(--text-primary)' : 'var(--text-muted)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = isMaximized ? 'var(--text-primary)' : 'var(--text-muted)'
              }}
            >
              {isMaximized ? (
                /* Restore / Exit Fullscreen (pointing inwards) */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <path d="M4 14h3v3m0-3l-4 4m16-4h-3v3m0-3l4 4M4 10h3V7m0 3L3 6m16 4h-3V7m0 3l4-4" />
                </svg>
              ) : (
                /* Maximize / Fullscreen (pointing outwards) */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              )}
            </button>
          </div>

        </div>
      </div>

      {showIndicatorPanel && (
        <div className="indicator-modal-backdrop" onClick={() => setShowIndicatorPanel(false)}>
          <div className="indicator-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="indicator-modal-header">
              <div>
                <div className="indicator-modal-title">Indicators</div>
                <div className="indicator-modal-subtitle">Toggle overlays and jump to the education note.</div>
              </div>
              <button className="indicator-modal-close" onClick={() => setShowIndicatorPanel(false)} aria-label="Close indicators">x</button>
            </div>

            <div className="indicator-list">
              {indicatorItems.map((item) => (
                <div key={item.id} className="indicator-item-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className={`indicator-row ${item.applied ? 'applied' : ''}`}>
                    <button type="button" className="indicator-row-main" onClick={item.onToggle}>
                      <span className="indicator-row-label-wrap">
                        <span className="indicator-row-label">{item.label}</span>
                        <span className="indicator-row-description">{item.description}</span>
                      </span>
                      <span className={`indicator-status ${item.applied ? 'on' : 'off'}`}>
                        {item.applied ? 'Applied' : 'Hidden'}
                      </span>
                    </button>
                    <a
                      className="indicator-help"
                      href={item.href}
                      aria-label={`Open education for ${item.label}`}
                      title={`Open education for ${item.label}`}
                    >
                      ?
                    </a>
                  </div>
                  {item.id === 'standard-pivots' && item.applied && (
                    <div className="indicator-settings-subrow" style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 16px',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px dashed var(--border-subtle)',
                      marginLeft: '8px',
                      marginRight: '8px',
                      animation: 'fadeIn 0.2s ease-in-out'
                    }}>
                      <label htmlFor="pivot-type-select" style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--text-secondary)'
                      }}>Calculation Method</label>
                      <select
                        id="pivot-type-select"
                        value={chartPreferences.pivotType || 'traditional'}
                        onChange={(e) => {
                          onChartPreferencesChange((prev) => ({
                            ...prev,
                            pivotType: e.target.value
                          }))
                        }}
                        style={{
                          background: 'var(--bg-raised)',
                          border: '1px solid var(--border-medium)',
                          borderRadius: '8px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          color: 'var(--text-primary)',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="traditional">Traditional</option>
                        <option value="fibonacci">Fibonacci</option>
                        <option value="woodie">Woodie</option>
                        <option value="classic">Classic</option>
                        <option value="dm">DM (DeMark)</option>
                        <option value="camarilla">Camarilla</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="chart-container-shell" style={{ position: 'relative' }}>
        {/* Dynamic Sliding Legend list */}
        <div className="chart-legend-container" style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          zIndex: 40,
          fontFamily: 'var(--font-ui), ui-sans-serif, system-ui, sans-serif',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          pointerEvents: 'auto',
          userSelect: 'none',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: legendCollapsed ? 'translateX(-10px)' : 'none'
        }}>
          {/* Collapse/Expand Toggle Button */}
          <button
            onClick={() => setLegendCollapsed(!legendCollapsed)}
            style={{
              background: 'rgba(7, 12, 20, 0.85)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '12px',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
            title={legendCollapsed ? 'Expand Legend' : 'Collapse Legend'}
          >
            {legendCollapsed ? '»' : '«'}
          </button>

          {/* List of active indicator badges */}
          {!legendCollapsed && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              transition: 'all 0.3s ease'
            }}>
              {[
                {
                  id: 'ema20',
                  label: 'EMA 20',
                  active: chartPreferences.showEma20,
                  onRemove: () => updatePreference('showEma20')
                },
                {
                  id: 'ema50',
                  label: 'EMA 50',
                  active: chartPreferences.showEma50,
                  onRemove: () => updatePreference('showEma50')
                },
                {
                  id: 'rsi',
                  label: 'RSI 14',
                  active: chartPreferences.showRsi,
                  onRemove: () => updatePreference('showRsi')
                },
                {
                  id: 'macd',
                  label: 'MACD',
                  active: chartPreferences.showMacd,
                  onRemove: () => updatePreference('showMacd')
                },
                {
                  id: 'support',
                  label: 'Support',
                  active: chartPreferences.showSupport,
                  onRemove: () => updatePreference('showSupport')
                },
                {
                  id: 'resistance',
                  label: 'Resistance',
                  active: chartPreferences.showResistance,
                  onRemove: () => updatePreference('showResistance')
                },

                {
                  id: 'volume',
                  label: 'Volume',
                  active: chartPreferences.showCandles,
                  onRemove: null
                },
                {
                  id: 'standard-pivots',
                  label: `Pivots ${getPivotTypeName(chartPreferences.pivotType)} Auto ${chartPreferences.pivotsBack || 15}`,
                  active: chartPreferences.showStandardPivots,
                  hasSettings: true,
                  onRemove: () => updatePreference('showStandardPivots')
                }
              ].filter(ind => ind.active).map(ind => {
                const isHidden = hiddenIndicators.includes(ind.id)
                return (
                  <div
                    key={ind.id}
                    className="indicator-legend-badge"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'rgba(7, 12, 20, 0.85)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: isHidden ? 'var(--text-muted)' : 'var(--text-primary)',
                      backdropFilter: 'blur(8px)',
                      opacity: isHidden ? 0.6 : 1,
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                  >
                    <span>{ind.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Hide/Show Eye Icon */}
                      <button
                        onClick={() => {
                          setHiddenIndicators(prev => 
                            prev.includes(ind.id) ? prev.filter(x => x !== ind.id) : [...prev, ind.id]
                          )
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: isHidden ? 'var(--text-muted)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '11px'
                        }}
                        title={isHidden ? 'Show' : 'Hide'}
                      >
                        {isHidden ? '👁️' : '👁️'}
                      </button>

                      {/* Settings Gear Button (Only for Standard Pivots) */}
                      {ind.hasSettings && !isHidden && (
                        <button
                          onClick={() => setShowPivotSettings(!showPivotSettings)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '11px'
                          }}
                          title="Settings"
                        >
                          ⚙️
                        </button>
                      )}

                      {/* Remove Button */}
                      {ind.onRemove && (
                        <button
                          onClick={ind.onRemove}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-bear)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '11px'
                          }}
                          title="Remove"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Dynamic Glassmorphic settings popover overlay */}
        {showPivotSettings && chartPreferences.showStandardPivots && !hiddenIndicators.includes('standard-pivots') && (
          <div className="pivot-settings-popover glass-panel" style={{
            position: 'absolute',
            top: '40px',
            left: '180px',
            zIndex: 80,
            background: 'rgba(7, 12, 20, 0.95)',
            border: '1px solid var(--border-medium)',
            borderRadius: '16px',
            padding: '20px',
            width: '320px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            animation: 'fadeIn 0.2s ease-in-out',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui), ui-sans-serif, system-ui, sans-serif',
            backdropFilter: 'blur(16px)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>Standard Pivots Settings</span>
              <button onClick={() => setShowPivotSettings(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px' }}>&times;</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Calculation Type</label>
                <select
                  value={chartPreferences.pivotType || 'traditional'}
                  onChange={(e) => {
                    onChartPreferencesChange((prev) => ({ ...prev, pivotType: e.target.value }))
                  }}
                  style={{
                    background: 'var(--bg-raised)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="traditional">Traditional</option>
                  <option value="fibonacci">Fibonacci</option>
                  <option value="woodie">Woodie</option>
                  <option value="classic">Classic</option>
                  <option value="dm">DM (DeMark)</option>
                  <option value="camarilla">Camarilla</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Show historical pivots</label>
                <input
                  type="checkbox"
                  checked={chartPreferences.showHistoricalPivots !== false}
                  onChange={(e) => onChartPreferencesChange((prev) => ({ ...prev, showHistoricalPivots: e.target.checked }))}
                  style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pivots Timeframe</label>
                <select
                  value="auto"
                  disabled
                  style={{
                    background: 'var(--bg-raised)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    outline: 'none',
                    cursor: 'not-allowed'
                  }}
                >
                  <option value="auto">Auto</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Number of Pivots Back</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={chartPreferences.pivotsBack || 15}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(50, parseInt(e.target.value) || 15))
                    onChartPreferencesChange((prev) => ({ ...prev, pivotsBack: val }))
                  }}
                  style={{
                    background: 'var(--bg-raised)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPivotSettings(false)} style={{
                background: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer'
              }}>Apply</button>
            </div>
          </div>
        )}
        <div id="chart-container" className="chart-container" ref={priceContainerRef}></div>
        {(loading || error || (!candles.length && !loading)) && (
          <div className={`chart-state-overlay ${error ? 'error' : ''}`}>
            <div className="chart-state-title">
              {error ? 'Chart data unavailable' : loading ? 'Loading candles' : 'No candle data'}
            </div>
            <div className="chart-state-copy">
              {error || status || 'Load a symbol and timeframe to render the chart.'}
            </div>
          </div>
        )}
      </div>
      <div id="rsi-container" className="subchart-container" ref={rsiContainerRef} style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 5, left: 10, color: '#8b8b9e', zIndex: 10, fontSize: '12px', fontWeight: 'bold', pointerEvents: 'none' }}>RSI</div>
      </div>
      <div id="macd-container" className="subchart-container" ref={macdContainerRef} style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 5, left: 10, color: '#8b8b9e', zIndex: 10, fontSize: '12px', fontWeight: 'bold', pointerEvents: 'none' }}>MACD</div>
      </div>
    </div>
  )
}
