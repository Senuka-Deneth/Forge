import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { summarizeOrderBook } from "../_shared/binance.ts";

/** Book levels as Binance returns them: [price, quantity] string pairs, best price first. */
function ladder(start: number, step: number, qty: number, count: number): [string, string][] {
  return Array.from({ length: count }, (_, i) => [
    String(start + i * step),
    String(qty),
  ] as [string, string]);
}

Deno.test("summarizeOrderBook reports a balanced book as zero imbalance", () => {
  const bids = ladder(99.99, -0.01, 10, 200);
  const asks = ladder(100.01, 0.01, 10, 200);
  const book = summarizeOrderBook(bids, asks);

  assertAlmostEquals(book.midPrice!, 100, 1e-9);
  assertAlmostEquals(book.obi!, 0, 1e-9);
});

Deno.test("summarizeOrderBook reports positive imbalance for a bid-heavy book", () => {
  const bids = ladder(99.99, -0.01, 30, 200);
  const asks = ladder(100.01, 0.01, 10, 200);
  const book = summarizeOrderBook(bids, asks);

  // (30 − 10) / (30 + 10) = 0.5 per level, uniform across the band.
  assertAlmostEquals(book.obi!, 0.5, 1e-6);
  assertEquals(book.bidVolume > book.askVolume, true);
});

Deno.test("summarizeOrderBook exposes imbalance at several depths", () => {
  // Bid-heavy right at the touch, ask-heavy further out — a single band would hide this entirely.
  const bids: [string, string][] = [
    ...ladder(99.99, -0.01, 100, 10), // within ~0.1%
    ...ladder(99.89, -0.01, 1, 190),
  ];
  const asks: [string, string][] = [
    ...ladder(100.01, 0.01, 1, 10),
    ...ladder(100.11, 0.01, 100, 190),
  ];

  const book = summarizeOrderBook(bids, asks);
  const tight = book.bands.find((b) => b.depthPct === 0.001)!;
  const wide = book.bands.find((b) => b.depthPct === 0.01)!;

  assertEquals(tight.obi! > 0.5, true); // bid-heavy at the touch
  assertEquals(wide.obi! < 0, true); // ask-heavy deeper in
  assertEquals(book.bands.length, 3);
});

Deno.test("summarizeOrderBook reports notional depth per band", () => {
  const bids = ladder(99.99, -0.01, 100, 300);
  const asks = ladder(100.01, 0.01, 100, 300);
  const book = summarizeOrderBook(bids, asks);

  const tight = book.bands.find((b) => b.depthPct === 0.001)!;
  // ±0.1% of 100 is ±0.10, so ~10 levels a side at 100 units and ~$100 each ≈ $100k.
  assertAlmostEquals(tight.bidNotional, 100_000, 15_000);
  assertEquals(tight.askNotional > 0, true);

  // Notional must grow with the band width.
  const wide = book.bands.find((b) => b.depthPct === 0.01)!;
  assertEquals(wide.bidNotional > tight.bidNotional, true);
});

Deno.test("summarizeOrderBook reports how far the book data actually reaches", () => {
  // 300 levels at a 0.01 step from ~100 covers roughly 3% either side.
  const book = summarizeOrderBook(ladder(99.99, -0.01, 100, 300), ladder(100.01, 0.01, 100, 300));
  assertAlmostEquals(book.bookCoverage.bidPct!, 3, 0.1);
  assertAlmostEquals(book.bookCoverage.askPct!, 3, 0.1);

  // A shallow book must advertise its shallowness — this is what stops a ±1% band being read as a
  // complete measurement when Binance only returned ±0.1% of depth.
  const shallow = summarizeOrderBook(ladder(99.99, -0.01, 5, 3), ladder(100.01, 0.01, 5, 3));
  assertEquals(shallow.bookCoverage.bidPct! < 0.1, true);
});

Deno.test("summarizeOrderBook computes the spread as a percentage of mid", () => {
  const book = summarizeOrderBook(ladder(99.9, -0.01, 10, 50), ladder(100.1, 0.01, 10, 50));
  // (100.1 − 99.9) / 100 = 0.2%
  assertAlmostEquals(book.spreadPct!, 0.2, 1e-6);
});

Deno.test("summarizeOrderBook surfaces the largest resting orders as walls", () => {
  const bids: [string, string][] = [
    ["99.99", "10"],
    ["99.90", "5000"], // the wall
    ...ladder(99.89, -0.01, 10, 50),
  ];
  const asks: [string, string][] = [
    ["100.01", "10"],
    ["100.20", "8000"], // bigger wall
    ...ladder(100.21, 0.01, 10, 50),
  ];

  const book = summarizeOrderBook(bids, asks);
  assertEquals(book.walls[0].quantity, 8000);
  assertEquals(book.walls[0].side, "ask");
  assertEquals(book.walls[1].quantity, 5000);
  assertEquals(book.walls[1].side, "bid");
  // Bid walls sit below mid, ask walls above.
  assertEquals(book.walls.find((w) => w.side === "bid")!.distancePct < 0, true);
  assertEquals(book.walls.find((w) => w.side === "ask")!.distancePct > 0, true);
});

Deno.test("summarizeOrderBook returns slopeBid/slopeAsk when book covers 1%", () => {
  // 300 levels at 0.01 step from ~100 reaches ~3% — enough for the 1% slope measurement.
  const bids = ladder(99.99, -0.01, 100, 300);
  const asks = ladder(100.01, 0.01, 100, 300);
  const book = summarizeOrderBook(bids, asks);

  assertEquals(book.bookCoverage.bidPct! >= 1, true);
  assertEquals(book.bookCoverage.askPct! >= 1, true);
  assertEquals(book.slopeBid != null && book.slopeBid > 0, true);
  assertEquals(book.slopeAsk != null && book.slopeAsk > 0, true);
});

Deno.test("summarizeOrderBook degrades to nulls on an unusable book", () => {
  assertEquals(summarizeOrderBook([], []).obi, null);
  assertEquals(summarizeOrderBook([["abc", "1"]], [["def", "1"]]).midPrice, null);
  assertEquals(summarizeOrderBook([], ladder(100, 0.01, 1, 5)).walls, []);
});
