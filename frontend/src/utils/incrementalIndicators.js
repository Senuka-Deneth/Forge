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
