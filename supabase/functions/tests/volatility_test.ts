import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  calculateChandelierExit,
  calculateDonchian,
  calculateIchimoku,
  calculateKeltnerChannels,
  calculatePersistence,
  calculateRealizedVolatility,
  calculateSqueeze,
  calculateStochRsi,
  calculateSupertrend,
  calculateVarianceRatio,
  rollingMax,
  rollingMin,
} from "../_shared/volatility.ts";

function ohlc(high: number, low: number, close: number, open = close) {
  return { open, high, low, close, volume: 100 };
}

/** Steady uptrend with a fixed bar range — ATR is constant, so levels are hand-checkable. */
function uptrend(length: number, start = 100, step = 1, range = 2) {
  return Array.from({ length }, (_, i) => {
    const close = start + i * step;
    return ohlc(close + range / 2, close - range / 2, close, close - step);
  });
}

function downtrend(length: number, start = 200, step = 1, range = 2) {
  return Array.from({ length }, (_, i) => {
    const close = start - i * step;
    return ohlc(close + range / 2, close - range / 2, close, close + step);
  });
}

// ---------------------------------------------------------------------------

Deno.test("rollingMax and rollingMin are null until the window fills, then exact", () => {
  const values = [5, 3, 8, 1, 9];
  assertEquals(rollingMax(values, 3), [null, null, 8, 8, 9]);
  assertEquals(rollingMin(values, 3), [null, null, 3, 1, 1]);
});

Deno.test("calculateDonchian returns the N-bar high/low and position within the range", () => {
  const candles = [
    ohlc(10, 5, 7), ohlc(12, 6, 11), ohlc(11, 4, 5), ohlc(13, 8, 12),
  ];
  const d = calculateDonchian(candles, 3);
  // Last 3 bars: highs 12/11/13 → 13; lows 6/4/8 → 4; mid 8.5.
  assertEquals(d.latest.upper, 13);
  assertEquals(d.latest.lower, 4);
  assertEquals(d.latest.middle, 8.5);
  // close 12 within [4, 13] → (12-4)/9 = 88.888…%
  assertAlmostEquals(d.latest.positionPct!, 88.888889, 1e-4);
});

Deno.test("calculateDonchian yields nulls when there is not enough history", () => {
  const d = calculateDonchian([ohlc(10, 5, 7)], 20);
  assertEquals(d.latest.upper, null);
  assertEquals(d.latest.positionPct, null);
});

Deno.test("calculateKeltnerChannels brackets the middle line symmetrically", () => {
  const candles = uptrend(60);
  const kc = calculateKeltnerChannels(candles, 20, 20, 1.5);
  const i = candles.length - 1;

  assertEquals(kc.upper[i]! > kc.middle[i]!, true);
  assertEquals(kc.lower[i]! < kc.middle[i]!, true);
  // Bands are a pure ATR offset, so they must be equidistant from the middle.
  assertAlmostEquals(kc.upper[i]! - kc.middle[i]!, kc.middle[i]! - kc.lower[i]!, 1e-9);
});

Deno.test("calculateKeltnerChannels widens with a wider multiplier", () => {
  const candles = uptrend(60);
  const narrow = calculateKeltnerChannels(candles, 20, 20, 1);
  const wide = calculateKeltnerChannels(candles, 20, 20, 3);
  const i = candles.length - 1;
  assertEquals(wide.upper[i]! > narrow.upper[i]!, true);
  assertEquals(wide.lower[i]! < narrow.lower[i]!, true);
});

Deno.test("calculateSqueeze detects compression then release", () => {
  // 60 near-flat bars (tiny close-to-close moves, wide-ish ATR) then a sharp expansion.
  const quiet = Array.from({ length: 60 }, (_, i) => {
    const close = 100 + (i % 2 === 0 ? 0.01 : -0.01);
    return ohlc(close + 0.5, close - 0.5, close, close);
  });
  const squeeze = calculateSqueeze(quiet);
  assertEquals(squeeze.latest.state, "squeeze");
  assertEquals(squeeze.latest.barsInSqueeze > 0, true);

  const expanded = [...quiet, ...Array.from({ length: 12 }, (_, i) => {
    const close = 100 + (i + 1) * 4;
    return ohlc(close + 2, close - 2, close, close - 4);
  })];
  const released = calculateSqueeze(expanded);
  assertEquals(released.latest.state === "expanded" || released.latest.state === "fired", true);
  assertEquals(released.latest.barsInSqueeze, 0);
});

