import { supabase } from '../supabaseClient'

/**
 * Account-level sizing inputs, stored in `risk_settings` alongside the guardrail limits.
 *
 * Equity is deliberately allowed to stay null: a trader who does not want a balance in the
 * database still gets the sizer, they just supply equity per session instead of persisting it.
 */

export const DEFAULT_RISK_PROFILE = {
  account_equity: null,
  risk_per_trade_pct: 1,
  max_leverage: 1,
  exchange_leverage: null,
  ruin_tolerance_pct: 1,
  daily_loss_limit_r: 3,
  max_open_r: 5,
}

/** Mirrors the CHECK constraints in 20260722120000_position_sizing_risk_profile.sql. */
export const RISK_PROFILE_BOUNDS = {
  risk_per_trade_pct: { min: 0.01, max: 25 },
  max_leverage: { min: 1, max: 125 },
  exchange_leverage: { min: 1, max: 125 },
  ruin_tolerance_pct: { min: 0.1, max: 50 },
}

function clamp(value, { min, max }, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Coerce a column that is genuinely allowed to be unset.
 *
 * `Number(null)` is 0 and finite, so an unguarded coercion turns "nothing saved" into a real zero —
 * a zero-equity account the sizer reports as untradeable, or a 0× exchange leverage the database
 * rejects outright. Empty stays null; anything outside the bounds is treated as unset rather than
 * clamped, because a value the user never chose should not become a value they appear to have.
 */
function nullableNumber(value, bounds = null) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  if (bounds && (n < bounds.min || n > bounds.max)) return null
  return n
}

/**
 * Coerce anything into a valid profile.
 *
 * Validated client-side *and* by the database constraints. This copy is for immediate feedback in
 * the sizer; the constraints are what actually guarantee the invariant.
 */
export function sanitizeRiskProfile(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_RISK_PROFILE }

  return {
    account_equity: nullableNumber(raw.account_equity),
    exchange_leverage: nullableNumber(raw.exchange_leverage, RISK_PROFILE_BOUNDS.exchange_leverage),
    risk_per_trade_pct: clamp(
      raw.risk_per_trade_pct,
      RISK_PROFILE_BOUNDS.risk_per_trade_pct,
      DEFAULT_RISK_PROFILE.risk_per_trade_pct,
    ),
    max_leverage: clamp(raw.max_leverage, RISK_PROFILE_BOUNDS.max_leverage, DEFAULT_RISK_PROFILE.max_leverage),
    ruin_tolerance_pct: clamp(
      raw.ruin_tolerance_pct,
      RISK_PROFILE_BOUNDS.ruin_tolerance_pct,
      DEFAULT_RISK_PROFILE.ruin_tolerance_pct,
    ),
    daily_loss_limit_r: Number(raw.daily_loss_limit_r) > 0
      ? Number(raw.daily_loss_limit_r)
      : DEFAULT_RISK_PROFILE.daily_loss_limit_r,
    max_open_r: Number(raw.max_open_r) > 0 ? Number(raw.max_open_r) : DEFAULT_RISK_PROFILE.max_open_r,
  }
}

export async function fetchRiskProfile() {
  if (!supabase) return { ...DEFAULT_RISK_PROFILE }

  const { data, error } = await supabase
    .from('risk_settings')
    .select(
      'account_equity, risk_per_trade_pct, max_leverage, exchange_leverage, ruin_tolerance_pct, daily_loss_limit_r, max_open_r',
    )
    .maybeSingle()

  if (error) throw new Error(error.message)
  return sanitizeRiskProfile(data)
}

export async function saveRiskProfile(profile) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) throw new Error('Not signed in.')

  const clean = sanitizeRiskProfile(profile)
  const { error } = await supabase
    .from('risk_settings')
    .upsert({ user_id: userId, ...clean, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

  if (error) throw new Error(error.message)
  return clean
}

/** Entry mid and stop from an AI trade plan, or nulls when the plan has no usable geometry. */
export function planLevels(aiAnalysis) {
  const plan = aiAnalysis?.trade_plan
  if (!plan || plan.bias === 'wait') return { side: null, entry: null, stop: null }

  const bounds = [plan.entry_zone?.low, plan.entry_zone?.high]
    .map((v) => (v === null || v === undefined ? Number.NaN : Number(v)))
    .filter((v) => Number.isFinite(v) && v > 0)

  const entry = bounds.length ? bounds.reduce((a, b) => a + b, 0) / bounds.length : null
  const stopRaw = plan.stop_loss === null || plan.stop_loss === undefined ? Number.NaN : Number(plan.stop_loss)

  return {
    side: plan.bias === 'long' || plan.bias === 'short' ? plan.bias : null,
    entry,
    stop: Number.isFinite(stopRaw) && stopRaw > 0 ? stopRaw : null,
  }
}
