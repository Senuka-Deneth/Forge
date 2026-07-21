export type TradePlanTarget = { label: string; price: number | null; risk_reward: number | null };

export type TradePlan = {
  bias: "long" | "short" | "wait";
  entry_zone: { low: number | null; high: number | null } | null;
  stop_loss: number | null;
  targets: TradePlanTarget[];
  risk_reward_summary: string;
  confidence: number;
  rationale: string;
  position_sizing?: {
    risk_pct: number;
    formula: string;
    note: string;
  } | null;
};

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function entryMid(plan: TradePlan): number | null {
  if (!plan.entry_zone) return null;
  const low = finite(plan.entry_zone.low);
  const high = finite(plan.entry_zone.high);
  if (low == null || high == null) return null;
  return (low + high) / 2;
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
