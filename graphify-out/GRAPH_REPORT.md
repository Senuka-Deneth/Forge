# Graph Report - Forge  (2026-07-22)

## Corpus Check
- 143 files · ~159,847 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1125 nodes · 2287 edges · 83 communities (69 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `463bb3f1`
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
- drawingTools.js
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
- supabaseClient.js
- package.json
- dompurify
- incrementalIndicators.js
- liquidation.ts
- SignUp.jsx
- AnalysisPanel.jsx
- index.ts
- userPreferences.js
- ChartPanelErrorBoundary
- StatusBar.jsx
- fetchBinanceHtfKlines

## God Nodes (most connected - your core abstractions)
1. `buildContextFromCandles()` - 54 edges
2. `ChartPanel()` - 34 edges
3. `enrichCandles()` - 21 edges
4. `App()` - 19 edges
5. `DrawingsPrimitive` - 18 edges
6. `fetchBinanceKlines()` - 16 edges
7. `fetchWithTimeout()` - 16 edges
8. `drawOne()` - 15 edges
9. `buildPivotDataFromHtf()` - 14 edges
10. `applyRegimeGating()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `sanitizeDrawings()` --indirect_call--> `item()`  [INFERRED]
  frontend/src/utils/drawingTools.js → scripts/build-education-data.mjs
- `App()` --indirect_call--> `row()`  [INFERRED]
  frontend/src/App.jsx → supabase/functions/tests/journal_snapshot_test.ts
- `AIAnalysisPanel()` --indirect_call--> `level()`  [INFERRED]
  frontend/src/components/AIAnalysisPanel.jsx → supabase/functions/tests/confluence_test.ts
- `ChartPanel()` --indirect_call--> `level()`  [INFERRED]
  frontend/src/components/ChartPanel.jsx → supabase/functions/tests/confluence_test.ts
- `ScannerPanel()` --indirect_call--> `row()`  [INFERRED]
  frontend/src/components/ScannerPanel.jsx → supabase/functions/tests/journal_snapshot_test.ts

## Import Cycles
- None detected.

## Communities (83 total, 14 thin omitted)

### Community 0 - "App.jsx"
Cohesion: 0.16
Nodes (16): BlackoutWindow, checkEventBlackout(), classifySessionRelation(), CmeGap, computeFundingWindow(), computeSessionRanges(), dayIndexOf(), DEFAULT_EVENT_BLACKOUTS (+8 more)

### Community 1 - "pivotPoints.ts"
Cohesion: 0.09
Nodes (31): inflectionThreshold(), aggregateMonthlyToYearly(), ALLOWED_CHART_INTERVALS, AnalyzePivotsOptions, analyzePriceVsPivots(), buildPivotData(), buildPivotDataFromHtf(), BuildPivotDataInput (+23 more)

### Community 2 - "main.jsx"
Cohesion: 0.24
Nodes (16): App(), applyTheme(), buildTechnicalAnalysis(), COMMON_QUOTES, fetchBinanceCandles(), fetchMarketCandles(), fetchPivotData(), hasCurrentPivotPeriod() (+8 more)

### Community 3 - "package.json"
Cohesion: 0.13
Nodes (15): eslint, @eslint/js, eslint-plugin-react, eslint-plugin-react-hooks, devDependencies, eslint, @eslint/js, eslint-plugin-react (+7 more)

### Community 4 - "app.py"
Cohesion: 0.29
Nodes (12): appendPositionSizing(), applyRegimeGating(), clamp(), classifySetupType(), entryMid(), finite(), htfContradictions(), nearZone() (+4 more)

### Community 5 - "ChartPanel.jsx"
Cohesion: 0.16
Nodes (23): buildCandleDataWithWhitespace(), buildSqueezeBars(), ChartPanel(), EXTENDED_OVERLAY_IDS, getCryptoIcon(), getCurrentPivotPeriodEnd(), getPivotTypeName(), POPULAR_PAIRS (+15 more)

### Community 7 - "Pivot Points Architecture"
Cohesion: 0.20
Nodes (9): API response contract, Base data: native Binance HTF klines, Chart rendering (TradingView-equivalent), Pivot Points Architecture, Pivot types (formulas unchanged), Preferences, Serving path, Source of truth (+1 more)

### Community 9 - "PivotSegmentsPrimitive"
Cohesion: 0.09
Nodes (5): DrawingPriceAxisView, formatPivotPrice(), PivotSegmentsPaneRenderer, PivotSegmentsPaneView, PivotSegmentsPrimitive

### Community 10 - "index.ts"
Cohesion: 0.21
Nodes (8): ALLOWED_INTERVALS, isCandleArray(), readMarketCache(), AuthResult, getBearerToken(), requireAuthenticatedUser(), consumeQuota(), QuotaResult

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
Cohesion: 0.13
Nodes (19): addToBucket(), allResults, args, Bucket, deriveBias(), doUpload, interval, outPath (+11 more)

### Community 31 - "index.ts"
Cohesion: 0.13
Nodes (33): calculateATR(), calculateChandelierExit(), calculateDonchian(), calculateIchimoku(), calculateKeltnerChannels(), calculatePersistence(), calculateRealizedVolatility(), calculateSqueeze() (+25 more)

### Community 32 - "volumeProfile.ts"
Cohesion: 0.11
Nodes (28): buildMtfDepth(), fetchFundingSignal(), fetchJson(), fetchOiHistory(), fetchTakerRatioSignal(), FundingSignal, gatherMarketFeatures(), MarketFeatures (+20 more)

### Community 33 - "main.jsx"
Cohesion: 0.25
Nodes (10): ProtectedRoute(), PublicOnlyRoute(), AUTH_ROUTES, AuthContext, AuthProvider(), getPath(), isProtectedPath(), replacePath() (+2 more)

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
Nodes (12): body, count, __dirname, educationData, esc(), ICONS, iconsBody, item() (+4 more)

### Community 42 - "pivotChartPrefs.js"
Cohesion: 0.39
Nodes (8): clampPivotsBack(), createDefaultPivotLevelOptions(), DEFAULT_PIVOT_CHART_PREFS, getEnabledPivotLevels(), PIVOT_LEVEL_LABELS, sanitizePivotChartPrefs(), sanitizePivotLevelOptions(), PIVOT_LEVEL_KEYS

### Community 43 - "volumeProfilePrimitive.js"
Cohesion: 0.22
Nodes (3): buildProfileBins(), VolumeProfilePaneRenderer, VolumeProfilePaneView

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
Cohesion: 0.27
Nodes (12): ALLOWED_INTERVALS, analyzePriceVsPivots(), bucketStart(), calculateClassicPivots(), calculateFibonacciPivots(), calculateTraditionalPivots(), Candle, getPivotPeriod() (+4 more)

### Community 51 - "AnalysisPanel.jsx"
Cohesion: 0.19
Nodes (16): breakevenHitRate(), computeExpectancy(), entryMid(), feeCostR(), finite(), wilsonInterval(), barHitLong(), barHitShort() (+8 more)

### Community 52 - "confluence.ts"
Cohesion: 0.36
Nodes (8): buildConfluenceMap(), LevelInput, LevelSource, nearestConfluenceClusters(), round6(), SOURCE_WEIGHTS, topConfluenceClusters(), level()

### Community 53 - "chartOverlays.js"
Cohesion: 0.23
Nodes (11): compactConfluenceCluster(), compactForPrompt(), MarketContext, promptPriceDecimals(), roundPromptPct(), roundPromptPrice(), roundPromptScore(), ConfluenceCluster (+3 more)

### Community 54 - "userPreferences.js"
Cohesion: 0.22
Nodes (9): clamp(), deriveSignalBias(), fetchScanCalibration(), fetchSetupBaseline(), ScanResultRow, scanSymbol(), toGatingContext(), WatchlistRow (+1 more)

### Community 55 - "chartOverlays.js"
Cohesion: 0.28
Nodes (11): attachUserGuardrails(), DEFAULT_RISK_SETTINGS, aggregateJournalSnapshot(), fetchJournalSnapshot(), fetchRiskSettings(), JournalDbClient, JournalTradeRow, MAJOR_SYMBOLS (+3 more)

### Community 56 - "ChartPanelErrorBoundary"
Cohesion: 0.43
Nodes (5): Candle, deriveRegime(), MarketRegime, percentileRank(), RegimeResult

### Community 57 - "drawingTools.js"
Cohesion: 0.05
Nodes (51): DrawingStylePopover(), DrawingToolbar(), RAIL_TOOLS, TOOL_ICONS, applyLineDash(), drawHandle(), DrawingsPaneRenderer, DrawingsPaneView (+43 more)

### Community 58 - "index.ts"
Cohesion: 0.04
Nodes (53): ALLOWED_INTERVALS, ANALYSIS_JSON_SCHEMA, ANALYSIS_REGIME_SET, AnalysisMarketRegime, AnalysisMeta, ANOMALY_TYPE_SET, AnomalyType, asEnum() (+45 more)

### Community 59 - "crossMarket.ts"
Cohesion: 0.12
Nodes (24): AtrResult, OHLC, trueRangeSeries(), wilderSmooth(), calculateADX(), calculateATR(), calculateBollingerBands(), calculateCVD() (+16 more)

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
Cohesion: 0.18
Nodes (15): AlertRow, fetchLatestPrice(), TriggeredAlert, asTradePlan(), LogRow, scoreRow(), tryServiceClient(), fetchBinanceKlines() (+7 more)

### Community 65 - "outcome.ts"
Cohesion: 0.11
Nodes (24): applyJournalGuardrails(), JOURNAL_GUARDRAIL_IDS, ExpectancyResult, applyGuardrailVerdict(), BookQuality, evaluateGuardrails(), GuardrailId, GuardrailResult (+16 more)

### Community 66 - "expectancy.ts"
Cohesion: 0.15
Nodes (16): gatherMarketContext(), BookWall, EMPTY_ORDER_BOOK, fetchFuturesContext(), FetchKlinesOptions, fetchOrderBookImbalance(), fetchTicker24hr(), FuturesContext (+8 more)

### Community 67 - "cors.ts"
Cohesion: 0.39
Nodes (7): ScoredRow, buildCorsHeaders(), DEFAULT_ALLOWED_ORIGINS, getAllowedOrigins(), handleOptions(), jsonResponse(), resolveAllowedOrigin()

### Community 68 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, preview, test

### Community 69 - "supabaseClient.js"
Cohesion: 0.19
Nodes (8): AccuracyPanel(), formatNumber(), INTERVAL_OPTIONS, PILL_VARIANTS, ScannerPanel(), EdgeFunctionUnavailableError, invokeFunction(), isUnavailableFunctionError()

### Community 70 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 71 - "dompurify"
Cohesion: 0.67
Nodes (3): dompurify, dompurify, EducationPanel()

### Community 72 - "incrementalIndicators.js"
Cohesion: 0.26
Nodes (12): calculateEMA(), calculateMACD(), calculateRSI(), computeMacdState(), computeRsiState(), computeSeriesIndicators(), extractClosedIndicatorState(), patchLastCandleIndicators() (+4 more)

### Community 75 - "liquidation.ts"
Cohesion: 0.22
Nodes (13): clamp(), CoinglassCluster, derivePressure(), EMPTY, estimateLiquidationClusters(), fetchCoinglassClusters(), fetchLiquidationContext(), fetchOiDeltas() (+5 more)

### Community 76 - "SignUp.jsx"
Cohesion: 0.37
Nodes (7): AuthShell(), GoogleIcon(), SignIn(), SignUp(), getFriendlyAuthError(), isValidEmail(), ensureUserPreferences()

### Community 77 - "AnalysisPanel.jsx"
Cohesion: 0.35
Nodes (7): AnalysisPanel(), formatLevel(), formatSwingTime(), formatValue(), zoneBucket(), deriveSignalAgreement(), signalAgreementLabel()

### Community 78 - "index.ts"
Cohesion: 0.31
Nodes (8): createDefaultPivotLevelOptions(), DEFAULT_CHART_PREFERENCES, getAuthenticatedUserId(), getBearerToken(), normalizeUserKey(), resolveRequestedUserId(), sanitizePivotLevelOptions(), sanitizePreferences()

### Community 79 - "userPreferences.js"
Cohesion: 0.47
Nodes (3): DEFAULT_CHART_PREFERENCES, INDICATOR_PRESETS, OVERLAY_KEYS

### Community 81 - "StatusBar.jsx"
Cohesion: 0.83
Nodes (3): formatPrice(), formatVolume(), StatusBar()

### Community 82 - "fetchBinanceHtfKlines"
Cohesion: 0.67
Nodes (3): fetchBinanceHtfKlines(), parseBinanceKlines(), Candle

## Knowledge Gaps
- **264 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+259 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `level()` connect `confluence.ts` to `backtest.ts`, `ChartPanel.jsx`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Why does `buildConfluenceMap()` connect `confluence.ts` to `features.ts`?**
  _High betweenness centrality (0.178) - this node is a cross-community bridge._
- **Why does `ChartPanel()` connect `ChartPanel.jsx` to `main.jsx`, `pivotChartPrefs.js`, `volumeProfilePrimitive.js`, `chartIndicators.js`, `chartTheme.js`, `confluence.ts`, `drawingTools.js`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _264 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pivotPoints.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08888888888888889 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `PivotSegmentsPrimitive` be split into smaller, more focused modules?**
  _Cohesion score 0.09486166007905138 - nodes in this community are weakly interconnected._