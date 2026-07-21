# Graph Report - Forge  (2026-07-19)

## Corpus Check
- 49 files · ~392,611 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 367 nodes · 618 edges · 26 communities (17 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9faffbf4`
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
- DEFAULT_PRICE_SCALE_MARGINS
- marketStructure.test.js

## God Nodes (most connected - your core abstractions)
1. `App()` - 17 edges
2. `ChartPanel()` - 16 edges
3. `buildPivotDataFromHtf()` - 12 edges
4. `analyze()` - 11 edges
5. `_build_deterministic_fallback()` - 10 edges
6. `PivotSegmentsPrimitive` - 9 edges
7. `deterministicFallback()` - 9 edges
8. `Pivot Points Architecture` - 9 edges
9. `_normalize_and_validate_analysis()` - 8 edges
10. `buildPivotData()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `ai_analyze()` --calls--> `analyze_market()`  [INFERRED]
  backend/app.py → backend/services/openrouter_service.py
- `createDefaultPivotLevelOptions()` --references--> `PIVOT_LEVEL_KEYS`  [EXTRACTED]
  frontend/src/utils/pivotChartPrefs.js → supabase/functions/_shared/pivotPoints.ts
- `sanitizePivotLevelOptions()` --references--> `PIVOT_LEVEL_KEYS`  [EXTRACTED]
  frontend/src/utils/pivotChartPrefs.js → supabase/functions/_shared/pivotPoints.ts
- `App()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/App.jsx → frontend/src/hooks/useAuth.js
- `sanitizePreferences()` --calls--> `sanitizePivotChartPrefs()`  [EXTRACTED]
  frontend/src/utils/userPreferences.js → frontend/src/utils/pivotChartPrefs.js

## Import Cycles
- None detected.

## Communities (26 total, 9 thin omitted)

### Community 0 - "App.jsx"
Cohesion: 0.10
Nodes (33): App(), applyTheme(), buildTechnicalAnalysis(), calculateEMA(), calculateMACD(), calculateRSI(), COMMON_QUOTES, enrichCandles() (+25 more)

### Community 1 - "pivotPoints.ts"
Cohesion: 0.07
Nodes (43): corsHeaders, handleOptions(), jsonResponse(), inflectionThreshold(), aggregateMonthlyToYearly(), ALLOWED_CHART_INTERVALS, AnalyzePivotsOptions, analyzePriceVsPivots() (+35 more)

### Community 2 - "main.jsx"
Cohesion: 0.17
Nodes (17): AuthShell(), GoogleIcon(), ProtectedRoute(), PublicOnlyRoute(), AUTH_ROUTES, AuthContext, AuthProvider(), getPath() (+9 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (30): framer-motion, dependencies, framer-motion, lightweight-charts, puppeteer, react, react-dom, @supabase/supabase-js (+22 more)

### Community 4 - "app.py"
Cohesion: 0.15
Nodes (24): ai_analyze(), analyze(), build_scenarios(), calculate_ema(), calculate_macd(), calculate_rsi(), enrich_candles(), fetch_binance_klines() (+16 more)

### Community 5 - "ChartPanel.jsx"
Cohesion: 0.17
Nodes (23): buildCandleDataWithWhitespace(), ChartPanel(), getCryptoIcon(), getCurrentPivotPeriodEnd(), getPivotTypeName(), POPULAR_PAIRS, subtractFiveMonths(), applyManualPriceRange() (+15 more)

### Community 6 - "index.ts"
Cohesion: 0.10
Nodes (27): asEnum(), clamp(), deriveAlignment(), deriveRsiState(), deterministicFallback(), normalizeLabelValue(), normalizeModelOutput(), resolveDivergence() (+19 more)

### Community 7 - "Pivot Points Architecture"
Cohesion: 0.09
Nodes (21): API response contract, Base data: native Binance HTF klines, Chart rendering (TradingView-equivalent), Pivot Points Architecture, Pivot types (formulas unchanged), Preferences, Serving path, Source of truth (+13 more)

### Community 8 - "openrouter_service.py"
Cohesion: 0.23
Nodes (16): analyze_market(), _as_enum(), _build_deterministic_fallback(), build_system_prompt(), build_user_message(), _clamp(), _derive_alignment(), _derive_rsi_state() (+8 more)

### Community 9 - "PivotSegmentsPrimitive"
Cohesion: 0.14
Nodes (4): formatPivotPrice(), PivotSegmentsPaneRenderer, PivotSegmentsPaneView, PivotSegmentsPrimitive

### Community 10 - "index.ts"
Cohesion: 0.22
Nodes (10): ALLOWED_INTERVALS, calculateEMA(), calculateMACD(), calculateRSI(), Candle, enrichCandles(), fetchBinanceKlines(), isCandleArray() (+2 more)

### Community 11 - "Forge — Prediction Accuracy Audit & Roadmap"
Cohesion: 0.15
Nodes (12): 1. The core problem, stated plainly, 2. Current architecture (as built), 3. Why this can't be "very accurate" as built (the theory), 4. Roadmap, prioritized by leverage, 5. Immediate quick wins (no architecture change required), 6. Direct answers to your questions, Forge — Prediction Accuracy Audit & Roadmap, Tier 0 — Fix trust and measurement (do this before anything else) (+4 more)

### Community 12 - "Forge — Plan Mode Prompts"
Cohesion: 0.33
Nodes (5): Forge — Plan Mode Prompts, Prompt 1 — Consolidate pivot logic + TradingView calculation parity, Prompt 2 — TradingView-style pivot rendering clone (frontend), Prompt 3 — Indicator integrity: real divergence, adaptive thresholds, honest UI, Suggested order and why

### Community 13 - "EducationPanel.jsx"
Cohesion: 0.53
Nodes (4): EducationPanel(), educationData, getIcon(), ICONS

### Community 25 - "marketStructure.test.js"
Cohesion: 0.83
Nodes (3): buildHighVolSeries(), buildLowVolSeries(), makeCandle()

## Knowledge Gaps
- **80 isolated node(s):** `ICONS`, `educationData`, `name`, `private`, `version` (+75 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PIVOT_LEVEL_KEYS` connect `ChartPanel.jsx` to `pivotPoints.ts`?**
  _High betweenness centrality (0.184) - this node is a cross-community bridge._
- **Why does `ChartPanel()` connect `ChartPanel.jsx` to `App.jsx`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **What connects `Use precomputed signalAgreement from payload; fallback to legacy bonus formula.`, `ICONS`, `educationData` to the rest of the system?**
  _81 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `pivotPoints.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06561085972850679 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `app.py` be split into smaller, more focused modules?**
  _Cohesion score 0.1452991452991453 - nodes in this community are weakly interconnected._