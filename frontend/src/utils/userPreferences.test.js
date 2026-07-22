import { describe, it, expect } from 'vitest'
import { DEFAULT_CHART_PREFERENCES, INDICATOR_PRESETS, sanitizePreferences } from './userPreferences'

/** Mirrors applyPreset in ChartPanel: clean base, then the preset's own keys. */
function applyPreset(prev, preset) {
  return { ...prev, ...INDICATOR_PRESETS.clean.apply, ...preset.apply }
}

const OVERLAY_KEYS = Object.keys(INDICATOR_PRESETS.clean.apply)

describe('chart preference defaults', () => {
  it('ships every extended overlay off so an existing chart is unchanged', () => {
    for (const key of OVERLAY_KEYS) {
      expect(DEFAULT_CHART_PREFERENCES[key]).toBe(false)
    }
  })

  it('round-trips new overlay flags through sanitizePreferences', () => {
    const sanitized = sanitizePreferences({
      ...DEFAULT_CHART_PREFERENCES,
      showIchimoku: true,
      showFvg: true,
      showVolumeProfile: true,
    })
    expect(sanitized.showIchimoku).toBe(true)
    expect(sanitized.showFvg).toBe(true)
    expect(sanitized.showVolumeProfile).toBe(true)
    expect(sanitized.showSupertrend).toBe(false)
  })

  it('coerces non-boolean overlay values rather than storing them raw', () => {
    const sanitized = sanitizePreferences({ showSqueeze: 'yes', showDonchian: 0 })
    expect(sanitized.showSqueeze).toBe(true)
    expect(sanitized.showDonchian).toBe(false)
  })
})

describe('indicator presets', () => {
  it('lands on the same state regardless of what was applied before', () => {
    const fromClean = applyPreset(DEFAULT_CHART_PREFERENCES, INDICATOR_PRESETS.trend)
    const fromLiquidity = applyPreset(
      applyPreset(DEFAULT_CHART_PREFERENCES, INDICATOR_PRESETS.liquidity),
      INDICATOR_PRESETS.trend,
    )

    for (const key of OVERLAY_KEYS) {
      expect(fromLiquidity[key]).toBe(fromClean[key])
    }
  })

  it('clean turns every overlay off', () => {
    const busy = { ...DEFAULT_CHART_PREFERENCES }
    for (const key of OVERLAY_KEYS) busy[key] = true

    const cleaned = applyPreset(busy, INDICATOR_PRESETS.clean)
    for (const key of OVERLAY_KEYS) {
      expect(cleaned[key]).toBe(false)
    }
  })

  it('clean names every key the other presets can enable, so nothing leaks between them', () => {
    const cleanKeys = new Set(Object.keys(INDICATOR_PRESETS.clean.apply))
    for (const [name, preset] of Object.entries(INDICATOR_PRESETS)) {
      if (name === 'clean') continue
      for (const key of Object.keys(preset.apply)) {
        expect(cleanKeys.has(key), `${name} sets "${key}" which clean does not reset`).toBe(true)
      }
    }
  })

  it('gives each preset a coherent identity', () => {
    const trend = applyPreset(DEFAULT_CHART_PREFERENCES, INDICATOR_PRESETS.trend)
    expect(trend.showSupertrend).toBe(true)
    expect(trend.showIchimoku).toBe(true)
    // A trend-following layout should not be carrying mean-reversion oscillators.
    expect(trend.showStochRsi).toBe(false)

    const meanReversion = applyPreset(DEFAULT_CHART_PREFERENCES, INDICATOR_PRESETS.meanReversion)
    expect(meanReversion.showAnchoredVwap).toBe(true)
    expect(meanReversion.showVwapBands).toBe(true)
    expect(meanReversion.showSupertrend).toBe(false)

    const liquidity = applyPreset(DEFAULT_CHART_PREFERENCES, INDICATOR_PRESETS.liquidity)
    expect(liquidity.showLiquidityPools).toBe(true)
    expect(liquidity.showSweeps).toBe(true)
    expect(liquidity.showFvg).toBe(true)
    expect(liquidity.showOrderBlocks).toBe(true)
  })
})
