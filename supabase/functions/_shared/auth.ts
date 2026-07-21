import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string; error_code: "AUTH_REQUIRED" | "INVALID_TOKEN" | "MISSING_SUPABASE_SECRETS" };

const MISSING_SECRETS_MESSAGE =
  "Edge Function is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them in Supabase Dashboard → Project Settings → Edge Functions → Secrets.";

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function tryServiceClient():
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

export async function requireAuthenticatedUser(supabase: SupabaseClient, req: Request): Promise<AuthResult> {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: "Sign in is required to use this feature.", error_code: "AUTH_REQUIRED" };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) {
    return { ok: false, status: 401, error: "Your session expired. Please sign in again.", error_code: "INVALID_TOKEN" };
  }

  return { ok: true, userId: data.user.id };
}
