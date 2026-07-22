import React, { useEffect, useState } from 'react'
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
        .select('id, symbol, side, status, pnl, r_multiple, plan_adherence, behavioral_tags, mae, mfe, closed_at, analysis_id')
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

  const closed = entries.filter((e) => e.status === 'closed' && e.pnl != null)
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

  const maeAvg = avg(closed.map((e) => e.mae))
  const mfeAvg = avg(closed.map((e) => e.mfe))

  const tagCounts = {}
  for (const entry of closed) {
    for (const tag of entry.behavioral_tags ?? []) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
    }
  }
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <div className="panel-card" id="edge-panel">
      <div className="panel-card-header">
        <span className="panel-title">Your Edge</span>
      </div>

      {loading && <p className="ai-signal-note">Loading journal…</p>}
      {error && <p className="ai-signal-note" style={{ color: 'var(--bear)' }}>{error}</p>}

      {!loading && !error && closed.length === 0 && (
        <p className="ai-signal-note">
          No closed trades yet. Once the journal has outcomes (with optional adherence and MAE/MFE),
          this panel shows where your edge actually is.
        </p>
      )}

      {!loading && closed.length > 0 && (
        <>
          <div className="ai-rows">
            <div className="ai-row">
              <span>Closed trades</span>
              <span>{stats.totalTrades}</span>
            </div>
            <div className="ai-row">
              <span>Win rate</span>
              <span>{formatJournalPct(stats.winRate)}</span>
            </div>
            <div className="ai-row">
              <span>Avg R</span>
              <span>{formatJournalR(stats.avgR)}</span>
            </div>
            <div className="ai-row">
              <span>Expectancy ($)</span>
              <span>{stats.expectancy != null ? `$${stats.expectancy.toFixed(2)}` : '—'}</span>
            </div>
          </div>

          <div style={{ marginTop: '14px' }}>
            <div className="summary-label" style={{ marginBottom: '4px' }}>Plan adherence</div>
            {adherenceRows.length === 0 && (
              <p className="ai-signal-note">No adherence tags recorded yet.</p>
            )}
            {adherenceRows.map((row) => (
              <div key={row.key} className="ai-row">
                <span>{row.key.replace(/_/g, ' ')} (n={row.n})</span>
                <span>
                  {formatJournalPct(row.winRate)} · {formatJournalR(row.avgR)}
                </span>
              </div>
            ))}
            {followed.length > 0 && deviated.length > 0 && (
              <p className="ai-signal-note" style={{ marginTop: '6px' }}>
                Followed plans average {formatJournalR(followedAvgR)}; deviations average{' '}
                {formatJournalR(deviatedAvgR)}.
              </p>
            )}
          </div>

          {(maeAvg != null || mfeAvg != null) && (
            <div style={{ marginTop: '14px' }}>
              <div className="summary-label" style={{ marginBottom: '4px' }}>Excursion</div>
              <div className="ai-row">
                <span title="Maximum adverse excursion on your fills">Avg MAE</span>
                <span>{maeAvg != null ? maeAvg.toFixed(4) : '—'}</span>
              </div>
              <div className="ai-row">
                <span title="Maximum favorable excursion on your fills">Avg MFE</span>
                <span>{mfeAvg != null ? mfeAvg.toFixed(4) : '—'}</span>
              </div>
              {mfeAvg != null && stats.avgR != null && mfeAvg > 0 && (
                <p className="ai-signal-note">
                  Avg MFE {mfeAvg.toFixed(4)} vs avg realized {formatJournalR(stats.avgR)} —
                  compare these to see whether you tend to leave winners early or hold losers too long.
                </p>
              )}
            </div>
          )}

          {topTags.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <div className="summary-label" style={{ marginBottom: '4px' }}>Behavioral tags</div>
              {topTags.map(([tag, count]) => (
                <div key={tag} className="ai-row">
                  <span>{tag}</span>
                  <span>×{count}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
