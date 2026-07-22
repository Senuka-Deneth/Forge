import { afterEach, describe, expect, it, vi } from 'vitest'
import { UNCONSTRAINED_FILTERS } from '@forge/position-sizing'
import { clearSymbolFiltersCache, fetchSymbolFilters } from './symbolFilters'

/**
 * The contract that matters here is the failure path: the sizer must keep working when Binance
 * does not. A throw would blank the panel; unconstrained filters only cost rounding precision.
 */

const BTC_PAYLOAD = {
  symbols: [{
    symbol: 'BTCUSDT',
    filters: [
      { filterType: 'PRICE_FILTER', tickSize: '0.01000000' },
      { filterType: 'LOT_SIZE', stepSize: '0.00001000', minQty: '0.00001000', maxQty: '9000.00000000' },
      { filterType: 'NOTIONAL', minNotional: '5.00000000' },
    ],
  }],
}

function mockFetch(impl) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearSymbolFiltersCache()
})

describe('fetchSymbolFilters', () => {
  it('parses lot step, tick size and minimum notional', async () => {
    mockFetch(async () => ({ ok: true, json: async () => BTC_PAYLOAD }))

    const filters = await fetchSymbolFilters('BTCUSDT')
    expect(filters.stepSize).toBe(0.00001)
    expect(filters.tickSize).toBe(0.01)
    expect(filters.minQty).toBe(0.00001)
    expect(filters.maxQty).toBe(9000)
    expect(filters.minNotional).toBe(5)
  })

  it('uppercases the symbol and caches the result', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => BTC_PAYLOAD }))
    mockFetch(fetchSpy)

    await fetchSymbolFilters('btcusdt')
    await fetchSymbolFilters('BTCUSDT')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toContain('symbol=BTCUSDT')
  })

  it('falls back to unconstrained filters on a non-ok response', async () => {
    mockFetch(async () => ({ ok: false, json: async () => ({}) }))
    expect(await fetchSymbolFilters('BTCUSDT')).toEqual(UNCONSTRAINED_FILTERS)
  })

  it('falls back to unconstrained filters when the network throws', async () => {
    mockFetch(async () => { throw new Error('offline') })
    expect(await fetchSymbolFilters('BTCUSDT')).toEqual(UNCONSTRAINED_FILTERS)
  })

  it('falls back when the payload has no matching symbol', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ symbols: [] }) }))
    expect(await fetchSymbolFilters('BTCUSDT')).toEqual(UNCONSTRAINED_FILTERS)
  })

  it('does not cache a failure, so the next call retries', async () => {
    let calls = 0
    mockFetch(async () => {
      calls += 1
      if (calls === 1) throw new Error('offline')
      return { ok: true, json: async () => BTC_PAYLOAD }
    })

    expect(await fetchSymbolFilters('BTCUSDT')).toEqual(UNCONSTRAINED_FILTERS)
    expect((await fetchSymbolFilters('BTCUSDT')).stepSize).toBe(0.00001)
  })

  it('returns unconstrained filters without a network call for an empty symbol', async () => {
    const fetchSpy = vi.fn()
    mockFetch(fetchSpy)

    expect(await fetchSymbolFilters('')).toEqual(UNCONSTRAINED_FILTERS)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
