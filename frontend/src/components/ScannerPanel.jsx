import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { invokeFunction, supabase } from '../supabaseClient'

const INTERVAL_OPTIONS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']

const colorMap = {
  long: 'var(--bull)',
  short: 'var(--bear)',
  wait: 'var(--neutral)',
  take: 'var(--bull)',
  skip: 'var(--bear)',
  trending: 'var(--info)',
  ranging: 'var(--neutral)',
  volatile_chop: 'var(--bear)',
}

function StatusPill({ value }) {
  if (value == null) {
    return <span className="status-pill" style={{ color: 'inherit', opacity: 0.5 }}>—</span>
  }

  const valStr = String(value).toLowerCase()
  const display = String(value).replace(/_/g, ' ').toUpperCase()
  const color = colorMap[valStr] ?? 'var(--text-muted)'
  const isTransparent = color === 'transparent'

  return (
    <span className="status-pill" style={{
      backgroundColor: isTransparent ? 'var(--bg-overlay)' : `var(--${color.replace('var(--', '').replace(')', '')}-soft, var(--bg-overlay))`,
      color,
      border: `1px solid ${isTransparent ? 'var(--border-subtle)' : color}`,
      padding: '2px 8px',
      borderRadius: 'var(--radius-sm)',
      fontSize: '10px',
      fontWeight: '700',
      letterSpacing: '0.02em',
      display: 'inline-flex',
      alignItems: 'center',
    }}>
      {display}
    </span>
  )
}

