import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  CrosshairMode,
} from 'lightweight-charts'

const FIBONACCI_PIVOT_COLOR = 'rgba(160, 160, 170, 0.8)'
const STANDARD_PIVOT_COLOR = 'rgba(255, 159, 67, 0.92)'

const fibonacciPivotConfig = {
  PP: { color: FIBONACCI_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'PP' },
  R1: { color: FIBONACCI_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'R1' },
  R2: { color: FIBONACCI_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'R2' },
  R3: { color: FIBONACCI_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'R3' },
  S1: { color: FIBONACCI_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'S1' },
  S2: { color: FIBONACCI_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'S2' },
  S3: { color: FIBONACCI_PIVOT_COLOR, width: 1, style: LineStyle.Solid, label: 'S3' },
}

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

  const fibPivotLinesRef = useRef([])
  const standardPivotSeriesRef = useRef([])

  const hasAppliedInitialZoomRef = useRef(false)
  const isInitializedRef = useRef(false)
  const marginStateRef = useRef({ top: 0.1, bottom: 0.1 })
  const priceZoomRef = useRef({ min: null, max: null })

  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [hiddenIndicators, setHiddenIndicators] = useState([])
  const [showPivotSettings, setShowPivotSettings] = useState(false)
  const [legendCollapsed, setLegendCollapsed] = useState(false)

  const updatePreference = (key) => {
    onChartPreferencesChange((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const clearFibPivotLines = () => {
    const series = candleSeriesRef.current
    if (!series) return

    fibPivotLinesRef.current.forEach((line) => {
      try {
        series.removePriceLine(line)
      } catch {
        // Ignore stale lines
      }
    })
    fibPivotLinesRef.current = []
  }

  const clearStandardPivotSegments = () => {
    const chart = priceChartRef.current
    if (!chart) return

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
    if (!priceContainerRef.current || !rsiContainerRef.current || !macdContainerRef.current) return

    const initialTheme = document.body.getAttribute('data-theme') || 'dark'
    const isDark = initialTheme === 'dark'

    const sharedLayout = {
      background: { color: isDark ? '#070c14' : '#ffffff' },
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
      },
      rightPriceScale: {
        minimumWidth: 80,
        autoScale: true,
        scaleMargins: marginStateRef.current,
        axisLineVisible: false,
        borderVisible: false,
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
      timeScale: { visible: false },
      rightPriceScale: { minimumWidth: 80 },
    })

    const macdChart = createChart(macdContainerRef.current, {
      width: macdContainerRef.current.clientWidth,
      height: 120,
      layout: sharedLayout,
      grid: sharedGrid,
      crosshair: { ...sharedCrosshair, mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { minimumWidth: 80 },
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
          background: { color: darkMode ? '#070c14' : '#ffffff' },
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
      if (!container || !priceChartRef.current || !candleSeriesRef.current || !candles.length) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const isOverPriceScale = x > rect.width - 80
      const isAltKey = e.altKey

      if (isOverPriceScale || isAltKey) {
        e.preventDefault()
        e.stopPropagation()

        const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85

        // Initialize manual price bounds from currently visible candles if not already zooming
        if (priceZoomRef.current.min === null || priceZoomRef.current.max === null) {
          const visibleRange = priceChartRef.current.timeScale().getVisibleRange()
          let minPrice = Infinity
          let maxPrice = -Infinity

          if (visibleRange) {
            candles.forEach((c) => {
              if (c.time >= visibleRange.from && c.time <= visibleRange.to) {
                if (c.low < minPrice) minPrice = c.low
                if (c.high > maxPrice) maxPrice = c.high
              }
            })
          }

          if (minPrice === Infinity || maxPrice === -Infinity) {
            const lastCandle = candles[candles.length - 1]
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

    const priceContainer = priceContainerRef.current
    if (priceContainer) {
      priceContainer.addEventListener('wheel', handlePriceWheel, { capture: true, passive: false })
      priceContainer.addEventListener('dblclick', handleDblClick, { capture: true })
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('themeChanged', handleThemeChange)

    return () => {
      if (priceContainer) {
        priceContainer.removeEventListener('wheel', handlePriceWheel, { capture: true })
        priceContainer.removeEventListener('dblclick', handleDblClick, { capture: true })
      }
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
      volumeSeriesRef.current.applyOptions({ visible: chartPreferences.showCandles })
    }
  }, [chartPreferences.showCandles])

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
    clearFibPivotLines()

    if (!chartPreferences.showPivots || !pivotData?.fibonacci?.pivots || !candleSeriesRef.current || hiddenIndicators.includes('fibonacci-pivots')) {
      return
    }

    Object.entries(fibonacciPivotConfig).forEach(([key, cfg]) => {
      const value = pivotData.fibonacci.pivots[key]
      if (value === undefined || value === null) return

      const line = candleSeriesRef.current.createPriceLine({
        price: value,
        color: cfg.color,
        lineWidth: cfg.width,
        lineStyle: cfg.style,
        axisLabelVisible: true,
        title: cfg.label,
      })

      fibPivotLinesRef.current.push(line)
    })
  }, [chartPreferences.showPivots, pivotData, hiddenIndicators])

  useEffect(() => {
    clearStandardPivotSegments()

    if (!chartPreferences.showStandardPivots || !pivotData?.standardPeriods?.items || !priceChartRef.current || hiddenIndicators.includes('standard-pivots')) {
      return
    }

    pivotData.standardPeriods.items.forEach((periodItem) => {
      Object.entries(standardPivotConfig).forEach(([level, cfg]) => {
        const value = periodItem.pivots?.[level]
        if (value === undefined || value === null) return

        const lineSeries = priceChartRef.current.addSeries(LineSeries, {
          color: cfg.color,
          lineWidth: cfg.width,
          lineStyle: cfg.style,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })

        lineSeries.setData([
          { time: periodItem.startTime, value },
          { time: periodItem.endTime, value },
        ])

        // Add text marker right on the line segment
        lineSeries.setMarkers([
          {
            time: periodItem.startTime,
            position: 'inBar',
            color: 'rgba(255, 159, 67, 0.85)',
            shape: 'circle',
            text: cfg.label,
            size: 0
          }
        ])

        standardPivotSeriesRef.current.push(lineSeries)
      })
    })
  }, [chartPreferences.showStandardPivots, pivotData, chartPreferences.pivotType, hiddenIndicators])

  useEffect(() => {
    return () => {
      clearFibPivotLines()
      clearStandardPivotSegments()
    }
  }, [])

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
      id: 'fibonacci-pivots',
      label: 'Fibonacci Pivots',
      description: 'PP, R1-R3, S1-S3',
      applied: chartPreferences.showPivots,
      href: '?tab=learning#pivot-levels',
      onToggle: () => updatePreference('showPivots'),
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
      <div className="chart-card-header">
        <div className="chart-card-title-row">
          <div className="chart-card-title">
            <span id="chart-symbol-display">{symbol}</span>
            <span className="chart-timeframe-badge" id="chart-tf-display">{interval}</span>
          </div>
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
            >
              {isMaximized ? 'Restore' : 'Maximize'}
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
                  id: 'fibonacci-pivots',
                  label: 'Fib Pivots',
                  active: chartPreferences.showPivots,
                  onRemove: () => updatePreference('showPivots')
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
