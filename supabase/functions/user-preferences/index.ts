import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

const DEFAULT_CHART_PREFERENCES = {
  showCandles: true,
  showEma20: false,
  showEma50: false,
  showRsi: false,
  showMacd: false,
  showSupport: false,
  showResistance: false,
  showPivots: false,
  showStandardPivots: false,
};

const USER_KEY_REGEX = /^[a-zA-Z0-9_.@-]{3,128}$/;

function normalizeUserKey(raw: unknown): string {
  const userKey = String(raw ?? "").trim().toLowerCase();
  return USER_KEY_REGEX.test(userKey) ? userKey : "guest";
}

function sanitizePreferences(payload: unknown) {
  const sanitized = { ...DEFAULT_CHART_PREFERENCES };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return sanitized;
  const source = payload as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_CHART_PREFERENCES) as Array<keyof typeof DEFAULT_CHART_PREFERENCES>) {
    if (key in source) sanitized[key] = Boolean(source[key]);
  }
  return sanitized;
}

const MISSING_SECRETS_MESSAGE =
  "Edge Function is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them in Supabase Dashboard → Project Settings → Edge Functions → Secrets.";

function tryServiceClient():
  | { ok: true; client: SupabaseClient }
  | { ok: false; error: string; error_code: "MISSING_SUPABASE_SECRETS" } {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    return { ok: false, error: MISSING_SECRETS_MESSAGE, error_code: "MISSING_SUPABASE_SECRETS" };
  }
  return {
    ok: true,
    client: createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (!["GET", "POST"].includes(req.method)) {
    return jsonResponse({ success: false, error: "Method not allowed.", error_code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const clientResult = tryServiceClient();
  if (!clientResult.ok) {
    return jsonResponse(
      { success: false, error: clientResult.error, error_code: clientResult.error_code },
      503,
    );
  }
  const supabase = clientResult.client;

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const userId = normalizeUserKey(url.searchParams.get("user_id") ?? url.searchParams.get("userKey") ?? "guest");
      const { data, error } = await supabase
        .from("user_preferences")
        .select("preferences")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        return jsonResponse(
          { success: false, error: error.message, error_code: "DATABASE_ERROR", hint: "Check that migration ran and table user_preferences exists." },
          500,
        );
      }
      return jsonResponse({
        success: true,
        user_id: userId,
        userKey: userId,
        preferences: sanitizePreferences(data?.preferences),
      });
    }

    const body = await req.json().catch(() => ({}));
    if (body.action === "get") {
      const userId = normalizeUserKey(body.user_id ?? body.userKey ?? "guest");
      const { data, error } = await supabase
        .from("user_preferences")
        .select("preferences")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        return jsonResponse(
          { success: false, error: error.message, error_code: "DATABASE_ERROR", hint: "Check that migration ran and table user_preferences exists." },
          500,
        );
      }
      return jsonResponse({
        success: true,
        user_id: userId,
        userKey: userId,
        preferences: sanitizePreferences(data?.preferences),
      });
    }

    if (body.action === "upsert") {
      const userId = normalizeUserKey(body.user_id ?? body.userKey ?? "guest");
      const preferences = sanitizePreferences(body.preferences);

      const { error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: userId, preferences }, { onConflict: "user_id" });

      if (error) {
        return jsonResponse(
          { success: false, error: error.message, error_code: "DATABASE_ERROR", hint: "Upsert failed; verify RLS and service role, or migration constraints." },
          500,
        );
      }
      return jsonResponse({
        success: true,
        user_id: userId,
        userKey: userId,
        preferences,
      });
    }

    return jsonResponse({
      success: false,
      error: "Unknown action. Use action: \"get\" or \"upsert\" (POST), or GET with user_id query param.",
      error_code: "INVALID_ACTION",
    }, 400);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      error_code: "UNEXPECTED_ERROR",
    }, 500);
  }
});