Deno.test("calculateSqueeze momentum turns positive on an upside release", () => {
  const candles = [
    ...Array.from({ length: 40 }, () => ohlc(100.5, 99.5, 100, 100)),
    ...Array.from({ length: 10 }, (_, i) => {
      const close = 100 + (i + 1) * 3;
      return ohlc(close + 1, close - 1, close, close - 3);
    }),
  ];
  const result = calculateSqueeze(candles);
  assertEquals(result.latest.momentum! > 0, true);
});

Deno.test("calculateStochRsi stays within 0-100 and flags extremes", () => {
  // Two phases. The choppy phase gives RSI a real range to be measured against; the clean run at
  // the end pushes RSI to the top of that range. Both are needed: a purely monotonic series pins
  // RSI at exactly 100 (no range — see the degenerate test below), while a purely periodic one
  // never lets the 3-bar smoothed %K clear 80 because the cycle pulls it back every few bars.
  const rising = [100];
  for (let i = 1; i < 60; i += 1) {
    rising.push(i % 5 === 0 ? rising[i - 1] - 3 : rising[i - 1] + 4);
  }
  for (let i = 60; i < 80; i += 1) rising.push(rising[i - 1] + 4);

  const result = calculateStochRsi(rising);
  for (const v of result.k) {
    if (v == null) continue;
    assertEquals(v >= 0 && v <= 100, true);
  }
  assertEquals(result.latest.state, "overbought");

  const falling = [400];
  for (let i = 1; i < 60; i += 1) {
    falling.push(i % 5 === 0 ? falling[i - 1] + 3 : falling[i - 1] - 4);
  }
  for (let i = 60; i < 80; i += 1) falling.push(falling[i - 1] - 4);

  assertEquals(calculateStochRsi(falling).latest.state, "oversold");
});

Deno.test("calculateStochRsi reports null rather than neutral on a degenerate RSI window", () => {
  // Strictly monotonic prices give RSI = 100 on every bar, so there is no range to be relative to.
  // Reporting 50/"neutral" here would be actively misleading during the strongest possible run.
  const monotonic = Array.from({ length: 80 }, (_, i) => 100 + i);
  const result = calculateStochRsi(monotonic);
  assertEquals(result.latest.k, null);
});

Deno.test("calculateStochRsi returns nulls when there is too little data", () => {
  const result = calculateStochRsi([100, 101, 102]);
  assertEquals(result.latest.k, null);
  assertEquals(result.latest.state, "neutral");
});

Deno.test("calculateSupertrend tracks direction and sits on the correct side of price", () => {
  const up = calculateSupertrend(uptrend(60), 10, 3);
  assertEquals(up.latest.direction, 1);
  // In an uptrend the line is the lower band, i.e. below price.
  assertEquals(up.latest.value! < uptrend(60)[59].close, true);

  const down = calculateSupertrend(downtrend(60), 10, 3);
  assertEquals(down.latest.direction, -1);
  assertEquals(down.latest.value! > downtrend(60)[59].close, true);
});

Deno.test("calculateSupertrend reports how long the direction has held", () => {
  const flip = [...downtrend(40), ...uptrend(40, 161, 3)];
  const result = calculateSupertrend(flip, 10, 3);
  assertEquals(result.latest.direction, 1);
  // It flipped somewhere in the second leg, not on the final bar.
  assertEquals(result.latest.flippedBarsAgo! > 0, true);
  assertEquals(result.latest.flippedBarsAgo! < flip.length, true);
});

Deno.test("calculateChandelierExit hangs the stop an ATR multiple off the extreme", () => {
  // Constant 2-wide range → ATR converges to 2, highest high over 22 bars is known.
  const candles = uptrend(60, 100, 1, 2);
  const result = calculateChandelierExit(candles, 22, 3);
  const highestHigh = Math.max(...candles.slice(-22).map((c) => c.high));

  assertEquals(result.latest.long! < highestHigh, true);
  // long stop = HH − 3·ATR, and ATR is 2 here, so the gap is ≈ 6.
  assertAlmostEquals(highestHigh - result.latest.long!, 6, 0.35);
});

