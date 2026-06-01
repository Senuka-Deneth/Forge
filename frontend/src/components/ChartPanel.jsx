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

function subtractSixMonths(unixTime) {
  const date = new Date(unixTime * 1000)
  date.setUTCMonth(date.getUTCMonth() - 6)
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

  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

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
    if (!priceContainerRef.current || !rsiContainerRef.current || !macdContainerRef.current) return

    const initialTheme = document.body.getAttribute('data-theme') || 'dark'
    const isDark = initialTheme === 'dark'

    const sharedLayout = {
      background: { color: isDark ? '#0d0d16' : '#ffffff' },
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
        mouseWheel: true,
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
          background: { color: darkMode ? '#0d0d16' : '#ffffff' },
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
      if (!container || !priceChartRef.current) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const isOverPriceScale = x > rect.width - 80
      const isAltKey = e.altKey

      if (isOverPriceScale || isAltKey) {
        e.preventDefault()
        e.stopPropagation()

        const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85
        const currentMargins = marginStateRef.current

        // Calculate new margins, preserving vertical center if possible or just scaling both
        const newMargins = {
          top: Math.max(0.01, Math.min(0.8, currentMargins.top * zoomFactor)),
          bottom: Math.max(0.01, Math.min(0.8, currentMargins.bottom * zoomFactor)),
        }

        marginStateRef.current = newMargins
        priceChartRef.current.priceScale('right').applyOptions({
          autoScale: true, // Keep autoScale to use margins or we can toggle based on preference
          scaleMargins: newMargins,
        })
      }
    }

    const handleDblClick = (e) => {
      const container = priceContainerRef.current
      if (!container || !priceChartRef.current) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const isOverPriceScale = x > rect.width - 80

      if (isOverPriceScale) {
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
      priceContainer.addEventListener('wheel', handlePriceWheel, { passive: false })
      priceContainer.addEventListener('dblclick', handleDblClick)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('themeChanged', handleThemeChange)

    return () => {
      if (priceContainer) {
        priceContainer.removeEventListener('wheel', handlePriceWheel)
        priceContainer.removeEventListener('dblclick', handleDblClick)
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
      const from = Math.max(earliestTime, subtractSixMonths(latestTime))
      priceChartRef.current.timeScale().setVisibleRange({ from, to: latestTime })
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
    if (ema20SeriesRef.current) ema20SeriesRef.current.applyOptions({ visible: chartPreferences.showEma20 })
  }, [chartPreferences.showEma20])

  useEffect(() => {
    if (ema50SeriesRef.current) ema50SeriesRef.current.applyOptions({ visible: chartPreferences.showEma50 })
  }, [chartPreferences.showEma50])

  useEffect(() => {
    if (rsiContainerRef.current) {
      rsiContainerRef.current.style.display = chartPreferences.showRsi ? 'block' : 'none'
      window.dispatchEvent(new Event('resize'))
    }
  }, [chartPreferences.showRsi])

  useEffect(() => {
    if (macdContainerRef.current) {
      macdContainerRef.current.style.display = chartPreferences.showMacd ? 'block' : 'none'
      window.dispatchEvent(new Event('resize'))
    }
  }, [chartPreferences.showMacd])

  useEffect(() => {
    if (supportLineRef.current) supportLineRef.current.applyOptions({ visible: chartPreferences.showSupport })
  }, [chartPreferences.showSupport])

  useEffect(() => {
    if (resistanceLineRef.current) resistanceLineRef.current.applyOptions({ visible: chartPreferences.showResistance })
  }, [chartPreferences.showResistance])

  useEffect(() => {
    clearFibPivotLines()

    if (!chartPreferences.showPivots || !pivotData?.fibonacci?.pivots || !candleSeriesRef.current) {
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
  }, [chartPreferences.showPivots, pivotData])

  useEffect(() => {
    clearStandardPivotSegments()

    if (!chartPreferences.showStandardPivots || !pivotData?.standardPeriods?.items || !priceChartRef.current) {
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

        standardPivotSeriesRef.current.push(lineSeries)
      })
    })
  }, [chartPreferences.showStandardPivots, pivotData, chartPreferences.pivotType])

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

      <div className="chart-container-shell">
        {chartPreferences.showStandardPivots && pivotData && (
          <div className="chart-legend-overlay" style={{
            position: 'absolute',
            top: '12px',
            left: '16px',
            zIndex: 10,
            fontSize: '11px',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            color: '#8b8b9e',
            background: 'rgba(13, 13, 22, 0.65)',
            padding: '4px 8px',
            borderRadius: '4px',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 500,
          }}>
            <span>Pivots {getPivotTypeName(chartPreferences.pivotType)} Auto 15</span>
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
