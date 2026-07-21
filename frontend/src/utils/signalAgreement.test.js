import { describe, it, expect } from 'vitest'
import { deriveSignalAgreement, signalAgreementLabel } from './signalAgreement'

/**
 * The shape buildTechnicalAnalysis returns, reduced to the fields signal agreement reads.
 * `trend` is deliberately absent — primaryTrend is re-derived from price/EMAs via the same
 * derivePrimaryTrend the edge functions use, so the two sides cannot drift.
 */
function makeAnalysis(overrides = {}) {
  return {
    latestPrice: 100,
    ema20: 98,
    ema50: 95,
    rsi: 60,
    macd: 1.2,
    macdSignal: 0.8,
    nearestSupport: { price: 90 },
    nearestResistance: { price: 110 },
    divergence: 'none',
    ...overrides,
  }
}

describe('deriveSignalAgreement', () => {
  it('returns null without an analysis', () => {
    expect(deriveSignalAgreement(null)).toBeNull()
  })

  it('scores a fully aligned bullish read without inventing a confidence', () => {
    const result = deriveSignalAgreement(makeAnalysis())
    // EMA stack 20 + RSI side 15 + MACD 15 + both zones 10 = 60. Pivot components are absent.
    expect(result.score).toBe(60)
    expect(result.primaryTrend).toBe('bullish')
    expect(result.pivotsIncluded).toBe(false)
  })

  it('adds pivot components once pivot data has loaded', () => {
    const result = deriveSignalAgreement(makeAnalysis(), {
      bias: 'bullish',
      atInflectionPoint: true,
    })
    // 60 as above + pivot session bias 15 + inflection 15 = 90.
    expect(result.score).toBe(90)
    expect(result.pivotsIncluded).toBe(true)
  })

  it('scores momentum that contradicts the trend well below an aligned read', () => {
    // Bearish EMA stack, but RSI (60) and MACD (above signal) are still bullish, so both momentum
    // checks withhold their points.
    //
    // Note the EMA component still scores: primaryTrend is *derived from* the EMA stack, so those
    // 20 points are effectively a baseline for any non-sideways read rather than an independent
    // confirmation. 30 here vs 60 for the aligned case is the meaningful comparison.
    const result = deriveSignalAgreement(makeAnalysis({ latestPrice: 90, ema20: 95, ema50: 98 }))
    expect(result.primaryTrend).toBe('bearish')
    expect(result.score).toBe(30)

    const aligned = deriveSignalAgreement(makeAnalysis())
    expect(result.score).toBeLessThan(aligned.score)
  })

  it('never reports the old hardcoded 95 ceiling for an ordinary trending read', () => {
    // The replaced formula was 50 +15 trend +15 momentum +10 support +10 resistance, capped at 95,
    // so any trend with both zones present read "95%". This fixture is exactly that case.
    const result = deriveSignalAgreement(makeAnalysis())
    expect(result.score).not.toBe(95)
    expect(result.score).toBeLessThan(95)
  })

  it('degrades safely when indicators are missing instead of assuming agreement', () => {
    const result = deriveSignalAgreement(
      makeAnalysis({ ema20: null, ema50: null, rsi: null, macd: null, macdSignal: null }),
    )
    expect(result.primaryTrend).toBe('sideways')
    expect(result.score).toBe(10) // only the both-zones-present check survives
  })

  it('treats a missing pivot bias as neutral rather than agreeing', () => {
    const withNeutral = deriveSignalAgreement(makeAnalysis(), { bias: 'neutral' })
    const withoutPivots = deriveSignalAgreement(makeAnalysis())
    expect(withNeutral.score).toBe(withoutPivots.score)
  })
})

describe('signalAgreementLabel', () => {
  it('describes alignment in words, never as a probability', () => {
    expect(signalAgreementLabel(null)).toBe('—')
    expect(signalAgreementLabel(10)).toBe('Conflicting')
    expect(signalAgreementLabel(30)).toBe('Weakly aligned')
    expect(signalAgreementLabel(60)).toBe('Partially aligned')
    expect(signalAgreementLabel(85)).toBe('Strongly aligned')
  })
})
