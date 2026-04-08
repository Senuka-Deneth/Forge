import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  CrosshairMode
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
  const [showBinancePivots, setShowBinancePivots] = useState(false)
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false)

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

  const clearPivotLines = (series) => {
    activePivotLinesRef.current.forEach(({ line }) => {
      try {
        series.removePriceLine(line)
      } catch (e) {
        /* ignore */
      }
    })
    activePivotLinesRef.current = []
  }

  const addPivotLines = (series, pivots, config) => {
    Object.entries(config).forEach(([key, cfg]) => {
      if (pivots[key] === undefined || pivots[key] === null) return

      const line = series.createPriceLine({
        price: pivots[key],
        color: cfg.color,
        lineWidth: cfg.width,
        lineStyle: cfg.style,
        axisLabelVisible: true,
        title: cfg.label,
      })

      activePivotLinesRef.current.push({ key, line })
    })
  }

  const classicPivotColor = 'rgba(160, 160, 170, 0.80)'
  const binancePivotColor = 'rgba(255, 159, 67, 0.94)'

  const classicPivotConfig = {
    PP: { color: classicPivotColor, width: 1, style: LineStyle.Solid, label: 'PP' },
    R1: { color: classicPivotColor, width: 1, style: LineStyle.Solid, label: 'R1' },
    R2: { color: classicPivotColor, width: 1, style: LineStyle.Solid, label: 'R2' },
    R3: { color: classicPivotColor, width: 1, style: LineStyle.Solid, label: 'R3' },
    S1: { color: classicPivotColor, width: 1, style: LineStyle.Solid, label: 'S1' },
    S2: { color: classicPivotColor, width: 1, style: LineStyle.Solid, label: 'S2' },
    S3: { color: classicPivotColor, width: 1, style: LineStyle.Solid, label: 'S3' },
  }

  const binancePivotConfig = {
    PP: { color: binancePivotColor, width: 2, style: LineStyle.Solid, label: 'P' },
    R1: { color: binancePivotColor, width: 1, style: LineStyle.Solid, label: 'R1' },
    R2: { color: binancePivotColor, width: 1, style: LineStyle.Solid, label: 'R2' },
    R3: { color: binancePivotColor, width: 1, style: LineStyle.Solid, label: 'R3' },
    R4: { color: binancePivotColor, width: 1, style: LineStyle.Solid, label: 'R4' },
    R5: { color: binancePivotColor, width: 1, style: LineStyle.Solid, label: 'R5' },
    S1: { color: binancePivotColor, width: 1, style: LineStyle.Solid, label: 'S1' },
    S2: { color: binancePivotColor, width: 1, style: LineStyle.Solid, label: 'S2' },
    S3: { color: binancePivotColor, width: 1, style: LineStyle.Solid, label: 'S3' },
    S4: { color: binancePivotColor, width: 1, style: LineStyle.Solid, label: 'S4' },
    S5: { color: binancePivotColor, width: 1, style: LineStyle.Solid, label: 'S5' },
  }

  const pivotDataRef = useRef(pivotData)
  const showPivotsRef = useRef(showPivots)
  const showBinancePivotsRef = useRef(showBinancePivots)

  useEffect(() => {
    pivotDataRef.current = pivotData
    showPivotsRef.current = showPivots
    showBinancePivotsRef.current = showBinancePivots
  }, [pivotData, showPivots, showBinancePivots])

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

    const sharedCrosshair = {
      vertLine: { 
        color: '#808080', 
        width: 1, 
        style: LineStyle.Dashed, 
      },
      horzLine: { 
        color: '#808080', 
        width: 1, 
        style: LineStyle.Dashed, 
        labelBackgroundColor: '#808080' 
      },
    }

    const priceChart = createChart(priceContainerRef.current, {
      width: priceContainerRef.current.clientWidth,
      height: 420,
      layout: sharedLayout,
      grid: sharedGrid,
      crosshair: { ...sharedCrosshair, mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { minimumWidth: 80 }
    })

    const rsiChart = createChart(rsiContainerRef.current, {
      width: rsiContainerRef.current.clientWidth,
      height: 120,
      layout: sharedLayout,
      grid: sharedGrid,
      crosshair: { ...sharedCrosshair, mode: CrosshairMode.Normal },
      timeScale: { visible: false },
      rightPriceScale: { minimumWidth: 80 }
    })

    const macdChart = createChart(macdContainerRef.current, {
      width: macdContainerRef.current.clientWidth,
      height: 120,
      layout: sharedLayout,
      grid: sharedGrid,
      crosshair: { ...sharedCrosshair, mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { minimumWidth: 80 }
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
      lineStyle: LineStyle.Solid
    })

    const resistanceLine = priceChart.addSeries(LineSeries, {
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: LineStyle.Solid
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

    // ── Crosshair Sync across all 3 charts ──────────────────────────────
    // We use setCrosshairPosition so both vertical AND horizontal lines sync.
    let isSyncingCrosshair = false;

    const getSyncValue = (series, param) => {
      if (!param.time) return 0;
      const d = param.seriesData.get(series);
      if (!d) return 0;
      return d.value !== undefined ? d.value : (d.close !== undefined ? d.close : 0);
    };

    const syncToTargets = (sourceParam, targets) => {
      if (isSyncingCrosshair) return;
      isSyncingCrosshair = true;
      const oob = !sourceParam.point || !sourceParam.time;
      targets.forEach(({ chart, series }) => {
        if (oob) {
          chart.clearCrosshairPosition();
        } else {
          chart.setCrosshairPosition(getSyncValue(series, sourceParam), sourceParam.time, series);
        }
      });
      isSyncingCrosshair = false;
    };

    priceChart.subscribeCrosshairMove((param) => {
      syncToTargets(param, [
        { chart: rsiChart,  series: rsiSeries  },
        { chart: macdChart, series: macdSeries }
      ]);

      // Dynamic horizontal line color when near a pivot
      if (!param.point) {
        priceChart.applyOptions({ crosshair: sharedCrosshair });
        return;
      }
      const pivotSets = []
      if (showPivotsRef.current && pivotDataRef.current?.classic?.pivots) {
        pivotSets.push(pivotDataRef.current.classic.pivots)
      }
      if (showBinancePivotsRef.current && pivotDataRef.current?.traditional?.pivots) {
        pivotSets.push(pivotDataRef.current.traditional.pivots)
      }

      if (pivotSets.length > 0) {
        let matchedColor = '#808080';
        pivotSets.forEach((pivots) => {
          Object.entries({ ...classicPivotConfig, ...binancePivotConfig }).forEach(([key, cfg]) => {
            if (pivots[key] !== undefined) {
              const pricePx = candleSeries.priceToCoordinate(pivots[key]);
              if (pricePx !== null && Math.abs(param.point.y - pricePx) <= 8) {
                matchedColor = cfg.color;
              }
            }
          })
        })
        priceChart.applyOptions({
          crosshair: {
            horzLine: { color: matchedColor, labelBackgroundColor: matchedColor, width: 1, style: LineStyle.Dashed },
            vertLine: { color: '#808080', width: 1, style: LineStyle.Dashed }
          }
        });
      } else {
        priceChart.applyOptions({ crosshair: sharedCrosshair });
      }
    });

    rsiChart.subscribeCrosshairMove((param) => {
      syncToTargets(param, [
        { chart: priceChart, series: candleSeries },
        { chart: macdChart,  series: macdSeries  }
      ]);
    });

    macdChart.subscribeCrosshairMove((param) => {
      syncToTargets(param, [
        { chart: priceChart, series: candleSeries },
        { chart: rsiChart,   series: rsiSeries   }
      ]);
    });

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
      // Only fit the price chart, then sync range to RSI + MACD so all 3 align perfectly
      priceChartRef.current.timeScale().fitContent()
      // Give the chart one tick to apply fitContent before reading the range
      setTimeout(() => {
        if (!priceChartRef.current) return
        const range = priceChartRef.current.timeScale().getVisibleLogicalRange()
        if (range) {
          if (rsiChartRef.current) rsiChartRef.current.timeScale().setVisibleLogicalRange(range)
          if (macdChartRef.current) macdChartRef.current.timeScale().setVisibleLogicalRange(range)
        }
      }, 50)
      hasFitContentRef.current = true
    }
  }, [candles, analysis])

  // Pivot lines rendering
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series) return

    // Clear existing pivot lines
    clearPivotLines(series)

    // Render new pivot lines if toggled on and data available
    if (showPivots && pivotData?.classic?.pivots) {
      addPivotLines(series, pivotData.classic.pivots, classicPivotConfig)
    }

    if (showBinancePivots && pivotData?.traditional?.pivots) {
      addPivotLines(series, pivotData.traditional.pivots, binancePivotConfig)
    }
  }, [showPivots, showBinancePivots, pivotData])

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
          <button className={`toggle-btn ${showIndicatorPanel ? 'active' : ''}`} id="indicator-panel-btn"
                  onClick={() => setShowIndicatorPanel((prev) => !prev)}>Indicators</button>
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
              <button className="indicator-modal-close" onClick={() => setShowIndicatorPanel(false)} aria-label="Close indicators">×</button>
            </div>

            <div className="indicator-list">
              {[
                {
                  id: 'ema20',
                  label: 'EMA 20',
                  description: 'Short-term trend filter',
                  applied: showEma20,
                  href: '?tab=learning#ema',
                  onToggle: () => setShowEma20((prev) => !prev),
                },
                {
                  id: 'ema50',
                  label: 'EMA 50',
                  description: 'Medium-term trend filter',
                  applied: showEma50,
                  href: '?tab=learning#ema',
                  onToggle: () => setShowEma50((prev) => !prev),
                },
                {
                  id: 'rsi',
                  label: 'RSI 14',
                  description: 'Momentum / overbought-oversold',
                  applied: showRsi,
                  href: '?tab=learning#rsi',
                  onToggle: () => setShowRsi((prev) => !prev),
                },
                {
                  id: 'macd',
                  label: 'MACD',
                  description: 'Trend momentum confirmation',
                  applied: showMacd,
                  href: '?tab=learning#macd',
                  onToggle: () => setShowMacd((prev) => !prev),
                },
                {
                  id: 'support',
                  label: 'Support line',
                  description: 'Nearest swing floor',
                  applied: showSupport,
                  href: '?tab=learning#pivot-levels',
                  onToggle: () => setShowSupport((prev) => !prev),
                },
                {
                  id: 'resistance',
                  label: 'Resistance line',
                  description: 'Nearest swing ceiling',
                  applied: showResistance,
                  href: '?tab=learning#pivot-levels',
                  onToggle: () => setShowResistance((prev) => !prev),
                },
                {
                  id: 'classic-pivots',
                  label: 'Classic pivots',
                  description: 'PP, R1-R3, S1-S3',
                  applied: showPivots,
                  href: '?tab=learning#pivot-levels',
                  onToggle: onTogglePivots,
                },
                {
                  id: 'binance-pivots',
                  label: 'Binance pivots',
                  description: 'Traditional auto pivots',
                  applied: showBinancePivots,
                  href: '?tab=learning#binance-pivots',
                  onToggle: () => setShowBinancePivots((prev) => !prev),
                },
              ].map((item) => (
                <div key={item.id} className={`indicator-row ${item.applied ? 'applied' : ''}`}>
                  <button type="button" className="indicator-row-main" onClick={item.onToggle}>
                    <span className="indicator-row-label-wrap">
                      <span className="indicator-row-label">{item.label}</span>
                      <span className="indicator-row-description">{item.description}</span>
                    </span>
                    <span className={`indicator-status ${item.applied ? 'on' : 'off'}`}>{item.applied ? 'Applied' : 'Hidden'}</span>
                  </button>
                  <a className="indicator-help" href={item.href} aria-label={`Open education for ${item.label}`} title={`Open education for ${item.label}`}>?</a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div id="chart-container" className="chart-container" ref={priceContainerRef}></div>
      <div id="rsi-container" className="subchart-container" ref={rsiContainerRef} style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 5, left: 10, color: '#8b8b9e', zIndex: 10, fontSize: '12px', fontWeight: 'bold', pointerEvents: 'none' }}>RSI</div>
      </div>
      <div id="macd-container" className="subchart-container" ref={macdContainerRef} style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 5, left: 10, color: '#8b8b9e', zIndex: 10, fontSize: '12px', fontWeight: 'bold', pointerEvents: 'none' }}>MACD</div>
      </div>
    </div>
  )
}