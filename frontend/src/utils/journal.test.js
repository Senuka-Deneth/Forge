import { describe, it, expect } from 'vitest'
import { computeJournalStats } from './journal.js'

describe('computeJournalStats', () => {
  it('computes decided win rate and expectancy', () => {
    const stats = computeJournalStats([
      { status: 'closed', side: 'long', pnl: 100, r_multiple: 2, entry: 100, size: 1, closed_at: '2026-01-01' },
      { status: 'closed', side: 'long', pnl: -50, r_multiple: -1, entry: 100, size: 1, closed_at: '2026-01-02' },
      { status: 'open', side: 'long', pnl: null, r_multiple: null, entry: 100, size: 1 },
    ])
    expect(stats.totalTrades).toBe(2)
    expect(stats.winRate).toBe(0.5)
    expect(stats.avgR).toBe(0.5)
    expect(stats.equityCurve).toHaveLength(2)
  })
})
