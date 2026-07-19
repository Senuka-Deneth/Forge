# Forge — Prediction Accuracy Audit & Roadmap

**Scope:** Full read of `backend/`, `supabase/functions/`, `supabase/migrations/`, and `frontend/src/`. Findings below are tagged (certain) when based on direct code inspection, (likely) when they're strong inference from established quant-finance theory, and (guessing) where I'm extrapolating without direct evidence.

---

## 1. The core problem, stated plainly

Forge does not currently produce *predictions* — it produces a fluent narrative wrapped around six textbook indicators. (certain, from code) There is no backtest, no historical accuracy log being read back, and the headline "AI Confidence" number is either LLM-hallucinated or a hardcoded formula (`55 + flat bonuses, capped at 95`) with zero statistical grounding. (certain) Before adding a single new feature, you don't know if the current bullish/bearish calls beat a coin flip on BTCUSDT 4h. That's the fix to make first — everything else is optimizing blind.

---

## 2. Current architecture (as built)

- **Frontend:** React 18 + Vite, `lightweight-charts` for rendering, Supabase Auth for login. Live price via a genuine Binance WebSocket kline stream (`wss://stream.binance.com`) — the README's "real-time streaming" claim is accurate. (certain)
- **Serving backend:** Three Supabase Edge Functions (Deno/TypeScript) — `get-market-data`, `calculate-pivots`, `ai-analysis` — are what the frontend actually calls (confirmed via `invokeFunction` call sites). (certain)
- **Parallel backend:** `backend/app.py` (Flask) re-implements the *exact same* indicator/pivot/AI logic in Python. It is not called by the frontend at all currently. (certain) This is dead weight or an abandoned migration artifact — and it's already **drifted**: the Flask service defaults to `nvidia/nemotron-3-super-120b`, the edge function hardcodes `nvidia/nemotron-super-49b-v1`. Two different models, two slightly different prompts, no single source of truth. (certain — this is a live bug, not a hypothetical)
- **Data source:** Binance Spot public REST klines only. No auth needed. No futures/derivatives data anywhere in the payload. (certain)
- **Indicators:** EMA20, EMA50, RSI14 (Wilder smoothing), MACD(12,26,9) — all correctly implemented, textbook formulas, duplicated identically in Flask and TS. (certain)
- **Pivots:** Six methodologies (Traditional, Classic, Fibonacci, Woodie, DM, Camarilla), correctly mapped to a higher timeframe based on chart interval (intraday→daily, 4h→weekly, 1d→monthly, 1w→quarterly) — this replicates TradingView's "Pivot Points Standard" convention. (certain on the code; likely correct against TradingView's own documented behavior)
- **Structure detection:** Swing highs/lows via a naive 2-bar fractal (`find_swings`, lookback=2). No ATR filter, no volume confirmation, no minimum-move threshold. On any noisy timeframe this produces a swing point almost every few candles — noise, not structure. (certain)
- **Support/Resistance:** Literally "nearest swing point above/below price." Not a zone, not weighted by number of touches, no volume-at-price. (certain)
- **AI layer:** Sends indicators + pivots + **only the last 5 closes/volumes** to a free-tier OpenRouter model, temperature 0, single shot, JSON-coerced output. `obi`, `tfi`, `fundingRate`, `oiDelta` are sent as **hardcoded `null`** — the schema has slots for order-flow and derivatives data that are never populated. (certain — I read the exact payload construction in `App.jsx`)
- **"Validation" step:** The UI shows a step called "Validating signal consistency..." — this is a timed loading-message rotation, not an actual second inference pass or cross-check. (certain) That's a transparency problem: the UI implies more rigor than the code performs.
- **Storage:** `ai_analysis_logs` table captures every request/response/latency — good bones for accuracy tracking — but nothing in the app reads it back. It's a write-only log today. (certain)

---

## 3. Why this can't be "very accurate" as built (the theory)

- **LLMs are not calibrated numeric forecasters.** Asking a language model to emit a 0–100 confidence over five closing prices produces a plausible-sounding number, not a statistically grounded probability. This is a well-documented failure mode, not a model-quality issue — it doesn't go away with a bigger model. (likely — established finding in LLM numerical-reasoning literature)
- **Standalone TA indicators have modest, well-studied edge, not strong edge.** Moving-average and RSI-style rules (Brock, Lakonishok & LeBaron 1992, and the large body of work since) show small, decaying edge in liquid markets as adoption rises — they work best as *filters/context*, not as standalone predictors. Using six pivot methodologies and two moving averages doesn't multiply the edge; most of them are highly correlated with each other (EMA20/50 and PP-based pivots are both just different lags on the same price series). (likely, standard quant-finance consensus)
- **No walk-forward or out-of-sample test exists anywhere in the repo.** Nobody — including you — currently knows whether "price > PP = bullish" has any predictive value on BTCUSDT specifically, on any timeframe. (certain, from code absence)
- **Crypto-specific alpha sources are entirely absent.** Funding rate, open interest, liquidation clusters, order-book imbalance, taker buy/sell ratio (CVD) — these are the standard inputs professional crypto desks actually trade on, because perpetual futures (not spot) dominate price discovery in crypto. Spot-only technicals miss the leverage-driven part of every big move. (likely — this is standard practice knowledge, not proprietary)

---

## 4. Roadmap, prioritized by leverage

