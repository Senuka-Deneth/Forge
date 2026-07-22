import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMarketStructure,
  computeSwingProminence,
  findFractalSwings,
  selectSignificantSwings,
} from "../_shared/marketStructure.ts";

/**
 * Realistic oscillating series: many small swings, a few large ones. Mirrors the live prominence
 * distribution where ~95% of swings sit below 1 ATR of prominence.
 */
function wavySeries(length = 200) {
  const candles = [];
  for (let i = 0; i < length; i += 1) {
    const ripple = Math.sin(i / 3) * 2; // frequent small oscillation
    const large = Math.sin(i / 25) * 15; // occasional large swing
    const close = 100 + ripple + large;
    candles.push({
      time: i,
      open: close - 0.2,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000,
    });
  }
  return candles;
}

Deno.test("computeSwingProminence measures a swing against its neighbourhood", () => {
  const candles = [
    { time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
    { time: 1, open: 100, high: 102, low: 99, close: 100, volume: 1 },
    { time: 2, open: 100, high: 110, low: 99, close: 100, volume: 1 }, // the spike
    { time: 3, open: 100, high: 103, low: 99, close: 100, volume: 1 },
    { time: 4, open: 100, high: 101, low: 99, close: 100, volume: 1 },
  ];
  // Highest neighbouring high is 103, so the spike stands 7 above its surroundings.
  assertEquals(computeSwingProminence(candles, { index: 2, price: 110, kind: "high" }), 7);
});

Deno.test("selectSignificantSwings never starves the S/R system when candidates exist", () => {
  const candles = wavySeries();
  const { swingHighs } = findFractalSwings(candles, 2);
  assertEquals(swingHighs.length > 10, true);

  // An absurdly strict threshold used to return an empty set, which left the ranging-regime gate
  // unable to find any zone near price and forced every ranging setup to "wait".
  const selected = selectSignificantSwings(swingHighs, candles, 5, { minMult: 99 });
  assertEquals(selected.length >= 4, true);
});

Deno.test("selectSignificantSwings prefers the most prominent swings when it falls back", () => {
  const candles = wavySeries();
  const { swingHighs } = findFractalSwings(candles, 2);
  const selected = selectSignificantSwings(swingHighs, candles, 5, { minMult: 99, minCount: 5 });

  const selectedProm = selected.map((s) => computeSwingProminence(candles, s));
  const allProm = swingHighs.map((s) => computeSwingProminence(candles, s)).sort((a, b) => b - a);
  const cutoff = allProm[4];

  assertEquals(selected.length, 5);
  for (const p of selectedProm) assertEquals(p >= cutoff, true);
});

Deno.test("selectSignificantSwings returns results in chronological order", () => {
  const candles = wavySeries();
  const { swingHighs } = findFractalSwings(candles, 2);
  const selected = selectSignificantSwings(swingHighs, candles, 5, { minMult: 99 });

  // Callers index into candles with these and compare against lastIndex, so order matters.
  for (let i = 1; i < selected.length; i += 1) {
    assertEquals(selected[i].index > selected[i - 1].index, true);
  }
});

Deno.test("selectSignificantSwings still honours the threshold when plenty of swings clear it", () => {
  const candles = wavySeries();
  const { swingHighs } = findFractalSwings(candles, 2);
  const strict = selectSignificantSwings(swingHighs, candles, 5, { minMult: 0.5, minCount: 2 });
  const loose = selectSignificantSwings(swingHighs, candles, 5, { minMult: 0.05, minCount: 2 });
  assertEquals(loose.length >= strict.length, true);
});

Deno.test("buildMarketStructure produces usable S/R zones on an oscillating series", () => {
  const candles = wavySeries();
  const result = buildMarketStructure(candles, candles.map(() => 50));

  // The whole downstream chain (nearZone gating, signal agreement, confluence) depends on these
  // being non-empty.
  assertEquals(result.srZones.supports.length > 0, true);
  assertEquals(result.srZones.resistances.length > 0, true);
  assertEquals(result.swingHighs.length > 0, true);
  assertEquals(result.swingLows.length > 0, true);
});

Deno.test("selectSignificantSwings passes swings through when ATR is unavailable", () => {
  const candles = wavySeries();
  const { swingHighs } = findFractalSwings(candles, 2);
  assertEquals(selectSignificantSwings(swingHighs, candles, null).length, swingHighs.length);
  assertEquals(selectSignificantSwings([], candles, 5).length, 0);
});
import { classifyMarketStructure } from "../_shared/indicators.ts";
import type { Candle } from "../_shared/indicators.ts";

function blankCandle(i: number, close: number): Candle {
  return {
    time: i, open: close, high: close + 1, low: close - 1, close, volume: 1000,
    takerBuyVolume: 500, ema20: null, ema50: null, rsi14: null, macd: null, macdSignal: null,
    macdHist: null, atr14: null, atrPct: null, bbUpper: null, bbMiddle: null, bbLower: null,
    bbPercentB: null, bbBandwidth: null, vwap: null, adx14: null, plusDI14: null, minusDI14: null,
    obv: null, cvd: null, relativeVolume: null,
  };
}

Deno.test("classifyMarketStructure bullish BOS when close breaks swing high", () => {
  const candles = [blankCandle(0, 100), blankCandle(1, 105), blankCandle(2, 120)];
  const swingHighs = [{ index: 1, time: 1, price: 106 }];
  const swingLows = [{ index: 0, time: 0, price: 99 }];
  const ms = classifyMarketStructure(candles, swingHighs, swingLows);
  assertEquals(ms.breakOfStructure, "bullish");
});
