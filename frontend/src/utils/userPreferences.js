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
  ...DEFAULT_PIVOT_CHART_PREFS,
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
