# Graph Report - Forge  (2026-07-19)

## Corpus Check
- 47 files · ~389,953 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 338 nodes · 565 edges · 25 communities (16 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `430134f2`
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

## God Nodes (most connected - your core abstractions)
1. `App()` - 17 edges
2. `ChartPanel()` - 16 edges
3. `analyze()` - 11 edges
4. `buildPivotDataFromHtf()` - 11 edges
5. `_build_deterministic_fallback()` - 9 edges
6. `PivotSegmentsPrimitive` - 9 edges
7. `Pivot Points Architecture` - 9 edges
8. `_normalize_and_validate_analysis()` - 8 edges
9. `buildPivotData()` - 8 edges
10. `deterministicFallback()` - 8 edges

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

## Communities (25 total, 9 thin omitted)

### Community 0 - "App.jsx"
Cohesion: 0.11
Nodes (32): App(), applyTheme(), buildTechnicalAnalysis(), calculateEMA(), calculateMACD(), calculateRSI(), COMMON_QUOTES, enrichCandles() (+24 more)

### Community 1 - "pivotPoints.ts"
Cohesion: 0.09
Nodes (31): aggregateMonthlyToYearly(), analyzePriceVsPivots(), buildPivotData(), buildPivotDataFromHtf(), BuildPivotDataInput, calculatePivotsGeneric(), ChartPrefs, countPivotLevelsForType() (+23 more)

### Community 2 - "main.jsx"
Cohesion: 0.14
Nodes (19): AuthShell(), GoogleIcon(), ProtectedRoute(), PublicOnlyRoute(), AUTH_ROUTES, AuthContext, AuthProvider(), getPath() (+11 more)

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
Cohesion: 0.13
Nodes (19): asEnum(), clamp(), deriveAlignment(), deriveRsiState(), deterministicFallback(), normalizeLabelValue(), normalizeModelOutput(), safeFloat() (+11 more)

### Community 7 - "Pivot Points Architecture"
Cohesion: 0.09
Nodes (21): API response contract, Base data: native Binance HTF klines, Chart rendering (TradingView-equivalent), Pivot Points Architecture, Pivot types (formulas unchanged), Preferences, Serving path, Source of truth (+13 more)

### Community 8 - "openrouter_service.py"
Cohesion: 0.28
Nodes (13): analyze_market(), _as_enum(), _build_deterministic_fallback(), build_system_prompt(), build_user_message(), _clamp(), _derive_alignment(), _derive_rsi_state() (+5 more)

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

## Knowledge Gaps
- **73 isolated node(s):** `ICONS`, `educationData`, `name`, `private`, `version` (+68 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PIVOT_LEVEL_KEYS` connect `ChartPanel.jsx` to `pivotPoints.ts`?**
  _High betweenness centrality (0.169) - this node is a cross-community bridge._
- **Why does `ChartPanel()` connect `ChartPanel.jsx` to `App.jsx`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **What connects `ICONS`, `educationData`, `name` to the rest of the system?**
  _73 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10953058321479374 - nodes in this community are weakly interconnected._
- **Should `pivotPoints.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09047619047619047 - nodes in this community are weakly interconnected._
- **Should `main.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14015151515151514 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._