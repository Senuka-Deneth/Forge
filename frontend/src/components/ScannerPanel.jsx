import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { invokeFunction, supabase } from '../supabaseClient'

const INTERVAL_OPTIONS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']

const PILL_VARIANTS = {
  long: 'tag--bull',
  short: 'tag--bear',
  wait: 'tag--muted',
  take: 'tag--bull',
  skip: 'tag--bear',
  trending: 'tag--accent',
  ranging: 'tag--muted',
  volatile_chop: 'tag--bear',
}

function StatusPill({ value }) {
  if (value == null) {
    return <span className="tag tag--muted">—</span>
  }

  const valStr = String(value).toLowerCase()
  const display = String(value).replace(/_/g, ' ').toUpperCase()
  const variant = PILL_VARIANTS[valStr] ?? ''

  return (
    <span className={`tag ${variant}`.trim()}>
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
    <section className="scanner-panel stack-4" aria-label="Watchlist scanner">
      <div className="module">
        <div className="module__header">
          <span className="module__title">Watchlist Scanner</span>
          <button
            type="button"
            className="btn btn--solid"
            onClick={handleScan}
            disabled={scanning || loadingList || !watchlist.length}
          >
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
        </div>

        <div className="module__body stack-4">
          {error && <p className="bear">{error}</p>}

          {armedAlerts.length > 0 && (
            <div className="panel-section">
              <div className="panel-section__title">Armed alerts</div>
              <div className="stack-2">
                {armedAlerts.slice(0, 8).map((alert) => (
                  <div key={alert.id} className="row-between">
                    <span>{alert.symbol} {alert.direction} {alert.level}</span>
                    <span className="muted">{String(alert.source || '').replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form className="row wrap" onSubmit={handleAdd}>
            <label className="field-group">
              <span className="field-label">Symbol</span>
              <input
                className="field"
                type="text"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                placeholder="BTCUSDT"
                maxLength={20}
              />
            </label>
            <label className="field-group">
              <span className="field-label">Interval</span>
              <select className="field" value={newInterval} onChange={(e) => setNewInterval(e.target.value)}>
                {INTERVAL_OPTIONS.map((interval) => (
                  <option key={interval} value={interval}>{interval}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn" disabled={saving || !newSymbol.trim()}>
              Add
            </button>
          </form>

          {loadingList ? (
            <p className="ai-signal-note">Loading watchlist…</p>
          ) : watchlist.length === 0 ? (
            <p className="ai-signal-note">Add symbols to your watchlist, then scan for deterministic setups.</p>
          ) : (
            <div className="stack-2">
              {watchlist.map((row) => (
                <div key={row.id} className="row-between">
                  <span>{row.symbol} · {row.interval}</span>
                  <button
                    type="button"
                    className="btn"
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
      </div>

      {sortedResults.length > 0 && (
        <div className="module">
          <div className="module__header">
            <span className="module__title">Scan results</span>
            <span className="tag tag--bull">{sortedResults.length} symbols</span>
          </div>

          <div className="module__body">
            <table className="scanner-table">
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
                    <th key={key} onClick={() => toggleSort(key)}>
                      {label}{sortIndicator(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((row) => (
                  <tr
                    key={`${row.symbol}-${row.interval}`}
                    className={onSelectSymbol ? 'scanner-row' : ''}
                    onClick={() => onSelectSymbol?.(row.symbol, row.interval)}
                  >
                    <td>
                      <div>{row.symbol}</div>
                      <div className="muted">{row.interval}{row.error ? ` · ${row.error}` : ''}</div>
                    </td>
                    <td><StatusPill value={row.bias} /></td>
                    <td><StatusPill value={row.setup_type} /></td>
                    <td><StatusPill value={row.regime} /></td>
                    <td className="num">{row.confidence}%</td>
                    <td className="num">{row.confluence_score}%</td>
                    <td><StatusPill value={row.verdict} /></td>
                    <td className="num">{formatNumber(row.ev_r, 3)}</td>
                    <td className="num">{formatNumber(row.risk_reward, 2)}</td>
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
