function round6(value) {
  return value == null ? null : Number(value.toFixed(6))
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

/** Full-series indicator enrichment for historical candles and bar closes. */
export function computeSeriesIndicators(candles) {
  const closes = candles.map((c) => c.close)
  const ema20 = calculateEMA(closes, 20)
  const ema50 = calculateEMA(closes, 50)
  const rsi14 = calculateRSI(closes, 14)
  const { macd, signalLine, hist } = calculateMACD(closes)

  return candles.map((c, i) => ({
    ...c,
    ema20: round6(ema20[i]),
    ema50: round6(ema50[i]),
    rsi14: round6(rsi14[i]),
    macd: round6(macd[i]),
    macdSignal: round6(signalLine[i]),
    macdHist: round6(hist[i]),
  }))
}

export function updateEmaLast(prevEma, newClose, period) {
  if (prevEma == null || !Number.isFinite(newClose)) return prevEma
  const k = 2 / (period + 1)
  return (newClose - prevEma) * k + prevEma
}

export function updateRsiLast(prevRsi, prevClose, newClose, period = 14, state = null) {
  if (!Number.isFinite(newClose) || !Number.isFinite(prevClose)) return { rsi: prevRsi, state }
  const change = newClose - prevClose
  const gain = Math.max(change, 0)
  const loss = Math.max(-change, 0)

  if (!state?.avgGain || !state?.avgLoss) {
    return { rsi: prevRsi, state }
  }

  const avgGain = (state.avgGain * (period - 1) + gain) / period
  const avgLoss = (state.avgLoss * (period - 1) + loss) / period
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
  const rsi = 100 - 100 / (1 + rs)
  return { rsi, state: { avgGain, avgLoss } }
}

export function updateMacdLast(prevMacd, prevSignal, newClose, state) {
  if (!state?.ema12 || !state?.ema26) {
    return { macd: prevMacd, signal: prevSignal, hist: null, state }
  }
  const ema12 = updateEmaLast(state.ema12, newClose, 12)
  const ema26 = updateEmaLast(state.ema26, newClose, 26)
  const macd = ema12 - ema26
  const signal = updateEmaLast(prevSignal ?? macd, macd, 9)
  const hist = macd - signal
  return { macd, signal, hist, state: { ...state, ema12, ema26 } }
}

function computeRsiState(closes, period = 14) {
  if (closes.length < period + 1) return null
  const gains = [0]
  const losses = [0]
  for (let i = 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1]
    gains.push(Math.max(change, 0))
    losses.push(Math.abs(Math.min(change, 0)))
  }
  let avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period
  for (let i = period + 1; i < closes.length; i += 1) {
    avgGain = ((avgGain * (period - 1)) + gains[i]) / period
    avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period
  }
  return { avgGain, avgLoss }
}

function computeMacdState(closes) {
  const ema = (values, period) => {
    if (values.length < period) return null
    const k = 2 / (period + 1)
    let seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period
    for (let i = period; i < values.length; i += 1) {
      seed = (values[i] - seed) * k + seed
    }
    return seed
  }
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  if (ema12 == null || ema26 == null) return null
  return { ema12, ema26 }
}

/** Snapshot indicator state as of the last closed bar in a fully-recalculated series. */
export function extractClosedIndicatorState(candles) {
  if (!candles?.length) return null
  const closes = candles.map((c) => c.close)
  const last = candles[candles.length - 1]
  return {
    ema20: last.ema20 ?? null,
    ema50: last.ema50 ?? null,
    rsiState: computeRsiState(closes),
    macdState: computeMacdState(closes),
    macdSignal: last.macdSignal ?? null,
    lastClose: last.close,
  }
}

export function patchLastCandleIndicators(prevCandles, liveCandle, closedState) {
  if (!prevCandles?.length || !closedState) return prevCandles
  const next = [...prevCandles]
  const lastIdx = next.length - 1
  const prev = next[lastIdx]
  const merged = { ...prev, ...liveCandle }

  const prevClose = closedState.lastClose ?? (lastIdx > 0 ? next[lastIdx - 1].close : merged.open)
  merged.ema20 = updateEmaLast(closedState.ema20, merged.close, 20)
  merged.ema50 = updateEmaLast(closedState.ema50, merged.close, 50)

  const rsiPatch = updateRsiLast(prev.rsi14, prevClose, merged.close, 14, closedState.rsiState)
  merged.rsi14 = rsiPatch.rsi

  const macdPatch = updateMacdLast(prev.macd, closedState.macdSignal, merged.close, closedState.macdState)
  merged.macd = macdPatch.macd
  merged.macdSignal = macdPatch.signal
  merged.macdHist = macdPatch.hist

  next[lastIdx] = merged
  return next
}
