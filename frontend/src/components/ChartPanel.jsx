import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  CrosshairMode,
} from 'lightweight-charts'
import {
  applyManualPriceRange,
  clearManualPriceRange,
  getVisiblePriceBounds,
  isManualPriceRangeActive,
  isOverPriceScale,
  shouldHandleVerticalWheel,
} from '../utils/manualPriceScale'
import {
  getPivotPeriodLabel,
  resolvePivotPeriod,
  getChartIntervalSeconds,
  PIVOT_LEVEL_KEYS,
  PIVOT_SEGMENT_CAP,
} from '@forge/pivot'
import {
  PIVOT_LEVEL_LABELS,
  STANDARD_PIVOT_COLOR,
  clampPivotsBack,
  createDefaultPivotLevelOptions,
  getEnabledPivotLevels,
} from '../utils/pivotChartPrefs'
import { PivotSegmentsPrimitive } from '../utils/pivotSegmentsPrimitive'
import { getChartTheme, getCurrentChartTheme } from '../styles/chartTheme'

function buildCandleDataWithWhitespace(candles, periodEndTime, interval) {
  const data = candles.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }))
  if (!candles.length || !periodEndTime) return data

  const lastTime = candles[candles.length - 1].time
  if (periodEndTime <= lastTime) return data

  const step = getChartIntervalSeconds(interval, candles)
  let t = lastTime + step
  while (t <= periodEndTime) {
    data.push({ time: t })
    t += step
  }
  return data
}

const SUBPANE_HEIGHT = 120
const PANE_SEPARATOR_HEIGHT = 1

