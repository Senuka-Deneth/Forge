import { supabase } from '../supabaseClient'

export function buildEntryFromAiPlan(symbol, aiAnalysis) {
  const plan = aiAnalysis?.trade_plan
  if (!plan || plan.bias === 'wait') return null

  const side = plan.bias === 'long' || plan.bias === 'short' ? plan.bias : null
  if (!side) return null

  const low = plan.entry_zone?.low
  const high = plan.entry_zone?.high
  let entry = null
  if (low != null && high != null) entry = (Number(low) + Number(high)) / 2
  else if (low != null) entry = Number(low)
  else if (high != null) entry = Number(high)

  if (!Number.isFinite(entry) || entry <= 0) return null

  const stop = plan.stop_loss != null ? Number(plan.stop_loss) : null
  const target = plan.targets?.[0]?.price != null ? Number(plan.targets[0].price) : null

  return {
    symbol: String(symbol || '').trim().toUpperCase(),
    side,
    entry,
    stop: Number.isFinite(stop) && stop > 0 ? stop : null,
    target: Number.isFinite(target) && target > 0 ? target : null,
    analysis_id: aiAnalysis?._meta?.analysis_id ?? null,
    notes: plan.rationale ? String(plan.rationale).slice(0, 4000) : '',
  }
}

export async function fetchJournalEntries() {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase
    .from('trade_journal')
    .select('*')
    .order('opened_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createJournalEntry(entry) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const payload = {
    symbol: entry.symbol,
    side: entry.side,
    status: 'open',
    entry: entry.entry,
    size: entry.size,
    stop: entry.stop ?? null,
    target: entry.target ?? null,
    fees: entry.fees ?? 0,
    notes: entry.notes ?? null,
    analysis_id: entry.analysis_id ?? null,
  }

  const { data, error } = await supabase
    .from('trade_journal')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function closeJournalEntry(id, exitPrice, fees = 0) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase
    .from('trade_journal')
    .update({
      status: 'closed',
      exit_price: exitPrice,
      closed_at: new Date().toISOString(),
      fees,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function cancelJournalEntry(id) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase
    .from('trade_journal')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function deleteJournalEntry(id) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase
    .from('trade_journal')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function fetchJournalAnalysisOutcomes(journalIds) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!journalIds?.length) return []

  const { data, error } = await supabase.rpc('get_journal_analysis_outcomes', {
    journal_ids: journalIds,
  })

  if (error) throw new Error(error.message)
  return data ?? []
}

export function computeJournalStats(entries) {
  const decided = entries.filter((entry) => entry.status === 'closed' && entry.pnl != null)
  const wins = decided.filter((entry) => entry.pnl > 0)
  const losses = decided.filter((entry) => entry.pnl <= 0)

  const winRate = decided.length ? wins.length / decided.length : null

  const rValues = decided.map((entry) => entry.r_multiple).filter((value) => value != null)
  const avgR = rValues.length
    ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length
    : null

  const avgWin = wins.length
    ? wins.reduce((sum, entry) => sum + entry.pnl, 0) / wins.length
    : 0
  const avgLoss = losses.length
    ? Math.abs(losses.reduce((sum, entry) => sum + entry.pnl, 0) / losses.length)
    : 0
  const winPct = decided.length ? wins.length / decided.length : 0
  const lossPct = decided.length ? losses.length / decided.length : 0
  const expectancy = decided.length ? (avgWin * winPct) - (avgLoss * lossPct) : null

  const sorted = [...decided].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at))
  let cumulativeR = 0
  const equityCurve = sorted.map((entry) => {
    cumulativeR += entry.r_multiple ?? 0
    return {
      id: entry.id,
      closedAt: entry.closed_at,
      rMultiple: entry.r_multiple,
      cumulativeR,
    }
  })

  return {
    totalTrades: decided.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgR,
    expectancy,
    equityCurve,
  }
}

export function formatJournalPrice(value) {
  if (value == null) return '—'
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
}

export function formatJournalPct(value) {
  if (value == null) return '—'
  return `${(value * 100).toFixed(1)}%`
}

export function formatJournalR(value) {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${Number(value).toFixed(2)}R`
}
