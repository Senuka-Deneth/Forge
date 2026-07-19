# Forge — Plan Mode Prompts

Run these one at a time, in order. Each prompt is self-contained: paste it into a new plan-mode session. Prompt 1 must land first — Prompts 2 and 3 build on the consolidated module it creates.

---

## Prompt 1 — Consolidate pivot logic + TradingView calculation parity

```
CONTEXT
The Forge repo has the same pivot-point logic duplicated in three places:
- backend/app.py + backend/utils/pivotPoints.py (Flask — not called by the frontend)
- supabase/functions/calculate-pivots/index.ts (live serving path)
- frontend/src/utils/pivotPoints.js (client-side duplicate)
They have already drifted (period end-time semantics differ between the Python and JS versions).
The six pivot formulas (Traditional, Fibonacci, Woodie, Classic, DM, Camarilla) are correct —
verified against TradingView's Pivot Points Standard docs. Do NOT change the formulas.

GOAL
One source of truth for pivot calculation, with TradingView-parity behavior.

REQUIREMENTS
1. Consolidate: keep ONE implementation as the source of truth (a shared TypeScript module used
   by both the calculate-pivots edge function and the frontend). Delete or quarantine the other
   copies. Decide and document where the Flask backend fits (recommend: mark deprecated for
   serving; it is not called by the frontend).
2. Fix the Auto pivot-timeframe mapping to match TradingView exactly:
   - chart interval <= 15m  -> Daily pivots
   - > 15m and < 1d         -> Weekly pivots
   - >= 1d                  -> Monthly pivots
   Current wrong mappings to fix: 30m/1h/2h currently get daily (should be weekly);
   1w currently gets quarterly (should be monthly); 1M chart currently falls through
   to daily (should be monthly).
3. Add a user-selectable "Pivots Timeframe" setting: Auto | Daily | Weekly | Monthly | Yearly
   (Auto = the mapping above). Persist it in chart preferences alongside pivotType/pivotsBack.
4. Fetch pivot base data as native higher-timeframe klines from Binance (interval=1d/1w/1M)
   instead of aggregating chart candles. This is TradingView's "Use Daily-based Values"
   behavior and eliminates two current bugs:
   a) partial first bucket (history starting mid-period produces a wrong high/low, which
      corrupts the next period's pivots),
   b) not enough chart candles to cover pivotsBack periods (default fetch is 300 candles;
      15 monthly pivots on a 1D chart needs ~480+).
   Weekly buckets must remain Monday 00:00 UTC anchored; verify Binance 1w klines match.
5. Guarantee pivotsBack periods are always available: derive the HTF kline fetch count from
   pivotsBack + 2, independent of the chart candle fetch.
6. Fix the NaN bug in frontend analyzePriceVsPivots: for pivot types with missing levels
   (DM has only P/R1/S1; Fibonacci has no R4/R5), Number(undefined) = NaN makes every zone
   comparison false and price below S1 is misclassified as below_S3. Port the None-safe
   zone logic from the Python version.
7. Keep the API response shape backward-compatible with what ChartPanel.jsx and the
   AI-analysis payload builder consume (standardPeriods.items with startTime/endTime/
   isCurrent/pivots), or update all consumers in the same change.

ACCEPTANCE
- For BTCUSDT on 1D chart, pivots match TradingView's "Pivots Traditional Auto 15" values
  (spot-check P/R1/S1 for the current and previous month against TradingView).
- 30m and 1h charts now show weekly pivots.
- Requesting 15 pivots back on any interval renders exactly 15 historical sets.
- DM pivot zone classification is correct above R1 and below S1.
- grep confirms a single pivot calculation implementation is referenced by serving code.
```

---

## Prompt 2 — TradingView-style pivot rendering clone (frontend)

