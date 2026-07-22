import { useEffect, useMemo, useState } from 'react'
import {
  buildEntryFromAiPlan,
  cancelJournalEntry,
  closeJournalEntry,
  computeJournalStats,
  createJournalEntry,
  deleteJournalEntry,
  fetchJournalAnalysisOutcomes,
  fetchJournalEntries,
  formatJournalPct,
  formatJournalPrice,
  formatJournalR,
} from '../utils/journal'

function StatTile({ label, value, hint }) {
  return (
    <div>
      <div className="summary-label">{label}</div>
      <div className="summary-value mt-2">{value ?? '—'}</div>
      {hint && <p className="ai-signal-note mt-2">{hint}</p>}
    </div>
  )
}

function EquityCurve({ points }) {
  if (!points?.length) {
    return <p className="ai-signal-note">Close trades to build your cumulative-R curve.</p>
  }

  const values = points.map((point) => point.cumulativeR)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const range = max - min || 1
  const width = 320
  const height = 72

  const path = points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width
    const y = height - (((point.cumulativeR - min) / range) * (height - 8)) - 4
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-label="Cumulative R equity curve">
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  )
}

const EMPTY_FORM = {
  symbol: '',
  side: 'long',
  entry: '',
  size: '',
  stop: '',
  target: '',
  fees: '0',
  notes: '',
  analysis_id: null,
}

