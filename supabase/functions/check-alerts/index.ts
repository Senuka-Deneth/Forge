import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { safeError } from "../_shared/http.ts";
import { tryServiceClient } from "../_shared/auth.ts";
import { isCronSecretConfigured, verifyCronSecret } from "../_shared/cronAuth.ts";
import { fetchBinanceKlines } from "../_shared/binance.ts";

type AlertRow = {
  id: string;
  symbol: string;
  level: number;
  direction: "above" | "below";
};

type TriggeredAlert = {
  id: string;
  symbol: string;
  level: number;
  direction: string;
  price: number;
};

/** Last 1m close is enough for price-alert checks and avoids an extra ticker endpoint. */
async function fetchLatestPrice(symbol: string): Promise<number | null> {
  try {
    const candles = await fetchBinanceKlines(symbol, "1m", 1);
    const last = candles[candles.length - 1];
    return last?.close != null && Number.isFinite(last.close) ? last.close : null;
  } catch (error) {
    console.error("[check-alerts] price fetch failed:", symbol, error instanceof Error ? error.message : String(error));
    return null;
  }
}

function alertTriggered(price: number, level: number, direction: string): boolean {
  if (direction === "above") return price >= level;
  if (direction === "below") return price <= level;
  return false;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse(req, { success: false, error: "Method not allowed." }, 405);
  }

  if (!isCronSecretConfigured()) {
    return jsonResponse(req, { success: false, error: "CRON_SECRET not configured." }, 503);
  }
  if (!(await verifyCronSecret(req.headers.get("X-Cron-Secret")))) {
    return jsonResponse(req, { success: false, error: "Unauthorized." }, 401);
  }

  const clientResult = tryServiceClient();
  if (!clientResult.ok) {
    return jsonResponse(req, { success: false, error: clientResult.error }, 503);
  }
  const supabase = clientResult.client;

  try {
    const { data: alerts, error } = await supabase
      .from("price_alerts")
      .select("id, symbol, level, direction")
      .eq("armed", true)
      .is("triggered_at", null);

    if (error) throw error;

    const rows = (alerts ?? []) as AlertRow[];
    const symbols = [...new Set(rows.map((row) => row.symbol))];
    const priceBySymbol = new Map<string, number>();

    await Promise.all(symbols.map(async (symbol) => {
      const price = await fetchLatestPrice(symbol);
      if (price != null) priceBySymbol.set(symbol, price);
    }));

    const triggered: TriggeredAlert[] = [];
    const now = new Date().toISOString();

    for (const alert of rows) {
      const price = priceBySymbol.get(alert.symbol);
      if (price == null) continue;
      if (!alertTriggered(price, Number(alert.level), alert.direction)) continue;

      const { error: updateError } = await supabase
        .from("price_alerts")
        .update({ triggered_at: now, armed: false })
        .eq("id", alert.id);

      if (updateError) {
        console.error("[check-alerts] update failed:", alert.id, updateError.message);
        continue;
      }

      triggered.push({
        id: alert.id,
        symbol: alert.symbol,
        level: Number(alert.level),
        direction: alert.direction,
        price,
      });
    }

    return jsonResponse(req, { success: true, checked: rows.length, triggered });
  } catch (error) {
    return jsonResponse(req, { success: false, error: safeError("Alert check failed.", error) }, 500);
  }
});
