/**
 * Per-user journal + risk-settings snapshots for guardrail evaluation.
 *
 * Market analysis is shared/cached across users; journal state is not. Callers must attach these
 * after any shared-cache read so daily-loss / cooldown / open-R gates stay user-scoped.
 */

import {
  DEFAULT_RISK_SETTINGS,
  type JournalSnapshot,
  type RiskSettings,
} from "./guardrails.ts";

/** Minimal PostgREST-shaped client — avoids pulling @supabase/supabase-js into unit-test typecheck. */
export type JournalDbClient = {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
};

export type JournalTradeRow = {
  symbol: string;
  status: string;
  r_multiple: number | null;
  closed_at: string | null;
  opened_at: string | null;
  stop: number | null;
  entry: number | null;
  size: number | null;
};

const MAJOR_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT"]);

function startOfUtcDayIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function openPositionRiskR(row: JournalTradeRow): number {
  const entry = Number(row.entry);
  const stop = Number(row.stop);
  const size = Number(row.size);
  if (![entry, stop, size].every(Number.isFinite) || size <= 0) return 0;
  const riskPerUnit = Math.abs(entry - stop);
  if (riskPerUnit <= 0) return 0;
  // Size is in base units; risk in quote ≈ riskPerUnit * size. Express as R where 1R = that risk —
  // an open position that defined its stop contributes 1R of open risk by construction.
  return 1;
}

/**
 * Aggregate journal rows into the snapshot shape evaluateGuardrails expects.
 * Exported for unit tests so aggregation can be checked without a database.
 */
export function aggregateJournalSnapshot(
  rows: JournalTradeRow[],
  now = new Date(),
): JournalSnapshot {
  const dayStart = startOfUtcDayIso(now);
  const dayStartMs = Date.parse(dayStart);

  let realized_r_today = 0;
  let open_r = 0;
  let correlated_open_count = 0;

  const closed = rows
    .filter((r) => r.status === "closed" && r.closed_at)
    .sort((a, b) => Date.parse(b.closed_at!) - Date.parse(a.closed_at!));

  for (const row of closed) {
    const closedMs = Date.parse(row.closed_at!);
    if (Number.isFinite(closedMs) && closedMs >= dayStartMs && row.r_multiple != null && Number.isFinite(row.r_multiple)) {
      realized_r_today += Number(row.r_multiple);
    }
  }

  for (const row of rows) {
    if (row.status !== "open") continue;
    open_r += openPositionRiskR(row);
    const symbol = String(row.symbol || "").toUpperCase();
    if (symbol && !MAJOR_SYMBOLS.has(symbol)) {
      correlated_open_count += 1;
    }
  }

  let consecutive_losses = 0;
  let minutes_since_last_loss: number | null = null;
  for (const row of closed) {
    const r = row.r_multiple != null ? Number(row.r_multiple) : null;
    if (r == null || !Number.isFinite(r)) break;
    if (r < 0) {
      consecutive_losses += 1;
      if (minutes_since_last_loss == null && row.closed_at) {
        const closedMs = Date.parse(row.closed_at);
        if (Number.isFinite(closedMs)) {
          minutes_since_last_loss = Math.max(0, (now.getTime() - closedMs) / 60_000);
        }
      }
    } else {
      break;
    }
  }

  return {
    realized_r_today: Number(realized_r_today.toFixed(4)),
    open_r: Number(open_r.toFixed(4)),
    consecutive_losses,
    minutes_since_last_loss: minutes_since_last_loss == null
      ? null
      : Number(minutes_since_last_loss.toFixed(1)),
    correlated_open_count,
  };
}

export async function fetchRiskSettings(
  supabase: JournalDbClient,
  userId: string,
): Promise<RiskSettings> {
  const { data, error } = await supabase
    .from("risk_settings")
    .select("daily_loss_limit_r, max_open_r, cooldown_losses, cooldown_minutes")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_RISK_SETTINGS };

  return {
    daily_loss_limit_r: Number(data.daily_loss_limit_r) || DEFAULT_RISK_SETTINGS.daily_loss_limit_r,
    max_open_r: Number(data.max_open_r) || DEFAULT_RISK_SETTINGS.max_open_r,
    cooldown_losses: Number(data.cooldown_losses) || DEFAULT_RISK_SETTINGS.cooldown_losses,
    cooldown_minutes: Number(data.cooldown_minutes) || DEFAULT_RISK_SETTINGS.cooldown_minutes,
  };
}

export async function fetchJournalSnapshot(
  supabase: JournalDbClient,
  userId: string,
  now = new Date(),
): Promise<JournalSnapshot> {
  // Pull recent closed trades (for streak/cooldown) plus all open trades. 200 closed is enough
  // for consecutive-loss counting; open set is typically tiny.
  const [{ data: closed, error: closedError }, { data: open, error: openError }] = await Promise.all([
    supabase
      .from("trade_journal")
      .select("symbol, status, r_multiple, closed_at, opened_at, stop, entry, size")
      .eq("user_id", userId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(200),
    supabase
      .from("trade_journal")
      .select("symbol, status, r_multiple, closed_at, opened_at, stop, entry, size")
      .eq("user_id", userId)
      .eq("status", "open")
      .limit(50),
  ]);

  if (closedError) console.error("[journalSnapshot] closed query failed:", closedError.message);
  if (openError) console.error("[journalSnapshot] open query failed:", openError.message);

  const rows = [
    ...((closed ?? []) as JournalTradeRow[]),
    ...((open ?? []) as JournalTradeRow[]),
  ];
  return aggregateJournalSnapshot(rows, now);
}
