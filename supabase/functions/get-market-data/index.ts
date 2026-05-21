import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
};

const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const ALLOWED_INTERVALS = new Set([
  "1m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
]);
const SYMBOL_REGEX = /^[A-Z0-9]{5,20}$/;

function round6(value: number | null): number | null {
  return value == null ? null : Number(value.toFixed(6));
}

function calculateEMA(values: number[], period: number): Array<number | null> {
  if (!values.length || period <= 0 || values.length < period) {
    return values.map(() => null);
  }

  const ema = values.map(() => null as number | null);
  const multiplier = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema[period - 1] = seed;

  for (let i = period; i < values.length; i += 1) {
    ema[i] = (values[i] - (ema[i - 1] as number)) * multiplier + (ema[i - 1] as number);
  }
  return ema;
}

function calculateRSI(values: number[], period = 14): Array<number | null> {
  if (values.length < 2) return values.map(() => null);

  const gains = [0];
  const losses = [0];
  for (let i = 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.abs(Math.min(change, 0)));
  }

  const rsi = values.map(() => null as number | null);
  if (values.length <= period) return rsi;

  let avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < values.length; i += 1) {
    avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
    avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

function calculateMACD(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = calculateEMA(values, fast);
  const emaSlow = calculateEMA(values, slow);
  const macdLine = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null
  );
  const compactMacd = macdLine.filter((v): v is number => v != null);
  const compactSignal = calculateEMA(compactMacd, signal);
  const signalLine = values.map(() => null as number | null);
  const histogram = values.map(() => null as number | null);

  let compactIdx = 0;
  for (let i = 0; i < macdLine.length; i += 1) {
    if (macdLine[i] == null) continue;
    const sig = compactSignal[compactIdx];
    signalLine[i] = sig;
    if (sig != null) histogram[i] = (macdLine[i] as number) - sig;
    compactIdx += 1;
  }
  return { macdLine, signalLine, histogram };
}

function enrichCandles(candles: Omit<Candle, "ema20" | "ema50" | "rsi14" | "macd" | "macdSignal" | "macdHist">[]): Candle[] {
  const closes = candles.map((c) => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);
  const { macdLine, signalLine, histogram } = calculateMACD(closes);

  return candles.map((c, i) => ({
    ...c,
    ema20: round6(ema20[i]),
    ema50: round6(ema50[i]),
    rsi14: round6(rsi14[i]),
    macd: round6(macdLine[i]),
    macdSignal: round6(signalLine[i]),
    macdHist: round6(histogram[i]),
  }));
}

async function fetchBinanceKlines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  let remaining = limit;
  let currentEndTime: number | null = null;
  let allRawData: unknown[][] = [];

  while (remaining > 0) {
    const fetchLimit = Math.min(remaining, 1000);
    const url = new URL(BINANCE_KLINES_URL);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(fetchLimit));
    if (currentEndTime != null) url.searchParams.set("endTime", String(currentEndTime));

    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Binance request failed: ${response.status} ${body}`);
    }

    const rawData = await response.json();
    if (!Array.isArray(rawData) || rawData.length === 0) break;

    allRawData = [...rawData, ...allRawData];
    currentEndTime = Number(rawData[0][0]) - 1;
    remaining -= rawData.length;
    if (rawData.length < fetchLimit) break;
  }

  const candles = allRawData.map((item) => ({
    time: Math.trunc(Number(item[0]) / 1000),
    open: Number(item[1]),
    high: Number(item[2]),
    low: Number(item[3]),
    close: Number(item[4]),
    volume: Number(item[5]),
  })).slice(-limit);

  return enrichCandles(candles);
}

function parseCacheTtlSeconds(): number {
  const raw = Deno.env.get("MARKET_CACHE_TTL_SECONDS");
  if (raw == null || raw === "") return 300;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 300;
  if (n < 30) return 30;
  if (n > 86400) return 86400;
  return n;
}

function optionalServiceClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isCandleArray(value: unknown, expectedLength: number): value is Candle[] {
  if (!Array.isArray(value) || value.length !== expectedLength) return false;
  if (value.length === 0) return false;
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
  if (!isCandleArray(data.candles, limit)) return null;
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
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const symbol = String(body.symbol ?? url.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase().trim();
    const interval = String(body.interval ?? url.searchParams.get("interval") ?? "4h").trim();
    const limitRaw = body.limit ?? url.searchParams.get("limit") ?? "300";
    const limit = Number.parseInt(String(limitRaw), 10);

    if (!SYMBOL_REGEX.test(symbol)) return jsonResponse({ error: "Invalid symbol format." }, 400);
    if (!ALLOWED_INTERVALS.has(interval)) return jsonResponse({ error: "Invalid interval." }, 400);
    if (!Number.isInteger(limit)) return jsonResponse({ error: "Limit must be an integer." }, 400);
    if (limit < 50 || limit > 10000) return jsonResponse({ error: "Limit must be between 50 and 10000." }, 400);

    const ttlSeconds = parseCacheTtlSeconds();
    const supabase = optionalServiceClient();

    if (supabase) {
      const cached = await readMarketCache(supabase, symbol, interval, limit);
      if (cached) return jsonResponse(cached);
    }

    const candles = await fetchBinanceKlines(symbol, interval, limit);

    if (supabase) {
      try {
        await writeMarketCache(supabase, symbol, interval, limit, candles, ttlSeconds);
      } catch (e) {
        console.error("[get-market-data] market_cache write error:", e instanceof Error ? e.message : String(e));
      }
    }

    return jsonResponse(candles);
  } catch (error) {
    return jsonResponse({
      error: "Unexpected market data error.",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
