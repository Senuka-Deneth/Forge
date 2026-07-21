# Graph Report - Forge  (2026-07-21)

## Corpus Check
- 65 files · ~76,683 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 475 nodes · 868 edges · 28 communities (20 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `16302e72`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.jsx
- pivotPoints.ts
- main.jsx
- package.json
- app.py
- ChartPanel.jsx
- index.ts
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
1. `gatherMarketContext()` - 24 edges
2. `App()` - 18 edges
3. `ChartPanel()` - 18 edges
4. `enrichCandles()` - 16 edges
5. `buildPivotDataFromHtf()` - 14 edges
6. `normalizeModelOutput()` - 12 edges
7. `fetchWithTimeout()` - 11 edges
8. `PivotSegmentsPrimitive` - 9 edges
9. `buildMarketStructure()` - 9 edges
10. `Pivot Points Architecture` - 9 edges

## Surprising Connections (you probably didn't know these)
- `createDefaultPivotLevelOptions()` --references--> `PIVOT_LEVEL_KEYS`  [EXTRACTED]
  frontend/src/utils/pivotChartPrefs.js → supabase/functions/_shared/pivotPoints.ts
- `sanitizePivotLevelOptions()` --references--> `PIVOT_LEVEL_KEYS`  [EXTRACTED]
  frontend/src/utils/pivotChartPrefs.js → supabase/functions/_shared/pivotPoints.ts
- `sanitizePreferences()` --calls--> `sanitizePivotTimeframe()`  [EXTRACTED]
  supabase/functions/user-preferences/index.ts → supabase/functions/_shared/pivotPoints.ts
- `App()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/App.jsx → frontend/src/hooks/useAuth.js
- `sanitizePreferences()` --calls--> `sanitizePivotChartPrefs()`  [EXTRACTED]
  frontend/src/utils/userPreferences.js → frontend/src/utils/pivotChartPrefs.js

## Import Cycles
- None detected.

## Communities (28 total, 8 thin omitted)

### Community 0 - "App.jsx"
Cohesion: 0.09
Nodes (38): App(), applyTheme(), buildTechnicalAnalysis(), calculateEMA(), calculateMACD(), calculateRSI(), COMMON_QUOTES, enrichCandles() (+30 more)

### Community 1 - "pivotPoints.ts"
Cohesion: 0.08
Nodes (34): calculateATR(), inflectionThreshold(), aggregateMonthlyToYearly(), ALLOWED_CHART_INTERVALS, AnalyzePivotsOptions, analyzePriceVsPivots(), buildPivotData(), buildPivotDataFromHtf() (+26 more)

### Community 2 - "main.jsx"
Cohesion: 0.14
Nodes (19): AuthShell(), GoogleIcon(), ProtectedRoute(), PublicOnlyRoute(), AUTH_ROUTES, AuthContext, AuthProvider(), getPath() (+11 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (31): framer-motion, dependencies, framer-motion, lightweight-charts, react, react-dom, @supabase/supabase-js, three (+23 more)

### Community 4 - "app.py"
Cohesion: 0.11
Nodes (24): ALLOWED_INTERVALS, asEnum(), asObject(), buildDeterministicTradePlan(), clamp(), deterministicFallback(), normalizeLabelValue(), normalizeModelOutput() (+16 more)

### Community 5 - "ChartPanel.jsx"
Cohesion: 0.14
Nodes (27): buildCandleDataWithWhitespace(), ChartPanel(), getCryptoIcon(), getCurrentPivotPeriodEnd(), getPivotTypeName(), POPULAR_PAIRS, subtractFiveMonths(), DARK (+19 more)

### Community 6 - "index.ts"
Cohesion: 0.16
Nodes (17): AtrResult, buildMarketStructure(), clamp(), clusterIntoZones(), computeSignalAgreement(), detectRsiDivergence(), DivergenceOptions, DivergenceResult (+9 more)

### Community 7 - "Pivot Points Architecture"
Cohesion: 0.20
Nodes (9): API response contract, Base data: native Binance HTF klines, Chart rendering (TradingView-equivalent), Pivot Points Architecture, Pivot types (formulas unchanged), Preferences, Serving path, Source of truth (+1 more)

### Community 8 - "openrouter_service.py"
Cohesion: 0.11
Nodes (37): clamp(), divergenceToLegacy(), gatherMarketContext(), labelSwing(), MtfRead, nearestZones(), readTrendFromCandles(), seriesTrend() (+29 more)

### Community 9 - "PivotSegmentsPrimitive"
Cohesion: 0.14
Nodes (4): formatPivotPrice(), PivotSegmentsPaneRenderer, PivotSegmentsPaneView, PivotSegmentsPrimitive

### Community 10 - "index.ts"
Cohesion: 0.08
Nodes (38): ScoredRow, ALLOWED_INTERVALS, isCandleArray(), readMarketCache(), asTradePlan(), barHitLong(), barHitShort(), LogRow (+30 more)

### Community 11 - "Forge — Prediction Accuracy Audit & Roadmap"
Cohesion: 0.15
Nodes (12): 1. The core problem, stated plainly, 2. Current architecture (as built), 3. Why this can't be "very accurate" as built (the theory), 4. Roadmap, prioritized by leverage, 5. Immediate quick wins (no architecture change required), 6. Direct answers to your questions, Forge — Prediction Accuracy Audit & Roadmap, Tier 0 — Fix trust and measurement (do this before anything else) (+4 more)

### Community 12 - "Forge — Plan Mode Prompts"
Cohesion: 0.33
Nodes (5): Forge — Plan Mode Prompts, Prompt 1 — Consolidate pivot logic + TradingView calculation parity, Prompt 2 — TradingView-style pivot rendering clone (frontend), Prompt 3 — Indicator integrity: real divergence, adaptive thresholds, honest UI, Suggested order and why

### Community 13 - "EducationPanel.jsx"
Cohesion: 0.53
Nodes (4): EducationPanel(), educationData, getIcon(), ICONS

### Community 14 - "ChartPanelErrorBoundary"
Cohesion: 0.15
Nodes (20): calculateADX(), calculateATR(), calculateBollingerBands(), calculateCVD(), calculateEMA(), calculateMACD(), calculateOBV(), calculateRelativeVolume() (+12 more)

### Community 15 - "education-app.js"
Cohesion: 0.12
Nodes (19): bootScene(), canvas, fallback, nav, readProgress(), showFallback(), smoothstep(), supportsWebGL() (+11 more)

### Community 18 - "education-data.js"
Cohesion: 0.17
Nodes (11): 1. Supabase Setup, 2. Frontend Setup, Backend, 📸 Dashboard Overview, Forge 📊, Frontend, 🚀 Getting Started, ✨ Key Features (+3 more)

### Community 19 - "screenshot2.js"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, preview, test, test:functions

### Community 23 - "__init__.py"
Cohesion: 0.40
Nodes (3): public.ai_analysis_cache, public.ai_analysis_logs, public.ai_rate_limit_events

### Community 25 - "marketStructure.test.js"
Cohesion: 0.83
Nodes (3): buildHighVolSeries(), buildLowVolSeries(), makeCandle()

## Knowledge Gaps
- **118 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+113 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PIVOT_LEVEL_KEYS` connect `ChartPanel.jsx` to `pivotPoints.ts`?**
  _High betweenness centrality (0.256) - this node is a cross-community bridge._
- **Why does `ChartPanel()` connect `ChartPanel.jsx` to `App.jsx`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _118 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08788159111933395 - nodes in this community are weakly interconnected._
- **Should `pivotPoints.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08367071524966262 - nodes in this community are weakly interconnected._
- **Should `main.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14015151515151514 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._