import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calculateATR } from "../_shared/atr.ts";
import { calculateATR as indicatorsATR } from "../_shared/indicators.ts";
import { calculateATR as marketStructureATR } from "../_shared/marketStructure.ts";

function makeCandles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    high: 110 + i * 0.5,
    low: 100 + i * 0.3,
    close: 105 + i * 0.4,
  }));
}

Deno.test("canonical ATR matches marketStructure and indicators", () => {
  const candles = makeCandles(20);
  const canon = calculateATR(candles, 14);
  const ms = marketStructureATR(candles, 14);
  const ind = indicatorsATR(candles, 14);
  assertEquals(ms.value, canon.value);
  assertEquals(ind.atr[ind.atr.length - 1], canon.value);
});

Deno.test("ATR first value at index period", () => {
  const candles = makeCandles(16);
  const { series } = calculateATR(candles, 14);
  for (let i = 0; i < 14; i++) assertEquals(series[i], null);
  assertEquals(series[14] != null, true);
});
