export type DecileStats = { count: number; hits: number; hitRate: number | null; avg_predicted: number | null };

export type SetupStats = { n: number; hit_rate: number | null; avg_r: number | null };

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
  const grouped: Record<string, { n: number; hits: number; rs: number[] }> = {};
  for (const row of rows) {
    const key = row.setup_type ?? "unknown";
    if (!grouped[key]) grouped[key] = { n: 0, hits: 0, rs: [] };
    grouped[key].n += 1;
    if (row.outcome === "target_hit") grouped[key].hits += 1;
    if (row.realized_r != null && Number.isFinite(row.realized_r)) grouped[key].rs.push(row.realized_r);
  }
  const out: Record<string, SetupStats> = {};
  for (const [key, g] of Object.entries(grouped)) {
    out[key] = {
      n: g.n,
      hit_rate: g.n > 0 ? Number((g.hits / g.n).toFixed(3)) : null,
      avg_r: g.rs.length ? Number((g.rs.reduce((a, b) => a + b, 0) / g.rs.length).toFixed(3)) : null,
    };
  }
  return out;
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