Deno.test("calculateIchimoku computes midpoints and locates price against the cloud", () => {
  const candles = uptrend(120);
  const ich = calculateIchimoku(candles);
  const i = candles.length - 1;

  // Tenkan is the 9-bar midpoint by definition.
  const last9 = candles.slice(-9);
  const expectedTenkan = (Math.max(...last9.map((c) => c.high)) + Math.min(...last9.map((c) => c.low))) / 2;
  assertAlmostEquals(ich.latest.tenkan!, expectedTenkan, 1e-6);

  // A steady uptrend leaves price above a cloud built from older, lower prices.
  assertEquals(ich.latest.priceVsCloud, "above");
  assertEquals(ich.latest.cloudTop! >= ich.latest.cloudBottom!, true);
  assertEquals(ich.latest.cloudThicknessPct! >= 0, true);
});

Deno.test("calculateIchimoku displaces the cloud forward rather than reading it live", () => {
  const candles = uptrend(120);
  const ich = calculateIchimoku(candles, 9, 26, 52, 26);
  // With a 26-bar displacement the first 26 plotted cloud values have no source bar.
  assertEquals(ich.senkouA.slice(0, 26).every((v) => v === null), true);
});

Deno.test("calculateRealizedVolatility is zero on a flat series", () => {
  const flat = Array.from({ length: 40 }, () => ohlc(100, 100, 100, 100));
  const rv = calculateRealizedVolatility(flat);
  assertEquals(rv.closeToClose, 0);
  assertEquals(rv.parkinson, 0);
});

Deno.test("calculateRealizedVolatility rises with a noisier series", () => {
  const calm = Array.from({ length: 60 }, (_, i) => {
    const c = 100 + (i % 2 === 0 ? 0.1 : -0.1);
    return ohlc(c + 0.1, c - 0.1, c, c);
  });
  const wild = Array.from({ length: 60 }, (_, i) => {
    const c = 100 + (i % 2 === 0 ? 5 : -5);
    return ohlc(c + 5, c - 5, c, c);
  });
  assertEquals(calculateRealizedVolatility(wild).closeToClose! > calculateRealizedVolatility(calm).closeToClose!, true);
  assertEquals(calculateRealizedVolatility(wild).parkinson! > calculateRealizedVolatility(calm).parkinson!, true);
});

Deno.test("calculateRealizedVolatility returns nulls without enough bars", () => {
  const rv = calculateRealizedVolatility([ohlc(100, 100, 100)], 20);
  assertEquals(rv.closeToClose, null);
  assertEquals(rv.volOfVol, null);
});

Deno.test("calculatePersistence separates a trend from a mean-reverting series", () => {
  const trending = Array.from({ length: 300 }, (_, i) => 100 * Math.exp(i * 0.002));
  const reverting = Array.from({ length: 300 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));

  const t = calculatePersistence(trending);
  const r = calculatePersistence(reverting);

  assertEquals(t.hurst! > r.hurst!, true);
  assertEquals(r.interpretation, "mean_reverting");
});

Deno.test("calculatePersistence returns unknown on too little data", () => {
  const result = calculatePersistence([100, 101, 102]);
  assertEquals(result.hurst, null);
  assertEquals(result.interpretation, "unknown");
});

Deno.test("calculateVarianceRatio separates persistent from alternating returns", () => {
  // Same-sign returns with mild noise compound when aggregated → ratio at or above 1.
  const persistent = Array.from({ length: 400 }, (_, i) => 0.01 + (i % 7) * 0.0005);
  // Alternating returns cancel when aggregated → ratio well below 1.
  const alternating = Array.from({ length: 400 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01));

  const vrPersistent = calculateVarianceRatio(persistent, 4)!;
  const vrAlternating = calculateVarianceRatio(alternating, 4)!;

  assertEquals(vrAlternating < 1, true);
  assertEquals(vrPersistent > vrAlternating, true);
});

Deno.test("calculateVarianceRatio returns null on a degenerate (zero-dispersion) series", () => {
  // 0.01 is inexact in binary, so summing 200 copies leaves ~1e-18 of residual stdev. A strict
  // `variance === 0` guard would miss it and return a meaningless ratio of ~1.0.
  const constant = Array.from({ length: 200 }, () => 0.01);
  assertEquals(calculateVarianceRatio(constant, 4), null);
  assertEquals(calculateVarianceRatio(Array.from({ length: 200 }, () => 0), 4), null);
});
