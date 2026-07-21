# Graph Report - Forge  (2026-07-21)

## Corpus Check
- 80 files · ~81,451 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 559 nodes · 1027 edges · 30 communities (22 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `07b2fffa`
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

## God Nodes (most connected - your core abstractions)
1. `buildContextFromCandles()` - 24 edges
2. `App()` - 19 edges
3. `ChartPanel()` - 18 edges
4. `enrichCandles()` - 18 edges
5. `buildPivotDataFromHtf()` - 14 edges
6. `normalizeModelOutput()` - 14 edges
7. `fetchWithTimeout()` - 12 edges
8. `fetchBinanceKlines()` - 10 edges
9. `applyRegimeGating()` - 10 edges
10. `PivotSegmentsPrimitive` - 9 edges

## Surprising Connections (you probably didn't know these)
- `createDefaultPivotLevelOptions()` --references--> `PIVOT_LEVEL_KEYS`  [EXTRACTED]
  frontend/src/utils/pivotChartPrefs.js → supabase/functions/_shared/pivotPoints.ts
- `sanitizePivotLevelOptions()` --references--> `PIVOT_LEVEL_KEYS`  [EXTRACTED]
  frontend/src/utils/pivotChartPrefs.js → supabase/functions/_shared/pivotPoints.ts
- `App()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/App.jsx → frontend/src/hooks/useAuth.js
- `sanitizePreferences()` --calls--> `sanitizePivotChartPrefs()`  [EXTRACTED]
  frontend/src/utils/userPreferences.js → frontend/src/utils/pivotChartPrefs.js
- `buildContextFromCandles()` --calls--> `sliceClosedCandles()`  [EXTRACTED]
  supabase/functions/_shared/aiContext.ts → supabase/functions/_shared/candles.ts

## Import Cycles
- None detected.

## Communities (30 total, 8 thin omitted)

### Community 0 - "App.jsx"
Cohesion: 0.06
Nodes (44): App(), applyTheme(), buildTechnicalAnalysis(), calculateEMA(), calculateMACD(), calculateRSI(), ChartPanelErrorBoundary, COMMON_QUOTES (+36 more)

### Community 1 - "pivotPoints.ts"
Cohesion: 0.05
Nodes (53): AtrResult, buildMarketStructure(), calculateATR(), clamp(), clusterIntoZones(), computeSignalAgreement(), derivePrimaryTrend(), detectRsiDivergence() (+45 more)

### Community 2 - "main.jsx"
Cohesion: 0.17
Nodes (17): AuthShell(), GoogleIcon(), ProtectedRoute(), PublicOnlyRoute(), AUTH_ROUTES, AuthContext, AuthProvider(), getPath() (+9 more)

### Community 3 - "package.json"
Cohesion: 0.05
Nodes (38): eslint, @eslint/js, eslint-plugin-react, eslint-plugin-react-hooks, framer-motion, dependencies, framer-motion, lightweight-charts (+30 more)

### Community 4 - "app.py"
Cohesion: 0.06
Nodes (47): args, Bucket, buckets, closed, interval, outPath, step, summary (+39 more)

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
Nodes (46): fetchEmpiricalCalibration(), ScoredRow, asTradePlan(), LogRow, scoreRow(), AuthResult, getBearerToken(), requireAuthenticatedUser() (+38 more)

### Community 11 - "Forge — Prediction Accuracy Audit & Roadmap"
Cohesion: 0.15
Nodes (12): 1. The core problem, stated plainly, 2. Current architecture (as built), 3. Why this can't be "very accurate" as built (the theory), 4. Roadmap, prioritized by leverage, 5. Immediate quick wins (no architecture change required), 6. Direct answers to your questions, Forge — Prediction Accuracy Audit & Roadmap, Tier 0 — Fix trust and measurement (do this before anything else) (+4 more)

### Community 12 - "Forge — Plan Mode Prompts"
Cohesion: 0.33
Nodes (5): Forge — Plan Mode Prompts, Prompt 1 — Consolidate pivot logic + TradingView calculation parity, Prompt 2 — TradingView-style pivot rendering clone (frontend), Prompt 3 — Indicator integrity: real divergence, adaptive thresholds, honest UI, Suggested order and why

### Community 13 - "EducationPanel.jsx"
Cohesion: 0.26
Nodes (8): EducationIcon(), getIcon(), ICONS, iconStyle, EducationPanel(), educationData, ICONS, resolveIconId()

### Community 14 - "ChartPanelErrorBoundary"
Cohesion: 0.06
Nodes (55): ALLOWED_INTERVALS, isCandleArray(), readMarketCache(), buildContextFromCandles(), BuildContextOptions, clamp(), divergenceToLegacy(), EMPTY_FUTURES (+47 more)

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

## Knowledge Gaps
- **145 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+140 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PIVOT_LEVEL_KEYS` connect `ChartPanel.jsx` to `pivotPoints.ts`?**
  _High betweenness centrality (0.257) - this node is a cross-community bridge._
- **Why does `ChartPanel()` connect `ChartPanel.jsx` to `App.jsx`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _145 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06345848757271286 - nodes in this community are weakly interconnected._
- **Should `pivotPoints.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05493863237872589 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
- **Should `app.py` be split into smaller, more focused modules?**
  _Cohesion score 0.05920745920745921 - nodes in this community are weakly interconnected._