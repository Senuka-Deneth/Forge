import { applyCrossMarketGating, type CrossMarketContext } from "./crossMarket.ts";

export type SetupType =
  | "trend_continuation_long"
  | "trend_continuation_short"
  | "range_fade_long"
  | "range_fade_short"
  | "breakout"
  | "wait";

export type TradePlanTarget = { label: string; price: number | null; risk_reward: number | null };

export type TradePlan = {
  bias: "long" | "short" | "wait";
  entry_zone: { low: number | null; high: number | null } | null;
  stop_loss: number | null;
  targets: TradePlanTarget[];
  risk_reward_summary: string;
  confidence: number;
  rationale: string;
  empirical_confidence?: number | null;
  position_sizing?: {
    risk_pct: number;
    formula: string;
    note: string;
  } | null;
};

export type GatingContext = {
  price: number;
  latest: { atr14: number | null };
  regime: "trending" | "ranging" | "volatile_chop";
  htfBias: "bullish" | "bearish" | "mixed";
  mtf: Array<{ trend: "bullish" | "bearish" | "mixed" }>;
  structure: {
    supportZones: Array<{ mid: number }>;
    resistanceZones: Array<{ mid: number }>;
  };
  confluenceScore: number;
  pivots: {
    classic: {
      analysis: {
        allLevels: Array<{ label: string; value: number }>;
      };
    };
  };
  nearestSupport: { label: string; value: number } | null;
  nearestResistance: { label: string; value: number } | null;
  /** BTC-beta cross-market context (crossMarket.ts). Optional and defaults to skipping the check —
   * same contract as the existing HTF-contradiction gate below: omit it, or hand it an
   * `available: false` context, and this simply does nothing rather than guessing. */
  crossMarket?: CrossMarketContext;
};

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function entryMid(plan: TradePlan): number | null {
  if (!plan.entry_zone) return null;
  const low = finite(plan.entry_zone.low);
  const high = finite(plan.entry_zone.high);
  if (low == null || high == null) return null;
  return (low + high) / 2;
}

function nearZone(price: number, zones: Array<{ mid: number }>, atr: number): boolean {
  if (!zones.length) return false;
  const threshold = atr * 0.5;
  return zones.some((z) => Math.abs(price - z.mid) <= threshold);
}

function htfContradictions(bias: "long" | "short", mtf: GatingContext["mtf"]): number {
  const expected = bias === "long" ? "bullish" : "bearish";
  return mtf.filter((r) => r.trend !== "mixed" && r.trend !== expected).length;
}

export function classifySetupType(
  bias: "long" | "short" | "neutral",
  regime: GatingContext["regime"],
): SetupType {
  if (bias === "neutral") return "wait";
  if (regime === "trending") return bias === "long" ? "trend_continuation_long" : "trend_continuation_short";
  if (regime === "ranging") return bias === "long" ? "range_fade_long" : "range_fade_short";
  return "breakout";
}

export function applyRegimeGating(
  bias: "long" | "short" | "neutral",
  confidence: number,
  ctx: GatingContext,
): { bias: "long" | "short" | "neutral"; confidence: number; setupType: SetupType; crossMarketNote: string | null } {
  let gatedBias = bias;
  let gatedConfidence = confidence;

  if (ctx.regime === "volatile_chop") {
    return { bias: "neutral", confidence: gatedConfidence, setupType: "wait", crossMarketNote: null };
  }

  if (ctx.regime === "ranging" && gatedBias !== "neutral") {
    const atr = ctx.latest.atr14 ?? ctx.price * 0.01;
    const zones = gatedBias === "long" ? ctx.structure.supportZones : ctx.structure.resistanceZones;
    if (!nearZone(ctx.price, zones, atr)) {
      gatedBias = "neutral";
    }
  }

  if (gatedBias === "long" || gatedBias === "short") {
    const contradictions = htfContradictions(gatedBias, ctx.mtf);
    if (contradictions >= 2) {
      gatedBias = "neutral";
    } else if (contradictions === 1) {
      gatedConfidence = clamp(gatedConfidence - 15, 0, 100);
    }
  }

  // Cross-market (BTC beta) gating runs after the HTF check, on whatever bias survived it — a
  // setup the HTF gate already killed has nothing left for this to contradict.
  let crossMarketNote: string | null = null;
  if ((gatedBias === "long" || gatedBias === "short") && ctx.crossMarket) {
    const crossMarketResult = applyCrossMarketGating(gatedBias, gatedConfidence, ctx.crossMarket);
    if (crossMarketResult.applied) {
      gatedBias = crossMarketResult.bias;
      gatedConfidence = crossMarketResult.confidence;
      crossMarketNote = crossMarketResult.reason;
    }
  }

  const setupType = classifySetupType(gatedBias, ctx.regime);
  return { bias: gatedBias, confidence: gatedConfidence, setupType, crossMarketNote };
}

