import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries
} from 'lightweight-charts'

export default function ChartPanel({ candles, loading, error, analysis }) {
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

  useEffect(() => {
    if (!priceContainerRef.current || !rsiContainerRef.current || !macdContainerRef.current) return

    const sharedLayout = {
      background: { color: '#0f172a' },
      textColor: '#cbd5e1',
      fontFamily: 'Inter, Arial, sans-serif'
    }

    const sharedGrid = {
      vertLines: { color: '#1e293b' },
      horzLines: { color: '#1e293b' }
    }

    const priceChart = createChart(priceContainerRef.current, {
      width: priceContainerRef.current.clientWidth,
      height: priceContainerRef.current.clientHeight || 500,
      layout: sharedLayout,
      grid: sharedGrid,
      rightPriceScale: { borderColor: '#334155' },
      timeScale: { borderColor: '#334155', timeVisible: true, secondsVisible: false }
    })

    const rsiChart = createChart(rsiContainerRef.current, {
      width: rsiContainerRef.current.clientWidth,
      height: rsiContainerRef.current.clientHeight || 150,
      layout: sharedLayout,
      grid: sharedGrid,
      rightPriceScale: { borderColor: '#334155' },
      timeScale: { borderColor: '#334155', visible: false }
    })

    const macdChart = createChart(macdContainerRef.current, {
      width: macdContainerRef.current.clientWidth,
      height: macdContainerRef.current.clientHeight || 180,
      layout: sharedLayout,
      grid: sharedGrid,
      rightPriceScale: { borderColor: '#334155' },
      timeScale: { borderColor: '#334155', timeVisible: true, secondsVisible: false }
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

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
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

    const candleData = candles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }))

    const volumeData = candles.map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)'
    }))

    const ema20Data = candles
      .filter((c) => c.ema20 != null)
      .map((c) => ({ time: c.time, value: c.ema20 }))

    const ema50Data = candles
      .filter((c) => c.ema50 != null)
      .map((c) => ({ time: c.time, value: c.ema50 }))

    const rsiData = candles
      .filter((c) => c.rsi14 != null)
      .map((c) => ({ time: c.time, value: c.rsi14 }))

    const macdData = candles
      .filter((c) => c.macd != null)
      .map((c) => ({ time: c.time, value: c.macd }))

    const macdSignalData = candles
      .filter((c) => c.macdSignal != null)
      .map((c) => ({ time: c.time, value: c.macdSignal }))

    const macdHistData = candles
      .filter((c) => c.macdHist != null)
      .map((c) => ({
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

    priceChartRef.current.timeScale().fitContent()
    macdChartRef.current.timeScale().fitContent()
  }, [candles, analysis])

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h2>Market Chart</h2>
          <p>Price, Volume, EMA 20, EMA 50, RSI 14, MACD, Support, Resistance</p>
        </div>

        <div className="chart-legend">
          <span className="legend-item green">Candles</span>
          <span className="legend-item blue">EMA 20</span>
          <span className="legend-item gold">EMA 50</span>
          <span className="legend-item purple">RSI</span>
          <span className="legend-item volume">MACD</span>
          <span className="legend-item support">Support</span>
          <span className="legend-item resistance">Resistance</span>
        </div>
      </div>

      <div className="chart-stack">
        <div className="price-chart-wrap">
          {loading && <div className="overlay-message">Loading candles...</div>}
          {error && !loading && <div className="overlay-message error-message">{error}</div>}
          <div ref={priceContainerRef} className="price-chart-container" />
        </div>

        <div className="indicator-block">
          <div className="indicator-title">RSI 14</div>
          <div ref={rsiContainerRef} className="indicator-chart indicator-rsi" />
        </div>

        <div className="indicator-block">
          <div className="indicator-title">MACD (12, 26, 9)</div>
          <div ref={macdContainerRef} className="indicator-chart indicator-macd" />
        </div>
      </div>
    </div>
  )
}