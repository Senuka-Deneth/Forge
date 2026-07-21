# Graph Report - Forge  (2026-07-21)

## Corpus Check
- 92 files · ~83,469 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 618 nodes · 1163 edges · 42 communities (32 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `50ab47e0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.jsx
- pivotPoints.ts
- main.jsx
- package.json
- app.py
- ChartPanel.jsx
- Pivot Points Architecture
- openrouter_service.py
- PivotSegmentsPrimitive
- index.ts
- Forge — Prediction Accuracy Audit & Roadmap
- Forge — Plan Mode Prompts
- EducationPanel.jsx
- ChartPanelErrorBoundary
- education-app.js
- pivotPoints.test.js
- 20260519000000_auth_preferences_rls.sql
- education-data.js
- screenshot2.js
- vite.config.js
- 20260518000000_chart_bot_schema.sql
- __init__.py
- __init__.py
- DEFAULT_PRICE_SCALE_MARGINS
- marketStructure.test.js
- education-app.js
- education-data.js
- aiContext.ts
- index.ts
- marketStructure.ts
- main.jsx
- SignUp.jsx
- 20260722030000_user_preferences_db_validation.sql
- 20260722050000_trade_journal.sql
- 20260722040000_fill_aware_scoring.sql
- supabaseClient.js
- AnalysisPanel.jsx
- StatusBar.jsx

## God Nodes (most connected - your core abstractions)
1. `buildContextFromCandles()` - 28 edges
2. `ChartPanel()` - 18 edges
3. `enrichCandles()` - 18 edges
4. `App()` - 17 edges
5. `fetchWithTimeout()` - 16 edges
6. `buildPivotDataFromHtf()` - 14 edges
7. `normalizeModelOutput()` - 14 edges
8. `JournalPanel()` - 13 edges
9. `fetchBinanceKlines()` - 10 edges
10. `applyRegimeGating()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `createDefaultPivotLevelOptions()` --references--> `PIVOT_LEVEL_KEYS`  [EXTRACTED]
  frontend/src/utils/pivotChartPrefs.js → supabase/functions/_shared/pivotPoints.ts
- `sanitizePivotLevelOptions()` --references--> `PIVOT_LEVEL_KEYS`  [EXTRACTED]
  frontend/src/utils/pivotChartPrefs.js → supabase/functions/_shared/pivotPoints.ts
- `sanitizePreferences()` --calls--> `sanitizePivotTimeframe()`  [EXTRACTED]
  supabase/functions/user-preferences/index.ts → supabase/functions/_shared/pivotPoints.ts
- `fetchBinanceCandles()` --calls--> `computeSeriesIndicators()`  [EXTRACTED]
  frontend/src/App.jsx → frontend/src/utils/incrementalIndicators.js
- `fetchMarketCandles()` --calls--> `invokeFunction()`  [EXTRACTED]
  frontend/src/App.jsx → frontend/src/supabaseClient.js

## Import Cycles
- None detected.

## Communities (42 total, 10 thin omitted)

### Community 0 - "App.jsx"
Cohesion: 0.26
Nodes (12): calculateEMA(), calculateMACD(), calculateRSI(), computeMacdState(), computeRsiState(), computeSeriesIndicators(), extractClosedIndicatorState(), patchLastCandleIndicators() (+4 more)

### Community 1 - "pivotPoints.ts"
Cohesion: 0.08
Nodes (34): inflectionThreshold(), fetchBinanceHtfKlines(), parseBinanceKlines(), aggregateMonthlyToYearly(), ALLOWED_CHART_INTERVALS, AnalyzePivotsOptions, analyzePriceVsPivots(), buildPivotData() (+26 more)

### Community 2 - "main.jsx"
Cohesion: 0.24
Nodes (16): App(), applyTheme(), buildTechnicalAnalysis(), COMMON_QUOTES, fetchBinanceCandles(), fetchMarketCandles(), fetchPivotData(), hasCurrentPivotPeriod() (+8 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (25): eslint, @eslint/js, eslint-plugin-react, eslint-plugin-react-hooks, devDependencies, eslint, @eslint/js, eslint-plugin-react (+17 more)

### Community 4 - "app.py"
Cohesion: 0.07
Nodes (42): args, Bucket, buckets, closed, interval, outPath, step, summary (+34 more)

### Community 5 - "ChartPanel.jsx"
Cohesion: 0.14
Nodes (27): buildCandleDataWithWhitespace(), ChartPanel(), getCryptoIcon(), getCurrentPivotPeriodEnd(), getPivotTypeName(), POPULAR_PAIRS, subtractFiveMonths(), DARK (+19 more)

### Community 7 - "Pivot Points Architecture"
Cohesion: 0.20
Nodes (9): API response contract, Base data: native Binance HTF klines, Chart rendering (TradingView-equivalent), Pivot Points Architecture, Pivot types (formulas unchanged), Preferences, Serving path, Source of truth (+1 more)

### Community 8 - "openrouter_service.py"
Cohesion: 0.22
Nodes (15): buildMtfDepth(), computeVolumeProfile(), fetchFundingSignal(), fetchJson(), fetchOiHistory(), fetchTakerRatioSignal(), FundingSignal, gatherMarketFeatures() (+7 more)

### Community 9 - "PivotSegmentsPrimitive"
Cohesion: 0.14
Nodes (4): formatPivotPrice(), PivotSegmentsPaneRenderer, PivotSegmentsPaneView, PivotSegmentsPrimitive

### Community 10 - "index.ts"
Cohesion: 0.07
Nodes (46): attachEmpiricalConfidence(), fetchEmpiricalCalibration(), ScoredRow, ALLOWED_INTERVALS, isCandleArray(), readMarketCache(), AuthResult, getBearerToken() (+38 more)

### Community 11 - "Forge — Prediction Accuracy Audit & Roadmap"
Cohesion: 0.15
Nodes (12): 1. The core problem, stated plainly, 2. Current architecture (as built), 3. Why this can't be "very accurate" as built (the theory), 4. Roadmap, prioritized by leverage, 5. Immediate quick wins (no architecture change required), 6. Direct answers to your questions, Forge — Prediction Accuracy Audit & Roadmap, Tier 0 — Fix trust and measurement (do this before anything else) (+4 more)

### Community 12 - "Forge — Plan Mode Prompts"
Cohesion: 0.33
Nodes (5): Forge — Plan Mode Prompts, Prompt 1 — Consolidate pivot logic + TradingView calculation parity, Prompt 2 — TradingView-style pivot rendering clone (frontend), Prompt 3 — Indicator integrity: real divergence, adaptive thresholds, honest UI, Suggested order and why

### Community 13 - "EducationPanel.jsx"
Cohesion: 0.09
Nodes (23): dompurify, framer-motion, dependencies, dompurify, framer-motion, lightweight-charts, react, react-dom (+15 more)

### Community 14 - "ChartPanelErrorBoundary"
Cohesion: 0.09
Nodes (30): AtrResult, calculateATR(), OHLC, trueRangeSeries(), wilderSmooth(), calculateADX(), calculateATR(), calculateBollingerBands() (+22 more)

### Community 15 - "education-app.js"
Cohesion: 0.12
Nodes (19): bootScene(), canvas, fallback, nav, readProgress(), showFallback(), smoothstep(), supportsWebGL() (+11 more)

### Community 18 - "education-data.js"
Cohesion: 0.17
Nodes (11): 1. Supabase Setup, 2. Frontend Setup, Backend, 📸 Dashboard Overview, Forge 📊, Frontend, 🚀 Getting Started, ✨ Key Features (+3 more)

### Community 19 - "screenshot2.js"
Cohesion: 0.20
Nodes (9): name, private, scripts, backtest, build, dev, preview, test (+1 more)

### Community 23 - "__init__.py"
Cohesion: 0.40
Nodes (3): public.ai_analysis_cache, public.ai_analysis_logs, public.ai_rate_limit_events

### Community 25 - "marketStructure.test.js"
Cohesion: 0.83
Nodes (3): buildHighVolSeries(), buildLowVolSeries(), makeCandle()

### Community 26 - "education-app.js"
Cohesion: 0.26
Nodes (13): EMPTY_FORM, JournalPanel(), buildEntryFromAiPlan(), cancelJournalEntry(), closeJournalEntry(), computeJournalStats(), createJournalEntry(), deleteJournalEntry() (+5 more)

### Community 27 - "education-data.js"
Cohesion: 0.40
Nodes (4): AIAnalysisPanel(), colorMap, loadPositionCalcDefaults(), PositionSizeCalculator()

### Community 30 - "aiContext.ts"
Cohesion: 0.06
Nodes (60): buildContextFromCandles(), BuildContextOptions, clamp(), DAILY_PLUS_INTERVALS, divergenceToLegacy(), EMPTY_FUTURES, EMPTY_LIQUIDATION, EMPTY_ORDER_FLOW (+52 more)

### Community 31 - "index.ts"
Cohesion: 0.18
Nodes (17): asTradePlan(), LogRow, scoreRow(), fetchBinanceKlines(), constantTimeEqual(), digestSecret(), isCronSecretConfigured(), readCronSecret() (+9 more)

### Community 33 - "main.jsx"
Cohesion: 0.26
Nodes (10): ProtectedRoute(), PublicOnlyRoute(), AUTH_ROUTES, AuthContext, AuthProvider(), getPath(), isProtectedPath(), replacePath() (+2 more)

### Community 34 - "SignUp.jsx"
Cohesion: 0.35
Nodes (7): AuthShell(), GoogleIcon(), AuthCallback(), SignIn(), SignUp(), getFriendlyAuthError(), isValidEmail()

### Community 39 - "supabaseClient.js"
Cohesion: 0.31
Nodes (4): AccuracyPanel(), EdgeFunctionUnavailableError, invokeFunction(), isUnavailableFunctionError()

### Community 40 - "AnalysisPanel.jsx"
Cohesion: 0.70
Nodes (4): AnalysisPanel(), formatLevel(), formatSwingTime(), formatValue()

### Community 41 - "StatusBar.jsx"
Cohesion: 0.83
Nodes (3): formatPrice(), formatVolume(), StatusBar()

## Knowledge Gaps
- **155 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+150 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PIVOT_LEVEL_KEYS` connect `ChartPanel.jsx` to `pivotPoints.ts`?**
  _High betweenness centrality (0.331) - this node is a cross-community bridge._
- **Why does `ChartPanel()` connect `ChartPanel.jsx` to `main.jsx`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _155 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pivotPoints.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `app.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06704260651629072 - nodes in this community are weakly interconnected._
- **Should `ChartPanel.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13911290322580644 - nodes in this community are weakly interconnected._