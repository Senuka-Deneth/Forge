# Graph Report - Forge  (2026-07-22)

## Corpus Check
- 119 files · ~118,581 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 844 nodes · 1686 edges · 58 communities (45 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.63)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5197e399`
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
- liquidityMap.ts
- aiContext.ts
- index.ts
- volumeProfile.ts
- main.jsx
- features.ts
- 20260722030000_user_preferences_db_validation.sql
- 20260722050000_trade_journal.sql
- 20260722040000_fill_aware_scoring.sql
- vwap.ts
- backtest.ts
- tradePlan.ts
- pivotChartPrefs.js
- volumeProfilePrimitive.js
- VolumeProfilePrimitive
- zoneBoxPrimitive.js
- ZoneBoxPrimitive
- chartIndicators.js
- audit_fixes_test.ts
- chartTheme.js
- SignUp.jsx
- AnalysisPanel.jsx
- confluence.ts
- chartOverlays.js
- userPreferences.js
- AIAnalysisPanel.jsx
- ChartPanelErrorBoundary
- StatusBar.jsx

## God Nodes (most connected - your core abstractions)
1. `buildContextFromCandles()` - 51 edges
2. `ChartPanel()` - 28 edges
3. `enrichCandles()` - 20 edges
4. `App()` - 18 edges
5. `fetchWithTimeout()` - 16 edges
6. `buildPivotDataFromHtf()` - 14 edges
7. `normalizeModelOutput()` - 14 edges
8. `JournalPanel()` - 13 edges
9. `calculateATR()` - 13 edges
10. `fetchBinanceKlines()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `ChartPanel()` --indirect_call--> `level()`  [INFERRED]
  frontend/src/components/ChartPanel.jsx → supabase/functions/tests/confluence_test.ts
- `createDefaultPivotLevelOptions()` --references--> `PIVOT_LEVEL_KEYS`  [EXTRACTED]
  frontend/src/utils/pivotChartPrefs.js → supabase/functions/_shared/pivotPoints.ts
- `sanitizePivotLevelOptions()` --references--> `PIVOT_LEVEL_KEYS`  [EXTRACTED]
  frontend/src/utils/pivotChartPrefs.js → supabase/functions/_shared/pivotPoints.ts
- `buildVolumeProfile()` --indirect_call--> `candle()`  [INFERRED]
  supabase/functions/_shared/volumeProfile.ts → supabase/functions/tests/cross_market_test.ts
- `fetchBinanceCandles()` --calls--> `computeSeriesIndicators()`  [EXTRACTED]
  frontend/src/App.jsx → frontend/src/utils/incrementalIndicators.js

## Import Cycles
- None detected.

## Communities (58 total, 13 thin omitted)

### Community 0 - "App.jsx"
Cohesion: 0.12
Nodes (23): classifyMarketStructure(), AtrResult, buildMarketStructure(), clamp(), clusterIntoZones(), computeSignalAgreement(), computeSwingProminence(), detectMacdDivergence() (+15 more)

### Community 1 - "pivotPoints.ts"
Cohesion: 0.08
Nodes (34): inflectionThreshold(), fetchBinanceHtfKlines(), parseBinanceKlines(), aggregateMonthlyToYearly(), ALLOWED_CHART_INTERVALS, AnalyzePivotsOptions, analyzePriceVsPivots(), buildPivotData() (+26 more)

