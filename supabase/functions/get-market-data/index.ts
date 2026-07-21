import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { safeError } from "../_shared/http.ts";
import { requireAuthenticatedUser, tryServiceClient } from "../_shared/auth.ts";
import { consumeQuota } from "../_shared/rateLimit.ts";
import type { Candle } from "../_shared/indicators.ts";
import { fetchBinanceKlines } from "../_shared/binance.ts";

const ALLOWED_INTERVALS = new Set([
  "1m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
]);
const SYMBOL_REGEX = /^[A-Z0-9]{5,20}$/;
const MAX_LIMIT = 1500;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_CALLS = 60;

function parseCacheTtlSeconds(): number {
  const raw = Deno.env.get("MARKET_CACHE_TTL_SECONDS");
  if (raw == null || raw === "") return 300;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 300;
  if (n < 30) return 30;
  if (n > 86400) return 86400;
  return n;
}

function isCandleArray(value: unknown): value is Candle[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (const item of value) {
    if (!item || typeof item !== "object") return false;
    const c = item as Record<string, unknown>;
    if (typeof c.time !== "number" || typeof c.open !== "number" || typeof c.high !== "number" ||
      typeof c.low !== "number" || typeof c.close !== "number" || typeof c.volume !== "number") {
      return false;
    }
  }
  return true;
}

async function readMarketCache(
  supabase: SupabaseClient,
  symbol: string,
  interval: string,
  limit: number,
): Promise<Candle[] | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("market_cache")
    .select("candles")
    .eq("symbol", symbol)
    .eq("interval", interval)
    .eq("limit_count", limit)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (error || !data?.candles) return null;
  if (!isCandleArray(data.candles)) return null;
  return data.candles;
}

async function writeMarketCache(
  supabase: SupabaseClient,
  symbol: string,
  interval: string,
  limit: number,
  candles: Candle[],
  ttlSeconds: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const { error } = await supabase.from("market_cache").upsert(
    {
      symbol,
      interval,
      limit_count: limit,
      candles,
      expires_at: expiresAt,
    },
    { onConflict: "symbol,interval,limit_count" },
  );
  if (error) {
    console.error("[get-market-data] market_cache upsert failed:", error.message);
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (!["GET", "POST"].includes(req.method)) {
    return jsonResponse(req, { error: "Method not allowed." }, 405);
  }

  const clientResult = tryServiceClient();
  if (!clientResult.ok) {
    return jsonResponse(req, { error: clientResult.error, error_code: clientResult.error_code }, 503);
  }
  const supabase = clientResult.client;

  const authResult = await requireAuthenticatedUser(supabase, req);
  if (!authResult.ok) {
    return jsonResponse(req, { error: authResult.error, error_code: authResult.error_code }, authResult.status);
  }

  try {
    const quota = await consumeQuota(supabase, authResult.userId, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_CALLS, "market_data");
    if (!quota.ok) {
      if (quota.reason === "unavailable") {
        return jsonResponse(req, { error: "Rate limit check unavailable. Please try again shortly." }, 503);
      }
      return jsonResponse(req, { error: "Too many market data requests. Please wait and try again." }, 429);
    }

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const symbol = String(body.symbol ?? url.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase().trim();
    const interval = String(body.interval ?? url.searchParams.get("interval") ?? "4h").trim();
    const limitRaw = body.limit ?? url.searchParams.get("limit") ?? "300";
    const parsedLimit = Number.parseInt(String(limitRaw), 10);
    if (!SYMBOL_REGEX.test(symbol)) return jsonResponse(req, { error: "Invalid symbol format." }, 400);
    if (!ALLOWED_INTERVALS.has(interval)) return jsonResponse(req, { error: "Invalid interval." }, 400);
    if (!Number.isInteger(parsedLimit)) return jsonResponse(req, { error: "Limit must be an integer." }, 400);
    if (parsedLimit < 50 || parsedLimit > 10000) return jsonResponse(req, { error: "Limit must be between 50 and 10000." }, 400);
    if (parsedLimit > MAX_LIMIT) return jsonResponse(req, { error: `Limit must not exceed ${MAX_LIMIT}.` }, 400);
    const limit = parsedLimit;

    const ttlSeconds = parseCacheTtlSeconds();

    const cached = await readMarketCache(supabase, symbol, interval, limit);
    if (cached) return jsonResponse(req, cached);

    const candles = await fetchBinanceKlines(symbol, interval, limit);

    try {
      await writeMarketCache(supabase, symbol, interval, limit, candles, ttlSeconds);
    } catch (e) {
      console.error("[get-market-data] market_cache write error:", e instanceof Error ? e.message : String(e));
    }

    return jsonResponse(req, candles);
  } catch (error) {
    return jsonResponse(req, { error: safeError("Unexpected market data error.", error) }, 500);
  }
});
