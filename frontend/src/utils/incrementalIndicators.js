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

export function patchLastCandleIndicators(prevCandles, liveCandle, isBarClosed) {
  if (!prevCandles?.length) return prevCandles
  const next = [...prevCandles]
  const lastIdx = next.length - 1
  const prev = next[lastIdx]
  const merged = { ...prev, ...liveCandle }

  if (isBarClosed) {
    return next
  }

  const prevClose = lastIdx > 0 ? next[lastIdx - 1].close : merged.open
  merged.ema20 = updateEmaLast(prev.ema20, merged.close, 20)
  merged.ema50 = updateEmaLast(prev.ema50, merged.close, 50)

  const rsiPatch = updateRsiLast(prev.rsi14, prevClose, merged.close, 14, prev._rsiState)
  merged.rsi14 = rsiPatch.rsi
  merged._rsiState = rsiPatch.state

  const macdPatch = updateMacdLast(prev.macd, prev.macdSignal, merged.close, prev._macdState)
  merged.macd = macdPatch.macd
  merged.macdSignal = macdPatch.signal
  merged.macdHist = macdPatch.hist
  merged._macdState = macdPatch.state

  next[lastIdx] = merged
  return next
}
