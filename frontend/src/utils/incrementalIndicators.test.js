import { describe, expect, it } from 'vitest'
import { extractClosedIndicatorState, patchLastCandleIndicators } from './incrementalIndicators.js'

function makeSeries(n, start = 100) {
  return Array.from({ length: n }, (_, i) => ({
    time: i,
    open: start + i * 0.1,
    high: start + i * 0.1 + 0.5,
    low: start + i * 0.1 - 0.5,
    close: start + i * 0.1,
    volume: 1000,
    ema20: start + i * 0.09,
    ema50: start + i * 0.08,
    rsi14: 50 + (i % 5),
    macd: 0.1 * i,
    macdSignal: 0.09 * i,
    macdHist: 0.01 * i,
  }))
}

describe('incrementalIndicators', () => {
  it('patches in-progress bar from closed snapshot without mutating closed state', () => {
    const closed = makeSeries(30)
    const snapshot = extractClosedIndicatorState(closed)
    const live = { ...closed[closed.length - 1], close: closed[closed.length - 1].close + 2, high: closed[closed.length - 1].high + 2 }
    const patched = patchLastCandleIndicators([...closed], live, snapshot)
    const last = patched[patched.length - 1]
    expect(last.close).toBe(live.close)
    expect(last.ema20).not.toBeNull()
    expect(snapshot.ema20).toBe(closed[closed.length - 1].ema20)
  })
})
