import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

export type QuotaResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "unavailable" };

export async function consumeQuota(
  supabase: SupabaseClient,
  userId: string,
  windowMs: number,
  maxCalls: number,
  eventType = "ai_analysis",
): Promise<QuotaResult> {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
  const { data, error } = await supabase.rpc("consume_ai_analysis_quota", {
    p_user_id: userId,
    p_window: `${windowSeconds} seconds`,
    p_max: maxCalls,
    p_event_type: eventType,
  });

  if (error) {
    console.error(`[rate-limit] RPC failed (${eventType}):`, error.message);
    return { ok: false, reason: "unavailable" };
  }

  if (data === false) return { ok: false, reason: "rate_limited" };
  return { ok: true };
}
