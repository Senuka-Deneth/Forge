export type DecileStats = { count: number; hits: number; hitRate: number | null; avg_predicted: number | null };

export type SetupStats = { n: number; decided: number; hit_rate: number | null; avg_r: number | null };

export function confidenceDecile(confidence: number): number {
  return Math.min(9, Math.max(0, Math.floor(confidence / 10)));
}

export function computeBrierScore(
  rows: Array<{ confidence: number; outcome: string }>,
): number | null {
  const decided = rows.filter((r) => r.outcome === "target_hit" || r.outcome === "stop_hit");
  if (!decided.length) return null;
  const sum = decided.reduce((acc, row) => {
    const predicted = row.confidence / 100;
    const actual = row.outcome === "target_hit" ? 1 : 0;
    return acc + (predicted - actual) ** 2;
  }, 0);
  return Number((sum / decided.length).toFixed(4));
}

export function computeReliabilityCurve(
  rows: Array<{ confidence: number; outcome: string }>,
): Record<string, DecileStats> {
  const deciles: Record<string, DecileStats> = {};
  for (const row of rows) {
    const key = String(confidenceDecile(row.confidence));
    if (!deciles[key]) deciles[key] = { count: 0, hits: 0, hitRate: null, avg_predicted: null };
    deciles[key].count += 1;
    if (row.outcome === "target_hit") deciles[key].hits += 1;
  }
  for (const key of Object.keys(deciles)) {
    const d = deciles[key];
    d.hitRate = d.count > 0 ? Number((d.hits / d.count).toFixed(3)) : null;
    d.avg_predicted = d.count > 0 ? Number(((Number(key) * 10 + 5) / 100).toFixed(3)) : null;
  }
  return deciles;
}

export function computeSetupStats(
  rows: Array<{ setup_type: string | null; outcome: string; realized_r: number | null }>,
): Record<string, SetupStats> {
  const grouped: Record<string, { n: number; hits: number; losses: number; rs: number[] }> = {};
  for (const row of rows) {
    const key = row.setup_type ?? "unknown";
    if (!grouped[key]) grouped[key] = { n: 0, hits: 0, losses: 0, rs: [] };
    grouped[key].n += 1;
    if (row.outcome === "target_hit") grouped[key].hits += 1;
    if (row.outcome === "stop_hit") grouped[key].losses += 1;
    if (row.realized_r != null && Number.isFinite(row.realized_r)) grouped[key].rs.push(row.realized_r);
  }
  const out: Record<string, SetupStats> = {};
  for (const [key, g] of Object.entries(grouped)) {
    const decided = g.hits + g.losses;
    out[key] = {
      n: g.n,
      decided,
      hit_rate: decided > 0 ? Number((g.hits / decided).toFixed(3)) : null,
      avg_r: g.rs.length ? Number((g.rs.reduce((a, b) => a + b, 0) / g.rs.length).toFixed(3)) : null,
    };
  }
  return out;
}

export type CalibrationRow = {
  outcome: string | null;
  setup_type: string | null;
  regime: string | null;
};

export type CalibrationBucket = "setup_regime" | "setup" | "global";

export type EmpiricalCalibration = {
  n: number;
  empirical_hit_rate: number;
  /** Which bucket the rate came from, so a broad fallback is never read as a precise measurement. */
  bucket: CalibrationBucket;
};

/** Minimum decided samples before a bucket is considered specific enough to use on its own. */
export const MIN_BUCKET_SAMPLES = 20;

export function decidedCounts(rows: CalibrationRow[]): { hits: number; decided: number } {
  const hits = rows.filter((r) => r.outcome === "target_hit").length;
  const losses = rows.filter((r) => r.outcome === "stop_hit").length;
  return { hits, decided: hits + losses };
}

/**
 * Pick the narrowest trustworthy base rate for a setup.
 *
 * Prefers setup_type x regime — the same setup in a trending market and in volatile chop are
 * different bets, and pooling them produces a rate that describes neither. Falls back to
 * setup_type, then to the global pooled rate, whenever the narrower bucket has too few decided
 * samples to mean anything, and always reports which bucket it landed on.
 */
export function selectCalibrationBucket(
  rows: CalibrationRow[],
  setupType: string,
  regime: string | null,
  minSamples = MIN_BUCKET_SAMPLES,
): EmpiricalCalibration | null {
  const global = decidedCounts(rows);
  const globalRate = global.decided > 0 ? global.hits / global.decided : 0.5;

  const setupRows = rows.filter((r) => r.setup_type === setupType);
  const regimeRows = regime ? setupRows.filter((r) => r.regime === regime) : [];

  const candidates: Array<{ bucket: CalibrationBucket; rows: CalibrationRow[] }> = [
    { bucket: "setup_regime", rows: regimeRows },
    { bucket: "setup", rows: setupRows },
  ];

  for (const candidate of candidates) {
    const { hits, decided } = decidedCounts(candidate.rows);
    if (decided >= minSamples) {
      return {
        n: decided,
        empirical_hit_rate: empiricalConfidence(hits, decided, globalRate) / 100,
        bucket: candidate.bucket,
      };
    }
  }

  // Neither bucket is thick enough to stand alone. Report the widest honest number and label it
  // rather than dressing up a handful of samples as a per-setup rate.
  const setupCounts = decidedCounts(setupRows);
  if (setupCounts.decided > 0) {
    return {
      n: setupCounts.decided,
      empirical_hit_rate: empiricalConfidence(setupCounts.hits, setupCounts.decided, globalRate) / 100,
      bucket: "setup",
    };
  }
  if (global.decided > 0) {
    return { n: global.decided, empirical_hit_rate: globalRate, bucket: "global" };
  }
  return null;
}

export function empiricalConfidence(
  hits: number,
  n: number,
  globalRate: number,
  priorWeight = 10,
): number {
  if (n <= 0) return Number((globalRate * 100).toFixed(1));
  const rate = (hits + priorWeight * globalRate) / (n + priorWeight);
  return Number((rate * 100).toFixed(1));
}

/**
 * Prefer a backtest-seeded prior (setup_baselines) over the pooled live global rate when available.
 * Live results still dominate as n grows — that is the point of the Bayesian weight.
 */
export function resolvePriorRate(
  baselineHitRate: number | null | undefined,
  globalRate: number,
): number {
  if (baselineHitRate != null && Number.isFinite(baselineHitRate) && baselineHitRate >= 0 && baselineHitRate <= 1) {
    return baselineHitRate;
  }
  return globalRate;
}

/** Clamp headline confidence to empirical hit rate + margin when enough samples exist. */
export function clampModelConfidence(
  modelConfidence: number,
  calibration: { n: number; empirical_hit_rate: number } | null,
  margin = 15,
): { confidence: number; capped: boolean } {
  if (!calibration || calibration.n < 20) {
    return { confidence: modelConfidence, capped: false };
  }
  const ceiling = Math.round(calibration.empirical_hit_rate * 100) + margin;
  if (modelConfidence <= ceiling) {
    return { confidence: modelConfidence, capped: false };
  }
  return { confidence: Math.min(modelConfidence, ceiling), capped: true };
}
