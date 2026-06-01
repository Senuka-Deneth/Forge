import { supabase } from '../supabaseClient'

export const DEFAULT_CHART_PREFERENCES = {
  showCandles: true,
  showEma20: false,
  showEma50: false,
  showRsi: false,
  showMacd: false,
  showSupport: false,
  showResistance: false,
  showPivots: false,
  showStandardPivots: false,
  pivotType: 'traditional',
  pivotsBack: 15,
}

export function sanitizePreferences(payload) {
  const sanitized = { ...DEFAULT_CHART_PREFERENCES }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return sanitized

  Object.keys(DEFAULT_CHART_PREFERENCES).forEach((key) => {
    if (key in payload) {
      if (key === 'pivotType') {
        sanitized[key] = String(payload[key])
      } else if (key === 'pivotsBack') {
        sanitized[key] = Math.max(1, Math.min(50, Number(payload[key]) || 15))
      } else {
        sanitized[key] = Boolean(payload[key])
      }
    }
  })

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