```
CONTEXT
Forge renders pivots in frontend/src/components/ChartPanel.jsx using lightweight-charts v5.
Each period+level is already drawn as its own LineSeries segment (correct basic approach).
The target look is TradingView's Pivot Points Standard indicator (reference: user screenshot
of TradingView on a 1D BTCUSDT chart with "Pivots Traditional Auto 15").
Depends on Prompt 1 (consolidated pivot module + pivots timeframe setting) being done.

CURRENT GAPS VS TRADINGVIEW
1. Current-period lines stop at the last candle. TradingView extends them to the projected
   END of the current period (into future whitespace to the right of the last bar).
2. Level labels are faked with size-0 circle markers (createSeriesMarkers). No price text,
   imprecise placement.
3. Every level is the same hardcoded orange, width 1 (PP width 2).
4. No TradingView-equivalent settings: show/hide labels, show/hide prices, label position
   left/right, per-level enable + color, line width.

REQUIREMENTS
1. Extend current-period pivot lines to the period's projected end time. In lightweight-charts,
   append whitespace data points to the main candle series (or use the series' timeScale
   whitespace mechanism) so time slots exist beyond the last candle, then draw the current
   pivot segments out to period end. Historical segments keep spanning exactly their own period
   (start of period to start of next period).
2. Replace the marker hack with a proper text rendering approach: a lightweight-charts custom
   series primitive (v5 supports primitives with custom painting) that draws "P", "R1"... and
   optionally the price at the configured end of each segment. Fallback if primitives are too
   heavy: absolutely-positioned HTML overlay synced to chart coordinates via
   series.priceToCoordinate + timeScale.timeToCoordinate, re-rendered on visible-range change.
   Pick one and justify.
3. Settings popover (extend the existing pivot settings UI) with TradingView-equivalent inputs:
   - Pivot type (exists), Pivots Timeframe (from Prompt 1), Number of pivots back (exists)
   - Show labels (bool), Show prices (bool), Labels position (left | right)
   - Per-level toggle + color for P, S1-S5, R1-R5, line width
   Persist all of it in chart preferences (same persistence path as pivotType/pivotsBack).
4. Respect TradingView's cap: never draw more than 500 line segments total; clamp pivotsBack
   accordingly given the active pivot type's level count.
5. Current-period levels keep their price labels on the right price axis (lastValueVisible),
   matching the screenshot's orange axis labels.
6. Performance: creating one LineSeries per period+level (up to ~165 series at 15 periods x 11
   levels) is heavy. Evaluate replacing per-level series with ONE custom series primitive that
   paints all segments, or at minimum batch series creation/removal. Measure re-render cost
   when toggling settings before and after.

ACCEPTANCE
- Side-by-side with TradingView (same symbol/interval/type/count), the layout is visually
  equivalent: per-period blocks, labels with prices, current period extending to period end.
- Toggling "Show historical pivots" off leaves only the current period, extended to the right.
- No console errors from identical-time data points; no orphaned series after settings changes
  (verify by toggling repeatedly and inspecting chart.serieses count or memory).
```

---

## Prompt 3 — Indicator integrity: real divergence, adaptive thresholds, honest UI

```
CONTEXT
Forge's core indicator math is verified correct (EMA SMA-seeded, RSI Wilder-smoothed,
MACD 12/26/9 with compacted signal EMA, all six pivot formulas match TradingView docs).
The problems are in the analysis layer built on top of them.

ISSUES TO FIX
1. RSI divergence is hardcoded to "none" in the deterministic fallback, yet the UI renders
   "RSI Divergence" as if it were computed. Implement real divergence detection:
   - Find local RSI peaks/troughs and price peaks/troughs over a lookback window (use the
     existing swing detection as a base, but on both series).
   - Bearish divergence: price makes higher high while RSI makes lower high.
     Bullish divergence: price makes lower low while RSI makes higher low.
   - Require minimum peak separation (e.g. >= 5 bars) and minimum RSI delta to avoid noise.
2. The pivot "inflection point" proximity threshold is a fixed 0.3% of price. Make it
   volatility-adaptive: compute ATR(14) on the chart timeframe and use k * ATR / price
   (start k = 0.5) as the threshold. A fixed % is simultaneously too tight for a low-vol
   asset and too loose for a high-vol one.
3. Swing high/low detection is a 2-bar fractal with no filters, producing noise-level swings.
   Upgrade: keep the fractal as candidate generation, then filter candidates by minimum
   prominence (>= 1 ATR from the surrounding bars) and cluster nearby levels
   (within 0.5 ATR) into zones weighted by touch count and recency. Nearest support/
   resistance should come from these zones, not single raw swing ticks.
4. Honest UI: the AI panel shows a fake "Validating signal consistency..." step that is a
   timed loading animation, not a computation. Either remove the fake step labels or make
   them reflect actual pipeline stages. Also label the deterministic-fallback analysis
   distinctly in the UI (the _meta.source field already distinguishes openrouter vs
   local-fallback — surface it) so a user knows when the LLM was not involved.
5. The AI confidence number is either LLM-guessed or a hardcoded 55+bonuses formula. Until a
   calibrated model exists, rename it in the UI to "signal agreement" or similar and derive
   it deterministically from indicator confluence only (document the formula in code).
   Do not present it as a probability.

CONSTRAINTS
- Implement divergence/ATR/zone logic once, in the same consolidated module family as the
  pivot logic from the earlier consolidation prompt (shared between edge function and
  frontend) — do not create new duplicated copies in Python, TS, and JS.
- Keep the ai-analysis payload schema backward compatible; add fields (atr, divergence,
  srZones) rather than renaming existing ones.

ACCEPTANCE
- Unit tests: divergence detection on synthetic series (known HH/LH RSI pattern -> bearish),
  ATR threshold scales with synthetic volatility, zone clustering merges levels within
  0.5 ATR and ranks by touches.
- UI shows real divergence states and no fabricated pipeline steps.
- Fallback analyses are visibly labeled as deterministic (non-AI) in the panel.
```

---

## Suggested order and why

1 → 2 → 3. Prompt 1 kills the three-way logic drift and fixes the data layer (mapping, history depth, partial buckets) — rendering a wrong number beautifully is worse than rendering it plainly. Prompt 2 is the visual clone you asked for and needs Prompt 1's timeframe setting. Prompt 3 fixes the analysis layer and the honesty issues, and depends on the shared-module structure from Prompt 1.
