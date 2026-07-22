/**
 * Unified confluence map: every price level the system knows about, clustered and scored together.
 *
 * Today `pivot_analysis.confluences` only checks whether the classic PP sits near EMA20/50 within a
 * fixed 0.5% band — two indicators, one fixed threshold, regardless of instrument or volatility.
 * Meanwhile pivots, swing zones, VWAP, Donchian, Ichimoku, volume-profile nodes, FVGs, order blocks,
 * liquidity pools, session highs/lows and the CME gap are all computed and none of them talk to
 * each other. A level five different analyses independently arrive at is a materially different
 * kind of evidence than the same level from one analysis — this module is what makes that
 * observable, and it is what `buildDeterministicTradePlan` should ultimately pull stops and targets
 * from instead of pivot levels alone.
 */

export type LevelSource =
  | "pivot_classic"
  | "pivot_fibonacci"
  | "pivot_traditional"
  | "swing_support"
  | "swing_resistance"
  | "vwap"
  | "vwap_band"
  | "ema20"
  | "ema50"
  | "donchian_upper"
  | "donchian_lower"
  | "ichimoku_cloud"
  | "volume_profile_poc"
  | "volume_profile_va"
  | "volume_profile_hvn"
  | "volume_profile_lvn"
  | "volume_profile_naked_poc"
  | "fvg"
  | "order_block"
  | "liquidity_pool"
  | "session_high"
  | "session_low"
  | "cme_gap";

export type LevelInput = {
  price: number;
  source: LevelSource;
  /** Free-text detail carried through for the prompt/UI, e.g. "R1" or "swing_high x3". */
  label?: string;
};

/**
 * Relative weight per source, reflecting how much independent evidence a touch from that source
 * represents. Volume-profile POC and swing zones (which already require multiple touches) carry
 * the most weight; single-instance structural markers (FVGs, order blocks, session extremes) carry
 * the least, since any one of them is common and only becomes meaningful in combination.
 */
export const SOURCE_WEIGHTS: Record<LevelSource, number> = {
  pivot_classic: 1,
  pivot_fibonacci: 0.8,
  pivot_traditional: 0.9,
  swing_support: 1.3,
  swing_resistance: 1.3,
  vwap: 1.1,
  vwap_band: 0.7,
  ema20: 0.9,
  ema50: 1,
  donchian_upper: 0.8,
  donchian_lower: 0.8,
  ichimoku_cloud: 1,
  volume_profile_poc: 1.5,
  volume_profile_va: 0.9,
  volume_profile_hvn: 1,
  volume_profile_lvn: 0.4,
  volume_profile_naked_poc: 1.1,
  fvg: 0.6,
  order_block: 0.7,
  liquidity_pool: 0.8,
  session_high: 0.5,
  session_low: 0.5,
  cme_gap: 0.6,
};

export type ConfluenceCluster = {
  mid: number;
  low: number;
  high: number;
  /** Weighted score: sum of source weights, boosted for source diversity. */
  score: number;
  /** How many distinct source *types* contributed — the signal diversity metric. */
  sourceCount: number;
  sources: LevelSource[];
  labels: string[];
  distanceToPrice: number | null;
  distancePct: number | null;
};

function round6(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Cluster levels within `mergeMult * atr` of each other and score each cluster.
 *
 * Scoring rewards diversity over raw count deliberately: five swing-zone touches at slightly
 * different prices is one analysis repeating itself, while a pivot, a VWAP band, and a volume-
 * profile POC landing in the same place is three independent analyses agreeing — the latter should
 * score higher even with fewer total inputs.
 */
export function buildConfluenceMap(
  levels: LevelInput[],
  atr: number | null,
  price: number | null = null,
  mergeMult = 0.5,
  diversityBonus = 0.35,
): ConfluenceCluster[] {
  const finite = levels.filter((l) => Number.isFinite(l.price) && l.price > 0);
  if (!finite.length) return [];

  const mergeDist = atr != null && Number.isFinite(atr) && atr > 0
    ? atr * mergeMult
    : (finite[0].price || 1) * 0.002;

  const sorted = [...finite].sort((a, b) => a.price - b.price);
  const clusters: LevelInput[][] = [];

  for (const level of sorted) {
    const current = clusters[clusters.length - 1];
    if (!current) {
      clusters.push([level]);
      continue;
    }
    const clusterMid = current.reduce((sum, l) => sum + l.price, 0) / current.length;
    if (Math.abs(level.price - clusterMid) <= mergeDist) current.push(level);
    else clusters.push([level]);
  }

  return clusters
    .map((cluster) => {
      const mid = cluster.reduce((sum, l) => sum + l.price, 0) / cluster.length;
      const distinctSources = new Set(cluster.map((l) => l.source));
      const weightSum = cluster.reduce((sum, l) => sum + (SOURCE_WEIGHTS[l.source] ?? 0.5), 0);
      const score = weightSum * (1 + diversityBonus * (distinctSources.size - 1));

      return {
        mid: round6(mid),
        low: round6(Math.min(...cluster.map((l) => l.price))),
        high: round6(Math.max(...cluster.map((l) => l.price))),
        score: round6(score),
        sourceCount: distinctSources.size,
        sources: [...distinctSources],
        labels: cluster.map((l) => l.label ?? l.source),
        distanceToPrice: price != null ? round6(Math.abs(mid - price)) : null,
        distancePct: price != null && price > 0 ? round6((Math.abs(mid - price) / price) * 100) : null,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** Nearest cluster above and below price, from a scored cluster list. */
export function nearestConfluenceClusters(
  clusters: ConfluenceCluster[],
  price: number,
): { support: ConfluenceCluster | null; resistance: ConfluenceCluster | null } {
  const below = clusters.filter((c) => c.mid < price).sort((a, b) => b.mid - a.mid);
  const above = clusters.filter((c) => c.mid > price).sort((a, b) => a.mid - b.mid);
  return { support: below[0] ?? null, resistance: above[0] ?? null };
}

/** Top-N clusters by score — the subset actually worth sending to the model. */
export function topConfluenceClusters(clusters: ConfluenceCluster[], n = 8): ConfluenceCluster[] {
  return clusters.slice(0, n);
}
