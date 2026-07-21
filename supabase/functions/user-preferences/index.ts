import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { safeError } from "../_shared/http.ts";
import { sanitizePivotTimeframe } from "../_shared/pivotPoints.ts";

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
  showHistoricalPivots: true,
  pivotType: "traditional",
  pivotTimeframe: "auto",
  pivotsBack: 15,
};

const USER_KEY_REGEX = /^[a-zA-Z0-9_.@-]{3,128}$/;

function normalizeUserKey(raw: unknown): string {
  const userKey = String(raw ?? "").trim().toLowerCase();
  return USER_KEY_REGEX.test(userKey) ? userKey : "guest";
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function getAuthenticatedUserId(supabase: SupabaseClient, req: Request): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string; error_code: "AUTH_REQUIRED" | "INVALID_TOKEN" }
> {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: "Sign in is required to access chart settings.", error_code: "AUTH_REQUIRED" };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) {
    return { ok: false, status: 401, error: "Your session expired. Please sign in again.", error_code: "INVALID_TOKEN" };
  }

  return { ok: true, userId: data.user.id };
}

function resolveRequestedUserId(raw: unknown, authenticatedUserId: string):
  | { ok: true; userId: string }
  | { ok: false; error: string; error_code: "USER_MISMATCH" | "INVALID_USER_ID" } {
  const requested = raw == null || raw === "" ? authenticatedUserId : normalizeUserKey(raw);
  if (requested === "guest") {
    return { ok: false, error: "Invalid user id.", error_code: "INVALID_USER_ID" };
  }
  if (requested !== authenticatedUserId) {
    return { ok: false, error: "You can only access your own chart settings.", error_code: "USER_MISMATCH" };
  }
  return { ok: true, userId: authenticatedUserId };
}

function sanitizePreferences(payload: unknown) {
  const sanitized = { ...DEFAULT_CHART_PREFERENCES } as Record<string, unknown>;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return sanitized;
  const source = payload as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_CHART_PREFERENCES)) {
    if (key in source) {
      if (key === "pivotType") {
        sanitized[key] = String(source[key]);
      } else if (key === "pivotTimeframe") {
        sanitized[key] = sanitizePivotTimeframe(source[key]);
      } else if (key === "pivotsBack") {
        sanitized[key] = Math.max(1, Math.min(50, Number(source[key]) || 15));
      } else {
        sanitized[key] = Boolean(source[key]);
      }
    }
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
    return jsonResponse(req, { success: false, error: "Method not allowed.", error_code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const clientResult = tryServiceClient();
  if (!clientResult.ok) {
    return jsonResponse(
      req,
      { success: false, error: clientResult.error, error_code: clientResult.error_code },
      503,
    );
  }
  const supabase = clientResult.client;

  const authResult = await getAuthenticatedUserId(supabase, req);
  if (!authResult.ok) {
    return jsonResponse(
      req,
      { success: false, error: authResult.error, error_code: authResult.error_code },
      authResult.status,
    );
  }

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const userResult = resolveRequestedUserId(
        url.searchParams.get("user_id") ?? url.searchParams.get("userKey"),
        authResult.userId,
      );
      if (!userResult.ok) {
        return jsonResponse(req, { success: false, error: userResult.error, error_code: userResult.error_code }, 403);
      }
      const userId = userResult.userId;
      const { data, error } = await supabase
        .from("user_preferences")
        .select("preferences")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        return jsonResponse(req,
          { success: false, error: safeError("Failed to load preferences.", error), error_code: "DATABASE_ERROR" },
          500,
        );
      }
      return jsonResponse(req, {
        success: true,
        user_id: userId,
        userKey: userId,
        preferences: sanitizePreferences(data?.preferences),
      });
    }

    const body = await req.json().catch(() => ({}));
    if (body.action === "get") {
      const userResult = resolveRequestedUserId(body.user_id ?? body.userKey, authResult.userId);
      if (!userResult.ok) {
        return jsonResponse(req, { success: false, error: userResult.error, error_code: userResult.error_code }, 403);
      }
      const userId = userResult.userId;
      const { data, error } = await supabase
        .from("user_preferences")
        .select("preferences")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        return jsonResponse(req,
          { success: false, error: safeError("Failed to load preferences.", error), error_code: "DATABASE_ERROR" },
          500,
        );
      }
      return jsonResponse(req, {
        success: true,
        user_id: userId,
        userKey: userId,
        preferences: sanitizePreferences(data?.preferences),
      });
    }

    if (body.action === "upsert") {
      const userResult = resolveRequestedUserId(body.user_id ?? body.userKey, authResult.userId);
      if (!userResult.ok) {
        return jsonResponse(req, { success: false, error: userResult.error, error_code: userResult.error_code }, 403);
      }
      const userId = userResult.userId;
      const preferences = sanitizePreferences(body.preferences);

      const { error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: userId, preferences }, { onConflict: "user_id" });

      if (error) {
        return jsonResponse(req,
          { success: false, error: safeError("Failed to save preferences.", error), error_code: "DATABASE_ERROR" },
          500,
        );
      }
      return jsonResponse(req, {
        success: true,
        user_id: userId,
        userKey: userId,
        preferences,
      });
    }

    return jsonResponse(req, {
      success: false,
      error: "Unknown action. Use action: \"get\" or \"upsert\" (POST), or GET with user_id query param.",
      error_code: "INVALID_ACTION",
    }, 400);
  } catch (error) {
    return jsonResponse(req, {
      success: false,
      error: safeError("Unexpected preferences error.", error),
      error_code: "UNEXPECTED_ERROR",
    }, 500);
  }
});
