# Pivot Points Architecture

## Source of truth

All pivot calculation logic lives in a single shared module:

```
supabase/functions/_shared/pivotPoints.ts
```

Both the **calculate-pivots** Supabase Edge Function and the **frontend fallback** import this module. The frontend uses a Vite alias (`@forge/pivot`) pointing at the same file.

## Serving path

```
Chart (App.jsx)
  → invokeFunction('calculate-pivots')   [primary]
  → buildPivotData() via @forge/pivot     [fallback if edge unavailable]
```

The Flask backend (`backend/app.py`) is **deprecated for serving**. It is not called by the frontend. The `/api/pivots` route has been removed.

## Base data: native Binance HTF klines

Pivots use **native higher-timeframe klines** from Binance, not aggregation of chart candles. This matches TradingView's "Use Daily-based Values" behavior.

| Pivot period | Binance interval |
|--------------|------------------|
| daily        | `1d`             |
| weekly       | `1w` (Monday 00:00 UTC) |
| monthly      | `1M`             |
| yearly       | `1M` aggregated into calendar years |

Fetch count is always `pivotsBack + 2`, independent of chart candle limit.

## Timeframe mapping (Auto)

When **Pivots Timeframe** is set to **Auto**:

| Chart interval | Pivot period |
|----------------|--------------|
| 1m – 15m       | Daily        |
| 30m – 12h      | Weekly       |
| 1d, 3d, 1w, 1M | Monthly      |

Users can override with: Daily | Weekly | Monthly | Yearly.

## Pivot types (formulas unchanged)

Traditional, Fibonacci, Woodie, Classic, DM (DeMark), Camarilla — verified against TradingView Pivot Points Standard.

## API response contract

The `calculate-pivots` response shape is stable for `ChartPanel.jsx` and AI analysis:

```json
{
  "success": true,
  "timeframe": "1d",
  "currentPrice": 65000,
  "pivotTimeframe": "auto",
  "classic": { "pivots": { "PP": ..., "R1": ... }, "analysis": { "zone": ..., "bias": ... } },
  "fibonacci": { ... },
  "traditional": { ... },
  "woodie": { ... },
  "dm": { ... },
  "camarilla": { ... },
  "binance": { ... },
  "standardPeriods": {
    "periodType": "monthly",
    "requestedCount": 15,
    "availableCount": 15,
    "items": [
      {
        "period": "...",
        "startTime": 1234567890,
        "endTime": 1234567890,
        "isCurrent": false,
        "sourcePeriod": "...",
        "pivots": { "PP": ..., "R1": ... }
      }
    ]
  }
}
```

Note: `binance` is a historical alias for **traditional** pivot levels, not Binance-sourced data.

## Preferences

Chart preferences (localStorage + Supabase `user_preferences`):

| Key | Description |
|-----|-------------|
| `pivotType` | traditional, fibonacci, woodie, classic, dm, camarilla |
| `pivotTimeframe` | auto, daily, weekly, monthly, yearly |
| `pivotsBack` | Number of historical pivot periods (clamped by 500-segment cap) |
| `showHistoricalPivots` | Show prior periods or current only |
| `showPivotLabels` | Show P / R1 / S1 labels on segments |
| `showPivotPrices` | Append price to segment labels |
| `pivotLabelsPosition` | `left` or `right` end of each segment |
| `pivotLineWidth` | Line width 1–4 (PP defaults to max(width, 2)) |
| `pivotLevelOptions` | Per-level `{ enabled, color }` for P, S1–S5, R1–R5 |

## Chart rendering (TradingView-equivalent)

`ChartPanel.jsx` renders standard pivots as follows:

1. **Period spans** — Historical segments run from period start to the next period start. The current period runs to the projected calendar end (`projectPivotPeriodEnd`).
2. **Whitespace** — Candlestick data appends `{ time }` whitespace bars through the current period end so lines can extend into future chart space.
3. **Historical lines + labels** — One `PivotSegmentsPrimitive` (canvas) draws all historical segments and all level labels/prices.
4. **Current period** — One `LineSeries` per enabled level with `lastValueVisible` for orange axis price tags; lines extend to projected period end.
5. **500-segment cap** — Never more than 500 period×level segments; `pivotsBack` is clamped via `maxPivotsBackForType`.
