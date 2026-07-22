import { parseSymbolFilters, UNCONSTRAINED_FILTERS } from '@forge/position-sizing'

/**
 * Exchange trading rules for one symbol, for the position sizer.
 *
 * Without these the sizer returns a mathematically correct quantity that the exchange rejects —
 * 0.00042317 BTC when the lot step is 0.00001, or a $3 order under a $5 minimum notional. That is
 * the least useful kind of correct.
 *
 * This duplicates `fetchSymbolFilters` in `_shared/binance.ts` rather than importing it, because
 * that module reaches for Deno globals and the network helper and is deliberately excluded from the
 * `@forge/*` alias list in vite.config.js. Only the *parsing* is shared, via `parseSymbolFilters`,
 * which is pure — so the two paths cannot disagree about what a filter payload means.
 *
 * Talking to Binance directly from the browser follows what the app already does for klines
 * (App.jsx) and 24h tickers (ChartPanel.jsx); market data here is public and unauthenticated.
 */

const EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo'

/** Filters are a listing-level property, not a market one — they change rarely. */
const TTL_MS = 60 * 60 * 1000

const cache = new Map()

/** Exported for tests, which must not inherit a previous case's cached payload. */
export function clearSymbolFiltersCache() {
  cache.clear()
}

/**
 * Fetch and parse the exchange filters for `symbol`.
 *
 * Never rejects and never throws. Every failure path returns `UNCONSTRAINED_FILTERS`, which the
 * sizer treats as "no rounding, no minimums" — so a Binance outage degrades the precision of the
 * quantity rather than taking the sizer down with it. Failures are not cached, so the next render
 * retries.
 */
export async function fetchSymbolFilters(symbol) {
  const key = String(symbol || '').toUpperCase()
  if (!key) return UNCONSTRAINED_FILTERS

  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  try {
    const response = await fetch(`${EXCHANGE_INFO_URL}?symbol=${encodeURIComponent(key)}`)
    if (!response.ok) return UNCONSTRAINED_FILTERS

    const data = await response.json()
    const entry = Array.isArray(data?.symbols) ? data.symbols[0] : null
    if (!entry) return UNCONSTRAINED_FILTERS

    const parsed = parseSymbolFilters(entry.filters)
    cache.set(key, { value: parsed, expiresAt: Date.now() + TTL_MS })
    return parsed
  } catch {
    return UNCONSTRAINED_FILTERS
  }
}
