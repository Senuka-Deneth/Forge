import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { compactForPrompt, type MarketContext } from "../_shared/aiContext.ts";
import type { ConfluenceCluster } from "../_shared/confluence.ts";
import { UNAVAILABLE_CROSS_MARKET_CONTEXT } from "../_shared/crossMarket.ts";

function cluster(overrides: Partial<ConfluenceCluster> = {}): ConfluenceCluster {
  return {
    mid: 100.123456,
    low: 99.987654,
    high: 100.555555,
    score: 3.141592,
    sourceCount: 2,
    sources: ["vwap", "pivot_classic"],
    labels: ["session VWAP", "PP", "extra label"],
    distanceToPrice: 1.234567,
    distancePct: 0.123456,
    ...overrides,
  };
}

function minimalCtx(overrides: Partial<MarketContext> = {}): MarketContext {
  return {
    symbol: "BTCUSDT",
    interval: "4h",
    price: 60_000,
    latest: {} as MarketContext["latest"],
    series: { closes: [], rsi: [], macdHist: [], atrPct: [], obv: [], cvd: [], volume: [] },
    ticker24h: {},
    volatilityState: "medium",
    trendStrength: 50,
    regime: "trending",
    htfBias: "bullish",
    vwapRelation: "above",
    swingHighs: [],
    swingLows: [],
    structure: {
      breakOfStructure: "none",
      trendBias: "ranging",
      lastSwingHighLabel: "HH",
      lastSwingLowLabel: "LL",
      supportZones: [],
      resistanceZones: [],
    },
    rsiDivergence: { type: "none", description: "" },
    macdDivergence: { type: "none", description: "" },
    orderFlow: { obi: null },
    cvdTrend: "neutral",
    futures: { available: false },
    liquidation: { available: false, source: "estimate", estClusters: [] },
    pivots: {} as MarketContext["pivots"],
    nearestSupport: null,
    nearestResistance: null,
    mtf: [],
    confluenceScore: 50,
    signalAgreement: 50,
    confluenceBreakdown: { mtf_confluence: 50, mtf_sample_size: 3, signal_agreement: 50 },
    features: {} as MarketContext["features"],
    volatility: {} as MarketContext["volatility"],
    anchoredVwaps: [{
      kind: "swing_high",
      anchorPrice: 61_000,
      anchorTime: 1,
      latest: {
        vwap: 60_123.456,
        upper1: 61_000,
        lower1: 59_000,
        upper2: 62_000,
        lower2: 58_000,
      },
      zScore: 1.234567,
      relation: "above",
    }],
    liquidity: {
      atr: 500,
      pools: Array.from({ length: 8 }, (_, i) => ({
        side: "buy_side" as const,
        price: 60_000 + i * 10,
        touches: 2,
        firstIndex: 0,
        lastIndex: 1,
        lastTime: null,
        swept: i >= 3,
        sweptAtIndex: null,
      })),
      sweeps: [],
      fairValueGaps: Array.from({ length: 8 }, (_, i) => ({
        index: i,
        time: i,
        direction: "bullish" as const,
        top: 60_100 + i,
        bottom: 60_000 + i,
        sizeAtr: 1,
        fillProgress: 0.1,
        filled: false,
        barsAgo: i,
      })),
      orderBlocks: [],
      nearestBuySidePool: null,
      nearestSellSidePool: null,
      latestReclaimedSweep: null,
    },
    volumeProfileDetail: {
      composite: {
        poc: 60_000,
        vah: 61_000,
        val: 59_000,
        hvn: Array.from({ length: 5 }, (_, i) => ({ price: 60_000 + i * 100, volume: 10, share: 0.1 })),
        lvn: Array.from({ length: 5 }, (_, i) => ({ price: 59_000 - i * 100, volume: 1, share: 0.01 })),
        binSize: 50,
        totalVolume: 1000,
      },
      developing: {
        poc: 60_500,
        vah: 61_500,
        val: 59_500,
        hvn: [{ price: 60_500, volume: 5, share: 0.2 }],
        lvn: [],
        binSize: 25,
        totalVolume: 100,
      },
      valueAreaRelation: "in_value",
    },
    crossMarket: UNAVAILABLE_CROSS_MARKET_CONTEXT,
    sessions: {
      ranges: [
        { session: "asia", dayIndex: 1, high: 61_000, low: 59_000, startTime: 100, endTime: 200, isDeveloping: false },
        { session: "asia", dayIndex: 2, high: 62_000, low: 60_000, startTime: 300, endTime: 400, isDeveloping: true },
        { session: "london", dayIndex: 1, high: 63_000, low: 61_000, startTime: 150, endTime: 250, isDeveloping: false },
        { session: "london", dayIndex: 2, high: 64_000, low: 62_000, startTime: 350, endTime: 450, isDeveloping: true },
      ],
      cmeGap: null,
      fundingWindow: { minutesUntil: null, imminent: false },
      eventBlackout: { blocked: false, label: null, minutesRemaining: null },
    },
    confluence: {
      clusters: Array.from({ length: 8 }, (_, i) => cluster({ mid: 100 + i, score: 5 - i * 0.1 })),
      nearestSupport: cluster({ mid: 95 }),
      nearestResistance: cluster({ mid: 105 }),
    },
    ...overrides,
  } as MarketContext;
}

Deno.test("compactForPrompt drops confluence labels and rounds prices for the prompt", () => {
  const prompt = compactForPrompt(minimalCtx());
  const top = prompt.confluence.topClusters[0];
  assertEquals("labels" in (top as Record<string, unknown>), false);
  assertEquals(top.mid, 100);
  assertEquals(top.score, 5);
  assertEquals(top.dist_pct, 0.12);
  assertEquals(prompt.confluence.topClusters.length, 5);
});

Deno.test("compactForPrompt keeps anchored VWAP to vwap, z, and relation only", () => {
  const av = compactForPrompt(minimalCtx()).anchoredVwaps[0];
  assertEquals(av, { anchor: "swing_high", vwap: 60123, z: 1.23, relation: "above" });
});

Deno.test("compactForPrompt trims liquidity and volume-profile lists for the prompt", () => {
  const prompt = compactForPrompt(minimalCtx());
  assertEquals(prompt.liquidity.unsweptPools.length, 3);
  assertEquals(prompt.liquidity.unfilledFvgs.length, 5);
  assertEquals(prompt.volumeProfile.composite.hvn.length, 3);
  assertEquals(prompt.volumeProfile.composite.lvn.length, 3);
  assertEquals(prompt.volumeProfile.developing, {
    poc: 60500,
    vah: 61500,
    val: 59500,
    valueAreaRelation: "in_value",
  });
});

Deno.test("compactForPrompt keeps developing plus latest completed session ranges only", () => {
  const prompt = compactForPrompt(minimalCtx());
  const sessions = prompt.sessionRanges.map((r) => `${r.session}:${r.isDeveloping}`);
  assertEquals(sessions.sort(), ["asia:false", "asia:true", "london:false", "london:true"]);
});
