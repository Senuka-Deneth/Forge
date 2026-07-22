import { describe, it, expect } from 'vitest'
import { computePositionSize, suggestRiskPct } from '@forge/position-sizing'
import { simulateRiskOfRuin } from '@forge/risk-of-ruin'
import { analyzeTradeEfficiency } from '@forge/trade-efficiency'
import { assessTargetFeasibility } from '@forge/expected-move'
import {
  DEFAULT_RISK_PROFILE,
  planLevels,
  RISK_PROFILE_BOUNDS,
  sanitizeRiskProfile,
} from './riskProfile'

describe('sanitizeRiskProfile', () => {
  it('returns defaults for junk input', () => {
    expect(sanitizeRiskProfile(null)).toEqual(DEFAULT_RISK_PROFILE)
    expect(sanitizeRiskProfile('nope')).toEqual(DEFAULT_RISK_PROFILE)
  })

  it('treats a missing equity as null rather than as a zero-equity account', () => {
    // Number(null) is 0 and finite — coerced naively, "no equity saved" becomes a $0 account
    // and the sizer reports every trade as untradeable.
    expect(sanitizeRiskProfile({ account_equity: null }).account_equity).toBe(null)
    expect(sanitizeRiskProfile({ account_equity: '' }).account_equity).toBe(null)
    expect(sanitizeRiskProfile({ account_equity: undefined }).account_equity).toBe(null)
  })

  it('keeps a real equity value', () => {
    expect(sanitizeRiskProfile({ account_equity: 12500 }).account_equity).toBe(12500)
    expect(sanitizeRiskProfile({ account_equity: '12500' }).account_equity).toBe(12500)
  })

  it('rejects a non-positive equity', () => {
    expect(sanitizeRiskProfile({ account_equity: -100 }).account_equity).toBe(null)
    expect(sanitizeRiskProfile({ account_equity: 0 }).account_equity).toBe(null)
  })

  it('clamps risk and leverage to the database constraint bounds', () => {
    const high = sanitizeRiskProfile({ risk_per_trade_pct: 500, max_leverage: 9999 })
    expect(high.risk_per_trade_pct).toBe(RISK_PROFILE_BOUNDS.risk_per_trade_pct.max)
    expect(high.max_leverage).toBe(RISK_PROFILE_BOUNDS.max_leverage.max)

    const low = sanitizeRiskProfile({ risk_per_trade_pct: -3, max_leverage: 0 })
    expect(low.risk_per_trade_pct).toBe(RISK_PROFILE_BOUNDS.risk_per_trade_pct.min)
    expect(low.max_leverage).toBe(RISK_PROFILE_BOUNDS.max_leverage.min)
  })

  it('treats an unset exchange leverage as null rather than as 0x', () => {
    // 0 would violate the database CHECK and, worse, read as a real leverage the trader chose.
    expect(sanitizeRiskProfile({}).exchange_leverage).toBe(null)
    expect(sanitizeRiskProfile({ exchange_leverage: null }).exchange_leverage).toBe(null)
    expect(sanitizeRiskProfile({ exchange_leverage: '' }).exchange_leverage).toBe(null)
    expect(sanitizeRiskProfile({ exchange_leverage: 0 }).exchange_leverage).toBe(null)
  })

  it('keeps a real exchange leverage but drops one outside the constraint bounds', () => {
    expect(sanitizeRiskProfile({ exchange_leverage: 25 }).exchange_leverage).toBe(25)
    // Out of range is treated as unset, not clamped — the trader never chose 125x.
    expect(sanitizeRiskProfile({ exchange_leverage: 500 }).exchange_leverage).toBe(null)
    expect(sanitizeRiskProfile({ exchange_leverage: 0.5 }).exchange_leverage).toBe(null)
  })
})

describe('planLevels', () => {
  it('averages the entry zone bounds', () => {
    const levels = planLevels({
      trade_plan: { bias: 'long', entry_zone: { low: 100, high: 102 }, stop_loss: 98 },
    })
    expect(levels).toEqual({ side: 'long', entry: 101, stop: 98 })
  })

  it('uses a single bound when only one is present', () => {
    const levels = planLevels({
      trade_plan: { bias: 'short', entry_zone: { low: null, high: 102 }, stop_loss: 105 },
    })
    expect(levels.entry).toBe(102)
    expect(levels.side).toBe('short')
  })

  it('returns nulls for a wait plan or a missing plan', () => {
    expect(planLevels({ trade_plan: { bias: 'wait' } })).toEqual({ side: null, entry: null, stop: null })
    expect(planLevels(null)).toEqual({ side: null, entry: null, stop: null })
  })

  it('treats a null stop as absent rather than as price zero', () => {
    const levels = planLevels({
      trade_plan: { bias: 'long', entry_zone: { low: 100, high: 100 }, stop_loss: null },
    })
    expect(levels.stop).toBe(null)
  })
})

// The @forge/* aliases point the browser bundle at the same Deno modules the edge functions run.
// These assertions exist to catch an alias or bundling regression, not to re-test the math.
describe('shared risk modules resolve through the @forge aliases', () => {
  it('sizes a position identically to the server module', () => {
    const result = computePositionSize({
      equity: 10_000,
      riskPct: 1,
      entry: 100,
      stop: 98,
      side: 'long',
      maxLeverage: 10,
      feeRate: 0,
    })
    expect(result.qty).toBeCloseTo(50, 6)
    expect(result.risk_amount).toBeCloseTo(100, 6)
  })

  it('suggests a fractional-Kelly risk percentage', () => {
    const suggestion = suggestRiskPct({ p: 0.5, pCiLow: 0.45, rewardR: 2, n: 60 })
    expect(suggestion.risk_pct).toBeGreaterThan(0)
    expect(suggestion.p_source).toBe('ci_low')
  })

  it('runs a reproducible ruin simulation', () => {
    const samples = new Array(200).fill(0).map((_, i) => (i % 20 < 9 ? 2 : -1))
    const input = { rSamples: samples, riskPct: 2, trades: 100, simulations: 200, seed: 42 }
    const a = simulateRiskOfRuin(input)
    const b = simulateRiskOfRuin(input)
    expect(a.p_ruin).toBe(b.p_ruin)
  })

  it('analyzes excursions in R rather than raw price units', () => {
    const rows = new Array(25).fill(0).map(() => ({
      entry: 60_000, stop: 58_800, mae: 240, mfe: 4_800, realized_r: 2, outcome: 'target_hit',
    }))
    const report = analyzeTradeEfficiency(rows)
    // mae 240 on a risk of 1200 = 0.2R, regardless of the nominal price scale.
    expect(report.winner_mae_r.p50).toBeCloseTo(0.2, 6)
  })

  it('assesses target feasibility', () => {
    const result = assessTargetFeasibility({
      entry: 100,
      stop: 97,
      targets: [{ label: 'T1', price: 105 }],
      sigmaPerBar: 0.01,
      bars: 100,
    })
    expect(result.flagged).toBe(false)
    expect(result.targets[0].touch_probability).toBeGreaterThan(0.5)
  })
})
