import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
