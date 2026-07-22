import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildConfluenceMap,
  nearestConfluenceClusters,
  type LevelInput,
  SOURCE_WEIGHTS,
  topConfluenceClusters,
} from "../_shared/confluence.ts";

function level(price: number, source: LevelInput["source"], label?: string): LevelInput {
  return { price, source, label };
}

Deno.test("buildConfluenceMap clusters nearby levels from a single source into one cluster", () => {
  const levels = [level(100, "pivot_classic"), level(100.1, "pivot_classic"), level(100.05, "pivot_classic")];
  const clusters = buildConfluenceMap(levels, 10);
  assertEquals(clusters.length, 1);
  assertEquals(clusters[0].sourceCount, 1);
});

Deno.test("buildConfluenceMap keeps distant levels in separate clusters", () => {
  const levels = [level(100, "pivot_classic"), level(200, "vwap")];
  const clusters = buildConfluenceMap(levels, 5); // merge distance = 5*0.5 = 2.5, far below the 100 gap
  assertEquals(clusters.length, 2);
});

Deno.test("buildConfluenceMap scores source diversity above raw repetition", () => {
  // Cluster A: three touches, all the same source (swing_support, weight 1.3 each) -> 3.9, no bonus.
  const repeated = [
    level(100, "swing_support"), level(100.1, "swing_support"), level(100.05, "swing_support"),
  ];
  // Cluster B: three touches, three different sources -> weight sum ~3.4 but with the diversity
  // bonus applied, since three independent analyses agreeing is stronger evidence than one
  // analysis repeating itself.
  const diverse = [
    level(200, "pivot_classic"), level(200.1, "vwap"), level(200.05, "volume_profile_poc"),
  ];

  const repeatedCluster = buildConfluenceMap(repeated, 10)[0];
  const diverseCluster = buildConfluenceMap(diverse, 10)[0];

  assertEquals(repeatedCluster.sourceCount, 1);
  assertEquals(diverseCluster.sourceCount, 3);
  assertEquals(diverseCluster.score > repeatedCluster.score, true);
});

Deno.test("buildConfluenceMap computes score as weight sum times the diversity multiplier by hand", () => {
  const levels = [level(100, "ema20"), level(100.1, "ema50")];
  const clusters = buildConfluenceMap(levels, 10, null, 0.5, 0.35);
  // weightSum = 0.9 + 1.0 = 1.9; 2 distinct sources -> multiplier = 1 + 0.35*(2-1) = 1.35
  assertAlmostEquals(clusters[0].score, 1.9 * 1.35, 1e-6);
});

Deno.test("buildConfluenceMap reports distance and percentage distance from the given price", () => {
  const clusters = buildConfluenceMap([level(110, "vwap")], 5, 100);
  assertEquals(clusters[0].distanceToPrice, 10);
  assertAlmostEquals(clusters[0].distancePct!, 10, 1e-9);
});

Deno.test("buildConfluenceMap omits distance fields when no price is supplied", () => {
  const clusters = buildConfluenceMap([level(110, "vwap")], 5, null);
  assertEquals(clusters[0].distanceToPrice, null);
  assertEquals(clusters[0].distancePct, null);
});

Deno.test("buildConfluenceMap falls back to a percentage-of-price merge distance without an ATR", () => {
  const levels = [level(100, "pivot_classic"), level(100.1, "vwap")]; // 0.1% apart
  const clusters = buildConfluenceMap(levels, null, 100);
  assertEquals(clusters.length, 1); // within the default 0.2% fallback band
});

Deno.test("buildConfluenceMap filters out non-finite or non-positive prices", () => {
  const levels = [level(100, "vwap"), level(NaN, "ema20"), level(-5, "ema50"), level(0, "vwap_band")];
  const clusters = buildConfluenceMap(levels, 5);
  assertEquals(clusters.length, 1);
  assertEquals(clusters[0].mid, 100);
});

Deno.test("buildConfluenceMap returns nothing for an empty level list", () => {
  assertEquals(buildConfluenceMap([], 5), []);
});

Deno.test("buildConfluenceMap sorts clusters by score, highest first", () => {
  const levels = [
    level(100, "session_high"), // weight 0.5, alone
    level(200, "vwap"), level(200.1, "pivot_classic"), level(200.05, "volume_profile_poc"), // strong diverse cluster
  ];
  const clusters = buildConfluenceMap(levels, 10);
  // mid is the mean of the cluster's prices (200, 200.1, 200.05), not the first one.
  assertAlmostEquals(clusters[0].mid, 200.05, 1e-6);
  assertEquals(clusters[0].score > clusters[1].score, true);
});

Deno.test("nearestConfluenceClusters finds the closest cluster on each side of price", () => {
  const clusters = buildConfluenceMap(
    [level(90, "vwap"), level(80, "ema20"), level(110, "pivot_classic"), level(130, "ema50")],
    2,
    null,
  );
  const { support, resistance } = nearestConfluenceClusters(clusters, 100);
  assertEquals(support?.mid, 90);
  assertEquals(resistance?.mid, 110);
});

Deno.test("nearestConfluenceClusters returns null on a side with nothing", () => {
  const clusters = buildConfluenceMap([level(90, "vwap")], 2, null);
  const { support, resistance } = nearestConfluenceClusters(clusters, 100);
  assertEquals(support?.mid, 90);
  assertEquals(resistance, null);
});

Deno.test("topConfluenceClusters truncates to the requested count without reordering", () => {
  const levels = Array.from({ length: 12 }, (_, i) => level(100 + i * 20, "vwap"));
  const clusters = buildConfluenceMap(levels, 1);
  const top = topConfluenceClusters(clusters, 5);
  assertEquals(top.length, 5);
  assertEquals(top, clusters.slice(0, 5));
});

Deno.test("SOURCE_WEIGHTS assigns every LevelSource a positive weight", () => {
  for (const [source, weight] of Object.entries(SOURCE_WEIGHTS)) {
    assertEquals(weight > 0, true, `${source} has non-positive weight`);
  }
});
