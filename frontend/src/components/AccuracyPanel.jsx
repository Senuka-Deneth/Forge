import React, { useEffect, useState } from 'react'
import { invokeFunction } from '../supabaseClient'

function StatCard({ label, value, hint }) {
  return (
    <div className="panel-card" style={{ padding: '16px' }}>
      <div className="summary-label">{label}</div>
      <div className="summary-value" style={{ marginTop: '8px' }}>{value ?? '—'}</div>
      {hint && <p className="ai-signal-note" style={{ marginTop: '8px' }}>{hint}</p>}
    </div>
  )
}

function ReliabilityChart({ deciles }) {
  if (!deciles || !Object.keys(deciles).length) return null
  const rows = Object.entries(deciles)
    .map(([key, d]) => ({ key: Number(key), ...d }))
    .sort((a, b) => a.key - b.key)

  return (
    <div className="panel-card" style={{ padding: '16px', marginTop: '16px' }}>
      <div className="summary-label" style={{ marginBottom: '12px' }}>Reliability curve (predicted vs realized)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map((row) => {
          const predictedPct = row.avg_predicted != null ? row.avg_predicted * 100 : (row.key * 10 + 5)
          const realizedPct = row.hitRate != null ? row.hitRate * 100 : 0
          return (
            <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 1fr', gap: '8px', alignItems: 'center' }}>
              <span className="ai-signal-note">{row.key * 10}–{row.key * 10 + 9}%</span>
              <div title={`Predicted ~${predictedPct.toFixed(0)}%`} style={{ background: 'var(--bg-overlay)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, predictedPct)}%`, height: '100%', background: 'var(--accent-primary)' }} />
              </div>
              <div title={`Realized ${realizedPct.toFixed(0)}% (n=${row.count})`} style={{ background: 'var(--bg-overlay)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, realizedPct)}%`, height: '100%', background: 'var(--bull)' }} />
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
      <div className="panel-card" aria-busy="true" aria-label="Loading prediction accuracy">
        <div className="ai-skeleton-line" style={{ width: '40%', height: '10px' }}></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginTop: '16px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="ai-skeleton-line" style={{ height: '64px', marginBottom: 0 }}></div>
          ))}
        </div>
      </div>
    )
  }
  if (error) return <div className="panel-card error-text">{error}</div>
  if (!stats || !stats.total_scored) {
    return <div className="panel-card">No scored predictions yet. Run AI analysis and wait for the hourly scoring job.</div>
  }

  const hitPct = stats.hit_rate != null ? `${(stats.hit_rate * 100).toFixed(1)}%` : '—'
  const setupEntries = Object.entries(stats.setup_stats ?? {})

  return (
    <section className="accuracy-panel" aria-label="AI prediction accuracy">
      <div className="panel-card-header" style={{ marginBottom: '12px' }}>
        <span className="panel-title">Prediction Accuracy</span>
        <span className="panel-badge ready">{stats.total_scored} scored</span>
      </div>
      <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <StatCard label="Hit rate" value={hitPct} hint={`${stats.wins} wins / ${stats.losses} losses`} />
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
        <div className="panel-card" style={{ padding: '16px', marginTop: '16px' }}>
          <div className="summary-label" style={{ marginBottom: '12px' }}>Per-setup performance</div>
          <div className="ai-rows">
            {setupEntries.map(([setupType, row]) => (
              <div className="ai-row" key={setupType}>
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
    </section>
  )
}
