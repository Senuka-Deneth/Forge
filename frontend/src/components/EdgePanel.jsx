import React, { useEffect, useMemo, useState } from 'react'
import { analyzeTradeEfficiency } from '@forge/trade-efficiency'
import { supabase } from '../supabaseClient'
import {
  computeJournalStats,
  formatJournalPct,
  formatJournalR,
} from '../utils/journal'

/**
 * Personal-edge analytics from the trade journal.
 *
 * The journal already records outcomes; this panel answers "where does *my* money go?" —
 * win rate by adherence, average R when you deviate, and MAE/MFE when present.
 */

function groupBy(entries, keyFn) {
  const groups = {}
  for (const entry of entries) {
    const key = keyFn(entry) || 'unknown'
    if (!groups[key]) groups[key] = []
    groups[key].push(entry)
  }
  return groups
}

function avg(values) {
  const nums = values.filter((v) => v != null && Number.isFinite(Number(v))).map(Number)
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export default function EdgePanel() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      const { data, error: qError } = await supabase
        .from('trade_journal')
        // entry and stop are required to express MAE/MFE in R — see the excursion section below.
        .select('id, symbol, side, status, entry, stop, pnl, r_multiple, plan_adherence, behavioral_tags, mae, mfe, closed_at, analysis_id')
        .order('opened_at', { ascending: false })
        .limit(500)
      if (cancelled) return
      if (qError) {
        setError(qError.message)
        setEntries([])
      } else {
        setEntries(data ?? [])
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Memoized so it keeps a stable identity across renders — the efficiency report below depends
  // on it, and an array rebuilt every render would defeat that memo entirely.
  const closed = useMemo(
    () => entries.filter((e) => e.status === 'closed' && e.pnl != null),
    [entries],
  )
  const stats = computeJournalStats(entries)

  const byAdherence = groupBy(closed, (e) => e.plan_adherence || 'untracked')
  const adherenceRows = Object.entries(byAdherence).map(([key, rows]) => {
    const rs = rows.map((r) => r.r_multiple)
    const wins = rows.filter((r) => r.pnl > 0).length
    return {
      key,
      n: rows.length,
      winRate: rows.length ? wins / rows.length : null,
      avgR: avg(rs),
    }
  }).sort((a, b) => b.n - a.n)

  const followed = byAdherence.followed ?? []
  const deviated = closed.filter((e) => e.plan_adherence && e.plan_adherence !== 'followed')
  const followedAvgR = avg(followed.map((e) => e.r_multiple))
  const deviatedAvgR = avg(deviated.map((e) => e.r_multiple))

  // MAE/MFE are stored in absolute price units, so averaging them raw pools a $60,000 BTC trade
  // with a $0.30 alt and produces a number governed entirely by which symbol has the bigger
  // nominal price. analyzeTradeEfficiency normalizes each trade by its own |entry - stop| first.
  const efficiency = useMemo(
    () => analyzeTradeEfficiency(closed.map((entry) => ({
      mae: entry.mae,
      mfe: entry.mfe,
      entry: entry.entry,
      stop: entry.stop,
      realized_r: entry.r_multiple,
      outcome: entry.pnl > 0 ? 'target_hit' : 'stop_hit',
    }))),
    [closed],
  )

  const tagCounts = {}
  for (const entry of closed) {
    for (const tag of entry.behavioral_tags ?? []) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
    }
  }
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <div className="module" id="edge-panel">
      <div className="module__header">
        <span className="module__title">Your Edge</span>
      </div>

      <div className="module__body stack-4">
        {loading && <p className="ai-signal-note">Loading journal…</p>}
        {error && <p className="bear">{error}</p>}

        {!loading && !error && closed.length === 0 && (
          <p className="ai-signal-note">
            No closed trades yet. Once the journal has outcomes (with optional adherence and MAE/MFE),
            this panel shows where your edge actually is.
          </p>
        )}

        {!loading && closed.length > 0 && (
          <>
            <div className="stack-2">
              <div className="row-between">
                <span>Closed trades</span>
                <span>{stats.totalTrades}</span>
              </div>
              <div className="row-between">
                <span>Win rate</span>
                <span>{formatJournalPct(stats.winRate)}</span>
              </div>
              <div className="row-between">
                <span>Avg R</span>
                <span>{formatJournalR(stats.avgR)}</span>
              </div>
              <div className="row-between">
                <span>Expectancy ($)</span>
                <span>{stats.expectancy != null ? `$${stats.expectancy.toFixed(2)}` : '—'}</span>
              </div>
            </div>

            <div className="panel-section">
              <div className="panel-section__title">Plan adherence</div>
              {adherenceRows.length === 0 && (
                <p className="ai-signal-note">No adherence tags recorded yet.</p>
              )}
              <div className="stack-2">
                {adherenceRows.map((row) => (
                  <div key={row.key} className="row-between">
                    <span>{row.key.replace(/_/g, ' ')} (n={row.n})</span>
                    <span>
                      {formatJournalPct(row.winRate)} · {formatJournalR(row.avgR)}
                    </span>
                  </div>
                ))}
              </div>
              {followed.length > 0 && deviated.length > 0 && (
                <p className="ai-signal-note">
                  Followed plans average {formatJournalR(followedAvgR)}; deviations average{' '}
                  {formatJournalR(deviatedAvgR)}.
                </p>
              )}
            </div>

            {efficiency.n > 0 && (
              <div className="panel-section">
                <div className="panel-section__title">Stop &amp; target doctor</div>
                <div className="stack-2">
                  {efficiency.winner_mae_r && (
                    <div className="row-between">
                      <span title="How far winning trades ran against you before working, in R">
                        Heat on winners (p50 / p90)
                      </span>
                      <span>
                        {efficiency.winner_mae_r.p50.toFixed(2)}R / {efficiency.winner_mae_r.p90.toFixed(2)}R
                      </span>
                    </div>
                  )}
                  {efficiency.capture_efficiency != null && (
                    <div className="row-between">
                      <span title="Realized R divided by peak R on winning trades">
                        Capture efficiency
                      </span>
                      <span className={efficiency.capture_efficiency < 0.5 ? 'bear' : ''}>
                        {(efficiency.capture_efficiency * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                  {efficiency.shakeout_rate != null && (
                    <div className="row-between">
                      <span title="Share of losing trades that were already 1R in profit before stopping out">
                        Shaken out of winners
                      </span>
                      <span className={efficiency.shakeout_rate > 0.35 ? 'bear' : ''}>
                        {(efficiency.shakeout_rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                  {efficiency.suggested_stop_r != null && (
                    <div className="row-between">
                      <span title="Stop width that would have survived 90% of past winners, plus a buffer">
                        Stop hypothesis
                      </span>
                      <span>{efficiency.suggested_stop_r.toFixed(2)}R</span>
                    </div>
                  )}
                </div>
                {efficiency.stop_note && <p className="ai-signal-note">{efficiency.stop_note}</p>}
                {efficiency.target_note && <p className="ai-signal-note">{efficiency.target_note}</p>}
              </div>
            )}

            {topTags.length > 0 && (
              <div className="panel-section">
                <div className="panel-section__title">Behavioral tags</div>
                <div className="stack-2">
                  {topTags.map(([tag, count]) => (
                    <div key={tag} className="row-between">
                      <span>{tag}</span>
                      <span>×{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
