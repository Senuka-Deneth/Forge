import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveRegime } from "../_shared/regime.ts";
import { enrichCandles } from "../_shared/indicators.ts";
import type { Candle } from "../_shared/indicators.ts";
import { applyRegimeGating } from "../_shared/tradePlan.ts";

function makeTrendingSeries(): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  for (let i = 0; i < 220; i += 1) {
    price += 0.4 + Math.sin(i / 8) * 0.05;
    const high = price + 0.6;
    const low = price - 0.2;
    candles.push({
      time: i,
      open: price,
      high,
      low,
      close: price + 0.1,
      volume: 1000 + i,
      takerBuyVolume: 600,
      ema20: null,
      ema50: null,
      rsi14: null,
      macd: null,
      macdSignal: null,
      macdHist: null,
      atr14: null,
      atrPct: null,
      bbUpper: null,
      bbMiddle: null,
      bbLower: null,
      bbPercentB: null,
      bbBandwidth: null,
      vwap: null,
      adx14: null,
      plusDI14: null,
      minusDI14: null,
      obv: null,
      cvd: null,
      relativeVolume: null,
    });
  }
  return enrichCandles(candles);
}

Deno.test("deriveRegime downgrades trending without HTF alignment", () => {
  const regimeAligned = deriveRegime(makeTrendingSeries(), true);
  const regimeMisaligned = deriveRegime(makeTrendingSeries(), false);
  if (regimeAligned.regime === "trending") {
    assertEquals(regimeMisaligned.regime, "ranging");
  }
});

Deno.test("applyRegimeGating forces wait in volatile chop", () => {
  const gated = applyRegimeGating("long", 70, {
    price: 100,
    latest: { atr14: 5 },
    regime: "volatile_chop",
    htfBias: "bullish",
    mtf: [{ trend: "bullish" }, { trend: "bullish" }, { trend: "bullish" }],
    structure: { supportZones: [{ mid: 99 }], resistanceZones: [{ mid: 105 }] },
    confluenceScore: 70,
    pivots: { classic: { analysis: { allLevels: [] } } },
    nearestSupport: { label: "S1", value: 95 },
    nearestResistance: { label: "R1", value: 110 },
  });
  assertEquals(gated.bias, "neutral");
  assertEquals(gated.setupType, "wait");
});
