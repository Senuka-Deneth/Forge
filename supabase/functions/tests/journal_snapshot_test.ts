import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aggregateJournalSnapshot,
  type JournalTradeRow,
} from "../_shared/journalSnapshot.ts";

function row(partial: Partial<JournalTradeRow> & Pick<JournalTradeRow, "symbol" | "status">): JournalTradeRow {
  return {
    r_multiple: null,
    closed_at: null,
    opened_at: "2024-01-15T10:00:00.000Z",
    stop: 95,
    entry: 100,
    size: 1,
    ...partial,
  };
}

Deno.test("aggregateJournalSnapshot sums realized R for closed trades today", () => {
  const now = new Date("2024-01-15T18:00:00.000Z");
  const snap = aggregateJournalSnapshot([
    row({
      symbol: "BTCUSDT",
      status: "closed",
      r_multiple: -1.2,
      closed_at: "2024-01-15T12:00:00.000Z",
    }),
    row({
      symbol: "ETHUSDT",
      status: "closed",
      r_multiple: -0.8,
      closed_at: "2024-01-15T14:00:00.000Z",
    }),
    row({
      symbol: "SOLUSDT",
      status: "closed",
      r_multiple: -1,
      closed_at: "2024-01-14T20:00:00.000Z", // yesterday — ignored for daily sum
    }),
  ], now);

  assertEquals(snap.realized_r_today, -2);
});

Deno.test("aggregateJournalSnapshot counts consecutive losses and minutes since last loss", () => {
  const now = new Date("2024-01-15T16:00:00.000Z");
  const snap = aggregateJournalSnapshot([
    row({
      symbol: "BTCUSDT",
      status: "closed",
      r_multiple: -1,
      closed_at: "2024-01-15T15:00:00.000Z",
    }),
    row({
      symbol: "ETHUSDT",
      status: "closed",
      r_multiple: -1,
      closed_at: "2024-01-15T14:00:00.000Z",
    }),
    row({
      symbol: "SOLUSDT",
      status: "closed",
      r_multiple: -1,
      closed_at: "2024-01-15T13:00:00.000Z",
    }),
    row({
      symbol: "BNBUSDT",
      status: "closed",
      r_multiple: 1.5,
      closed_at: "2024-01-15T12:00:00.000Z",
    }),
  ], now);

  assertEquals(snap.consecutive_losses, 3);
  assertEquals(snap.minutes_since_last_loss, 60);
});

Deno.test("aggregateJournalSnapshot tallies open R and correlated alt exposure", () => {
  const snap = aggregateJournalSnapshot([
    row({ symbol: "BTCUSDT", status: "open", entry: 100, stop: 95, size: 1 }),
    row({ symbol: "SOLUSDT", status: "open", entry: 50, stop: 48, size: 2 }),
    row({ symbol: "AVAXUSDT", status: "open", entry: 20, stop: 19, size: 1 }),
    row({ symbol: "ETHUSDT", status: "open", entry: 2000, stop: 1900, size: 1 }),
  ]);

  assertEquals(snap.open_r, 4);
  // SOL + AVAX count; BTC/ETH are majors and excluded from the correlated alt tally.
  assertEquals(snap.correlated_open_count, 2);
});

Deno.test("aggregateJournalSnapshot returns zeros on an empty journal", () => {
  const snap = aggregateJournalSnapshot([]);
  assertEquals(snap, {
    realized_r_today: 0,
    open_r: 0,
    consecutive_losses: 0,
    minutes_since_last_loss: null,
    correlated_open_count: 0,
  });
});
