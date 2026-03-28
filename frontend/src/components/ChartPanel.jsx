import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle
} from 'lightweight-charts'

export default function ChartPanel({ symbol, interval, candles, loading, error, analysis, pivotData, showPivots, onTogglePivots }) {
  const priceContainerRef = useRef(null)
  const rsiContainerRef = useRef(null)
  const macdContainerRef = useRef(null)

  const priceChartRef = useRef(null)
  const rsiChartRef = useRef(null)
  const macdChartRef = useRef(null)

  const [showCandles, setShowCandles] = useState(true)
  const [showEma20, setShowEma20] = useState(true)
  const [showEma50, setShowEma50] = useState(true)
  const [showRsi, setShowRsi] = useState(true)
  const [showMacd, setShowMacd] = useState(true)
  const [showSupport, setShowSupport] = useState(true)
  const [showResistance, setShowResistance] = useState(true)

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
  const hasFitContentRef = useRef(false)
  const isInitializedRef = useRef(false)

  // Pivot lines ref
  const activePivotLinesRef = useRef([])

  // Pivot level config
  const pivotConfig = {
    PP:  { color: '#ffffff', width: 2, style: LineStyle.Solid,       label: 'PP'  },
    R1:  { color: '#ef5350', width: 1, style: LineStyle.Dotted,      label: 'R1'  },
    R2:  { color: '#e53935', width: 1, style: LineStyle.Dotted,      label: 'R2'  },
    R3:  { color: '#b71c1c', width: 1, style: LineStyle.Dashed,      label: 'R3'  },
    S1:  { color: '#26a69a', width: 1, style: LineStyle.Dotted,      label: 'S1'  },
    S2:  { color: '#00897b', width: 1, style: LineStyle.Dotted,      label: 'S2'  },
    S3:  { color: '#004d40', width: 1, style: LineStyle.Dashed,      label: 'S3'  },
  }

  useEffect(() => {
    if (loading) {
      hasFitContentRef.current = false
      isInitializedRef.current = false
    }
  }, [loading])

  useEffect(() => {
    if (!priceContainerRef.current || !rsiContainerRef.current || !macdContainerRef.current) return

    const initialTheme = document.body.getAttribute('data-theme') || 'dark'
    const isDark = initialTheme === 'dark'

    const sharedLayout = {
      background: { color: isDark ? '#0d0d16' : '#ffffff' },
      textColor: isDark ? '#8b8b9e' : '#6b6b7e',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    }

    const sharedGrid = {
      vertLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' },
      horzLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' }
    }

    const priceChart = createChart(priceContainerRef.current, {
      width: priceContainerRef.current.clientWidth,
      height: 420,
      layout: sharedLayout,
      grid: sharedGrid,
      crosshair: {
        vertLine: { color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)' },
        horzLine: { color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)' },
      },
      timeScale: { timeVisible: true, secondsVisible: false }
    })

    const rsiChart = createChart(rsiContainerRef.current, {
      width: rsiContainerRef.current.clientWidth,
      height: 120,
      layout: sharedLayout,
      grid: sharedGrid,
      crosshair: {
        vertLine: { color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)' },
        horzLine: { color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)' },
      },
      timeScale: { visible: false }
    })

    const macdChart = createChart(macdContainerRef.current, {
      width: macdContainerRef.current.clientWidth,
      height: 120,
      layout: sharedLayout,
      grid: sharedGrid,
      crosshair: {
        vertLine: { color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)' },
        horzLine: { color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)' },
      },
      timeScale: { timeVisible: true, secondsVisible: false }
    })

    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444'
    })

    const volumeSeries = priceChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: ''
    })

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0
      }
    })

    const ema20Series = priceChart.addSeries(LineSeries, {
      color: '#60a5fa',
      lineWidth: 2
    })

    const ema50Series = priceChart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2
    })

    const supportLine = priceChart.addSeries(LineSeries, {
      color: '#22c55e',
      lineWidth: 1,
      lineStyle: 2
    })

    const resistanceLine = priceChart.addSeries(LineSeries, {
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: 2
    })

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: '#a78bfa',
      lineWidth: 2
    })

    const macdSeries = macdChart.addSeries(LineSeries, {
      color: '#60a5fa',
      lineWidth: 2
    })

    const macdSignalSeries = macdChart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2
    })

    const macdHistSeries = macdChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'price', precision: 4, minMove: 0.0001 }
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

    // Guard flag to prevent circular re-entrancy between charts
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
          height: priceContainerRef.current.clientHeight
        })
      }

      if (rsiChartRef.current && rsiContainerRef.current) {
        rsiChartRef.current.applyOptions({
          width: rsiContainerRef.current.clientWidth,
          height: rsiContainerRef.current.clientHeight
        })
      }

      if (macdChartRef.current && macdContainerRef.current) {
        macdChartRef.current.applyOptions({
          width: macdContainerRef.current.clientWidth,
          height: macdContainerRef.current.clientHeight
        })
      }
    }

    const handleThemeChange = (e) => {
      const theme = e.detail.theme
      const isDark = theme === 'dark'
      const chartOptions = {
        layout: {
          background: { color: isDark ? '#0d0d16' : '#ffffff' },
          textColor: isDark ? '#8b8b9e' : '#6b6b7e',
        },
        grid: {
          vertLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' },
          horzLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' },
        },
        crosshair: {
          vertLine: { color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)' },
          horzLine: { color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)' },
        }
      }

      if (priceChartRef.current) priceChartRef.current.applyOptions(chartOptions)
      if (rsiChartRef.current) rsiChartRef.current.applyOptions(chartOptions)
      if (macdChartRef.current) macdChartRef.current.applyOptions(chartOptions)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('themeChanged', handleThemeChange)

    return () => {
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
      const candleData = candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
      const volumeData = candles.map((c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)' }))
      const ema20Data = candles.filter((c) => c.ema20 != null).map((c) => ({ time: c.time, value: c.ema20 }))
      const ema50Data = candles.filter((c) => c.ema50 != null).map((c) => ({ time: c.time, value: c.ema50 }))
      const rsiData = candles.filter((c) => c.rsi14 != null).map((c) => ({ time: c.time, value: c.rsi14 }))
      const macdData = candles.filter((c) => c.macd != null).map((c) => ({ time: c.time, value: c.macd }))
      const macdSignalData = candles.filter((c) => c.macdSignal != null).map((c) => ({ time: c.time, value: c.macdSignal }))
      const macdHistData = candles.filter((c) => c.macdHist != null).map((c) => ({
        time: c.time,
        value: c.macdHist,
        color: c.macdHist >= 0 ? 'rgba(34, 197, 94, 0.55)' : 'rgba(239, 68, 68, 0.55)'
      }))

      candleSeriesRef.current.setData(candleData)
      volumeSeriesRef.current.setData(volumeData)
      ema20SeriesRef.current.setData(ema20Data)
      ema50SeriesRef.current.setData(ema50Data)
      rsiSeriesRef.current.setData(rsiData)
      macdSeriesRef.current.setData(macdData)
      macdSignalSeriesRef.current.setData(macdSignalData)
      macdHistSeriesRef.current.setData(macdHistData)
      
      isInitializedRef.current = true;
    } else {
      const c = candles[candles.length - 1];
      candleSeriesRef.current.update({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
      volumeSeriesRef.current.update({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)' });
      if (c.ema20 != null) ema20SeriesRef.current.update({ time: c.time, value: c.ema20 });
      if (c.ema50 != null) ema50SeriesRef.current.update({ time: c.time, value: c.ema50 });
      if (c.rsi14 != null) rsiSeriesRef.current.update({ time: c.time, value: c.rsi14 });
      if (c.macd != null) macdSeriesRef.current.update({ time: c.time, value: c.macd });
      if (c.macdSignal != null) macdSignalSeriesRef.current.update({ time: c.time, value: c.macdSignal });
      if (c.macdHist != null) macdHistSeriesRef.current.update({ time: c.time, value: c.macdHist, color: c.macdHist >= 0 ? 'rgba(34, 197, 94, 0.55)' : 'rgba(239, 68, 68, 0.55)' });
    }

    if (analysis?.nearestSupport) {
      const supportData = [
        { time: candles[0].time, value: analysis.nearestSupport.price },
        { time: candles[candles.length - 1].time, value: analysis.nearestSupport.price }
      ]
      supportLineRef.current.setData(supportData)
    } else {
      supportLineRef.current.setData([])
    }

    if (analysis?.nearestResistance) {
      const resistanceData = [
        { time: candles[0].time, value: analysis.nearestResistance.price },
        { time: candles[candles.length - 1].time, value: analysis.nearestResistance.price }
      ]
      resistanceLineRef.current.setData(resistanceData)
    } else {
      resistanceLineRef.current.setData([])
    }

    if (!hasFitContentRef.current) {
      priceChartRef.current.timeScale().fitContent()
      macdChartRef.current.timeScale().fitContent()
      hasFitContentRef.current = true
    }
  }, [candles, analysis])

  // Pivot lines rendering
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series) return

    // Clear existing pivot lines
    activePivotLinesRef.current.forEach(({ line }) => {
      try { series.removePriceLine(line) } catch (e) { /* ignore */ }
    })
    activePivotLinesRef.current = []

    // Render new pivot lines if toggled on and data available
    if (showPivots && pivotData?.classic?.pivots) {
      const pivots = pivotData.classic.pivots

      Object.entries(pivotConfig).forEach(([key, cfg]) => {
        if (pivots[key] === undefined) return

        const line = series.createPriceLine({
          price: pivots[key],
          color: cfg.color,
          lineWidth: cfg.width,
          lineStyle: cfg.style,
          axisLabelVisible: true,
          title: `${cfg.label} ${pivots[key]}`,
        })

        activePivotLinesRef.current.push({ key, line })
      })
    }
  }, [showPivots, pivotData])

  useEffect(() => {
    if (candleSeriesRef.current) candleSeriesRef.current.applyOptions({ visible: showCandles })
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: showCandles })
  }, [showCandles])

  useEffect(() => {
    if (ema20SeriesRef.current) ema20SeriesRef.current.applyOptions({ visible: showEma20 })
  }, [showEma20])

  useEffect(() => {
    if (ema50SeriesRef.current) ema50SeriesRef.current.applyOptions({ visible: showEma50 })
  }, [showEma50])

  useEffect(() => {
    if (rsiContainerRef.current) {
      rsiContainerRef.current.style.display = showRsi ? 'block' : 'none'
    }
  }, [showRsi])

  useEffect(() => {
    if (macdContainerRef.current) {
      macdContainerRef.current.style.display = showMacd ? 'block' : 'none'
    }
  }, [showMacd])

  useEffect(() => {
    if (supportLineRef.current) supportLineRef.current.applyOptions({ visible: showSupport })
  }, [showSupport])

  useEffect(() => {
    if (resistanceLineRef.current) resistanceLineRef.current.applyOptions({ visible: showResistance })
  }, [showResistance])

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div className="chart-card-title">
          <span id="chart-symbol-display">{symbol}</span>
          <span className="chart-timeframe-badge" id="chart-tf-display">{interval}</span>
        </div>
        <div className="chart-toggles">
          <button className={`toggle-btn ${showCandles ? 'active' : ''}`} id="toggle-candles"
                  onClick={() => setShowCandles(!showCandles)}>Candles</button>
          <button className={`toggle-btn ${showEma20 ? 'active' : ''}`} id="toggle-ema20"
                  onClick={() => setShowEma20(!showEma20)}>EMA 20</button>
          <button className={`toggle-btn ${showEma50 ? 'active' : ''}`} id="toggle-ema50"
                  onClick={() => setShowEma50(!showEma50)}>EMA 50</button>
          <button className={`toggle-btn ${showRsi ? 'active' : ''}`} id="toggle-rsi"
                  onClick={() => setShowRsi(!showRsi)}>RSI</button>
          <button className={`toggle-btn ${showMacd ? 'active' : ''}`} id="toggle-macd"
                  onClick={() => setShowMacd(!showMacd)}>MACD</button>
          <button className={`toggle-btn ${showSupport ? 'active' : ''}`} id="toggle-support"
                  onClick={() => setShowSupport(!showSupport)}>Support</button>
          <button className={`toggle-btn ${showResistance ? 'active' : ''}`} id="toggle-resistance"
                  onClick={() => setShowResistance(!showResistance)}>Resistance</button>
          <button className={`toggle-btn ${showPivots ? 'active' : ''}`} id="pivot-toggle-btn"
                  onClick={onTogglePivots}>Pivots</button>
        </div>
      </div>

      <div id="chart-container" className="chart-container" ref={priceContainerRef}></div>
      <div id="rsi-container" className="subchart-container" ref={rsiContainerRef}></div>
      <div id="macd-container" className="subchart-container" ref={macdContainerRef}></div>
    </div>
  )
}