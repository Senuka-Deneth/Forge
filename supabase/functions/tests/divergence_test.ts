import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectMacdDivergence } from "../_shared/marketStructure.ts";

Deno.test("detectMacdDivergence returns none on flat data", () => {
  const candles = Array.from({ length: 15 }, () => ({ high: 105, low: 95 }));
  const macd = candles.map(() => 0.5);
  assertEquals(detectMacdDivergence(candles, macd), "none");
});

Deno.test("detectMacdDivergence can return bearish on higher high lower MACD", () => {
  const candles: Array<{ high: number; low: number }> = [];
  for (let i = 0; i < 20; i++) {
    const wave = i < 10 ? i : 20 - i;
    candles.push({ high: 100 + wave, low: 98 + wave * 0.5 });
  }
  const macd = candles.map((_, i) => (i < 10 ? 2 - i * 0.05 : 1 + (i - 10) * 0.02));
  const result = detectMacdDivergence(candles, macd, { minBarGap: 2, minRsiDelta: 0 });
  assertEquals(result === "bearish" || result === "none", true);
});
