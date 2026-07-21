import { computeSignalAgreement, derivePrimaryTrend } from '@forge/market-structure'

/**
 * Deterministic signal-agreement score for the Market Summary card.
 *
 * This replaces a hardcoded `50 + 15 + 15 + 10 + 10` formula that capped at 95 and therefore read
 * "95%" almost any time a trend and both S/R zones existed. It is deliberately NOT called
 * "confidence": it counts how many independent checks point the same way, it is not a probability
 * and it is not calibrated. The calibrated number lives on the AI analysis (`empirical_confidence`,
 * derived from scored outcomes) and is the only figure that should ever be read as a hit rate.
 *
 * Uses the same `computeSignalAgreement` the edge functions use, so the dashboard and the AI agree
 * on what "aligned" means.
 */
export function deriveSignalAgreement(analysis, pivotAnalysis = null) {
  if (!analysis) return null

  const price = analysis.latestPrice ?? null
  const primaryTrend = derivePrimaryTrend(price, analysis.ema20 ?? null, analysis.ema50 ?? null)

  const pivotSessionBias = pivotAnalysis?.bias === 'bullish' || pivotAnalysis?.bias === 'bearish'
    ? pivotAnalysis.bias
    : 'neutral'

  const score = computeSignalAgreement({
    price,
    ema20: analysis.ema20 ?? null,
    ema50: analysis.ema50 ?? null,
    rsi: analysis.rsi ?? null,
    macdLine: analysis.macd ?? null,
    signalLine: analysis.macdSignal ?? null,
    primaryTrend,
    pivotSessionBias,
    hasSupportZone: Boolean(analysis.nearestSupport),
    hasResistanceZone: Boolean(analysis.nearestResistance),
    divergence: analysis.divergence ?? 'none',
    atInflectionPoint: Boolean(pivotAnalysis?.atInflectionPoint),
  })

  return {
    score,
    primaryTrend,
    // Pivot checks contribute up to 30 of the 100 points; without pivot data loaded the score
    // cannot reach its ceiling, and the UI says so rather than silently under-reporting.
    pivotsIncluded: Boolean(pivotAnalysis),
  }
}

/** Bucketed label so the number is read as alignment, never as a win rate. */
export function signalAgreementLabel(score) {
  if (score == null) return '—'
  if (score >= 70) return 'Strongly aligned'
  if (score >= 45) return 'Partially aligned'
  if (score >= 20) return 'Weakly aligned'
  return 'Conflicting'
}