### Tier 0 — Fix trust and measurement (do this before anything else)
1. **Build an accuracy/calibration harness.** For every row already being written to `ai_analysis_logs`, snapshot price N candles later (e.g. +5, +10, +20 bars) and label whether the stated bullish/bearish scenario played out before its invalidation level was hit. Aggregate hit-rate and a Brier score *per confidence bucket*. This turns "confidence: 73%" from a vibe into a number you can trust or distrust.
2. **Unify Flask and the edge functions.** Pick one for serving (edge functions — that's what's live) and either delete the Flask duplicate or repurpose it purely as an offline research/backtesting environment. Reasoning: duplicated logic across two languages has already silently drifted (different LLM models) — that's a correctness bug today, not a future risk.
3. **Fix the model mismatch** between the two backends as part of #2.

### Tier 1 — Cheap, high-leverage data (days, not weeks)
4. **Funding rate + open interest** from Binance's public Futures API (no auth required). Funding sign/magnitude is a strong crowding indicator — e.g. price up + funding very positive + OI rising = crowded longs, squeeze risk. This alone fills the `fundingRate`/`oiDelta` slots that already exist in your schema and UI but are unused.
5. **Taker buy/sell volume → CVD approximation.** Binance's kline response already includes taker-buy-base-volume — you're fetching it and discarding it. Cumulative Volume Delta from this field is a real (if approximate) order-flow signal, and it fills the `tfi` slot.
6. **VWAP** (rolling or session) — trivial to compute from candles you already have, standard institutional mean-reversion anchor.
7. **ATR** — use it to make the "inflection point" proximity threshold adaptive. Right now it's a fixed 0.3% band, which is wrong for both a $0.01 altcoin and BTC; it should scale with recent volatility.

### Tier 2 — Structural signal quality (weeks)
8. **Multi-timeframe confluence.** Compute trend/momentum on a higher timeframe (e.g. daily) and require the lower timeframe (e.g. 4h) to agree before raising confidence. "Trade with the higher-timeframe trend" is one of the most consistently cited, evidence-backed heuristics in technical trading — and it's currently absent entirely (every call is single-timeframe).
9. **Replace the 2-bar fractal** with clustered swing/S-R zones: group swing points within *X* × ATR of each other, weight by number of touches + recency + volume-at-level. Output a *zone*, not a single tick.
10. **Actually implement RSI/price divergence** (compare local RSI peaks/troughs against price peaks/troughs over N bars) instead of hardcoding `"divergence": "none"`.
11. **Volatility-regime gating.** Classify regime (e.g. ATR percentile vs its own trailing history, or a simple Markov/HMM switch) and pick strategy logic accordingly: mean-reversion signals in low-vol/ranging regimes, breakout/momentum signals in trending/high-vol regimes. Regime-conditioning is one of the most consistently cited improvements over "one-size-fits-all" indicator thresholds in the applied quant literature.

### Tier 3 — Actual predictive modeling (this is the real "strong logic" ask)
12. **Train a supervised classifier** — gradient-boosted trees (XGBoost/LightGBM are the standard default for tabular financial features: robust to noise, fast, and explainable via SHAP) — with a label like "did price move >X% within N candles" using your existing indicators plus the Tier 1/2 features as inputs. Calibrate its raw output with isotonic or Platt scaling so "confidence: 73%" becomes an *actual* probability, not a guess.
13. This environment already has DataRobot tooling connected (skills for model training, feature engineering, explainability, monitoring, deployment) — that's a first-class fit for exactly this workflow and is currently unused. Worth using it rather than hand-rolling a training pipeline.
14. **Change the LLM's job.** Stop asking it to invent a confidence score. Feed it the calibrated model's probability + top SHAP features, and ask it only to narrate. LLMs are good at turning correct structured numbers into readable prose; they are not good at generating the numbers themselves. That's the correct division of labor.
15. **Critical discipline for #12:** any backtest here must be walk-forward (train on past, test strictly forward in time, roll the window) — never a random train/test split on time-series data. A random split leaks future information into training and will silently inflate your accuracy numbers to look great and mean nothing.

### Tier 4 — Sentiment / order-flow / on-chain (optional, higher cost)
16. **Real order-book imbalance** from Binance's free depth snapshot (REST or WS) — replaces the currently-null `obi` field with a real number.
17. **Fear & Greed Index** (alternative.me, free) as a coarse macro-regime filter.
18. **Liquidation clusters** (e.g. Coinglass-style data, usually paid) — large liquidation zones act as magnets/reversal points specifically in leveraged crypto markets.
19. **Cross-asset context** — BTC dominance, DXY, correlation to Nasdaq futures — for macro-aware bias, especially on higher timeframes.

---

## 5. Immediate quick wins (no architecture change required)
- Fix the Flask/edge-function model mismatch.
- Stop discarding taker-buy-volume from the klines response you already fetch.
- Make the inflection-point proximity threshold ATR-relative instead of a fixed 0.3%.
- Once Tier 0's harness exists, surface a real "last 30-day hit-rate" badge next to the AI confidence bar — this alone teaches you more about what's actually working than any new indicator will.

---

## 6. Direct answers to your questions

**New/strong prediction logic:** gradient-boosted trees for classification + isotonic calibration (Tier 3), regime-switching before signal selection (Tier 2), multi-timeframe confluence (Tier 2), volume-weighted S/R clustering (Tier 2) — in that order of leverage-to-effort.

**Add-ons worth integrating:** Binance Futures API (funding/OI — free), Binance depth/aggTrades (order flow — free), Alternative.me Fear & Greed Index (free), Glassnode/CryptoQuant (on-chain — paid), Coinglass (liquidations — paid), FRED/DXY (macro correlation — free).

**Biggest single lever:** Tier 0. A prediction system nobody has measured is not a prediction system — it's a narrative generator with numbers attached. Everything above only matters once you can prove it moved the accuracy needle.
