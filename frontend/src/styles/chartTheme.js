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
}

export function getChartTheme(theme) {
  return theme === 'light' ? LIGHT : DARK
}

export function getCurrentChartTheme() {
  return getChartTheme(document.body.getAttribute('data-theme') || 'dark')
}