function formatNumber(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

export default function ScannerPanel({ onSelectSymbol, armedAlerts = [] }) {
  const [watchlist, setWatchlist] = useState([])
  const [results, setResults] = useState([])
  const [newSymbol, setNewSymbol] = useState('')
  const [newInterval, setNewInterval] = useState('4h')
  const [loadingList, setLoadingList] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('ev_r')
  const [sortDir, setSortDir] = useState('desc')

  const loadWatchlist = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured.')
      setLoadingList(false)
      return
    }

    setError('')
    try {
      const { data, error: listError } = await supabase
        .from('watchlist')
        .select('id, symbol, interval, enabled')
        .order('created_at', { ascending: true })

      if (listError) throw listError
      setWatchlist(data ?? [])
    } catch (err) {
      setError(err.message || 'Unable to load watchlist.')
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!supabase) {
        if (!cancelled) {
          setError('Supabase is not configured.')
          setLoadingList(false)
        }
        return
      }
      try {
        const { data, error: listError } = await supabase
          .from('watchlist')
          .select('id, symbol, interval, enabled')
          .order('created_at', { ascending: true })
        if (listError) throw listError
        if (!cancelled) setWatchlist(data ?? [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'Unable to load watchlist.')
      } finally {
        if (!cancelled) setLoadingList(false)
      }
    })()
    return () => { cancelled = true }
  }, [])
  const sortedResults = useMemo(() => {
    const rows = [...results]
    rows.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const aNull = av == null
      const bNull = bv == null
      if (aNull && bNull) return 0
      if (aNull) return 1
      if (bNull) return -1
      if (typeof av === 'string' || typeof bv === 'string') {
        const cmp = String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      }
      const cmp = Number(av) - Number(bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [results, sortKey, sortDir])

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'symbol' ? 'asc' : 'desc')
  }

  const sortIndicator = (key) => {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  const handleAdd = async (event) => {
    event.preventDefault()
    if (!supabase) return

    const symbol = newSymbol.trim().toUpperCase()
    if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
      setError('Enter a valid symbol (5–20 uppercase letters/numbers).')
      return
    }

    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) throw new Error('Sign in is required to manage your watchlist.')

      const { error: insertError } = await supabase.from('watchlist').upsert({
        user_id: user.id,
        symbol,
        interval: newInterval,
        enabled: true,
      }, { onConflict: 'user_id,symbol,interval' })

      if (insertError) throw insertError
      setNewSymbol('')
      await loadWatchlist()
    } catch (err) {
      setError(err.message || 'Unable to add symbol.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (row) => {
    if (!supabase) return
    setSaving(true)
    setError('')
    try {
      const { error: deleteError } = await supabase.from('watchlist').delete().eq('id', row.id)
      if (deleteError) throw deleteError
      await loadWatchlist()
      setResults((prev) => prev.filter((item) => !(item.symbol === row.symbol && item.interval === row.interval)))
    } catch (err) {
      setError(err.message || 'Unable to remove symbol.')
    } finally {
      setSaving(false)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setError('')
    try {
      const data = await invokeFunction('scan-watchlist', {})
      if (!data?.success) {
        throw new Error(data?.error || 'Watchlist scan failed.')
      }
      setResults(data.results ?? [])
      setSortKey('ev_r')
      setSortDir('desc')
    } catch (err) {
      setError(err.message || 'Unable to scan watchlist.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <section className="scanner-panel" aria-label="Watchlist scanner">
      <div className="panel-card">
        <div className="panel-card-header">
          <span className="panel-title">Watchlist Scanner</span>
          <button
            type="button"
            className="btn-primary"
            onClick={handleScan}
            disabled={scanning || loadingList || !watchlist.length}
          >
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
        </div>

        {error && <p className="error-text" style={{ marginTop: '12px' }}>{error}</p>}

        {armedAlerts.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div className="summary-label" style={{ marginBottom: '4px' }}>Armed alerts</div>
            <div className="ai-rows">
              {armedAlerts.slice(0, 8).map((alert) => (
                <div key={alert.id} className="ai-row">
                  <span>{alert.symbol} {alert.direction} {alert.level}</span>
                  <span style={{ opacity: 0.6 }}>{String(alert.source || '').replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <form className="ai-rows" style={{ marginTop: '16px', gap: '12px' }} onSubmit={handleAdd}>
          <label style={{ flex: 1 }}>
            Symbol
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              placeholder="BTCUSDT"
              maxLength={20}
            />
          </label>
          <label>
            Interval
            <select value={newInterval} onChange={(e) => setNewInterval(e.target.value)}>
              {INTERVAL_OPTIONS.map((interval) => (
                <option key={interval} value={interval}>{interval}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-ghost" disabled={saving || !newSymbol.trim()}>
            Add
          </button>
        </form>

        {loadingList ? (
          <p className="ai-signal-note" style={{ marginTop: '16px' }}>Loading watchlist…</p>
        ) : watchlist.length === 0 ? (
          <p className="ai-signal-note" style={{ marginTop: '16px' }}>Add symbols to your watchlist, then scan for deterministic setups.</p>
        ) : (
          <div className="ai-rows" style={{ marginTop: '12px' }}>
            {watchlist.map((row) => (
              <div key={row.id} className="ai-row">
                <span>{row.symbol} · {row.interval}</span>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={saving}
                  onClick={() => handleRemove(row)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {sortedResults.length > 0 && (
        <div className="panel-card" style={{ marginTop: '16px' }}>
          <div className="panel-card-header">
            <span className="panel-title">Scan results</span>
            <span className="panel-badge ready">{sortedResults.length} symbols</span>
          </div>

          <div style={{ overflowX: 'auto', marginTop: '12px' }}>
            <table className="scanner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr>
                  {[
                    ['symbol', 'Symbol'],
                    ['bias', 'Bias'],
                    ['setup_type', 'Setup'],
                    ['regime', 'Regime'],
                    ['confidence', 'Conf'],
                    ['confluence_score', 'Confluence'],
                    ['verdict', 'Verdict'],
                    ['ev_r', 'EV (R)'],
                    ['risk_reward', 'R:R'],
                  ].map(([key, label]) => (
                    <th key={key} style={{ textAlign: 'left', padding: '8px', cursor: 'pointer' }} onClick={() => toggleSort(key)}>
                      {label}{sortIndicator(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((row) => (
                  <tr
                    key={`${row.symbol}-${row.interval}`}
                    style={{ cursor: onSelectSymbol ? 'pointer' : 'default' }}
                    onClick={() => onSelectSymbol?.(row.symbol, row.interval)}
                  >
                    <td style={{ padding: '8px' }}>
                      <div>{row.symbol}</div>
                      <div className="ai-signal-note">{row.interval}{row.error ? ` · ${row.error}` : ''}</div>
                    </td>
                    <td style={{ padding: '8px' }}><StatusPill value={row.bias} /></td>
                    <td style={{ padding: '8px' }}><StatusPill value={row.setup_type} /></td>
                    <td style={{ padding: '8px' }}><StatusPill value={row.regime} /></td>
                    <td style={{ padding: '8px' }}>{row.confidence}%</td>
                    <td style={{ padding: '8px' }}>{row.confluence_score}%</td>
                    <td style={{ padding: '8px' }}><StatusPill value={row.verdict} /></td>
                    <td style={{ padding: '8px' }}>{formatNumber(row.ev_r, 3)}</td>
                    <td style={{ padding: '8px' }}>{formatNumber(row.risk_reward, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