export function buildDeterministicTradePlan(
  ctx: GatingContext,
  bias: "long" | "short" | "neutral",
  confidence: number,
): TradePlan {
  const { price, latest, pivots, confluenceScore } = ctx;
  const atr = latest.atr14 ?? price * 0.01;

  if (bias === "neutral") {
    return {
      bias: "wait",
      entry_zone: null,
      stop_loss: null,
      targets: [],
      risk_reward_summary: "No clear directional edge; trend, momentum, and multi-timeframe signals are not aligned.",
      confidence: clamp(confidence || 40 + Math.round(confluenceScore / 10), 20, 60),
      rationale: "Wait for trend, momentum, and higher-timeframe confluence to align before sizing a position.",
    };
  }

  const levels = pivots.classic.analysis.allLevels as Array<{ label: string; value: number }>;
  const isLong = bias === "long";
  const entryLow = isLong ? price - atr * 0.15 : price;
  const entryHigh = isLong ? price : price + atr * 0.15;
  const stop = isLong
    ? Math.min(...[ctx.nearestSupport?.value, price - atr * 1.5].filter((v): v is number => v != null))
    : Math.max(...[ctx.nearestResistance?.value, price + atr * 1.5].filter((v): v is number => v != null));

  const candidateTargets = (isLong
    ? levels.filter((l) => l.value > price).sort((a, b) => a.value - b.value)
    : levels.filter((l) => l.value < price).sort((a, b) => b.value - a.value)
  ).slice(0, 3);

  const risk = Math.abs(price - stop);
  const targets: TradePlanTarget[] = candidateTargets.map((lvl, i) => {
    const reward = Math.abs(lvl.value - price);
    return {
      label: `T${i + 1} (${lvl.label})`,
      price: lvl.value,
      risk_reward: risk > 0 ? Number((reward / risk).toFixed(2)) : null,
    };
  });

  const bestRR = targets.find((t) => t.risk_reward != null)?.risk_reward ?? null;

  return {
    bias: isLong ? "long" : "short",
    entry_zone: { low: Number(entryLow.toFixed(6)), high: Number(entryHigh.toFixed(6)) },
    stop_loss: Number(stop.toFixed(6)),
    targets,
    risk_reward_summary: bestRR != null
      ? `Nearest target offers roughly ${bestRR}:1 reward-to-risk from the suggested entry and stop.`
      : "Insufficient pivot levels beyond price to size a reward-to-risk target.",
    confidence: clamp(confidence || 45 + Math.round(confluenceScore / 4), 20, 90),
    rationale: `${isLong ? "Long" : "Short"} bias from trend/momentum alignment with ${confluenceScore}% multi-timeframe agreement. Stop placed beyond ${isLong ? "nearest support" : "nearest resistance"} with an ATR buffer; targets use the next pivot levels in the trade direction.`,
  };
}

/** Validate directional geometry: long stop < entry < targets; short mirrored. */
export function validateTradePlanGeometry(plan: TradePlan, currentPrice: number): { valid: boolean; reason?: string } {
  if (plan.bias === "wait") return { valid: true };

  const stop = finite(plan.stop_loss);
  const entryLow = finite(plan.entry_zone?.low);
  const entryHigh = finite(plan.entry_zone?.high);
  const targets = plan.targets.map((t) => finite(t.price)).filter((p): p is number => p != null);

  if (stop == null || entryLow == null || entryHigh == null) {
    return { valid: false, reason: "missing stop or entry zone" };
  }
  if (entryLow > entryHigh) {
    return { valid: false, reason: "entry zone inverted" };
  }

  const entryMidPrice = (entryLow + entryHigh) / 2;
  const maxEntryDrift = Math.abs(currentPrice) * 0.15;
  if (Math.abs(entryMidPrice - currentPrice) > maxEntryDrift) {
    return { valid: false, reason: "entry zone too far from current price" };
  }

  if (plan.bias === "long") {
    if (!(stop < entryLow && entryHigh < (targets[0] ?? Infinity))) {
      return { valid: false, reason: "long geometry invalid" };
    }
    for (let i = 1; i < targets.length; i += 1) {
      if (targets[i] <= targets[i - 1]) return { valid: false, reason: "long targets not ascending" };
    }
    if (targets.some((t) => t <= entryHigh)) return { valid: false, reason: "long target at or below entry" };
    if (stop >= entryLow) return { valid: false, reason: "long stop not below entry" };
  } else {
    if (!(stop > entryHigh && entryLow > (targets[0] ?? -Infinity))) {
      return { valid: false, reason: "short geometry invalid" };
    }
    for (let i = 1; i < targets.length; i += 1) {
      if (targets[i] >= targets[i - 1]) return { valid: false, reason: "short targets not descending" };
    }
    if (targets.some((t) => t >= entryLow)) return { valid: false, reason: "short target at or above entry" };
    if (stop <= entryHigh) return { valid: false, reason: "short stop not above entry" };
  }

  return { valid: true };
}

/** Recompute per-target and summary risk/reward from entry mid and stop. */
export function recomputeTradePlanRiskReward(plan: TradePlan): TradePlan {
  if (plan.bias === "wait" || !plan.entry_zone) return plan;

  const stop = finite(plan.stop_loss);
  const mid = entryMid(plan);
  if (stop == null || mid == null) return plan;

  const risk = Math.abs(mid - stop);
  if (risk <= 0) return plan;

  const targets = plan.targets.map((t) => {
    const price = finite(t.price);
    if (price == null) return t;
    const reward = Math.abs(price - mid);
    return { ...t, risk_reward: Number((reward / risk).toFixed(2)) };
  });

  const best = targets.find((t) => t.risk_reward != null)?.risk_reward ?? null;
  return {
    ...plan,
    targets,
    risk_reward_summary: best != null
      ? `Nearest target offers roughly ${best}:1 reward-to-risk from the suggested entry and stop.`
      : plan.risk_reward_summary,
  };
}

export function appendPositionSizing(plan: TradePlan, riskPct = 1): TradePlan {
  if (plan.bias === "wait") return plan;
  const mid = entryMid(plan);
  const stop = finite(plan.stop_loss);
  if (mid == null || stop == null) return plan;
  const riskPerUnit = Math.abs(mid - stop);
  if (riskPerUnit <= 0) return plan;

  return {
    ...plan,
    position_sizing: {
      risk_pct: riskPct,
      formula: "position_size = (account_size × risk_pct/100) / |entry_mid − stop|",
      note: "Informational sizing formula only — not financial advice.",
    },
  };
}