### Community 2 - "main.jsx"
Cohesion: 0.16
Nodes (20): App(), applyTheme(), buildTechnicalAnalysis(), COMMON_QUOTES, fetchBinanceCandles(), fetchMarketCandles(), fetchPivotData(), hasCurrentPivotPeriod() (+12 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (25): eslint, @eslint/js, eslint-plugin-react, eslint-plugin-react-hooks, devDependencies, eslint, @eslint/js, eslint-plugin-react (+17 more)

### Community 4 - "app.py"
Cohesion: 0.06
Nodes (51): args, Bucket, buckets, closed, interval, outPath, step, summary (+43 more)

### Community 5 - "ChartPanel.jsx"
Cohesion: 0.22
Nodes (16): buildCandleDataWithWhitespace(), buildSqueezeBars(), ChartPanel(), EXTENDED_OVERLAY_IDS, getCryptoIcon(), getCurrentPivotPeriodEnd(), getPivotTypeName(), POPULAR_PAIRS (+8 more)

### Community 7 - "Pivot Points Architecture"
Cohesion: 0.20
Nodes (9): API response contract, Base data: native Binance HTF klines, Chart rendering (TradingView-equivalent), Pivot Points Architecture, Pivot types (formulas unchanged), Preferences, Serving path, Source of truth (+1 more)

### Community 9 - "PivotSegmentsPrimitive"
Cohesion: 0.14
Nodes (4): formatPivotPrice(), PivotSegmentsPaneRenderer, PivotSegmentsPaneView, PivotSegmentsPrimitive

### Community 10 - "index.ts"
Cohesion: 0.05
Nodes (58): attachEmpiricalConfidence(), fetchEmpiricalCalibration(), ScoredRow, ALLOWED_INTERVALS, isCandleArray(), readMarketCache(), asTradePlan(), LogRow (+50 more)

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
Cohesion: 0.07
Nodes (43): AtrResult, OHLC, trueRangeSeries(), wilderSmooth(), alignClosesByTime(), applyCrossMarketGating(), buildCrossMarketContext(), computeDominance() (+35 more)

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

### Community 27 - "liquidityMap.ts"
Cohesion: 0.23
Nodes (15): buildLiquidityMap(), Candle, detectFairValueGaps(), detectLiquiditySweeps(), detectOrderBlocks(), FairValueGap, findLiquidityPools(), LiquidityMap (+7 more)

### Community 30 - "aiContext.ts"
Cohesion: 0.10
Nodes (30): gatherMarketContext(), BookWall, EMPTY_ORDER_BOOK, fetchBinanceKlines(), fetchFuturesContext(), FetchKlinesOptions, fetchOrderBookImbalance(), fetchTicker24hr() (+22 more)

### Community 31 - "index.ts"
Cohesion: 0.12
Nodes (34): calculateATR(), calculateRSI(), calculateChandelierExit(), calculateDonchian(), calculateIchimoku(), calculateKeltnerChannels(), calculatePersistence(), calculateRealizedVolatility() (+26 more)

### Community 32 - "volumeProfile.ts"
Cohesion: 0.12
Nodes (27): buildMtfDepth(), fetchFundingSignal(), fetchJson(), fetchOiHistory(), fetchTakerRatioSignal(), FundingSignal, gatherMarketFeatures(), MarketFeatures (+19 more)

### Community 33 - "main.jsx"
Cohesion: 0.25
Nodes (10): ProtectedRoute(), PublicOnlyRoute(), AUTH_ROUTES, AuthContext, AuthProvider(), getPath(), isProtectedPath(), replacePath() (+2 more)

### Community 34 - "features.ts"
Cohesion: 0.13
Nodes (22): buildContextFromCandles(), BuildContextOptions, buildLevelInputsFromContext(), clamp(), ConfluenceInputParts, DAILY_PLUS_INTERVALS, divergenceToLegacy(), EMPTY_FUTURES (+14 more)

### Community 39 - "vwap.ts"
Cohesion: 0.22
Nodes (11): anchoredVwap, AnchoredVwapPoint, buildAnchoredVwaps(), classifyVwapRelation(), EMPTY_POINT, round6(), selectVwapAnchors(), typicalPrice() (+3 more)

### Community 40 - "backtest.ts"
Cohesion: 0.21
Nodes (12): compactConfluenceCluster(), compactForPrompt(), MarketContext, promptPriceDecimals(), roundPromptPct(), roundPromptPrice(), roundPromptScore(), ConfluenceCluster (+4 more)

### Community 41 - "tradePlan.ts"
Cohesion: 0.15
Nodes (17): BlackoutCheck, BlackoutWindow, checkEventBlackout(), classifySessionRelation(), CmeGap, computeFundingWindow(), computeSessionRanges(), dayIndexOf() (+9 more)

### Community 42 - "pivotChartPrefs.js"
Cohesion: 0.46
Nodes (7): clampPivotsBack(), createDefaultPivotLevelOptions(), getEnabledPivotLevels(), PIVOT_LEVEL_LABELS, sanitizePivotChartPrefs(), sanitizePivotLevelOptions(), PIVOT_LEVEL_KEYS

### Community 43 - "volumeProfilePrimitive.js"
Cohesion: 0.22
Nodes (3): buildProfileBins(), VolumeProfilePaneRenderer, VolumeProfilePaneView

### Community 45 - "zoneBoxPrimitive.js"
Cohesion: 0.22
Nodes (3): buildLiquidityZones(), ZoneBoxPaneRenderer, ZoneBoxPaneView

### Community 47 - "chartIndicators.js"
Cohesion: 0.47
Nodes (3): computeChartOverlays(), toLine(), VWAP_ANCHOR_LABELS

### Community 48 - "audit_fixes_test.ts"
Cohesion: 0.26
Nodes (12): calculateEMA(), calculateMACD(), calculateRSI(), computeMacdState(), computeRsiState(), computeSeriesIndicators(), extractClosedIndicatorState(), patchLastCandleIndicators() (+4 more)

### Community 49 - "chartTheme.js"
Cohesion: 0.50
Nodes (4): DARK, getChartTheme(), getCurrentChartTheme(), LIGHT

### Community 50 - "SignUp.jsx"
Cohesion: 0.37
Nodes (7): AuthShell(), GoogleIcon(), SignIn(), SignUp(), getFriendlyAuthError(), isValidEmail(), ensureUserPreferences()

### Community 51 - "AnalysisPanel.jsx"
Cohesion: 0.36
Nodes (6): AnalysisPanel(), formatLevel(), formatSwingTime(), formatValue(), deriveSignalAgreement(), signalAgreementLabel()

### Community 52 - "confluence.ts"
Cohesion: 0.36
Nodes (8): buildConfluenceMap(), LevelInput, LevelSource, nearestConfluenceClusters(), round6(), SOURCE_WEIGHTS, topConfluenceClusters(), level()

### Community 53 - "chartOverlays.js"
Cohesion: 0.33
Nodes (6): buildLiquidityMarkers(), clearPriceOverlays(), PRICE_OVERLAY_SPECS, seriesKey(), syncAnchoredVwaps(), syncPriceOverlays()

### Community 54 - "userPreferences.js"
Cohesion: 0.38
Nodes (4): DEFAULT_PIVOT_CHART_PREFS, DEFAULT_CHART_PREFERENCES, INDICATOR_PRESETS, OVERLAY_KEYS

### Community 55 - "AIAnalysisPanel.jsx"
Cohesion: 0.40
Nodes (4): AIAnalysisPanel(), colorMap, loadPositionCalcDefaults(), PositionSizeCalculator()

### Community 57 - "StatusBar.jsx"
Cohesion: 0.83
Nodes (3): formatPrice(), formatVolume(), StatusBar()

## Knowledge Gaps
- **190 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+185 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ChartPanel()` connect `ChartPanel.jsx` to `main.jsx`, `pivotChartPrefs.js`, `volumeProfilePrimitive.js`, `zoneBoxPrimitive.js`, `chartIndicators.js`, `chartTheme.js`, `confluence.ts`, `chartOverlays.js`?**
  _High betweenness centrality (0.271) - this node is a cross-community bridge._
- **Why does `level()` connect `confluence.ts` to `ChartPanel.jsx`?**
  _High betweenness centrality (0.248) - this node is a cross-community bridge._
- **Why does `buildConfluenceMap()` connect `confluence.ts` to `features.ts`?**
  _High betweenness centrality (0.244) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _190 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1164021164021164 - nodes in this community are weakly interconnected._
- **Should `pivotPoints.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._