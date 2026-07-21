import {
  PIVOT_LEVEL_KEYS,
  countPivotLevelsForType,
  maxPivotsBackForType,
} from '@forge/pivot'

export const STANDARD_PIVOT_COLOR = 'rgba(255, 159, 67, 0.92)'

export const PIVOT_LEVEL_LABELS = {
  PP: 'P',
  R1: 'R1',
  R2: 'R2',
  R3: 'R3',
  R4: 'R4',
  R5: 'R5',
  S1: 'S1',
  S2: 'S2',
  S3: 'S3',
  S4: 'S4',
  S5: 'S5',
}

export function createDefaultPivotLevelOptions() {
  const options = {}
  PIVOT_LEVEL_KEYS.forEach((level) => {
    options[level] = { enabled: true, color: STANDARD_PIVOT_COLOR }
  })
  return options
}

export const DEFAULT_PIVOT_CHART_PREFS = {
  showPivotLabels: true,
  showPivotPrices: true,
  pivotLabelsPosition: 'left',
  pivotLineWidth: 1,
  pivotLevelOptions: createDefaultPivotLevelOptions(),
}

export function getEnabledPivotLevels(pivotLevelOptions) {
  const opts = pivotLevelOptions ?? createDefaultPivotLevelOptions()
  return PIVOT_LEVEL_KEYS.filter((level) => opts[level]?.enabled !== false)
}

export function clampPivotsBack(pivotsBack, pivotType, pivotLevelOptions) {
  const enabledCount = getEnabledPivotLevels(pivotLevelOptions).length
    || countPivotLevelsForType(pivotType)
  const cap = maxPivotsBackForType(pivotType, enabledCount)
  return Math.max(1, Math.min(50, cap, Number(pivotsBack) || 15))
}

export function sanitizePivotLevelOptions(raw) {
  const defaults = createDefaultPivotLevelOptions()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults

  const sanitized = { ...defaults }
  PIVOT_LEVEL_KEYS.forEach((level) => {
    const entry = raw[level]
    if (!entry || typeof entry !== 'object') return
    sanitized[level] = {
      enabled: entry.enabled !== false,
      color: typeof entry.color === 'string' && entry.color.trim()
        ? entry.color.trim()
        : STANDARD_PIVOT_COLOR,
    }
  })
  return sanitized
}

export function sanitizePivotChartPrefs(payload = {}) {
  const labelsPosition = payload.pivotLabelsPosition === 'right' ? 'right' : 'left'
  const lineWidth = Math.max(1, Math.min(4, Number(payload.pivotLineWidth) || 1))
  const pivotLevelOptions = sanitizePivotLevelOptions(payload.pivotLevelOptions)
  const pivotType = String(payload.pivotType ?? 'traditional')

  return {
    showPivotLabels: payload.showPivotLabels !== false,
    showPivotPrices: payload.showPivotPrices !== false,
    pivotLabelsPosition: labelsPosition,
    pivotLineWidth: lineWidth,
    pivotLevelOptions,
    pivotsBack: clampPivotsBack(payload.pivotsBack, pivotType, pivotLevelOptions),
  }
}
