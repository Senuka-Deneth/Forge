import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  alignClosesByTime,
  applyCrossMarketGating,
  buildCrossMarketContext,
  type CrossMarketContext,
  logReturns,
  pearsonCorrelation,
  regressionBeta,
} from "../_shared/crossMarket.ts";

function candle(time: number, close: number, ema20: number | null = null, ema50: number | null = null) {
  return {
    time, open: close, high: close, low: close, close, volume: 100,
    takerBuyVolume: null, ema20, ema50, rsi14: null, macd: null, macdSignal: null, macdHist: null,
    atr14: null, atrPct: null, bbUpper: null, bbMiddle: null, bbLower: null, bbPercentB: null,
    bbBandwidth: null, vwap: null, adx14: null, plusDI14: null, minusDI14: null, obv: null, cvd: null,
    relativeVolume: null,
  };
}

Deno.test("logReturns produces one fewer value and skips non-positive prices", () => {
  assertEquals(logReturns([100, 110, 121]).length, 2);
  assertAlmostEquals(logReturns([100, 110])[0], Math.log(1.1), 1e-9);
  assertEquals(logReturns([100, 0, 110]).length, 0);
});

Deno.test("pearsonCorrelation is 1 for perfectly proportional series and null for constant input", () => {
  const a = [1, 2, 3, 4, 5];
  const b = [2, 4, 6, 8, 10];
  assertAlmostEquals(pearsonCorrelation(a, b)!, 1, 1e-9);
  assertEquals(pearsonCorrelation([1, 1, 1], [1, 2, 3]), null);
});

Deno.test("pearsonCorrelation is -1 for inversely proportional series", () => {
  const a = [1, 2, 3, 4];
  const b = [8, 6, 4, 2];
  assertAlmostEquals(pearsonCorrelation(a, b)!, -1, 1e-9);
});

Deno.test("regressionBeta recovers the true slope for a known linear relationship", () => {
  // a = 1.5 * b exactly, plus a mean shift (beta is scale-invariant to the mean).
  const b = [0.01, -0.02, 0.03, -0.01, 0.02];
  const a = b.map((v) => v * 1.5);
  assertAlmostEquals(regressionBeta(a, b)!, 1.5, 1e-6);
});

Deno.test("regressionBeta is null when the reference series has no variance", () => {
  assertEquals(regressionBeta([0.01, 0.02, 0.03], [0.05, 0.05, 0.05]), null);
});

Deno.test("alignClosesByTime pairs only overlapping timestamps, in order", () => {
  const a = [{ time: 1, close: 10 }, { time: 2, close: 11 }, { time: 4, close: 13 }];
  const b = [{ time: 2, close: 100 }, { time: 3, close: 105 }, { time: 4, close: 110 }];
  const aligned = alignClosesByTime(a, b);
  // time=1 has no match in b and must be dropped; times 2 and 4 must line up correctly.
  assertEquals(aligned.a, [11, 13]);
  assertEquals(aligned.b, [100, 110]);
});

Deno.test("buildCrossMarketContext flags BTC/ETH themselves and skips beta for them", () => {
  const btcCandles = Array.from({ length: 30 }, (_, i) => candle(i, 100 + i, 100 + i - 1, 100 + i - 2));
  const ctx = buildCrossMarketContext("BTCUSDT", btcCandles.map((c) => ({ time: c.time, close: c.close })), btcCandles, null);
  assertEquals(ctx.isBtcOrEth, true);
  assertEquals(ctx.betaToBtc, null);
  assertEquals(ctx.available, true);
  assertEquals(ctx.btcTrend, "bullish");
});

