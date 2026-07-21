import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { safeError } from "../_shared/http.ts";
import { requireAuthenticatedUser, tryServiceClient } from "../_shared/auth.ts";
import {
  computeBrierScore,
  computeReliabilityCurve,
  computeSetupStats,
  empiricalConfidence,
} from "../_shared/calibration.ts";

type ScoredRow = {
  outcome: string | null;
  realized_r: number | null;
  setup_type: string | null;
  response_payload: Record<string, unknown> | null;
};

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
      .select("outcome, realized_r, setup_type, response_payload")
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

    const confidenceRows = rows.map((r) => ({
      confidence: Number((r.response_payload?.trade_plan as Record<string, unknown> | undefined)?.confidence ?? 50),
      outcome: r.outcome ?? "expired",
    }));

    const deciles = computeReliabilityCurve(confidenceRows);
    const brierScore = computeBrierScore(confidenceRows);

    const setupStats = computeSetupStats(rows.map((r) => ({
      setup_type: r.setup_type ?? (r.response_payload?._meta as Record<string, unknown> | undefined)?.setup_type as string | null ?? null,
      outcome: r.outcome ?? "expired",
      realized_r: r.realized_r,
    })));

    const globalRate = hitRate ?? 0.5;
    const empiricalBySetup: Record<string, number> = {};
    for (const [setupType, stats] of Object.entries(setupStats)) {
      const hits = Math.round((stats.hit_rate ?? 0) * stats.n);
      empiricalBySetup[setupType] = empiricalConfidence(hits, stats.n, globalRate);
    }

    return jsonResponse(req, {
      success: true,
      stats: {
        total_scored: rows.length,
        hit_rate: hitRate != null ? Number(hitRate.toFixed(3)) : null,
        avg_realized_r: avgRealizedR != null ? Number(avgRealizedR.toFixed(3)) : null,
        expectancy: expectancy != null ? Number(expectancy.toFixed(3)) : null,
        brier_score: brierScore,
        wins,
        losses,
        expired: rows.filter((r) => r.outcome === "expired").length,
        confidence_deciles: deciles,
        setup_stats: setupStats,
        empirical_confidence_by_setup: empiricalBySetup,
      },
    });
  } catch (error) {
    return jsonResponse(req, { success: false, error: safeError("Failed to load analysis stats.", error) }, 500);
  }
});
