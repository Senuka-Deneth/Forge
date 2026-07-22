import React, { useEffect, useMemo, useState } from 'react'
import { simulateRiskOfRuin, solveMaxRiskPct } from '@forge/risk-of-ruin'
import { supabase } from '../supabaseClient'
import { DEFAULT_RISK_PROFILE, fetchRiskProfile } from '../utils/riskProfile'

/**
 * Risk lab — survival analysis over the trader's own realized R distribution.
 *
 * Expectancy says whether the strategy makes money over infinite trades. This panel says whether
 * the account survives the next two hundred. Those come apart badly at large position sizes: a
 * genuinely +EV strategy at 5% per trade ruins a meaningful share of the people running it.
 *
 * The simulation is seeded, so the numbers are stable across re-renders. A probability that
 * flickered on every refresh would train the user to ignore it.
 */

const SIM_SEED = 20260722
const HORIZON_TRADES = 200

function pct(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return '—'
  return `${(Number(value) * 100).toFixed(digits)}%`
}

function num(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

export default function RiskLabPanel() {
  const [rSamples, setRSamples] = useState([])
  const [profile, setProfile] = useState(DEFAULT_RISK_PROFILE)
  const [riskPct, setRiskPct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [loadedProfile, journal] = await Promise.all([
          fetchRiskProfile(),
          supabase
            .from('trade_journal')
            .select('r_multiple, status')
            .eq('status', 'closed')
            .not('r_multiple', 'is', null)
            .order('closed_at', { ascending: false })
            .limit(500),
        ])
        if (cancelled) return
        if (journal.error) throw new Error(journal.error.message)

        setProfile(loadedProfile)
        setRiskPct((current) => current ?? loadedProfile.risk_per_trade_pct)
        setRSamples((journal.data ?? []).map((row) => Number(row.r_multiple)).filter(Number.isFinite))
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const activeRisk = riskPct ?? profile.risk_per_trade_pct

  const simulation = useMemo(() => {
    if (!rSamples.length) return null
    return simulateRiskOfRuin({
      rSamples,
      riskPct: activeRisk,
      trades: HORIZON_TRADES,
      simulations: 2000,
      seed: SIM_SEED,
    })
  }, [rSamples, activeRisk])

  const solved = useMemo(() => {
    if (!rSamples.length) return null
    return solveMaxRiskPct(
      { rSamples, trades: HORIZON_TRADES, simulations: 1000, seed: SIM_SEED },
      { tolerance: profile.ruin_tolerance_pct / 100 },
    )
  }, [rSamples, profile.ruin_tolerance_pct])

  const overSized = solved && solved.risk_pct > 0 && activeRisk > solved.risk_pct

  return (
    <div className="module" id="risk-lab">
      <div className="module__header">
        <span className="module__title">Risk lab</span>
        <span className="text-sm-muted">{rSamples.length} scored trades</span>
      </div>

      <div className="module__body stack-4">
        {loading && <p className="ai-signal-note">Loading trade history…</p>}
        {error && <p className="bear">{error}</p>}

        {!loading && !error && !simulation && (
          <p className="ai-signal-note">
            Needs at least 20 closed trades with an R-multiple before the distribution is worth
            resampling. Until then, sizing has no history to be tested against.
          </p>
        )}

        {simulation && (
          <>
            <label className="sizer-field">
              <span>Risk per trade: {num(activeRisk, 2)}%</span>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={activeRisk}
                onChange={(e) => setRiskPct(Number(e.target.value))}
              />
            </label>

            <div className="stack-2">
              <div className="row-between">
                <span title={`Share of ${simulation.simulations} simulated ${HORIZON_TRADES}-trade paths that lost half the account`}>
                  Probability of ruin
                </span>
                <span className={simulation.p_ruin > 0.05 ? 'bear' : 'bull'}>
                  {pct(simulation.p_ruin)}
                </span>
              </div>
              <div className="row-between">
                <span>Paths ending profitable</span>
                <span>{pct(simulation.p_profitable)}</span>
              </div>
              <div className="row-between">
                <span title="Worst peak-to-trough drawdown in the median path">
                  Median max drawdown
                </span>
                <span>{num(simulation.median_max_drawdown_pct)}%</span>
              </div>
              <div className="row-between">
                <span title="1 path in 20 is worse than this">95th percentile drawdown</span>
                <span className="bear">{num(simulation.p95_max_drawdown_pct)}%</span>
              </div>
              <div className="row-between">
                <span title="Longest run of consecutive losses in the median path">
                  Losing streak to expect
                </span>
                <span>{simulation.median_longest_losing_streak} trades</span>
              </div>
              <div className="row-between">
                <span>Final equity (5th / 50th / 95th)</span>
                <span>
                  {num(simulation.p05_final_multiple, 2)}× / {num(simulation.median_final_multiple, 2)}× /{' '}
                  {num(simulation.p95_final_multiple, 2)}×
                </span>
              </div>
              <div className="row-between">
                <span>Sampled expectancy</span>
                <span className={simulation.sample_expectancy_r > 0 ? 'bull' : 'bear'}>
                  {simulation.sample_expectancy_r > 0 ? '+' : ''}
                  {num(simulation.sample_expectancy_r, 2)}R
                </span>
              </div>
            </div>

            <p className="ai-signal-note">{simulation.summary}</p>

            {solved && (
              <div className="panel-section">
                <div className="panel-section__title">Maximum supportable size</div>
                {solved.risk_pct > 0 ? (
                  <>
                    <div className="row-between">
                      <span title={`Largest size keeping ruin under ${profile.ruin_tolerance_pct}%`}>
                        Ceiling
                      </span>
                      <span className={overSized ? 'bear' : 'bull'}>{num(solved.risk_pct, 2)}%</span>
                    </div>
                    <p className="ai-signal-note">
                      {overSized
                        ? `You are sizing at ${num(activeRisk, 2)}%, above the ${num(solved.risk_pct, 2)}% your own R distribution supports at a ${profile.ruin_tolerance_pct}% ruin tolerance.`
                        : `Your history supports up to ${num(solved.risk_pct, 2)}% per trade at a ${profile.ruin_tolerance_pct}% ruin tolerance.`}
                    </p>
                  </>
                ) : (
                  <p className="bear">
                    This distribution has negative expectancy — no position size is safe, because the
                    ruin probability only falls by trading smaller, never by trading better. Fix the
                    edge before sizing it.
                  </p>
                )}
              </div>
            )}

            <p className="ai-signal-note">
              Resampled from your own {simulation.sample_size} realized R outcomes, so the left tail is
              the one you actually traded rather than an idealized −1R. Past outcomes are not a
              guarantee of the next two hundred.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