export default function JournalPanel({ symbol, latestPrice, aiAnalysis }) {
  const [entries, setEntries] = useState([])
  const [outcomes, setOutcomes] = useState({})
  const [form, setForm] = useState(EMPTY_FORM)
  const [closeDrafts, setCloseDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const stats = useMemo(() => computeJournalStats(entries), [entries])
  const openEntries = useMemo(() => entries.filter((entry) => entry.status === 'open'), [entries])
  const closedEntries = useMemo(() => entries.filter((entry) => entry.status === 'closed'), [entries])

  const loadEntries = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchJournalEntries()
      setEntries(data)

      const linkedIds = data
        .filter((entry) => entry.analysis_id)
        .map((entry) => entry.id)

      if (linkedIds.length) {
        const outcomeRows = await fetchJournalAnalysisOutcomes(linkedIds)
        const nextOutcomes = {}
        for (const row of outcomeRows) {
          nextOutcomes[row.journal_id] = row
        }
        setOutcomes(nextOutcomes)
      } else {
        setOutcomes({})
      }
    } catch (err) {
      setError(err.message || 'Unable to load journal entries.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadEntries()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const draft = buildEntryFromAiPlan(symbol, aiAnalysis)
    if (!draft) return

    setForm((prev) => ({
      ...prev,
      symbol: draft.symbol || prev.symbol,
      side: draft.side,
      entry: draft.entry != null ? String(draft.entry) : prev.entry,
      stop: draft.stop != null ? String(draft.stop) : prev.stop,
      target: draft.target != null ? String(draft.target) : prev.target,
      notes: draft.notes || prev.notes,
      analysis_id: draft.analysis_id,
    }))
  }, [symbol, aiAnalysis])

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    try {
      await createJournalEntry({
        symbol: form.symbol.trim().toUpperCase(),
        side: form.side,
        entry: Number(form.entry),
        size: Number(form.size),
        stop: form.stop ? Number(form.stop) : null,
        target: form.target ? Number(form.target) : null,
        fees: form.fees ? Number(form.fees) : 0,
        notes: form.notes || null,
        analysis_id: form.analysis_id,
      })
      setForm((prev) => ({
        ...EMPTY_FORM,
        symbol: prev.symbol,
        side: prev.side,
      }))
      await loadEntries()
    } catch (err) {
      setError(err.message || 'Unable to save journal entry.')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = async (entry) => {
    const draft = closeDrafts[entry.id] || {}
    const exitPrice = draft.exitPrice != null ? Number(draft.exitPrice) : latestPrice
    const fees = draft.fees != null ? Number(draft.fees) : 0

    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      setError('Enter a valid exit price to close the trade.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await closeJournalEntry(entry.id, exitPrice, fees)
      await loadEntries()
    } catch (err) {
      setError(err.message || 'Unable to close trade.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (entry) => {
    setSaving(true)
    setError('')
    try {
      await cancelJournalEntry(entry.id)
      await loadEntries()
    } catch (err) {
      setError(err.message || 'Unable to cancel trade.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (entry) => {
    setSaving(true)
    setError('')
    try {
      await deleteJournalEntry(entry.id)
      await loadEntries()
    } catch (err) {
      setError(err.message || 'Unable to delete trade.')
    } finally {
      setSaving(false)
    }
  }

  const updateCloseDraft = (id, field, value) => {
    setCloseDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }))
  }

  return (
    <div className="stack-4">
      <div className="panel-card">
        <div className="panel-card-header">
          <span className="panel-title">Trade Journal</span>
          <span className="panel-badge ready">PostgREST</span>
        </div>
        <p className="ai-signal-note">
          Log trades from the current AI plan or manually. PnL and R-multiple are computed server-side when you close a position.
        </p>
        {error && <p className="ai-signal-note bear">{error}</p>}
      </div>

      <div className="stat-grid">
        <StatTile label="Decided win rate" value={formatJournalPct(stats.winRate)} hint={`${stats.wins}W / ${stats.losses}L`} />
        <StatTile label="Average R" value={formatJournalR(stats.avgR)} />
        <StatTile label="Expectancy" value={stats.expectancy != null ? `$${stats.expectancy.toFixed(2)}` : '—'} />
        <StatTile label="Closed trades" value={stats.totalTrades} />
      </div>

      <div className="panel-card panel-card--pad">
        <div className="summary-label mb-3">Cumulative R</div>
        <EquityCurve points={stats.equityCurve} />
      </div>

      <div className="panel-card panel-card--pad">
        <div className="panel-card-header mb-3">
          <span className="panel-title">New Entry</span>
          {form.analysis_id && <span className="panel-badge ready">Linked to AI analysis</span>}
        </div>
        <form onSubmit={handleCreate} className="position-calc-inputs">
          <label>
            Symbol
            <input value={form.symbol} onChange={(e) => updateForm('symbol', e.target.value)} required />
          </label>
          <label>
            Side
            <select value={form.side} onChange={(e) => updateForm('side', e.target.value)}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>
          <label>
            Entry
            <input type="number" step="any" min="0" value={form.entry} onChange={(e) => updateForm('entry', e.target.value)} required />
          </label>
          <label>
            Size
            <input type="number" step="any" min="0" value={form.size} onChange={(e) => updateForm('size', e.target.value)} required />
          </label>
          <label>
            Stop
            <input type="number" step="any" min="0" value={form.stop} onChange={(e) => updateForm('stop', e.target.value)} />
          </label>
          <label>
            Target
            <input type="number" step="any" min="0" value={form.target} onChange={(e) => updateForm('target', e.target.value)} />
          </label>
          <label className="col-span-all">
            Notes
            <textarea value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} rows={3} />
          </label>
          <div className="col-span-all justify-end">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Open position'}
            </button>
          </div>
        </form>
      </div>

      <div className="panel-card panel-card--pad">
        <div className="panel-card-header mb-3">
          <span className="panel-title">Open Positions</span>
          <span className="panel-badge">{openEntries.length}</span>
        </div>
        {loading ? (
          <p className="ai-signal-note">Loading journal…</p>
        ) : openEntries.length === 0 ? (
          <p className="ai-signal-note">No open positions.</p>
        ) : (
          <div className="stack-3">
            {openEntries.map((entry) => (
              <div key={entry.id} className="ai-card">
                <div className="stack-2">
                  <div className="row-between">
                    <span>{entry.symbol} · {entry.side}</span>
                    <span>{formatJournalPrice(entry.entry)}</span>
                  </div>
                  <div className="row-between">
                    <span>Stop / Target</span>
                    <span>{formatJournalPrice(entry.stop)} / {formatJournalPrice(entry.target)}</span>
                  </div>
                </div>
                <div className="position-calc-inputs">
                  <label>
                    Exit price
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={closeDrafts[entry.id]?.exitPrice ?? (latestPrice != null ? String(latestPrice) : '')}
                      onChange={(e) => updateCloseDraft(entry.id, 'exitPrice', e.target.value)}
                    />
                  </label>
                  <label>
                    Fees
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={closeDrafts[entry.id]?.fees ?? '0'}
                      onChange={(e) => updateCloseDraft(entry.id, 'fees', e.target.value)}
                    />
                  </label>
                </div>
                <div className="row">
                  <button type="button" className="btn-primary" disabled={saving} onClick={() => handleClose(entry)}>Close</button>
                  <button type="button" className="btn-secondary" disabled={saving} onClick={() => handleCancel(entry)}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel-card panel-card--pad">
        <div className="panel-card-header mb-3">
          <span className="panel-title">Closed History</span>
          <span className="panel-badge">{closedEntries.length}</span>
        </div>
        {closedEntries.length === 0 ? (
          <p className="ai-signal-note">No closed trades yet.</p>
        ) : (
          <div className="stack-3">
            {closedEntries.map((entry) => {
              const outcome = outcomes[entry.id]
              const pnlPositive = entry.pnl != null && entry.pnl >= 0
              return (
                <div key={entry.id} className="ai-card">
                  <div className="stack-2">
                    <div className="row-between">
                      <span>{entry.symbol} · {entry.side}</span>
                      <span className={pnlPositive ? 'bull' : 'bear'}>
                        {entry.pnl != null ? `$${Number(entry.pnl).toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div className="row-between">
                      <span>Entry → Exit</span>
                      <span>{formatJournalPrice(entry.entry)} → {formatJournalPrice(entry.exit_price)}</span>
                    </div>
                    <div className="row-between">
                      <span>R-multiple</span>
                      <span>{formatJournalR(entry.r_multiple)}</span>
                    </div>
                    {outcome && (
                      <>
                        <div className="row-between">
                          <span>AI plan outcome</span>
                          <span>{outcome.outcome ?? '—'}</span>
                        </div>
                        <div className="row-between">
                          <span>AI realized R</span>
                          <span>{formatJournalR(outcome.realized_r)}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="justify-end">
                    <button type="button" className="btn-secondary" disabled={saving} onClick={() => handleDelete(entry)}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
