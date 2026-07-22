import { supabase } from '../supabaseClient'
import { sanitizePivotTimeframe } from '@forge/pivot'
import {
  DEFAULT_PIVOT_CHART_PREFS,
  sanitizePivotChartPrefs,
} from './pivotChartPrefs'

export const DEFAULT_CHART_PREFERENCES = {
  showCandles: true,
  showEma20: false,
  showEma50: false,
  showRsi: false,
  showMacd: false,
  showSupport: false,
  showResistance: false,
  showStandardPivots: false,
  showHistoricalPivots: true,
  pivotType: 'traditional',
  pivotTimeframe: 'auto',
  pivotsBack: 15,

  // Extended overlays (Phase 3 chart parity). All default off so an existing user's chart looks
  // exactly as they left it; sanitizePreferences coerces unknown keys to booleans, so these
  // round-trip through the user-preferences function without any server-side change.
  showKeltner: false,
  showSqueeze: false,
  showStochRsi: false,
  showSupertrend: false,
  showChandelier: false,
  showDonchian: false,
  showIchimoku: false,
  showAnchoredVwap: false,
  showVwapBands: false,
  showFvg: false,
  showOrderBlocks: false,
  showVolumeProfile: false,
  showLiquidityPools: false,
  showSweeps: false,
  showConfluence: false,

  ...DEFAULT_PIVOT_CHART_PREFS,
}

/**
 * Named bundles for the indicator modal.
 *
 * Twenty individual toggles is a worse experience than four intentions. Each preset flips a
 * coherent set for one way of reading the market, rather than leaving the user to guess which
 * combinations belong together.
 */
export const INDICATOR_PRESETS = {
  // `clean` doubles as the base every other preset is applied on top of (see applyPreset), so it
  // must name every toggle a preset could turn on — anything omitted here would leak between
  // presets.
  clean: {
    label: 'Clean',
    description: 'Price and pivots only',
    apply: {
      showEma20: false, showEma50: false, showRsi: false, showMacd: false,
      showKeltner: false, showSqueeze: false, showStochRsi: false, showSupertrend: false,
      showChandelier: false, showDonchian: false, showIchimoku: false, showAnchoredVwap: false,
      showVwapBands: false, showFvg: false, showOrderBlocks: false, showVolumeProfile: false,
      showLiquidityPools: false, showSweeps: false, showConfluence: false, showSupport: false, showResistance: false,
    },
  },
  trend: {
    label: 'Trend following',
    description: 'EMAs, Supertrend, Ichimoku, Donchian, ADX-style context',
    apply: {
      showEma20: true, showEma50: true, showSupertrend: true, showIchimoku: true,
      showDonchian: true, showChandelier: true, showMacd: true,
      showStochRsi: false, showFvg: false, showOrderBlocks: false, showVolumeProfile: false,
    },
  },
  meanReversion: {
    label: 'Mean reversion',
    description: 'Anchored VWAP bands, Keltner, StochRSI, volume profile',
    apply: {
      showAnchoredVwap: true, showVwapBands: true, showKeltner: true, showStochRsi: true,
      showVolumeProfile: true, showRsi: true,
      showSupertrend: false, showIchimoku: false, showDonchian: false, showMacd: false,
    },
  },
  liquidity: {
    label: 'Liquidity hunting',
    description: 'Stop pools, sweeps, fair value gaps, order blocks',
    apply: {
      showLiquidityPools: true, showSweeps: true, showFvg: true, showOrderBlocks: true,
      showVolumeProfile: true, showSupport: true, showResistance: true,
      showIchimoku: false, showKeltner: false, showDonchian: false,
    },
  },
}

export function sanitizePreferences(payload) {
  const sanitized = { ...DEFAULT_CHART_PREFERENCES }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return sanitized

  Object.keys(DEFAULT_CHART_PREFERENCES).forEach((key) => {
    if (!(key in payload)) return
    if (key === 'pivotType') {
      sanitized[key] = String(payload[key])
    } else if (key === 'pivotTimeframe') {
      sanitized[key] = sanitizePivotTimeframe(payload[key])
    } else if (key === 'pivotsBack') {
      sanitized[key] = sanitizePivotChartPrefs({
        ...payload,
        pivotType: payload.pivotType ?? sanitized.pivotType,
      }).pivotsBack
    } else if (key === 'pivotLabelsPosition') {
      sanitized[key] = payload[key] === 'right' ? 'right' : 'left'
    } else if (key === 'pivotLineWidth') {
      sanitized[key] = Math.max(1, Math.min(4, Number(payload[key]) || 1))
    } else if (key === 'pivotLevelOptions') {
      sanitized[key] = sanitizePivotChartPrefs(payload).pivotLevelOptions
    } else if (key === 'showPivotLabels' || key === 'showPivotPrices') {
      sanitized[key] = Boolean(payload[key])
    } else {
      sanitized[key] = Boolean(payload[key])
    }
  })

  const pivotSanitized = sanitizePivotChartPrefs({
    ...sanitized,
    ...payload,
    pivotType: sanitized.pivotType,
    pivotLevelOptions: sanitized.pivotLevelOptions,
    pivotsBack: sanitized.pivotsBack,
  })
  sanitized.showPivotLabels = pivotSanitized.showPivotLabels
  sanitized.showPivotPrices = pivotSanitized.showPivotPrices
  sanitized.pivotLabelsPosition = pivotSanitized.pivotLabelsPosition
  sanitized.pivotLineWidth = pivotSanitized.pivotLineWidth
  sanitized.pivotLevelOptions = pivotSanitized.pivotLevelOptions
  sanitized.pivotsBack = pivotSanitized.pivotsBack

  return sanitized
}

export async function ensureUserPreferences(userId, preferences = DEFAULT_CHART_PREFERENCES) {
  if (!supabase || !userId) return null

  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        preferences: sanitizePreferences(preferences),
      },
      { onConflict: 'user_id' },
    )
    .select('preferences')
    .single()

  if (error) throw error
  return data
}
