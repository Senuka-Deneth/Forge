import React, { useEffect, useMemo, useState } from 'react'
import { computePositionSize, UNCONSTRAINED_FILTERS } from '@forge/position-sizing'
import {
  DEFAULT_RISK_PROFILE,
  fetchRiskProfile,
  planLevels,
  RISK_PROFILE_BOUNDS,
  saveRiskProfile,
} from '../utils/riskProfile'
import { fetchSymbolFilters } from '../utils/symbolFilters'

/**
 * Position sizer — turns the plan's R-multiples into an actual order quantity.
 *
 * Runs the same `computePositionSize` the edge functions use, imported through the `@forge/*`
 * alias, so the number previewed here and the number reasoned about server-side cannot drift.
 *
 * Entry and stop prefill from the active AI plan and stay editable: the sizer has to work for a
 * discretionary level a trader picked off the chart, not only for a plan Forge produced.
 */

function fmt(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtQty(value) {
  if (!Number.isFinite(Number(value))) return '—'
  // Quantities span BTC (0.00042) to meme coins (4,200,000) — fixed decimals suit neither.
  return Number(value).toLocaleString(undefined, { maximumSignificantDigits: 8 })
}

export default function PositionSizerPanel({ aiAnalysis, symbol, latestPrice }) {
  const [profile, setProfile] = useState(DEFAULT_RISK_PROFILE)
  const [equityInput, setEquityInput] = useState('')
  const [riskPctInput, setRiskPctInput] = useState(String(DEFAULT_RISK_PROFILE.risk_per_trade_pct))
  const [leverageInput, setLeverageInput] = useState(String(DEFAULT_RISK_PROFILE.max_leverage))
  const [selectedLeverageInput, setSelectedLeverageInput] = useState('')
  const [entryInput, setEntryInput] = useState('')
  const [stopInput, setStopInput] = useState('')
  const [side, setSide] = useState('long')
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  // Unconstrained until the real filters land, so the very first render still sizes rather than
  // showing an empty panel while a network call is in flight.
  const [filters, setFilters] = useState(UNCONSTRAINED_FILTERS)

  useEffect(() => {
    let cancelled = false
    fetchRiskProfile()
      .then((loaded) => {
        if (cancelled) return
        setProfile(loaded)
        setEquityInput(loaded.account_equity != null ? String(loaded.account_equity) : '')
        setRiskPctInput(String(loaded.risk_per_trade_pct))
        setLeverageInput(String(loaded.max_leverage))
        setSelectedLeverageInput(loaded.exchange_leverage != null ? String(loaded.exchange_leverage) : '')
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  // Lot step and minimum notional decide whether the computed quantity is actually placeable.
  // fetchSymbolFilters never throws — it falls back to unconstrained — so there is nothing to catch.
  useEffect(() => {
    let cancelled = false
    setFilters(UNCONSTRAINED_FILTERS)
    if (!symbol) return undefined
    fetchSymbolFilters(symbol).then((loaded) => { if (!cancelled) setFilters(loaded) })
    return () => { cancelled = true }
  }, [symbol])

  // Prefill from the plan until the trader edits a level, then leave their input alone — nothing
  // is more irritating than a form that overwrites what you just typed on the next poll.
  const levels = useMemo(() => planLevels(aiAnalysis), [aiAnalysis])
  useEffect(() => {
    if (touched) return
    if (levels.entry != null) setEntryInput(String(levels.entry))
    if (levels.stop != null) setStopInput(String(levels.stop))
    if (levels.side) setSide(levels.side)
  }, [levels, touched])

  const result = useMemo(() => {
    const equity = Number(equityInput)
    const entry = Number(entryInput)
    const stop = Number(stopInput)
    if (!Number.isFinite(equity) || equity <= 0) return null
    if (!Number.isFinite(entry) || !Number.isFinite(stop)) return null

    const selected = Number(selectedLeverageInput)
    return computePositionSize({
      equity,
      riskPct: Number(riskPctInput),
      entry,
      stop,
      side,
      maxLeverage: Number(leverageInput) || 1,
      selectedLeverage: Number.isFinite(selected) && selected > 0 ? selected : undefined,
      filters,
    })
  }, [equityInput, riskPctInput, entryInput, stopInput, side, leverageInput, selectedLeverageInput, filters])

  const suggestion = aiAnalysis?.verdict?.risk_suggestion ?? null

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const next = await saveRiskProfile({
        ...profile,
        account_equity: equityInput === '' ? null : Number(equityInput),
        risk_per_trade_pct: Number(riskPctInput),
        max_leverage: Number(leverageInput),
        // Persisted so the server can reproduce this liquidation price. Without it the
        // liquidation_before_stop guardrail has to assume the account fully backs the position,
        // which is the one case where it never fires.
        exchange_leverage: selectedLeverageInput === '' ? null : Number(selectedLeverageInput),
      })
      setProfile(next)
      setSaved(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const markTouched = (setter) => (event) => {
    setTouched(true)
    setter(event.target.value)
  }

  return (
    <div className="module" id="position-sizer">
      <div className="module__header">
        <span className="module__title">Position sizer</span>
        {symbol && <span className="text-sm-muted">{symbol}</span>}
      </div>

      <div className="module__body stack-4">
        <div className="sizer-grid">
          <label className="sizer-field">
            <span>Account equity</span>
            <input
              type="number"
              inputMode="decimal"
              value={equityInput}
              onChange={(e) => setEquityInput(e.target.value)}
              placeholder="10000"
              min="0"
            />
          </label>

          <label className="sizer-field">
            <span>Risk per trade %</span>
            <input
              type="number"
              inputMode="decimal"
              value={riskPctInput}
              onChange={(e) => setRiskPctInput(e.target.value)}
              step="0.1"
              min={RISK_PROFILE_BOUNDS.risk_per_trade_pct.min}
              max={RISK_PROFILE_BOUNDS.risk_per_trade_pct.max}
            />
          </label>

          <label className="sizer-field">
            <span>Side</span>
            <select value={side} onChange={(e) => { setTouched(true); setSide(e.target.value) }}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>

          <label className="sizer-field">
            <span>Entry</span>
            <input
              type="number"
              inputMode="decimal"
              value={entryInput}
              onChange={markTouched(setEntryInput)}
              placeholder={latestPrice ? String(latestPrice) : 'entry'}
            />
          </label>

          <label className="sizer-field">
            <span>Stop</span>
            <input
              type="number"
              inputMode="decimal"
              value={stopInput}
              onChange={markTouched(setStopInput)}
              placeholder="stop"
            />
          </label>

          <label className="sizer-field">
            <span>Max leverage</span>
            <input
              type="number"
              inputMode="decimal"
              value={leverageInput}
              onChange={(e) => setLeverageInput(e.target.value)}
              min={RISK_PROFILE_BOUNDS.max_leverage.min}
              max={RISK_PROFILE_BOUNDS.max_leverage.max}
            />
          </label>

          <label className="sizer-field">
            <span title="Leverage set on the exchange for this symbol. Decides where liquidation sits — it is not the same as the leverage the position needs.">
              Exchange leverage
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={selectedLeverageInput}
              onChange={(e) => setSelectedLeverageInput(e.target.value)}
              placeholder="optional"
              min={RISK_PROFILE_BOUNDS.exchange_leverage.min}
              max={RISK_PROFILE_BOUNDS.exchange_leverage.max}
            />
          </label>
        </div>

        <div className="row-between">
          <button type="button" className="btn-ghost" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save risk profile'}
          </button>
          {saved && <span className="text-sm-muted">Saved</span>}
        </div>

        {error && <p className="bear">{error}</p>}

        {!result && (
          <p className="ai-signal-note">
            Enter account equity plus an entry and stop to size the position. Nothing is sized from a
            guess — without equity there is no risk budget to divide.
          </p>
        )}

        {result && (
          <>
            <div className="stack-2">
              <div className="row-between">
                <span>Quantity</span>
                <span className={result.tradeable ? '' : 'bear'}>{fmtQty(result.qty)}</span>
              </div>
              <div className="row-between">
                <span>Notional</span>
                <span>${fmt(result.notional)}</span>
              </div>
              <div className="row-between">
                <span title="Loss if the stop fills, including the round-trip fee">Risk at stop</span>
                <span>${fmt(result.risk_amount)} ({fmt(result.risk_pct_actual)}%)</span>
              </div>
              <div className="row-between">
                <span>Stop distance</span>
                <span>{fmt(result.stop_distance_pct, 3)}%</span>
              </div>
              <div className="row-between">
                <span title="Notional divided by equity — how much of the account this position uses">
                  Leverage required
                </span>
                <span>{fmt(result.required_leverage)}×</span>
              </div>
              <div className="row-between">
                <span title="Round-trip fee expressed in R — the same cost the EV calculation subtracts">
                  Fee cost
                </span>
                <span>${fmt(result.fee_cost)} ({fmt(result.fee_cost_r, 3)}R)</span>
              </div>
              {result.liquidation_price != null && (
                <div className="row-between">
                  <span>Est. liquidation</span>
                  <span className={result.liquidation_before_stop ? 'bear' : ''}>
                    {fmt(result.liquidation_price, 4)}
                    {result.liquidation_distance_pct != null
                      ? ` (${fmt(result.liquidation_distance_pct)}% away)`
                      : ''}
                  </span>
                </div>
              )}
            </div>

            {result.warnings.length > 0 && (
              <div className="panel-section">
                <div className="panel-section__title">Warnings</div>
                <div className="stack-2">
                  {result.warnings.map((warning, i) => (
                    <p key={i} className="bear text-sm">{warning}</p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {suggestion && (
          <div className="panel-section">
            <div className="panel-section__title">Suggested risk</div>
            <div className="row-between">
              <span title="Quarter-Kelly on the Wilson lower bound of the calibrated hit rate">
                Fractional Kelly
              </span>
              <span>{fmt(suggestion.risk_pct)}%</span>
            </div>
            <p className="ai-signal-note">{suggestion.rationale}</p>
          </div>
        )}
      </div>
    </div>
  )
}
