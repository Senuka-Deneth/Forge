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

  if (loading) return <div className="panel-card">Loading prediction accuracy…</div>
  if (error) return <div className="panel-card error-text">{error}</div>
  if (!stats || !stats.total_scored) {
    return <div className="panel-card">No scored predictions yet. Run AI analysis and wait for the hourly scoring job.</div>
  }

  const hitPct = stats.hit_rate != null ? `${(stats.hit_rate * 100).toFixed(1)}%` : '—'

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
        <StatCard label="Expired" value={stats.expired} />
      </div>
    </section>
  )
}
