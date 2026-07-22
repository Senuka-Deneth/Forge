# Graph Report - Forge  (2026-07-22)

## Corpus Check
- 139 files · ~150,103 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1040 nodes · 2093 edges · 72 communities (60 shown, 12 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5e86f730`
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
- chartOverlays.js
- ChartPanelErrorBoundary
- index.ts
- crossMarket.ts
- calibration.ts
- liquidation.ts
- tradePlan.ts
- EducationIcon.jsx
- normalizeModelOutput
- outcome.ts
- expectancy.ts
- cors.ts
- scripts
- package.json
- dompurify

## God Nodes (most connected - your core abstractions)
1. `buildContextFromCandles()` - 54 edges
2. `ChartPanel()` - 28 edges
3. `enrichCandles()` - 21 edges
4. `App()` - 19 edges
5. `fetchBinanceKlines()` - 16 edges
6. `fetchWithTimeout()` - 16 edges
7. `buildPivotDataFromHtf()` - 14 edges
8. `applyRegimeGating()` - 14 edges
9. `normalizeModelOutput()` - 14 edges
10. `JournalPanel()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `App()` --indirect_call--> `row()`  [INFERRED]
  frontend/src/App.jsx → supabase/functions/tests/journal_snapshot_test.ts
- `AIAnalysisPanel()` --indirect_call--> `level()`  [INFERRED]
  frontend/src/components/AIAnalysisPanel.jsx → supabase/functions/tests/confluence_test.ts
- `ChartPanel()` --indirect_call--> `level()`  [INFERRED]
  frontend/src/components/ChartPanel.jsx → supabase/functions/tests/confluence_test.ts
- `ScannerPanel()` --indirect_call--> `row()`  [INFERRED]
  frontend/src/components/ScannerPanel.jsx → supabase/functions/tests/journal_snapshot_test.ts
- `summarizeOrderBook()` --indirect_call--> `pct()`  [INFERRED]
  supabase/functions/_shared/binance.ts → frontend/src/components/VerdictPanel.jsx

## Import Cycles
- None detected.

## Communities (72 total, 12 thin omitted)

### Community 0 - "App.jsx"
Cohesion: 0.16
Nodes (16): BlackoutWindow, checkEventBlackout(), classifySessionRelation(), CmeGap, computeFundingWindow(), computeSessionRanges(), dayIndexOf(), DEFAULT_EVENT_BLACKOUTS (+8 more)

### Community 1 - "pivotPoints.ts"
Cohesion: 0.07
Nodes (42): inflectionThreshold(), fetchBinanceHtfKlines(), parseBinanceKlines(), aggregateMonthlyToYearly(), ALLOWED_CHART_INTERVALS, AnalyzePivotsOptions, analyzePriceVsPivots(), buildPivotData() (+34 more)

### Community 2 - "main.jsx"
Cohesion: 0.06
Nodes (47): App(), applyTheme(), buildTechnicalAnalysis(), ChartPanelErrorBoundary, COMMON_QUOTES, fetchBinanceCandles(), fetchMarketCandles(), fetchPivotData() (+39 more)

### Community 3 - "package.json"
Cohesion: 0.13
Nodes (15): eslint, @eslint/js, eslint-plugin-react, eslint-plugin-react-hooks, devDependencies, eslint, @eslint/js, eslint-plugin-react (+7 more)

### Community 4 - "app.py"
Cohesion: 0.18
Nodes (21): asEnum(), asObject(), clamp(), deterministicFallback(), normalizeLabelValue(), normalizeModelOutput(), safeFloat(), safeInt() (+13 more)

### Community 5 - "ChartPanel.jsx"
Cohesion: 0.17
Nodes (22): buildCandleDataWithWhitespace(), buildSqueezeBars(), ChartPanel(), EXTENDED_OVERLAY_IDS, getCryptoIcon(), getCurrentPivotPeriodEnd(), getPivotTypeName(), POPULAR_PAIRS (+14 more)

### Community 7 - "Pivot Points Architecture"
Cohesion: 0.20
Nodes (9): API response contract, Base data: native Binance HTF klines, Chart rendering (TradingView-equivalent), Pivot Points Architecture, Pivot types (formulas unchanged), Preferences, Serving path, Source of truth (+1 more)

### Community 9 - "PivotSegmentsPrimitive"
Cohesion: 0.14
Nodes (4): formatPivotPrice(), PivotSegmentsPaneRenderer, PivotSegmentsPaneView, PivotSegmentsPrimitive

### Community 10 - "index.ts"
Cohesion: 0.20
Nodes (10): ScoredRow, ALLOWED_INTERVALS, isCandleArray(), readMarketCache(), AuthResult, getBearerToken(), requireAuthenticatedUser(), tryServiceClient() (+2 more)

### Community 11 - "Forge — Prediction Accuracy Audit & Roadmap"
Cohesion: 0.15
Nodes (12): 1. The core problem, stated plainly, 2. Current architecture (as built), 3. Why this can't be "very accurate" as built (the theory), 4. Roadmap, prioritized by leverage, 5. Immediate quick wins (no architecture change required), 6. Direct answers to your questions, Forge — Prediction Accuracy Audit & Roadmap, Tier 0 — Fix trust and measurement (do this before anything else) (+4 more)

### Community 12 - "Forge — Plan Mode Prompts"
Cohesion: 0.33
Nodes (5): Forge — Plan Mode Prompts, Prompt 1 — Consolidate pivot logic + TradingView calculation parity, Prompt 2 — TradingView-style pivot rendering clone (frontend), Prompt 3 — Indicator integrity: real divergence, adaptive thresholds, honest UI, Suggested order and why

### Community 13 - "EducationPanel.jsx"
Cohesion: 0.15
Nodes (13): framer-motion, dependencies, framer-motion, lightweight-charts, react, react-dom, @supabase/supabase-js, three (+5 more)

### Community 14 - "ChartPanelErrorBoundary"
Cohesion: 0.13
Nodes (5): buildConfluenceBands(), ConfluenceBandPaneRenderer, ConfluenceBandPaneView, ConfluencePrimitive, topSourceLabel()

### Community 15 - "education-app.js"
Cohesion: 0.12
Nodes (19): bootScene(), canvas, fallback, nav, readProgress(), showFallback(), smoothstep(), supportsWebGL() (+11 more)

### Community 18 - "education-data.js"
Cohesion: 0.07
Nodes (28): 1. Supabase setup, 2. Frontend setup, AI analysis pipeline, Backend, Backtest and baseline seeding, Calibration loop and Brier score, Core indicators (on every enriched candle), Cross-market (alts vs BTC) (+20 more)

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
Cohesion: 0.23
Nodes (16): avg(), EdgePanel(), groupBy(), EMPTY_FORM, JournalPanel(), buildEntryFromAiPlan(), cancelJournalEntry(), closeJournalEntry() (+8 more)

### Community 27 - "liquidityMap.ts"
Cohesion: 0.23
Nodes (15): buildLiquidityMap(), Candle, detectFairValueGaps(), detectLiquiditySweeps(), detectOrderBlocks(), FairValueGap, findLiquidityPools(), LiquidityMap (+7 more)

### Community 30 - "aiContext.ts"
Cohesion: 0.06
Nodes (49): addToBucket(), allResults, args, Bucket, deriveBias(), doUpload, interval, outPath (+41 more)

### Community 31 - "index.ts"
Cohesion: 0.12
Nodes (34): calculateATR(), calculateRSI(), calculateChandelierExit(), calculateDonchian(), calculateIchimoku(), calculateKeltnerChannels(), calculatePersistence(), calculateRealizedVolatility() (+26 more)

### Community 32 - "volumeProfile.ts"
Cohesion: 0.12
Nodes (27): buildMtfDepth(), fetchFundingSignal(), fetchJson(), fetchOiHistory(), fetchTakerRatioSignal(), FundingSignal, gatherMarketFeatures(), MarketFeatures (+19 more)

### Community 33 - "main.jsx"
Cohesion: 0.17
Nodes (17): AuthShell(), GoogleIcon(), ProtectedRoute(), PublicOnlyRoute(), AUTH_ROUTES, AuthContext, AuthProvider(), getPath() (+9 more)

### Community 34 - "features.ts"
Cohesion: 0.13
Nodes (23): buildContextFromCandles(), BuildContextOptions, buildLevelInputsFromContext(), clamp(), ConfluenceInputParts, DAILY_PLUS_INTERVALS, divergenceToLegacy(), EMPTY_FUTURES (+15 more)

### Community 39 - "vwap.ts"
Cohesion: 0.22
Nodes (11): anchoredVwap, AnchoredVwapPoint, buildAnchoredVwaps(), classifyVwapRelation(), EMPTY_POINT, round6(), selectVwapAnchors(), typicalPrice() (+3 more)

### Community 40 - "backtest.ts"
Cohesion: 0.21
Nodes (14): ACCENT_STATES, AIAnalysisPanel(), alertDirection(), BEAR_STATES, BULL_STATES, loadPositionCalcDefaults(), PositionSizeCalculator(), StatusPill() (+6 more)

### Community 41 - "tradePlan.ts"
Cohesion: 0.13
Nodes (11): body, count, __dirname, educationData, esc(), ICONS, iconsBody, out (+3 more)

### Community 42 - "pivotChartPrefs.js"
Cohesion: 0.23
Nodes (11): clampPivotsBack(), createDefaultPivotLevelOptions(), DEFAULT_PIVOT_CHART_PREFS, getEnabledPivotLevels(), PIVOT_LEVEL_LABELS, sanitizePivotChartPrefs(), sanitizePivotLevelOptions(), DEFAULT_CHART_PREFERENCES (+3 more)

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
Cohesion: 0.22
Nodes (16): alignClosesByTime(), applyCrossMarketGating(), buildCrossMarketContext(), computeDominance(), CrossMarketContext, CrossMarketGateResult, CrossMarketPrefetch, DominanceDirection (+8 more)

### Community 49 - "chartTheme.js"
Cohesion: 0.50
Nodes (4): DARK, getChartTheme(), getCurrentChartTheme(), LIGHT

### Community 50 - "SignUp.jsx"
Cohesion: 0.25
Nodes (13): ALLOWED_INTERVALS, analyzePriceVsPivots(), bucketStart(), calculateClassicPivots(), calculateFibonacciPivots(), calculateTraditionalPivots(), Candle, getPivotPeriod() (+5 more)

### Community 51 - "AnalysisPanel.jsx"
Cohesion: 0.16
Nodes (15): barHitLong(), barHitShort(), defaultFractions(), entryFilled(), feeCostR(), LadderStepResult, ScoredOutcome, scorePlanAgainstCandles() (+7 more)

### Community 52 - "confluence.ts"
Cohesion: 0.36
Nodes (8): buildConfluenceMap(), LevelInput, LevelSource, nearestConfluenceClusters(), round6(), SOURCE_WEIGHTS, topConfluenceClusters(), level()

### Community 53 - "chartOverlays.js"
Cohesion: 0.23
Nodes (11): compactConfluenceCluster(), compactForPrompt(), MarketContext, promptPriceDecimals(), roundPromptPct(), roundPromptPrice(), roundPromptScore(), ConfluenceCluster (+3 more)

### Community 54 - "userPreferences.js"
Cohesion: 0.19
Nodes (11): clamp(), deriveSignalBias(), fetchScanCalibration(), fetchSetupBaseline(), ScanResultRow, scanSymbol(), toGatingContext(), WatchlistRow (+3 more)

### Community 55 - "chartOverlays.js"
Cohesion: 0.28
Nodes (11): attachUserGuardrails(), DEFAULT_RISK_SETTINGS, aggregateJournalSnapshot(), fetchJournalSnapshot(), fetchRiskSettings(), JournalDbClient, JournalTradeRow, MAJOR_SYMBOLS (+3 more)

### Community 56 - "ChartPanelErrorBoundary"
Cohesion: 0.43
Nodes (5): Candle, deriveRegime(), MarketRegime, percentileRank(), RegimeResult

### Community 58 - "index.ts"
Cohesion: 0.04
Nodes (44): ALLOWED_INTERVALS, ANALYSIS_JSON_SCHEMA, ANALYSIS_REGIME_SET, AnalysisMarketRegime, AnalysisMeta, ANOMALY_TYPE_SET, AnomalyType, attachDecisionLayer() (+36 more)

### Community 59 - "crossMarket.ts"
Cohesion: 0.12
Nodes (22): AtrResult, OHLC, trueRangeSeries(), wilderSmooth(), calculateADX(), calculateATR(), calculateBollingerBands(), calculateCVD() (+14 more)

### Community 60 - "calibration.ts"
Cohesion: 0.23
Nodes (13): CalibrationBucket, CalibrationRow, clampModelConfidence(), computeBrierScore(), computeReliabilityCurve(), computeSetupStats(), confidenceDecile(), decidedCounts() (+5 more)

### Community 61 - "liquidation.ts"
Cohesion: 0.40
Nodes (4): public.risk_overrides, public.risk_settings, public.setup_baselines, public.trade_journal

### Community 62 - "tradePlan.ts"
Cohesion: 0.12
Nodes (23): classifyMarketStructure(), AtrResult, buildMarketStructure(), clamp(), clusterIntoZones(), computeSignalAgreement(), computeSwingProminence(), detectMacdDivergence() (+15 more)

### Community 63 - "EducationIcon.jsx"
Cohesion: 0.27
Nodes (7): EducationIcon(), getIcon(), ICONS, iconStyle, educationData, ICONS, resolveIconId()

### Community 64 - "normalizeModelOutput"
Cohesion: 0.21
Nodes (12): AlertRow, fetchLatestPrice(), TriggeredAlert, asTradePlan(), LogRow, scoreRow(), constantTimeEqual(), digestSecret() (+4 more)

### Community 65 - "outcome.ts"
Cohesion: 0.15
Nodes (19): applyJournalGuardrails(), JOURNAL_GUARDRAIL_IDS, ExpectancyResult, applyGuardrailVerdict(), BookQuality, evaluateGuardrails(), GuardrailId, GuardrailResult (+11 more)

### Community 66 - "expectancy.ts"
Cohesion: 0.50
Nodes (6): breakevenHitRate(), computeExpectancy(), entryMid(), feeCostR(), finite(), wilsonInterval()

### Community 67 - "cors.ts"
Cohesion: 0.48
Nodes (6): buildCorsHeaders(), DEFAULT_ALLOWED_ORIGINS, getAllowedOrigins(), handleOptions(), jsonResponse(), resolveAllowedOrigin()

### Community 68 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, preview, test

### Community 70 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 71 - "dompurify"
Cohesion: 0.67
Nodes (3): dompurify, dompurify, EducationPanel()

## Knowledge Gaps
- **261 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+256 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `level()` connect `confluence.ts` to `backtest.ts`, `ChartPanel.jsx`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Why does `buildConfluenceMap()` connect `confluence.ts` to `features.ts`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Why does `PIVOT_LEVEL_KEYS` connect `pivotChartPrefs.js` to `pivotPoints.ts`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _261 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pivotPoints.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06693877551020408 - nodes in this community are weakly interconnected._
- **Should `main.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05970149253731343 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._