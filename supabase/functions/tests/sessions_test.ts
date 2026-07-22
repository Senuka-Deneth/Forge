import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkEventBlackout,
  classifySessionRelation,
  computeFundingWindow,
  computeSessionRanges,
  findLatestCmeGap,
  sessionRangesForPrompt,
  SESSION_HOURS,
} from "../_shared/sessions.ts";

const HOUR = 3600;
const DAY = 86400;

/** UTC timestamp for a given day offset and hour-of-day, from a fixed Monday-aligned epoch base. */
function ts(dayOffset: number, hour: number) {
  // 2024-01-01 00:00:00 UTC was a Monday, and is a round day index — a stable, easy-to-reason base.
  const MONDAY_2024_01_01 = Math.floor(Date.UTC(2024, 0, 1) / 1000);
  return MONDAY_2024_01_01 + dayOffset * DAY + hour * HOUR;
}

function bar(time: number, high: number, low: number) {
  return { time, high, low };
}

Deno.test("computeSessionRanges buckets candles into the correct session by UTC hour", () => {
  const candles = [
    bar(ts(0, 1), 101, 99), // asia (0-8)
    bar(ts(0, 10), 105, 95), // london only (8-16, before new_york opens at 13)
    bar(ts(0, 18), 110, 90), // new_york only (13-21, after london has closed at 16)
  ];
  const ranges = computeSessionRanges(candles);
  const bySession = Object.fromEntries(ranges.map((r) => [r.session, r]));

  assertEquals(bySession.asia.high, 101);
  assertEquals(bySession.asia.low, 99);
  assertEquals(bySession.london.high, 105);
  assertEquals(bySession.new_york.high, 110);
});

Deno.test("computeSessionRanges lets a bar in the London/New York overlap update both ranges", () => {
  // Hour 14 sits in both London (8-16) and New York (13-21) — the overlap is deliberate (see
  // module docstring on where volume peaks), so this bar must count toward both, not just
  // whichever session happens to be declared first.
  const candles = [bar(ts(0, 14), 110, 90)];
  const ranges = computeSessionRanges(candles);
  const sessions = ranges.map((r) => r.session).sort();
  assertEquals(sessions, ["london", "new_york"]);
  for (const range of ranges) {
    assertEquals(range.high, 110);
    assertEquals(range.low, 90);
  }
});

Deno.test("computeSessionRanges expands high/low across multiple bars in the same session", () => {
  const candles = [
    bar(ts(0, 9), 105, 98),
    bar(ts(0, 10), 108, 96),
    bar(ts(0, 11), 103, 100),
  ];
  const ranges = computeSessionRanges(candles);
  const london = ranges.find((r) => r.session === "london")!;
  assertEquals(london.high, 108);
  assertEquals(london.low, 96);
});

Deno.test("computeSessionRanges marks only the still-open session as developing", () => {
  const candles = [
    bar(ts(0, 1), 101, 99), // asia, day 0 — long closed
    bar(ts(1, 9), 105, 95), // london, day 1 — the last bar in the series
  ];
  const ranges = computeSessionRanges(candles);
  const asia = ranges.find((r) => r.session === "asia")!;
  const london = ranges.find((r) => r.session === "london")!;
  assertEquals(asia.isDeveloping, false);
  assertEquals(london.isDeveloping, true);
});

Deno.test("computeSessionRanges drops sessions older than the lookback window", () => {
  // dayIndex is an absolute days-since-epoch count, not the small offset passed to ts() — assert
  // against the actual computed indices rather than the offsets themselves.
  const dayIndexOfOffset = (offset: number) => Math.floor(ts(offset, 0) / DAY);
  const oldDay = dayIndexOfOffset(0);
  const anchorDay = dayIndexOfOffset(5);

  const candles = [
    bar(ts(0, 1), 101, 99), // should be dropped with a 1-day lookback from day 5
    bar(ts(5, 1), 200, 199), // the anchor
  ];
  const ranges = computeSessionRanges(candles, 1);
  assertEquals(ranges.some((r) => r.dayIndex === oldDay), false);
  assertEquals(ranges.some((r) => r.dayIndex === anchorDay), true);
});

Deno.test("computeSessionRanges returns nothing for an empty series", () => {
  assertEquals(computeSessionRanges([]), []);
});

Deno.test("sessionRangesForPrompt keeps developing plus latest completed range per session", () => {
  const ranges = [
    { session: "asia" as const, dayIndex: 1, high: 101, low: 99, startTime: 100, endTime: 200, isDeveloping: false },
    { session: "asia" as const, dayIndex: 2, high: 105, low: 95, startTime: 300, endTime: 400, isDeveloping: true },
    { session: "london" as const, dayIndex: 2, high: 110, low: 90, startTime: 350, endTime: 450, isDeveloping: true },
  ];
  const trimmed = sessionRangesForPrompt(ranges);
  assertEquals(trimmed.length, 3);
  assertEquals(trimmed.filter((r) => r.session === "asia").length, 2);
  assertEquals(trimmed.filter((r) => r.session === "london").length, 1);
  assertEquals(trimmed.filter((r) => r.isDeveloping).length, 2);
});

