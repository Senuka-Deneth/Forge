import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildLevelInputsFromContext,
  type ConfluenceInputParts,
} from "../_shared/aiContext.ts";
import type { PivotDataResponse } from "../_shared/pivotPoints.ts";

/**
 * Minimal fixture for buildLevelInputsFromContext — every field the function actually reads, with
 * everything else empty/null so each test can override only what it cares about.
 */
function baseParts(overrides: Partial<ConfluenceInputParts> = {}): ConfluenceInputParts {
  const emptyPivotSet = { pivots: {}, analysis: {} as unknown };
  return {
    latest: { ema20: null, ema50: null, vwap: null } as ConfluenceInputParts["latest"],
    pivots: {
      classic: emptyPivotSet,
      fibonacci: emptyPivotSet,
      traditional: emptyPivotSet,
    } as unknown as PivotDataResponse,
    supportZones: [],
    resistanceZones: [],
    donchian: { upper: null, lower: null, middle: null, positionPct: null },
    ichimoku: {
      tenkan: null, kijun: null, cloudTop: null, cloudBottom: null,
      cloudThicknessPct: null, priceVsCloud: "unknown", tkCross: "none",
    },
    anchoredVwaps: [],
    volumeProfile: {
      composite: { poc: null, vah: null, val: null, hvn: [], lvn: [], binSize: null, totalVolume: 0 },
      developing: null,
      nakedPocs: [],
    },
    liquidity: { atr: null, pools: [], sweeps: [], fairValueGaps: [], orderBlocks: [], nearestBuySidePool: null, nearestSellSidePool: null, latestReclaimedSweep: null },
    sessionRanges: [],
    cmeGap: null,
    ...overrides,
  };
}

Deno.test("buildLevelInputsFromContext extracts numeric pivot levels and labels them by set", () => {
  const parts = baseParts({
    pivots: {
      classic: { pivots: { PP: 100, R1: 105, S1: null }, analysis: {} },
      fibonacci: { pivots: { PP: 100, R1: 103 }, analysis: {} },
      traditional: { pivots: { PP: 100, R1: 107 }, analysis: {} },
    } as unknown as PivotDataResponse,
  });
  const levels = buildLevelInputsFromContext(parts);

  const classicLevels = levels.filter((l) => l.source === "pivot_classic");
  assertEquals(classicLevels.length, 2); // PP and R1; the null S1 is dropped
  assertEquals(classicLevels.some((l) => l.price === 105 && l.label === "R1"), true);

  assertEquals(levels.filter((l) => l.source === "pivot_fibonacci").length, 2);
  assertEquals(levels.filter((l) => l.source === "pivot_traditional").length, 2);
});

Deno.test("buildLevelInputsFromContext ignores non-numeric pivot fields", () => {
  const parts = baseParts({
    pivots: {
      classic: { pivots: { PP: 100, zone: "between_pp_r1", bias: "bullish" }, analysis: {} },
      fibonacci: { pivots: {}, analysis: {} },
      traditional: { pivots: {}, analysis: {} },
    } as unknown as PivotDataResponse,
  });
  const levels = buildLevelInputsFromContext(parts);
  assertEquals(levels.filter((l) => l.source === "pivot_classic").length, 1);
});

Deno.test("buildLevelInputsFromContext carries swing-zone touches into the label", () => {
  const parts = baseParts({
    supportZones: [{ mid: 90, low: 89, high: 91, touches: 3, lastIndex: 10, score: 35 }],
    resistanceZones: [{ mid: 110, low: 109, high: 111, touches: 2, lastIndex: 12, score: 25 }],
  });
  const levels = buildLevelInputsFromContext(parts);
  const support = levels.find((l) => l.source === "swing_support")!;
  const resistance = levels.find((l) => l.source === "swing_resistance")!;
  assertEquals(support.price, 90);
  assertEquals(support.label, "touches=3");
  assertEquals(resistance.price, 110);
});

Deno.test("buildLevelInputsFromContext includes EMA/VWAP only when present", () => {
  const withValues = buildLevelInputsFromContext(baseParts({
    latest: { ema20: 100, ema50: 95, vwap: 98 } as ConfluenceInputParts["latest"],
  }));
  assertEquals(withValues.some((l) => l.source === "ema20" && l.price === 100), true);
  assertEquals(withValues.some((l) => l.source === "ema50" && l.price === 95), true);
  assertEquals(withValues.some((l) => l.source === "vwap" && l.price === 98), true);

  const withoutValues = buildLevelInputsFromContext(baseParts());
  assertEquals(withoutValues.some((l) => l.source === "ema20"), false);
});

Deno.test("buildLevelInputsFromContext emits both Donchian edges and both cloud edges", () => {
  const levels = buildLevelInputsFromContext(baseParts({
    donchian: { upper: 120, lower: 80, middle: 100, positionPct: 50 },
    ichimoku: {
      tenkan: 100, kijun: 98, cloudTop: 105, cloudBottom: 95,
      cloudThicknessPct: 5, priceVsCloud: "above", tkCross: "none",
    },
  }));
  assertEquals(levels.filter((l) => l.source === "donchian_upper" || l.source === "donchian_lower").length, 2);
  assertEquals(levels.filter((l) => l.source === "ichimoku_cloud").length, 2);
});

