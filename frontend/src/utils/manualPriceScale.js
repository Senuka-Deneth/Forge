const DEFAULT_MARGINS = { top: 0.1, bottom: 0.1 }
const PRICE_SCALE_WIDTH = 80

export function isOverPriceScale(container, clientX) {
  if (!container) return false
  const rect = container.getBoundingClientRect()
  return clientX - rect.left > rect.width - PRICE_SCALE_WIDTH
}

export function getVisiblePriceBounds(chart, candles, paddingRatio = 0.1) {
  if (!chart || !candles?.length) return null

  const visibleRange = chart.timeScale().getVisibleRange()
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

  const span = maxPrice - minPrice
  const padding = span > 0 ? span * paddingRatio : Math.max(maxPrice * paddingRatio, 1)
  return { min: minPrice - padding, max: maxPrice + padding }
}

export function applyManualPriceRange(chart, priceZoomRef, min, max) {
  if (!chart || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) return false

  priceZoomRef.current = { min, max }

  const priceScale = chart.priceScale('right')
  priceScale.setAutoScale(false)
  priceScale.setVisibleRange({ from: min, to: max })
  return true
}

export function clearManualPriceRange(chart, candleSeries, priceZoomRef, marginStateRef) {
  if (!chart) return

  priceZoomRef.current = { min: null, max: null }

  if (candleSeries) {
    try {
      candleSeries.applyOptions({ autoscaleInfoProvider: undefined })
    } catch {
      // Ignore stale series
    }
  }

  const margins = marginStateRef?.current ?? DEFAULT_MARGINS
  const priceScale = chart.priceScale('right')
  priceScale.setAutoScale(true)
  priceScale.applyOptions({ scaleMargins: margins })
}

export function isManualPriceRangeActive(priceZoomRef) {
  return priceZoomRef.current.min != null && priceZoomRef.current.max != null
}

export function shouldHandleVerticalWheel(e, container) {
  if (e.shiftKey || e.ctrlKey || e.metaKey) return false
  if (isOverPriceScale(container, e.clientX) || e.altKey) {
    return Math.abs(e.deltaY) >= Math.abs(e.deltaX)
  }
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2) return false
  return Math.abs(e.deltaY) > Math.abs(e.deltaX) * 1.2
}

export const DEFAULT_PRICE_SCALE_MARGINS = DEFAULT_MARGINS
