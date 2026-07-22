// Single source of truth for every JS-side chart color.
// lightweight-charts needs literal color strings, so these mirror the
// CSS custom properties in src/styles/tokens.css — keep both in sync.

const DARK = {
  layout: {
    background: 'hsl(220, 13%, 8%)',
    textColor: 'hsl(218, 8%, 58%)',
    paneSeparator: 'hsla(218, 20%, 60%, 0.10)',
    paneSeparatorHover: 'hsla(218, 20%, 60%, 0.22)',
  },
  border: 'hsla(218, 20%, 60%, 0.10)',
  grid: 'hsla(218, 20%, 60%, 0.05)',
  crosshair: {
    line: 'hsla(218, 15%, 60%, 0.35)',
    labelBg: 'hsl(220, 10%, 25%)',
  },
  candles: { up: 'hsl(152, 38%, 50%)', down: 'hsl(4, 56%, 58%)' },
  volume: { up: 'hsla(152, 38%, 50%, 0.35)', down: 'hsla(4, 56%, 58%, 0.35)' },
  ema20: 'hsl(215, 42%, 66%)',
  ema50: 'hsl(215, 18%, 45%)',
  supportLine: 'hsl(152, 38%, 50%)',
  resistanceLine: 'hsl(4, 56%, 58%)',
  rsi: 'hsl(215, 30%, 58%)',
  macd: {
    line: 'hsl(215, 42%, 66%)',
    signal: 'hsl(218, 10%, 52%)',
    histPos: 'hsla(152, 38%, 50%, 0.45)',
    histNeg: 'hsla(4, 56%, 58%, 0.45)',
  },
  paneLabel: 'hsl(218, 8%, 58%)',

  // Extended overlays. Deliberately desaturated against the EMA/candle palette above: these are
  // context layers, and a chart with twenty screaming colours is harder to read than one with six.
  keltner: 'hsla(38, 45%, 60%, 0.55)',
  donchian: 'hsla(280, 30%, 65%, 0.5)',
  supertrendUp: 'hsl(152, 38%, 50%)',
  supertrendDown: 'hsl(4, 56%, 58%)',
  chandelier: 'hsla(28, 55%, 58%, 0.7)',
  vwap: 'hsl(190, 45%, 58%)',
  vwapBand: 'hsla(190, 45%, 58%, 0.35)',
  ichimoku: {
    tenkan: 'hsl(200, 50%, 62%)',
    kijun: 'hsl(340, 35%, 60%)',
    cloudBull: 'hsla(152, 38%, 50%, 0.12)',
    cloudBear: 'hsla(4, 56%, 58%, 0.12)',
  },
  stochRsi: { k: 'hsl(215, 42%, 66%)', d: 'hsl(28, 45%, 60%)' },
  squeeze: {
    on: 'hsl(4, 56%, 58%)',
    off: 'hsl(152, 38%, 50%)',
    momentumPos: 'hsla(152, 38%, 50%, 0.55)',
    momentumNeg: 'hsla(4, 56%, 58%, 0.55)',
  },
  zones: {
    fvgBullFill: 'hsla(152, 38%, 50%, 0.22)',
    fvgBullBorder: 'hsla(152, 38%, 50%, 0.5)',
    fvgBearFill: 'hsla(4, 56%, 58%, 0.22)',
    fvgBearBorder: 'hsla(4, 56%, 58%, 0.5)',
    obBullFill: 'hsla(200, 45%, 55%, 0.20)',
    obBullBorder: 'hsla(200, 45%, 55%, 0.5)',
    obBearFill: 'hsla(280, 35%, 60%, 0.20)',
    obBearBorder: 'hsla(280, 35%, 60%, 0.5)',
  },
  volumeProfile: {
    poc: 'hsl(38, 60%, 60%)',
    valueArea: 'hsl(215, 30%, 58%)',
    outside: 'hsl(218, 10%, 45%)',
  },
}

