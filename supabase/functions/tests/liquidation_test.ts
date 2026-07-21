import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { estimateLiquidationClusters } from "../_shared/liquidation.ts";

Deno.test("estimateLiquidationClusters returns empty when swings missing", () => {
  assertEquals(estimateLiquidationClusters(null, 100, 5, 1.2), []);
  assertEquals(estimateLiquidationClusters(110, null, 5, 1.2), []);
});

Deno.test("estimateLiquidationClusters produces 8 bands for 4 leverage tiers", () => {
  const clusters = estimateLiquidationClusters(110, 100, 5, 1.2);
  assertEquals(clusters.length, 8);
  const longs = clusters.filter((c) => c.side === "long");
  const shorts = clusters.filter((c) => c.side === "short");
  assertEquals(longs.length, 4);
  assertEquals(shorts.length, 4);
});

Deno.test("estimateLiquidationClusters long bands sit below swing low", () => {
  const swingLow = 100;
  const swingHigh = 110;
  const clusters = estimateLiquidationClusters(swingHigh, swingLow, 0, 1);
  for (const cluster of clusters.filter((c) => c.side === "long")) {
    assert(cluster.price < swingLow, `long liq ${cluster.price} should be below swingLow ${swingLow}`);
    assert(cluster.price > 0);
    assert(cluster.strength > 0 && cluster.strength <= 1);
  }
});

Deno.test("estimateLiquidationClusters short bands sit above swing high", () => {
  const swingLow = 100;
  const swingHigh = 110;
  const clusters = estimateLiquidationClusters(swingHigh, swingLow, 0, 1);
  for (const cluster of clusters.filter((c) => c.side === "short")) {
    assert(cluster.price > swingHigh, `short liq ${cluster.price} should be above swingHigh ${swingHigh}`);
    assert(cluster.strength > 0 && cluster.strength <= 1);
  }
});

Deno.test("estimateLiquidationClusters weights long side when long/short ratio elevated", () => {
  const crowdedLongs = estimateLiquidationClusters(110, 100, 10, 1.8);
  const crowdedShorts = estimateLiquidationClusters(110, 100, 10, 0.6);
  const avgLongStrength = crowdedLongs
    .filter((c) => c.side === "long")
    .reduce((sum, c) => sum + c.strength, 0) / 4;
  const avgShortStrengthCrowdedLongs = crowdedLongs
    .filter((c) => c.side === "short")
    .reduce((sum, c) => sum + c.strength, 0) / 4;
  const avgShortStrengthCrowdedShorts = crowdedShorts
    .filter((c) => c.side === "short")
    .reduce((sum, c) => sum + c.strength, 0) / 4;

  assert(avgLongStrength > avgShortStrengthCrowdedLongs);
  assert(avgShortStrengthCrowdedShorts > avgShortStrengthCrowdedLongs);
});

Deno.test("estimateLiquidationClusters uses leverage tier formula", () => {
  const clusters = estimateLiquidationClusters(100, 90, null, null);
  const tenXLong = clusters.find((c) => c.side === "long" && c.price === Number((90 * 0.9).toFixed(6)));
  assert(tenXLong != null, "expected 10x long band at swingLow*(1-1/10)");
});