Deno.test("buildCrossMarketContext computes a high beta for an amplified series", () => {
  const btcReturns = Array.from({ length: 60 }, (_, i) => Math.sin(i / 4) * 0.01);
  let btcPrice = 100;
  let altPrice = 10;
  const btcCandles = [];
  const altCandles = [];
  for (let i = 0; i < btcReturns.length; i += 1) {
    btcPrice *= Math.exp(btcReturns[i]);
    altPrice *= Math.exp(btcReturns[i] * 2); // exactly 2x BTC's moves
    btcCandles.push(candle(i, btcPrice, btcPrice, btcPrice));
    altCandles.push({ time: i, close: altPrice });
  }

  const ctx = buildCrossMarketContext("SOLUSDT", altCandles, btcCandles, null, 50);
  assertEquals(ctx.available, true);
  assertEquals(ctx.isBtcOrEth, false);
  assertAlmostEquals(ctx.betaToBtc!, 2, 0.05);
  assertAlmostEquals(ctx.correlationToBtc!, 1, 0.02);
});

Deno.test("buildCrossMarketContext computes dominance direction from the BTC/ETH ratio", () => {
  const n = 40;
  const btcCandles = Array.from({ length: n }, (_, i) => candle(i, 100 * (1 + i * 0.01)));
  const ethCandles = Array.from({ length: n }, (_, i) => candle(i, 50)); // flat — BTC outruns it
  const altCandles = Array.from({ length: n }, (_, i) => ({ time: i, close: 10 }));

  const ctx = buildCrossMarketContext("SOLUSDT", altCandles, btcCandles, ethCandles);
  assertEquals(ctx.dominance.direction, "btc_leading");
  assertEquals(ctx.dominance.changePct! > 0, true);
});

Deno.test("buildCrossMarketContext degrades to unavailable without BTC data", () => {
  const ctx = buildCrossMarketContext("SOLUSDT", [{ time: 0, close: 10 }], [], null);
  assertEquals(ctx.available, false);
  assertEquals(ctx.betaToBtc, null);
});

// ---------------------------------------------------------------------------
// applyCrossMarketGating
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<CrossMarketContext>): CrossMarketContext {
  return {
    available: true,
    isBtcOrEth: false,
    btcRegime: "trending",
    btcTrend: "bearish",
    btcPrice: 60000,
    correlationToBtc: 0.9,
    betaToBtc: 1.2,
    sampleSize: 100,
    dominance: { ratio: null, changePct: null, direction: "neutral" },
    ...overrides,
  };
}

Deno.test("applyCrossMarketGating forces neutral on a high-beta long against a trending-down BTC", () => {
  const result = applyCrossMarketGating("long", 70, makeContext({}));
  assertEquals(result.bias, "neutral");
  assertEquals(result.applied, true);
  assertEquals(result.reason?.includes("BTC"), true);
});

Deno.test("applyCrossMarketGating only haircuts confidence when BTC itself is not trending", () => {
  const result = applyCrossMarketGating("long", 70, makeContext({ btcRegime: "ranging" }));
  assertEquals(result.bias, "long");
  assertEquals(result.applied, true);
  assertEquals(result.confidence, 58);
});

Deno.test("applyCrossMarketGating does nothing for BTC/ETH themselves", () => {
  const result = applyCrossMarketGating("long", 70, makeContext({ isBtcOrEth: true }));
  assertEquals(result.applied, false);
  assertEquals(result.confidence, 70);
});

Deno.test("applyCrossMarketGating does nothing below the beta threshold", () => {
  const result = applyCrossMarketGating("long", 70, makeContext({ betaToBtc: 0.3 }));
  assertEquals(result.applied, false);
});

Deno.test("applyCrossMarketGating does nothing when BTC trend agrees with the trade", () => {
  const result = applyCrossMarketGating("short", 70, makeContext({ btcTrend: "bearish" }));
  assertEquals(result.applied, false);
  assertEquals(result.bias, "short");
});

Deno.test("applyCrossMarketGating does nothing when context is unavailable or bias is already neutral", () => {
  assertEquals(applyCrossMarketGating("long", 70, makeContext({ available: false })).applied, false);
  assertEquals(applyCrossMarketGating("neutral", 70, makeContext({})).applied, false);
});

Deno.test("applyCrossMarketGating treats a sideways BTC as non-contradictory", () => {
  const result = applyCrossMarketGating("long", 70, makeContext({ btcTrend: "sideways" }));
  assertEquals(result.applied, false);
});
