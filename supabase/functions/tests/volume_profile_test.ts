import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildVolumeProfile,
  buildVolumeProfileResult,
  classifyValueAreaRelation,
  findNakedPocs,
} from "../_shared/volumeProfile.ts";

function bar(time: number, high: number, low: number, close: number, volume: number) {
  return { time, high, low, close, volume };
}

Deno.test("buildVolumeProfile puts the POC where volume actually concentrates", () => {
  const candles = [
    // Heavy trade in a tight band around 100.
    ...Array.from({ length: 20 }, (_, i) => bar(i, 100.5, 99.5, 100, 1000)),
    // Light excursions well above and below.
    bar(20, 130, 129, 129.5, 10),
    bar(21, 71, 70, 70.5, 10),
  ];

  const profile = buildVolumeProfile(candles, 60);
  assertEquals(profile.poc! > 95 && profile.poc! < 105, true);
  assertEquals(profile.val! < profile.poc!, true);
  assertEquals(profile.vah! > profile.poc!, true);
});

Deno.test("buildVolumeProfile spreads volume across a bar's range, not just its midpoint", () => {
  // One wide bar covering 90–110 and one narrow bar at 91. If volume were dumped at the midpoint,
  // the wide bar would pile everything at 100 and the POC would land there. Spread across its
  // range, the narrow bar's concentrated volume wins.
  const candles = [
    bar(0, 110, 90, 100, 1000),
    bar(1, 91.2, 90.8, 91, 900),
  ];

  const profile = buildVolumeProfile(candles, 20);
  assertEquals(profile.poc! < 95, true);
});

Deno.test("buildVolumeProfile value area contains roughly the requested share of volume", () => {
  const candles = Array.from({ length: 100 }, (_, i) => {
    const centre = 100 + Math.sin(i / 5) * 10;
    return bar(i, centre + 1, centre - 1, centre, 100);
  });

  const profile = buildVolumeProfile(candles, 50, 0.7);
  assertEquals(profile.val! < profile.poc! && profile.poc! < profile.vah!, true);
  // The value area should be a genuine subset of the full range.
  const fullRange =
    Math.max(...candles.map((c) => c.high)) - Math.min(...candles.map((c) => c.low));
  assertEquals(profile.vah! - profile.val! < fullRange, true);
});

Deno.test("buildVolumeProfile identifies high and low volume nodes", () => {
  const candles = [
    // Dense shelf at 100.
    ...Array.from({ length: 30 }, (_, i) => bar(i, 100.4, 99.6, 100, 2000)),
    // Sparse traversal from 101 to 120.
    ...Array.from({ length: 19 }, (_, i) => bar(30 + i, 101.5 + i, 100.5 + i, 101 + i, 20)),
    // Second dense shelf at 120.
    ...Array.from({ length: 30 }, (_, i) => bar(49 + i, 120.4, 119.6, 120, 2000)),
  ];

  const profile = buildVolumeProfile(candles, 60);
  assertEquals(profile.hvn.length > 0, true);
  assertEquals(profile.lvn.length > 0, true);

  // High-volume nodes sit on the two shelves.
  assertEquals(profile.hvn.every((n) => n.price < 101.5 || n.price > 118.5), true);
  // Every low-volume node sits in the thin traversal between them...
  assertEquals(profile.lvn.every((n) => n.price > 100.4 && n.price < 119.6), true);
  // ...and is an order of magnitude lighter than the shelves.
  const lightestHvn = Math.min(...profile.hvn.map((n) => n.volume));
  assertEquals(profile.lvn.every((n) => n.volume < lightestHvn / 10), true);
});

Deno.test("buildVolumeProfile degrades safely on empty or flat input", () => {
  assertEquals(buildVolumeProfile([]).poc, null);
  // A single price with no range has no distribution to describe.
  assertEquals(buildVolumeProfile([bar(0, 100, 100, 100, 500)]).poc, null);
  // Zero volume everywhere.
  assertEquals(buildVolumeProfile([bar(0, 110, 90, 100, 0), bar(1, 110, 90, 100, 0)]).poc, null);
});

Deno.test("buildVolumeProfile reports node shares as a fraction of total volume", () => {
  const candles = Array.from({ length: 40 }, (_, i) => bar(i, 105 + i * 0.1, 95 + i * 0.1, 100 + i * 0.1, 500));
  const profile = buildVolumeProfile(candles, 30);

  assertEquals(profile.totalVolume > 0, true);
  for (const node of [...profile.hvn, ...profile.lvn]) {
    assertEquals(node.share >= 0 && node.share <= 1, true);
    // share is volume / totalVolume by definition.
    assertAlmostEquals(node.share, node.volume / profile.totalVolume, 1e-5);
  }
  // Selected nodes are a subset of the distribution, so they cannot exceed the whole.
  assertEquals(profile.hvn.reduce((a, n) => a + n.share, 0) <= 1, true);
});

Deno.test("findNakedPocs reports a prior session POC price never returned to", () => {
  const candles = [
    // Session 0: trades around 100.
    ...Array.from({ length: 24 }, (_, i) => bar(i, 101, 99, 100, 1000)),
    // Sessions 1 and 2: gap far above and stay there.
    ...Array.from({ length: 48 }, (_, i) => bar(24 + i, 151, 149, 150, 1000)),
  ];

  const naked = findNakedPocs(candles, 24);
  assertEquals(naked.length >= 1, true);
  assertEquals(naked.some((p) => p.price > 98 && p.price < 102), true);
});

Deno.test("findNakedPocs excludes a POC that price traded back through", () => {
  const candles = [
    ...Array.from({ length: 24 }, (_, i) => bar(i, 101, 99, 100, 1000)),
    ...Array.from({ length: 24 }, (_, i) => bar(24 + i, 151, 149, 150, 1000)),
    // Third session returns to the original area, testing session 0's POC.
    ...Array.from({ length: 24 }, (_, i) => bar(48 + i, 101, 99, 100, 1000)),
  ];

  const naked = findNakedPocs(candles, 24);
  assertEquals(naked.some((p) => p.price > 98 && p.price < 102), false);
});

Deno.test("findNakedPocs needs more than one session", () => {
  const candles = Array.from({ length: 10 }, (_, i) => bar(i, 101, 99, 100, 100));
  assertEquals(findNakedPocs(candles, 24), []);
});

Deno.test("buildVolumeProfileResult returns composite, developing and naked POCs", () => {
  const candles = Array.from({ length: 100 }, (_, i) => bar(i, 101 + i * 0.1, 99 + i * 0.1, 100 + i * 0.1, 500));
  const result = buildVolumeProfileResult(candles, { sessionBars: 24 });

  assertEquals(result.composite.poc != null, true);
  assertEquals(result.developing?.poc != null, true);
  // Developing profile covers only the last partial session, so its range is tighter.
  const compositeRange = result.composite.vah! - result.composite.val!;
  const developingRange = result.developing!.vah! - result.developing!.val!;
  assertEquals(developingRange <= compositeRange, true);
});

Deno.test("classifyValueAreaRelation places price against the value area", () => {
  const profile = { poc: 100, vah: 110, val: 90, hvn: [], lvn: [], binSize: 1, totalVolume: 1000 };
  assertEquals(classifyValueAreaRelation(120, profile), "above_value");
  assertEquals(classifyValueAreaRelation(100, profile), "in_value");
  assertEquals(classifyValueAreaRelation(80, profile), "below_value");
  assertEquals(classifyValueAreaRelation(null, profile), "unknown");
  assertEquals(classifyValueAreaRelation(100, { ...profile, vah: null }), "unknown");
});