Deno.test("SESSION_HOURS windows do not gap the day and london/NY overlap as documented", () => {
  assertEquals(SESSION_HOURS.asia.startHour, 0);
  assertEquals(SESSION_HOURS.london.startHour, SESSION_HOURS.asia.endHour);
  // The overlap is deliberate (see module docstring) — new_york starts before london ends.
  assertEquals(SESSION_HOURS.new_york.startHour < SESSION_HOURS.london.endHour, true);
});

Deno.test("classifySessionRelation places price against a session range", () => {
  const range = { session: "asia" as const, dayIndex: 0, high: 110, low: 90, startTime: 0, endTime: 1, isDeveloping: false };
  assertEquals(classifySessionRelation(115, range), "above");
  assertEquals(classifySessionRelation(85, range), "below");
  assertEquals(classifySessionRelation(100, range), "inside");
  assertEquals(classifySessionRelation(null, range), "unknown");
});

// ---------------------------------------------------------------------------
// CME gap
// ---------------------------------------------------------------------------

Deno.test("findLatestCmeGap detects a weekend gap up and reports it unfilled", () => {
  // Friday 21:00 UTC close, Monday 00:00 UTC reopen — a deliberately simple boundary case.
  const fridayClose = ts(4, 21); // day 4 = Friday given Monday=day 0
  const mondayOpen = ts(7, 0); // day 7 = next Monday
  const candles = [
    { time: fridayClose, open: 100, high: 101, low: 99, close: 100 },
    { time: mondayOpen, open: 105, high: 106, low: 104, close: 105 },
    { time: mondayOpen + HOUR, open: 105, high: 106, low: 104.5, close: 105.5 }, // stays above the gap
  ];
  const gap = findLatestCmeGap(candles, HOUR);
  assertEquals(gap?.direction, "up");
  assertEquals(gap?.filled, false);
  assertEquals(gap!.gapPct > 0, true);
});

Deno.test("findLatestCmeGap marks a gap filled once price trades back through it", () => {
  const fridayClose = ts(4, 21);
  const mondayOpen = ts(7, 0);
  const candles = [
    { time: fridayClose, open: 100, high: 101, low: 99, close: 100 },
    { time: mondayOpen, open: 105, high: 106, low: 104, close: 105 },
    { time: mondayOpen + HOUR, open: 105, high: 106, low: 99, close: 100 }, // wicks back through 100
  ];
  const gap = findLatestCmeGap(candles, HOUR);
  assertEquals(gap?.filled, true);
});

Deno.test("findLatestCmeGap returns none direction for a negligible gap", () => {
  const fridayClose = ts(4, 21);
  const mondayOpen = ts(7, 0);
  const candles = [
    { time: fridayClose, open: 100, high: 101, low: 99, close: 100 },
    { time: mondayOpen, open: 100.001, high: 101, low: 99, close: 100.001 },
  ];
  assertEquals(findLatestCmeGap(candles, HOUR)?.direction, "none");
});

Deno.test("findLatestCmeGap returns null on daily-plus intervals", () => {
  const candles = [
    { time: ts(4, 21), open: 100, high: 101, low: 99, close: 100 },
    { time: ts(7, 0), open: 105, high: 106, low: 104, close: 105 },
  ];
  assertEquals(findLatestCmeGap(candles, DAY), null);
});

Deno.test("findLatestCmeGap returns null when no weekend boundary exists in the data", () => {
  const candles = [
    { time: ts(0, 1), open: 100, high: 101, low: 99, close: 100 },
    { time: ts(0, 2), open: 100, high: 101, low: 99, close: 100 },
  ];
  assertEquals(findLatestCmeGap(candles, HOUR), null);
});

// ---------------------------------------------------------------------------
// Funding window
// ---------------------------------------------------------------------------

Deno.test("computeFundingWindow reports minutes until funding and flags the imminent window", () => {
  const now = 1_000_000_000;
  const in10min = now + 10 * 60_000;
  const in2h = now + 2 * 60 * 60_000;

  assertEquals(computeFundingWindow(in10min, now).imminent, true);
  assertEquals(computeFundingWindow(in2h, now).imminent, false);
  assertEquals(computeFundingWindow(in2h, now).minutesUntil, 120);
});

Deno.test("computeFundingWindow handles missing or already-past funding times", () => {
  assertEquals(computeFundingWindow(null, 1000), { minutesUntil: null, imminent: false });
  assertEquals(computeFundingWindow(500, 1000).minutesUntil, null); // funding time in the past
});

// ---------------------------------------------------------------------------
// Event blackout
// ---------------------------------------------------------------------------

Deno.test("checkEventBlackout reports the active window and time remaining", () => {
  const windows = [{ label: "FOMC", startMs: 1000, endMs: 5000 }];
  const result = checkEventBlackout(3000, windows);
  assertEquals(result.blocked, true);
  assertEquals(result.label, "FOMC");
  assertEquals(result.minutesRemaining, Number(((5000 - 3000) / 60000).toFixed(1)));
});

Deno.test("checkEventBlackout is inert with the default (empty) schedule", () => {
  assertEquals(checkEventBlackout(Date.now()).blocked, false);
});

Deno.test("checkEventBlackout ignores windows outside the current time", () => {
  const windows = [{ label: "CPI", startMs: 1000, endMs: 2000 }];
  assertEquals(checkEventBlackout(500, windows).blocked, false);
  assertEquals(checkEventBlackout(2500, windows).blocked, false);
});
