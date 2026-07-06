/**
 * Order book data model — plain TS types, deliberately NO Zod.
 *
 * CLAUDE.md's "Zod validates server responses" rule targets REST: user-adjacent,
 * low-frequency, worth the CPU. The socket is the opposite — server-generated
 * payloads arriving every ~100ms on the perf-critical path. Running every batch
 * through Zod buys little and costs exactly where we can't afford it. The feed
 * client does a cheap structural guard instead (see `lib/ws/feedClient.ts`) and
 * otherwise trusts the documented contract (`.claude/docs/websocket-feed-api.md`).
 */

export type Market = 'SPOT' | 'FUTURES';

/** One price level inside a book's `bids` / `asks`. Shape per doc §3.4. */
export interface Level {
  price: number;
  quantity: number; // base-asset units
  tier: 0 | 1 | 2 | 3 | 4; // whole number 0–4; arrives as a plain number, clamped in the card
  firstSeenMillis: number; // epoch ms — order age is `Date.now() - firstSeenMillis`
  distance: number; // FRACTION (0.0123 = 1.23%) — format at render time (×100, toFixed(2))
}

export interface OrderBook {
  symbol: string;
  market: Market;
  bids: Level[]; // up to 5, best-first (highest price first)
  asks: Level[]; // up to 5, best-first (lowest price first)
}

/** Connection status the feed client publishes to the store for the UI to reflect. */
export type FeedStatus = 'connecting' | 'connected' | 'reconnecting' | 'auth-failed';

export type BookKey = string; // `${symbol}:${market}`

/** The single canonical key for a book. Always key local state on (symbol, market). */
export const bookKey = (symbol: string, market: Market): BookKey => `${symbol}:${market}`;

/**
 * Server → client messages (doc §3). `seq` is present in every message but is
 * intentionally ignored (doc §5); it's typed here only so the guard can accept it.
 * `ADD` and `UPDATE` are one shape and MUST be handled identically (doc §4).
 */
export type FeedMessage =
  | { seq: number; type: 'SNAPSHOT'; data: OrderBook[] }
  | {
      seq: number;
      type: 'ADD' | 'UPDATE';
      symbol: string;
      market: Market;
      bids: Level[];
      asks: Level[];
    }
  | { seq: number; type: 'DROP'; symbol: string; market: Market };