Deno.test("buildLevelInputsFromContext expands one anchored VWAP into its mean plus present bands", () => {
  const levels = buildLevelInputsFromContext(baseParts({
    anchoredVwaps: [{
      kind: "swing_high",
      anchorPrice: 100,
      anchorTime: 0,
      latest: { vwap: 100, upper1: 105, lower1: 95, upper2: null, lower2: 90 },
      zScore: 0.5,
      relation: "above",
    }],
  }));
  assertEquals(levels.filter((l) => l.source === "vwap").length, 1);
  // upper2 is null and must be skipped rather than emitted as a bogus level.
  assertEquals(levels.filter((l) => l.source === "vwap_band").length, 3);
  assertEquals(levels.every((l) => l.label?.includes("swing_high")), true);
});

Deno.test("buildLevelInputsFromContext surfaces POC, value area, HVN/LVN and naked POCs", () => {
  const levels = buildLevelInputsFromContext(baseParts({
    volumeProfile: {
      composite: {
        poc: 100, vah: 110, val: 90,
        hvn: [{ price: 101, volume: 500, share: 0.1 }],
        lvn: [{ price: 105, volume: 10, share: 0.01 }],
        binSize: 1, totalVolume: 5000,
      },
      developing: null,
      nakedPocs: [{ price: 120, sessionIndex: 0, time: null, barsAgo: 30 }],
    },
  }));
  assertEquals(levels.some((l) => l.source === "volume_profile_poc" && l.price === 100), true);
  assertEquals(levels.filter((l) => l.source === "volume_profile_va").length, 2);
  assertEquals(levels.some((l) => l.source === "volume_profile_hvn" && l.price === 101), true);
  assertEquals(levels.some((l) => l.source === "volume_profile_lvn" && l.price === 105), true);
  assertEquals(levels.some((l) => l.source === "volume_profile_naked_poc" && l.price === 120), true);
});

Deno.test("buildLevelInputsFromContext uses the midpoint of a FVG/order block, not an edge", () => {
  const levels = buildLevelInputsFromContext(baseParts({
    liquidity: {
      atr: 5, sweeps: [], nearestBuySidePool: null, nearestSellSidePool: null, latestReclaimedSweep: null,
      pools: [],
      fairValueGaps: [{ index: 0, time: 0, direction: "bullish", top: 110, bottom: 100, sizeAtr: 2, fillProgress: 0.5, filled: false, barsAgo: 3 }],
      orderBlocks: [{ index: 0, time: 0, direction: "bearish", top: 50, bottom: 40, displacementAtr: 3, mitigated: false, barsAgo: 5 }],
    },
  }));
  const fvg = levels.find((l) => l.source === "fvg")!;
  const ob = levels.find((l) => l.source === "order_block")!;
  assertEquals(fvg.price, 105); // (110+100)/2
  assertEquals(fvg.label?.includes("50%"), true);
  assertEquals(ob.price, 45); // (50+40)/2
});

Deno.test("buildLevelInputsFromContext drops swept pools but keeps unswept ones", () => {
  const levels = buildLevelInputsFromContext(baseParts({
    liquidity: {
      atr: 5, sweeps: [], fairValueGaps: [], orderBlocks: [], nearestBuySidePool: null, nearestSellSidePool: null, latestReclaimedSweep: null,
      pools: [
        { side: "buy_side", price: 110, touches: 2, firstIndex: 0, lastIndex: 5, lastTime: null, swept: true, sweptAtIndex: 8 },
        { side: "sell_side", price: 90, touches: 2, firstIndex: 0, lastIndex: 5, lastTime: null, swept: false, sweptAtIndex: null },
      ],
    },
  }));
  assertEquals(levels.filter((l) => l.source === "liquidity_pool").length, 1);
  assertEquals(levels[0].price, 90);
});

Deno.test("buildLevelInputsFromContext emits both high and low for every session range", () => {
  const levels = buildLevelInputsFromContext(baseParts({
    sessionRanges: [
      { session: "asia", dayIndex: 0, high: 105, low: 95, startTime: 0, endTime: 100, isDeveloping: false },
      { session: "london", dayIndex: 0, high: 108, low: 98, startTime: 100, endTime: 200, isDeveloping: true },
    ],
  }));
  assertEquals(levels.filter((l) => l.source === "session_high").length, 2);
  assertEquals(levels.filter((l) => l.source === "session_low").length, 2);
});

Deno.test("buildLevelInputsFromContext includes an unfilled CME gap but not a filled one", () => {
  const gap = { fridayCloseTime: 0, fridayClose: 100, mondayOpenTime: 1, mondayOpen: 105, gapPct: 5, direction: "up" as const, filled: false };
  const unfilled = buildLevelInputsFromContext(baseParts({ cmeGap: gap }));
  assertEquals(unfilled.filter((l) => l.source === "cme_gap").length, 2);

  const filled = buildLevelInputsFromContext(baseParts({ cmeGap: { ...gap, filled: true } }));
  assertEquals(filled.filter((l) => l.source === "cme_gap").length, 0);
});

Deno.test("buildLevelInputsFromContext returns nothing for a fully empty context", () => {
  assertEquals(buildLevelInputsFromContext(baseParts()), []);
});
