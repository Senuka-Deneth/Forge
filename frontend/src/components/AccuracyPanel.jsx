import React, { useEffect, useState } from 'react'
import { invokeFunction } from '../supabaseClient'

function StatCard({ label, value, hint }) {
  return (
    <div>
      <div className="stat-grid__label">{label}</div>
      <div className="stat-grid__value">{value ?? '—'}</div>
      {hint && <p className="ai-signal-note">{hint}</p>}
    </div>
  )
}

function ReliabilityChart({ deciles }) {
  if (!deciles || !Object.keys(deciles).length) return null
  const rows = Object.entries(deciles)
    .map(([key, d]) => ({ key: Number(key), ...d }))
    .sort((a, b) => a.key - b.key)

  return (
    <div className="module">
      <div className="module__header">
        <span className="module__title">Reliability curve</span>
      </div>
      <div className="module__body stack-2">
        {rows.map((row) => {
          const predictedPct = row.avg_predicted != null ? row.avg_predicted * 100 : (row.key * 10 + 5)
          const realizedPct = row.hitRate != null ? row.hitRate * 100 : 0
          return (
            <div key={row.key} className="row">
              <span className="label">{row.key * 10}–{row.key * 10 + 9}%</span>
              <div className="confidence-bar-track" title={`Predicted ~${predictedPct.toFixed(0)}%`}>
                <div className="confidence-bar-fill" style={{ width: `${Math.min(100, predictedPct)}%` }} />
              </div>
              <div className="swing-bar-track" title={`Realized ${realizedPct.toFixed(0)}% (n=${row.count})`}>
                <div className="swing-bar-fill swing-bar-fill--bull" style={{ left: 0, width: `${Math.min(100, realizedPct)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AccuracyPanel() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await invokeFunction('analysis-stats')
        if (!cancelled) {
          if (data?.success) setStats(data.stats)
          else setError(data?.error || 'Unable to load accuracy stats.')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to reach analysis-stats.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="module" aria-busy="true" aria-label="Loading prediction accuracy">
        <div className="module__header">
          <span className="module__title skeleton">Prediction Accuracy</span>
        </div>
        <div className="module__body">
          <div className="stat-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div className="stat-grid__label skeleton">Loading</div>
                <div className="stat-grid__value skeleton">Loading</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="module">
        <div className="module__body bear">{error}</div>
      </div>
    )
  }
  if (!stats || !stats.total_scored) {
    return (
      <div className="module">
        <div className="module__body muted">No scored predictions yet. Run AI analysis and wait for the hourly scoring job.</div>
      </div>
    )
  }

  const hitPct = stats.hit_rate != null ? `${(stats.hit_rate * 100).toFixed(1)}%` : '—'
  const setupEntries = Object.entries(stats.setup_stats ?? {})

  return (
    <section className="module" aria-label="AI prediction accuracy">
      <div className="module__header">
        <span className="module__title">Prediction Accuracy</span>
        <span className="tag tag--bull">{stats.total_scored} scored</span>
      </div>
      <div className="module__body stack-4">
        <div className="stat-grid">
          <StatCard label="Decided hit rate" value={hitPct} hint={`${stats.wins}W / ${stats.losses}L (target vs stop only)`} />
          <StatCard
            label="Expiry rate"
            value={stats.expiry_rate != null ? `${(stats.expiry_rate * 100).toFixed(1)}%` : '—'}
            hint={`${stats.expired ?? 0} plans expired without target/stop`}
          />
          <StatCard
            label="No-fill rate"
            value={stats.no_fill_rate != null ? `${(stats.no_fill_rate * 100).toFixed(1)}%` : '—'}
            hint={`${stats.no_fill ?? 0} limit entries never filled`}
          />
          <StatCard label="Avg realized R" value={stats.avg_realized_r} />
          <StatCard label="Expectancy (R)" value={stats.expectancy} />
          <StatCard
            label="Brier score"
            value={stats.brier_score}
            hint="0.25 = coin flip on 50% calls; lower is better"
          />
          <StatCard label="Expired" value={stats.expired} />
        </div>

        <ReliabilityChart deciles={stats.confidence_deciles} />

        {setupEntries.length > 0 && (
          <div className="module">
            <div className="module__header">
              <span className="module__title">Per-setup performance</span>
            </div>
            <div className="module__body stack-2">
              {setupEntries.map(([setupType, row]) => (
                <div className="row-between" key={setupType}>
                  <span>{setupType.replace(/_/g, ' ')}</span>
                  <span>
                    n={row.n}
                    {row.hit_rate != null ? ` · ${(row.hit_rate * 100).toFixed(1)}% hit` : ''}
                    {row.avg_r != null ? ` · ${row.avg_r}R` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