function getCurrentPivotPeriodEnd(pivotData) {
  const items = pivotData?.standardPeriods?.items
  if (!items?.length) return null
  const current = items.find((item) => item.isCurrent) ?? items[items.length - 1]
  return current?.endTime ?? null
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
  onIntervalChange,
  onLoadChart,
  isMaximized,
  setIsMaximized,
}) {
  const priceContainerRef = useRef(null)

  const priceChartRef = useRef(null)

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
  const pivotPrimitiveRef = useRef(null)
  const pivotPeriodEndRef = useRef(null)

  const hasAppliedInitialZoomRef = useRef(false)
  const isInitializedRef = useRef(false)
  const marginStateRef = useRef({ top: 0.1, bottom: 0.1 })
  const priceZoomRef = useRef({ min: null, max: null })
  const dragStartRef = useRef({
    isDragging: false,
    pending: false,
    startX: 0,
    startY: 0,
    startMin: null,
    startMax: null,
  })
  const savedHandleScrollRef = useRef(null)
  const timeRangeAtPanStartRef = useRef(null)
  const VERTICAL_PAN_THRESHOLD_PX = 5

  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false)
  const [hiddenIndicators, setHiddenIndicators] = useState([])
  const [showPivotSettings, setShowPivotSettings] = useState(false)
  const [legendCollapsed, setLegendCollapsed] = useState(false)
  const [paneLabelTops, setPaneLabelTops] = useState({ rsi: null, macd: null })

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

  const rsiVisible = chartPreferences.showRsi && !hiddenIndicators.includes('rsi')
  const macdVisible = chartPreferences.showMacd && !hiddenIndicators.includes('macd')

  // Pins every sub-pane to SUBPANE_HEIGHT (pane 0 absorbs the rest) and
  // repositions the floating RSI/MACD pane labels.
  const updatePaneLayout = () => {
    const chart = priceChartRef.current
    if (!chart) return

    chart.panes().forEach((pane) => {
      if (pane.paneIndex() > 0) pane.setHeight(SUBPANE_HEIGHT)
    })

    requestAnimationFrame(() => {
      const currentChart = priceChartRef.current
      if (!currentChart) return
      const measure = (series) => {
        if (!series) return null
        const paneIndex = series.getPane().paneIndex()
        let top = 0
        for (let i = 0; i < paneIndex; i++) {
          top += currentChart.paneSize(i).height + PANE_SEPARATOR_HEIGHT
        }
        return top
      }
      setPaneLabelTops({
        rsi: measure(rsiSeriesRef.current),
        macd: measure(macdSeriesRef.current),
      })
    })
  }


  const clearStandardPivotSegments = () => {
    const chart = priceChartRef.current
    if (!chart) return

    pivotPrimitiveRef.current?.clear()

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
    if (priceChartRef.current && candleSeriesRef.current) {
      clearManualPriceRange(priceChartRef.current, candleSeriesRef.current, priceZoomRef, marginStateRef)
    } else {
      priceZoomRef.current = { min: null, max: null }
    }
  }, [symbol, interval])

  useEffect(() => {
    if (!isManualPriceRangeActive(priceZoomRef)) return
    if (!priceChartRef.current) return
    applyManualPriceRange(
      priceChartRef.current,
      priceZoomRef,
      priceZoomRef.current.min,
      priceZoomRef.current.max,
    )
  }, [candles])

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
    const intervalId = window.setInterval(fetchTickers, 10000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!priceContainerRef.current) return

    const initialTheme = document.body.getAttribute('data-theme') || 'dark'
    const ct = getChartTheme(initialTheme)
    const borderColor = ct.border

    // Single chart with native panes (pane 0 = price, pane 1 = RSI, pane 2 = MACD):
    // one shared time scale and crosshair, so the panes can never drift apart.
    const priceChart = createChart(priceContainerRef.current, {
      autoSize: true,
      layout: {
        background: { color: ct.layout.background },
        textColor: ct.layout.textColor,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        panes: {
          separatorColor: ct.layout.paneSeparator,
          separatorHoverColor: ct.layout.paneSeparatorHover,
          enableResize: false,
        },
      },
      grid: {
        vertLines: { color: ct.grid },
        horzLines: { color: ct.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: ct.crosshair.line, width: 1, style: LineStyle.Dashed },
        horzLine: { color: ct.crosshair.line, width: 1, style: LineStyle.Dashed, labelBackgroundColor: ct.crosshair.labelBg },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
        borderVisible: true,
        borderColor,
      },
      rightPriceScale: {
        minimumWidth: 80,
        autoScale: true,
        scaleMargins: marginStateRef.current,
        axisLineVisible: true,
        borderVisible: true,
        borderColor,
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

    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: ct.candles.up,
      downColor: ct.candles.down,
      borderUpColor: ct.candles.up,
      borderDownColor: ct.candles.down,
      wickUpColor: ct.candles.up,
      wickDownColor: ct.candles.down,
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
      color: ct.ema20,
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
    })

    const ema50Series = priceChart.addSeries(LineSeries, {
      color: ct.ema50,
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
    })

    const supportLine = priceChart.addSeries(LineSeries, {
      color: ct.supportLine,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
    })

    const resistanceLine = priceChart.addSeries(LineSeries, {
      color: ct.resistanceLine,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
    })

    priceChartRef.current = priceChart

    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    const pivotPrimitive = new PivotSegmentsPrimitive()
    candleSeries.attachPrimitive(pivotPrimitive)
    pivotPrimitiveRef.current = pivotPrimitive
    ema20SeriesRef.current = ema20Series
    ema50SeriesRef.current = ema50Series

    supportLineRef.current = supportLine
    resistanceLineRef.current = resistanceLine

    const handleResize = () => {
      updatePaneLayout()
    }

    const handleThemeChange = (e) => {
      const nextTheme = getChartTheme(e.detail.theme)

      if (priceChartRef.current) {
        priceChartRef.current.applyOptions({
          layout: {
            background: { color: nextTheme.layout.background },
            textColor: nextTheme.layout.textColor,
            panes: { separatorColor: nextTheme.layout.paneSeparator },
          },
          grid: {
            vertLines: { color: nextTheme.grid },
            horzLines: { color: nextTheme.grid },
          },
          crosshair: {
            vertLine: { color: nextTheme.crosshair.line },
            horzLine: { color: nextTheme.crosshair.line, labelBackgroundColor: nextTheme.crosshair.labelBg },
          },
          timeScale: { borderColor: nextTheme.border },
          rightPriceScale: { borderColor: nextTheme.border },
        })
      }

      // Recolor every series so the chart fully follows the theme toggle.
      candleSeriesRef.current?.applyOptions({
        upColor: nextTheme.candles.up,
        downColor: nextTheme.candles.down,
        borderUpColor: nextTheme.candles.up,
        borderDownColor: nextTheme.candles.down,
        wickUpColor: nextTheme.candles.up,
        wickDownColor: nextTheme.candles.down,
      })
      ema20SeriesRef.current?.applyOptions({ color: nextTheme.ema20 })
      ema50SeriesRef.current?.applyOptions({ color: nextTheme.ema50 })
      supportLineRef.current?.applyOptions({ color: nextTheme.supportLine })
      resistanceLineRef.current?.applyOptions({ color: nextTheme.resistanceLine })
      rsiSeriesRef.current?.applyOptions({ color: nextTheme.rsi })
      macdSeriesRef.current?.applyOptions({ color: nextTheme.macd.line })
      macdSignalSeriesRef.current?.applyOptions({ color: nextTheme.macd.signal })

      // Per-point colored series (volume, MACD histogram) need their data re-mapped.
      const source = candlesRef.current || []
      volumeSeriesRef.current?.setData(source.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? nextTheme.volume.up : nextTheme.volume.down,
      })))
      macdHistSeriesRef.current?.setData(source.filter((c) => c.macdHist != null).map((c) => ({
        time: c.time,
        value: c.macdHist,
        color: c.macdHist >= 0 ? nextTheme.macd.histPos : nextTheme.macd.histNeg,
      })))
    }

    // The container now spans all panes; custom price-scale zoom/pan must only
    // engage over the main price pane (pane 0), not the RSI/MACD panes.
    const isWithinMainPane = (clientY) => {
      const container = priceContainerRef.current
      const chart = priceChartRef.current
      if (!container || !chart) return false
      const rect = container.getBoundingClientRect()
      const y = clientY - rect.top
      return y >= 0 && y <= chart.paneSize(0).height
    }

    const handlePriceWheel = (e) => {
      const container = priceContainerRef.current
      const candlesList = candlesRef.current
      const chart = priceChartRef.current
      if (!container || !chart || !candlesList.length) return
      if (!isWithinMainPane(e.clientY)) return

      // Shift/Ctrl/Meta or horizontal-dominant wheel: time-axis zoom (library default)
      if (!shouldHandleVerticalWheel(e, container)) return

      e.preventDefault()
      e.stopPropagation()

      const zoomFactor = Math.max(0.7, Math.min(1.4, 1 + e.deltaY * 0.0012))

      if (!isManualPriceRangeActive(priceZoomRef)) {
        const bounds = getVisiblePriceBounds(chart, candlesList)
        if (!bounds) return
        applyManualPriceRange(chart, priceZoomRef, bounds.min, bounds.max)
      }

      const currentMin = priceZoomRef.current.min
      const currentMax = priceZoomRef.current.max
      const mid = (currentMax + currentMin) / 2
      const range = currentMax - currentMin
      if (range <= 0) return

      const newRange = range * zoomFactor
      const nextMin = mid - newRange / 2
      const nextMax = mid + newRange / 2

      applyManualPriceRange(chart, priceZoomRef, nextMin, nextMax)
    }

    const handleDblClick = (e) => {
      const container = priceContainerRef.current
      if (!container || !priceChartRef.current || !candleSeriesRef.current) return
      if (!isWithinMainPane(e.clientY)) return

      if (isOverPriceScale(container, e.clientX)) {
        e.preventDefault()
        e.stopPropagation()
        clearManualPriceRange(priceChartRef.current, candleSeriesRef.current, priceZoomRef, marginStateRef)
      }
    }

    const defaultHandleScroll = {
      mouseWheel: false,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    }

    const restoreChartScroll = () => {
      if (savedHandleScrollRef.current && priceChartRef.current) {
        priceChartRef.current.applyOptions({ handleScroll: savedHandleScrollRef.current })
        savedHandleScrollRef.current = null
      }
    }

    const beginVerticalPan = (chart, candlesList) => {
      if (!isManualPriceRangeActive(priceZoomRef)) {
        const bounds = getVisiblePriceBounds(chart, candlesList)
        if (!bounds || !applyManualPriceRange(chart, priceZoomRef, bounds.min, bounds.max)) {
          return false
        }
      }

      if (timeRangeAtPanStartRef.current) {
        chart.timeScale().setVisibleLogicalRange(timeRangeAtPanStartRef.current)
      }

      savedHandleScrollRef.current = defaultHandleScroll
      chart.applyOptions({
        handleScroll: { ...defaultHandleScroll, pressedMouseMove: false },
      })
      return true
    }

    const handlePriceMouseDown = (e) => {
      if (e.button !== 0) return

      const container = priceContainerRef.current
      const candlesList = candlesRef.current
      const chart = priceChartRef.current
      if (!container || !chart || !candlesList.length) return

      if (isOverPriceScale(container, e.clientX)) return
      if (!isWithinMainPane(e.clientY)) return

      timeRangeAtPanStartRef.current = chart.timeScale().getVisibleLogicalRange()

      dragStartRef.current = {
        isDragging: false,
        pending: true,
        startX: e.clientX,
        startY: e.clientY,
        startMin: priceZoomRef.current.min,
        startMax: priceZoomRef.current.max,
      }
    }

    const handlePriceMouseMove = (e) => {
      const drag = dragStartRef.current
      if (!drag.pending && !drag.isDragging) return

      const container = priceContainerRef.current
      const chart = priceChartRef.current
      const candlesList = candlesRef.current
      if (!container || !chart || !candlesList.length) return

      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      if (drag.pending && !drag.isDragging) {
        if (Math.abs(dx) < VERTICAL_PAN_THRESHOLD_PX && Math.abs(dy) < VERTICAL_PAN_THRESHOLD_PX) {
          return
        }

        if (Math.abs(dy) <= Math.abs(dx)) {
          dragStartRef.current.pending = false
          return
        }

        if (!beginVerticalPan(chart, candlesList)) {
          dragStartRef.current.pending = false
          return
        }

        dragStartRef.current = {
          ...dragStartRef.current,
          pending: false,
          isDragging: true,
          startMin: priceZoomRef.current.min,
          startMax: priceZoomRef.current.max,
        }
      }

      if (!dragStartRef.current.isDragging) return

      const range = dragStartRef.current.startMax - dragStartRef.current.startMin
      if (!Number.isFinite(range) || range <= 0) return

      const height = container.clientHeight || 1
      const priceDelta = (dy / height) * range
      const nextMin = dragStartRef.current.startMin + priceDelta
      const nextMax = dragStartRef.current.startMax + priceDelta

      applyManualPriceRange(chart, priceZoomRef, nextMin, nextMax)
    }

    const handlePriceMouseUp = () => {
      dragStartRef.current.pending = false
      timeRangeAtPanStartRef.current = null
      if (dragStartRef.current.isDragging) {
        dragStartRef.current.isDragging = false
        restoreChartScroll()
      }
    }

    const priceContainer = priceContainerRef.current
    if (priceContainer) {
      priceContainer.addEventListener('wheel', handlePriceWheel, { capture: true, passive: false })
      priceContainer.addEventListener('dblclick', handleDblClick, { capture: true })
      priceContainer.addEventListener('mousedown', handlePriceMouseDown, { capture: true })
      window.addEventListener('mousemove', handlePriceMouseMove)
      window.addEventListener('mouseup', handlePriceMouseUp)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('themeChanged', handleThemeChange)

    return () => {
      if (priceContainer) {
        priceContainer.removeEventListener('wheel', handlePriceWheel, { capture: true })
        priceContainer.removeEventListener('dblclick', handleDblClick, { capture: true })
        priceContainer.removeEventListener('mousedown', handlePriceMouseDown, { capture: true })
      }
      window.removeEventListener('mousemove', handlePriceMouseMove)
      window.removeEventListener('mouseup', handlePriceMouseUp)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('themeChanged', handleThemeChange)
      pivotPrimitiveRef.current = null
      priceChartRef.current = null
      rsiSeriesRef.current = null
      macdSeriesRef.current = null
      macdSignalSeriesRef.current = null
      macdHistSeriesRef.current = null
      priceChart.remove()
    }
  }, [])

  // Creates/removes the RSI and MACD panes to match visibility preferences.
  // Removing a pane's last series drops the pane; pane 0 reclaims the space.
  useEffect(() => {
    const chart = priceChartRef.current
    if (!chart) return

    const source = candlesRef.current
    const ct = getCurrentChartTheme()

    if (rsiVisible && !rsiSeriesRef.current) {
      const rsiSeries = chart.addSeries(LineSeries, {
        color: ct.rsi,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
      }, chart.panes().length)
      rsiSeries.setData(source.filter((c) => c.rsi14 != null).map((c) => ({ time: c.time, value: c.rsi14 })))

      // Keep RSI pane above the MACD pane
      if (macdSeriesRef.current) {
        const macdPaneIndex = macdSeriesRef.current.getPane().paneIndex()
        const rsiPane = rsiSeries.getPane()
        if (rsiPane.paneIndex() > macdPaneIndex) rsiPane.moveTo(macdPaneIndex)
      }
      rsiSeriesRef.current = rsiSeries
    } else if (!rsiVisible && rsiSeriesRef.current) {
      chart.removeSeries(rsiSeriesRef.current)
      rsiSeriesRef.current = null
    }

    if (macdVisible && !macdSeriesRef.current) {
      const paneIndex = chart.panes().length
      const macdSeries = chart.addSeries(LineSeries, {
        color: ct.macd.line,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
      }, paneIndex)
      const macdSignalSeries = chart.addSeries(LineSeries, {
        color: ct.macd.signal,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
      }, paneIndex)
      const macdHistSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
      }, paneIndex)

      macdSeries.setData(source.filter((c) => c.macd != null).map((c) => ({ time: c.time, value: c.macd })))
      macdSignalSeries.setData(source.filter((c) => c.macdSignal != null).map((c) => ({ time: c.time, value: c.macdSignal })))
      macdHistSeries.setData(source.filter((c) => c.macdHist != null).map((c) => ({
        time: c.time,
        value: c.macdHist,
        color: c.macdHist >= 0 ? ct.macd.histPos : ct.macd.histNeg,
      })))

      macdSeriesRef.current = macdSeries
      macdSignalSeriesRef.current = macdSignalSeries
      macdHistSeriesRef.current = macdHistSeries
    } else if (!macdVisible && macdSeriesRef.current) {
      chart.removeSeries(macdSeriesRef.current)
      chart.removeSeries(macdSignalSeriesRef.current)
      chart.removeSeries(macdHistSeriesRef.current)
      macdSeriesRef.current = null
      macdSignalSeriesRef.current = null
      macdHistSeriesRef.current = null
    }

    updatePaneLayout()
  }, [rsiVisible, macdVisible])

  useEffect(() => {
    if (!candles.length) return
    if (
      !candleSeriesRef.current ||
      !volumeSeriesRef.current ||
      !ema20SeriesRef.current ||
      !ema50SeriesRef.current ||
      !supportLineRef.current ||
      !resistanceLineRef.current
    ) {
      return
    }

    const showPivots = chartPreferences.showStandardPivots && !hiddenIndicators.includes('standard-pivots')
    const periodEnd = showPivots ? getCurrentPivotPeriodEnd(pivotData) : null
    pivotPeriodEndRef.current = periodEnd
    const candleData = showPivots && periodEnd
      ? buildCandleDataWithWhitespace(candles, periodEnd, interval)
      : candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
    const needsFullCandleSet = showPivots && periodEnd && periodEnd > candles[candles.length - 1].time

    const ct = getCurrentChartTheme()

    if (!isInitializedRef.current) {
      candleSeriesRef.current.setData(candleData)
      volumeSeriesRef.current.setData(candles.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? ct.volume.up : ct.volume.down,
      })))
      ema20SeriesRef.current.setData(candles.filter((c) => c.ema20 != null).map((c) => ({ time: c.time, value: c.ema20 })))
      ema50SeriesRef.current.setData(candles.filter((c) => c.ema50 != null).map((c) => ({ time: c.time, value: c.ema50 })))
      rsiSeriesRef.current?.setData(candles.filter((c) => c.rsi14 != null).map((c) => ({ time: c.time, value: c.rsi14 })))
      macdSeriesRef.current?.setData(candles.filter((c) => c.macd != null).map((c) => ({ time: c.time, value: c.macd })))
      macdSignalSeriesRef.current?.setData(candles.filter((c) => c.macdSignal != null).map((c) => ({ time: c.time, value: c.macdSignal })))
      macdHistSeriesRef.current?.setData(candles.filter((c) => c.macdHist != null).map((c) => ({
        time: c.time,
        value: c.macdHist,
        color: c.macdHist >= 0 ? ct.macd.histPos : ct.macd.histNeg,
      })))
      isInitializedRef.current = true
    } else {
      const c = candles[candles.length - 1]
      if (needsFullCandleSet) {
        candleSeriesRef.current.setData(candleData)
      } else {
        candleSeriesRef.current.update({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })
      }
      // Indicator/volume series always take the tick update, regardless of
      // whether the candle series needed a full reset for pivot whitespace.
      volumeSeriesRef.current.update({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? ct.volume.up : ct.volume.down,
      })
      if (c.ema20 != null) ema20SeriesRef.current.update({ time: c.time, value: c.ema20 })
      if (c.ema50 != null) ema50SeriesRef.current.update({ time: c.time, value: c.ema50 })
      if (c.rsi14 != null) rsiSeriesRef.current?.update({ time: c.time, value: c.rsi14 })
      if (c.macd != null) macdSeriesRef.current?.update({ time: c.time, value: c.macd })
      if (c.macdSignal != null) macdSignalSeriesRef.current?.update({ time: c.time, value: c.macdSignal })
      if (c.macdHist != null) {
        macdHistSeriesRef.current?.update({
          time: c.time,
          value: c.macdHist,
          color: c.macdHist >= 0 ? ct.macd.histPos : ct.macd.histNeg,
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
  }, [candles, analysis, pivotData, chartPreferences.showStandardPivots, hiddenIndicators, interval])

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
    if (supportLineRef.current) supportLineRef.current.applyOptions({ visible: chartPreferences.showSupport && !hiddenIndicators.includes('support') })
  }, [chartPreferences.showSupport, hiddenIndicators])

  useEffect(() => {
    if (resistanceLineRef.current) resistanceLineRef.current.applyOptions({ visible: chartPreferences.showResistance && !hiddenIndicators.includes('resistance') })
  }, [chartPreferences.showResistance, hiddenIndicators])



  useEffect(() => {
    const rebuildStart = performance.now()
    clearStandardPivotSegments()

    if (!chartPreferences.showStandardPivots || !pivotData?.standardPeriods?.items || !priceChartRef.current || hiddenIndicators.includes('standard-pivots')) {
      return
    }

    const items = pivotData.standardPeriods.items
    if (!items.length) return

    const pivotType = chartPreferences.pivotType || 'traditional'
    const levelOptions = chartPreferences.pivotLevelOptions || createDefaultPivotLevelOptions()
    const enabledLevels = getEnabledPivotLevels(levelOptions)
    const baseLineWidth = chartPreferences.pivotLineWidth || 1
    const maxPeriods = Math.max(1, Math.floor(PIVOT_SEGMENT_CAP / Math.max(1, enabledLevels.length)))

    const sortedItems = [...items].sort((a, b) => a.startTime - b.startTime)
    const visibleItems = chartPreferences.showHistoricalPivots !== false
      ? sortedItems.slice(-maxPeriods)
      : [sortedItems[sortedItems.length - 1]].filter(Boolean)

    const labelStyle = {
      showLabels: chartPreferences.showPivotLabels !== false,
      showPrices: chartPreferences.showPivotPrices !== false,
      labelsPosition: chartPreferences.pivotLabelsPosition === 'right' ? 'right' : 'left',
    }

    const primitiveSegments = []
    let segmentCount = 0

    visibleItems.forEach((periodItem) => {
      if (periodItem.startTime >= periodItem.endTime) return

      enabledLevels.forEach((level) => {
        if (segmentCount >= PIVOT_SEGMENT_CAP) return
        const value = periodItem.pivots?.[level]
        if (value === undefined || value === null || !Number.isFinite(value)) return

        const levelCfg = levelOptions[level] || {}
        const color = levelCfg.color || STANDARD_PIVOT_COLOR
        const lineWidth = level === 'PP' ? Math.max(baseLineWidth, 2) : baseLineWidth
        const isCurrent = Boolean(periodItem.isCurrent)

        primitiveSegments.push({
          startTime: periodItem.startTime,
          endTime: periodItem.endTime,
          price: value,
          level,
          label: PIVOT_LEVEL_LABELS[level],
          color,
          lineWidth,
          drawLine: !isCurrent,
        })
        segmentCount += 1

        if (isCurrent) {
          const lineSeries = priceChartRef.current.addSeries(LineSeries, {
            color,
            lineWidth,
            lineStyle: LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false,
          })
          lineSeries.setData([
            { time: periodItem.startTime, value },
            { time: periodItem.endTime, value },
          ])
          standardPivotSeriesRef.current.push(lineSeries)
        }
      })
    })

    pivotPrimitiveRef.current?.setSegments(primitiveSegments, labelStyle)

    if (import.meta.env.DEV) {
      const elapsed = performance.now() - rebuildStart
      console.debug(
        `[pivots] rebuild ${elapsed.toFixed(1)}ms | periods=${visibleItems.length} segments=${segmentCount} series=${standardPivotSeriesRef.current.length}`,
      )
    }
  }, [
    chartPreferences.showStandardPivots,
    chartPreferences.showHistoricalPivots,
    chartPreferences.pivotsBack,
    chartPreferences.pivotType,
    chartPreferences.showPivotLabels,
    chartPreferences.showPivotPrices,
    chartPreferences.pivotLabelsPosition,
    chartPreferences.pivotLineWidth,
    chartPreferences.pivotLevelOptions,
    pivotData,
    hiddenIndicators,
  ])

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
                className="pair-selector-btn"
                onClick={() => setShowPairDropdown(!showPairDropdown)}
              >
                {getCryptoIcon(symbol, 18)}
                <span>{symbol}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>

              {/* Searchable Pair Dropdown Panel */}
              {showPairDropdown && (
                <div className="glass-panel" style={{
                  position: 'absolute',
                  top: '38px',
                  left: '0',
                  zIndex: 200,
                  background: 'var(--surface-overlay)',
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
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
                onChange={(e) => onIntervalChange(e.target.value)}
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

            <button
              className="btn-primary chart-load-btn"
              onClick={() => onLoadChart(symbolInput, interval)}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Load'}
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
              aria-label={isMaximized ? 'Exit fullscreen' : 'Fullscreen'}
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

      <AnimatePresence>
      {showIndicatorPanel && (
        <m.div
          className="indicator-modal-backdrop"
          onClick={() => setShowIndicatorPanel(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <m.div
            className="indicator-modal glass-panel"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="indicator-modal-header">
              <div>
                <div className="indicator-modal-title">Indicators</div>
                <div className="indicator-modal-subtitle">Toggle overlays and jump to the education note.</div>
              </div>
              <button className="indicator-modal-close" onClick={() => setShowIndicatorPanel(false)} aria-label="Close indicators">×</button>
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
          </m.div>
        </m.div>
      )}
      </AnimatePresence>

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
              background: 'var(--surface-overlay)',
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
                  label: `Pivots ${getPivotTypeName(chartPreferences.pivotType)} ${pivotData?.standardPeriods?.periodType ? getPivotPeriodLabel(pivotData.standardPeriods.periodType) : 'Auto'} ${chartPreferences.pivotsBack || 15}`,
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
                      background: 'var(--surface-overlay)',
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
                        aria-label={isHidden ? `Show ${ind.label}` : `Hide ${ind.label}`}
                      >
                        {isHidden ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        )}
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
                          aria-label="Pivot settings"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
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
        {showPivotSettings && chartPreferences.showStandardPivots && !hiddenIndicators.includes('standard-pivots') && (() => {
          const levelOptions = chartPreferences.pivotLevelOptions || createDefaultPivotLevelOptions()
          const enabledCount = getEnabledPivotLevels(levelOptions).length
          const pivotsBackMax = clampPivotsBack(
            50,
            chartPreferences.pivotType || 'traditional',
            levelOptions,
          )
          const inputStyle = {
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-medium)',
            borderRadius: '8px',
            padding: '6px 10px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            outline: 'none',
          }

          return (
          <div className="pivot-settings-popover glass-panel" style={{
            position: 'absolute',
            top: '40px',
            left: '180px',
            zIndex: 80,
            background: 'var(--surface-overlay)',
            border: '1px solid var(--border-medium)',
            borderRadius: '16px',
            padding: '20px',
            width: '340px',
            maxHeight: 'min(80vh, 640px)',
            overflowY: 'auto',
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
                    const pivotType = e.target.value
                    onChartPreferencesChange((prev) => ({
                      ...prev,
                      pivotType,
                      pivotsBack: clampPivotsBack(prev.pivotsBack, pivotType, prev.pivotLevelOptions),
                    }))
                  }}
                  style={{
                    ...inputStyle,
                    cursor: 'pointer',
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
                  value={chartPreferences.pivotTimeframe || 'auto'}
                  onChange={(e) => {
                    onChartPreferencesChange((prev) => ({ ...prev, pivotTimeframe: e.target.value }))
                  }}
                  style={{
                    background: 'var(--bg-raised)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="auto">Auto</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
                {chartPreferences.pivotTimeframe === 'auto' && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Resolves to {getPivotPeriodLabel(
                      pivotData?.standardPeriods?.periodType
                        ?? resolvePivotPeriod(interval, 'auto'),
                    )}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Number of Pivots Back</label>
                <input
                  type="number"
                  min="1"
                  max={pivotsBackMax}
                  value={chartPreferences.pivotsBack || 15}
                  onChange={(e) => {
                    const val = clampPivotsBack(
                      parseInt(e.target.value, 10) || 15,
                      chartPreferences.pivotType || 'traditional',
                      levelOptions,
                    )
                    onChartPreferencesChange((prev) => ({ ...prev, pivotsBack: val }))
                  }}
                  style={inputStyle}
                />
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Max {pivotsBackMax} ({enabledCount} levels, {PIVOT_SEGMENT_CAP} segment cap)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Show labels</label>
                <input
                  type="checkbox"
                  checked={chartPreferences.showPivotLabels !== false}
                  onChange={(e) => onChartPreferencesChange((prev) => ({ ...prev, showPivotLabels: e.target.checked }))}
                  style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Show prices</label>
                <input
                  type="checkbox"
                  checked={chartPreferences.showPivotPrices !== false}
                  onChange={(e) => onChartPreferencesChange((prev) => ({ ...prev, showPivotPrices: e.target.checked }))}
                  style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Labels position</label>
                <select
                  value={chartPreferences.pivotLabelsPosition === 'right' ? 'right' : 'left'}
                  onChange={(e) => onChartPreferencesChange((prev) => ({ ...prev, pivotLabelsPosition: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Line width</label>
                <input
                  type="number"
                  min="1"
                  max="4"
                  value={chartPreferences.pivotLineWidth || 1}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1))
                    onChartPreferencesChange((prev) => ({ ...prev, pivotLineWidth: val }))
                  }}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Levels</label>
                {PIVOT_LEVEL_KEYS.map((level) => {
                  const cfg = levelOptions[level] || { enabled: true, color: STANDARD_PIVOT_COLOR }
                  return (
                    <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={cfg.enabled !== false}
                        onChange={(e) => {
                          onChartPreferencesChange((prev) => {
                            const nextLevelOptions = {
                              ...(prev.pivotLevelOptions || createDefaultPivotLevelOptions()),
                              [level]: {
                                ...((prev.pivotLevelOptions || createDefaultPivotLevelOptions())[level]),
                                enabled: e.target.checked,
                              },
                            }
                            return {
                              ...prev,
                              pivotLevelOptions: nextLevelOptions,
                              pivotsBack: clampPivotsBack(prev.pivotsBack, prev.pivotType, nextLevelOptions),
                            }
                          })
                        }}
                        style={{ width: '14px', height: '14px', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <span style={{ fontSize: '11px', width: '28px', color: 'var(--text-secondary)' }}>
                        {PIVOT_LEVEL_LABELS[level]}
                      </span>
                      <input
                        type="color"
                        value={cfg.color?.startsWith('#') ? cfg.color : '#748fb4'}
                        onChange={(e) => {
                          onChartPreferencesChange((prev) => ({
                            ...prev,
                            pivotLevelOptions: {
                              ...(prev.pivotLevelOptions || createDefaultPivotLevelOptions()),
                              [level]: {
                                ...((prev.pivotLevelOptions || createDefaultPivotLevelOptions())[level]),
                                color: e.target.value,
                              },
                            },
                          }))
                        }}
                        style={{ width: '28px', height: '22px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn-primary"
                style={{ height: '30px', padding: '0 14px', fontSize: '12px' }}
                onClick={() => setShowPivotSettings(false)}
              >
                Apply
              </button>
            </div>
          </div>
          )
        })()}
        <div id="chart-container" className="chart-container" ref={priceContainerRef}></div>
        {paneLabelTops.rsi != null && (
          <div className="pane-label" style={{ top: paneLabelTops.rsi + 5 }}>RSI</div>
        )}
        {paneLabelTops.macd != null && (
          <div className="pane-label" style={{ top: paneLabelTops.macd + 5 }}>MACD</div>
        )}
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
    </div>
  )
}
