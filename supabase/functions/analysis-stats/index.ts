import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { safeError } from "../_shared/http.ts";
import { requireAuthenticatedUser, tryServiceClient } from "../_shared/auth.ts";

type ScoredRow = {
  outcome: string | null;
  realized_r: number | null;
  response_payload: Record<string, unknown> | null;
};

function confidenceDecile(confidence: number): number {
  return Math.min(9, Math.max(0, Math.floor(confidence / 10)));
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "GET") return jsonResponse(req, { success: false, error: "Method not allowed." }, 405);

  const clientResult = tryServiceClient();
  if (!clientResult.ok) {
    return jsonResponse(req, { success: false, error: clientResult.error }, 503);
  }
  const supabase = clientResult.client;

  const authResult = await requireAuthenticatedUser(supabase, req);
  if (!authResult.ok) {
    return jsonResponse(req, { success: false, error: authResult.error }, authResult.status);
  }

  try {
    const { data, error } = await supabase
      .from("ai_analysis_logs")
      .select("outcome, realized_r, response_payload")
      .eq("status", "success")
      .not("evaluated_at", "is", null)
      .not("outcome", "is", null)
      .in("outcome", ["target_hit", "stop_hit", "expired"])
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const rows = (data ?? []) as ScoredRow[];
    const wins = rows.filter((r) => r.outcome === "target_hit").length;
    const losses = rows.filter((r) => r.outcome === "stop_hit").length;
    const decided = wins + losses;
    const hitRate = decided > 0 ? wins / decided : null;

    const realized = rows.map((r) => Number(r.realized_r)).filter(Number.isFinite);
    const avgRealizedR = realized.length ? realized.reduce((a, b) => a + b, 0) / realized.length : null;
    const expectancy = avgRealizedR;

    const deciles: Record<string, { count: number; hits: number; hitRate: number | null }> = {};
    for (const row of rows) {
      const conf = Number((row.response_payload?.trade_plan as Record<string, unknown> | undefined)?.confidence ?? 50);
      const key = String(confidenceDecile(conf));
      if (!deciles[key]) deciles[key] = { count: 0, hits: 0, hitRate: null };
      deciles[key].count += 1;
      if (row.outcome === "target_hit") deciles[key].hits += 1;
    }
    for (const key of Object.keys(deciles)) {
      const d = deciles[key];
      d.hitRate = d.count > 0 ? d.hits / d.count : null;
    }

    return jsonResponse(req, {
      success: true,
      stats: {
        total_scored: rows.length,
        hit_rate: hitRate != null ? Number(hitRate.toFixed(3)) : null,
        avg_realized_r: avgRealizedR != null ? Number(avgRealizedR.toFixed(3)) : null,
        expectancy: expectancy != null ? Number(expectancy.toFixed(3)) : null,
        wins,
        losses,
        expired: rows.filter((r) => r.outcome === "expired").length,
        confidence_deciles: deciles,
      },
    });
  } catch (error) {
    return jsonResponse(req, { success: false, error: safeError("Failed to load analysis stats.", error) }, 500);
  }
});