const LIGHT = {
  layout: {
    background: 'hsl(0, 0%, 100%)',
    textColor: 'hsl(219, 10%, 45%)',
    paneSeparator: 'hsla(220, 25%, 20%, 0.10)',
    paneSeparatorHover: 'hsla(220, 25%, 20%, 0.22)',
  },
  border: 'hsla(220, 25%, 20%, 0.10)',
  grid: 'hsla(220, 25%, 20%, 0.05)',
  crosshair: {
    line: 'hsla(220, 20%, 30%, 0.3)',
    labelBg: 'hsl(220, 12%, 40%)',
  },
  candles: { up: 'hsl(152, 45%, 36%)', down: 'hsl(4, 55%, 48%)' },
  volume: { up: 'hsla(152, 45%, 36%, 0.35)', down: 'hsla(4, 55%, 48%, 0.35)' },
  ema20: 'hsl(215, 40%, 46%)',
  ema50: 'hsl(217, 14%, 62%)',
  supportLine: 'hsl(152, 45%, 36%)',
  resistanceLine: 'hsl(4, 55%, 48%)',
  rsi: 'hsl(215, 32%, 40%)',
  macd: {
    line: 'hsl(215, 40%, 46%)',
    signal: 'hsl(219, 10%, 55%)',
    histPos: 'hsla(152, 45%, 36%, 0.45)',
    histNeg: 'hsla(4, 55%, 48%, 0.45)',
  },
  paneLabel: 'hsl(219, 10%, 45%)',

  // Light-mode counterparts: same hues, darkened for contrast on a white background.
  keltner: 'hsla(38, 50%, 42%, 0.6)',
  donchian: 'hsla(280, 32%, 48%, 0.55)',
  supertrendUp: 'hsl(152, 45%, 36%)',
  supertrendDown: 'hsl(4, 55%, 48%)',
  chandelier: 'hsla(28, 60%, 42%, 0.75)',
  vwap: 'hsl(190, 50%, 38%)',
  vwapBand: 'hsla(190, 50%, 38%, 0.35)',
  ichimoku: {
    tenkan: 'hsl(200, 55%, 42%)',
    kijun: 'hsl(340, 40%, 45%)',
    cloudBull: 'hsla(152, 45%, 36%, 0.12)',
    cloudBear: 'hsla(4, 55%, 48%, 0.12)',
  },
  stochRsi: { k: 'hsl(215, 40%, 46%)', d: 'hsl(28, 50%, 42%)' },
  squeeze: {
    on: 'hsl(4, 55%, 48%)',
    off: 'hsl(152, 45%, 36%)',
    momentumPos: 'hsla(152, 45%, 36%, 0.55)',
    momentumNeg: 'hsla(4, 55%, 48%, 0.55)',
  },
  zones: {
    fvgBullFill: 'hsla(152, 45%, 36%, 0.20)',
    fvgBullBorder: 'hsla(152, 45%, 36%, 0.5)',
    fvgBearFill: 'hsla(4, 55%, 48%, 0.20)',
    fvgBearBorder: 'hsla(4, 55%, 48%, 0.5)',
    obBullFill: 'hsla(200, 50%, 42%, 0.18)',
    obBullBorder: 'hsla(200, 50%, 42%, 0.5)',
    obBearFill: 'hsla(280, 32%, 48%, 0.18)',
    obBearBorder: 'hsla(280, 32%, 48%, 0.5)',
  },
  volumeProfile: {
    poc: 'hsl(38, 65%, 42%)',
    valueArea: 'hsl(215, 32%, 40%)',
    outside: 'hsl(219, 10%, 60%)',
  },
}

export function getChartTheme(theme) {
  return theme === 'light' ? LIGHT : DARK
}

export function getCurrentChartTheme() {
  return getChartTheme(document.body.getAttribute('data-theme') || 'dark')
}
