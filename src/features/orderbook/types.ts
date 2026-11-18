import type { Exchange } from '@/features/orderbook/exchanges';

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

export type { Exchange } from '@/features/orderbook/exchanges';

export type Market = 'SPOT' | 'FUTURES';

/** Every market the feed can carry, in display order. Single source for UI that enumerates markets. */
export const MARKETS = ['SPOT', 'FUTURES'] as const satisfies readonly Market[];

/** Level importance. Tier 0 is never sent on the wire (doc §3.5). */
export type Tier = 1 | 2 | 3 | 4;

/**
 * Wire level (doc §3.5): a positional tuple, decoded into a `Level` at the edge by the
 * feed client. Extra trailing elements may appear in future and are ignored.
 */
export type LevelTuple = [
  price: number,
  quantity: number,
  tier: Tier,
  firstSeenMillis: number,
  distance: number,
];

/** One decoded price level inside a venue's `bids` / `asks`. */
export interface Level {
  price: number;
  quantity: number; // base-asset units
  tier: Tier;
  firstSeenMillis: number; // epoch ms — order age is `Date.now() - firstSeenMillis`
  distance: number; // FRACTION (0.0123 = 1.23%) — format at render time (×100, toFixed(2))
  exchange: Exchange; // stamped at decode time so a card can merge venues without re-threading keys
}

/** One exchange's book for a pair. 0–5 levels per side, either side may be empty (doc §3.5). */
export interface VenueBook {
  bids: Level[]; // ordered by importance, NOT price — the card sorts
  asks: Level[];
}

/**
 * One card's worth of state: a `(symbol, market)` pair with every exchange's book nested
 * inside it (plan D1). `venues` is never empty — a pair whose last venue leaves is deleted.
 */
export interface PairBook {
  symbol: string;
  market: Market;
  venues: Partial<Record<Exchange, VenueBook>>;
}

/** Connection status the feed client publishes to the store for the UI to reflect. */
export type FeedStatus = 'connecting' | 'connected' | 'reconnecting' | 'auth-failed' | 'access-denied';

/** A surfaced order-book event shown in the notifications panel. */
export interface Notification {
  id: string; // stable React key
  exchange: Exchange;
  symbol: string; // normalized symbol, e.g. 'XRPUSDT'
  market: Market;
  side: 'bid' | 'ask';
  price: number;
  notional: number; // dollar notional (base for both $ and QTY display)
  tier: Tier;
  distance: number; // FRACTION (0.0026 = 0.26%) — format at render time
  timeMillis: number; // epoch ms of detection — format via fmtClock() at render
}

export type BookKey = string; // `${symbol}:${market}`

/**
 * The single canonical key for a card: a `(symbol, market)` PAIR, exchange-independent
 * (plan D1). Exchanges nest inside the pair (`PairBook.venues`); mutes and rules key on
 * this too, so they apply across every exchange.
 */
export const bookKey = (symbol: string, market: Market): BookKey => `${symbol}:${market}`;

export type VenueKey = string; // `${exchange}_${market}`

/**
 * The canonical key for one `(exchange, market)` venue, in the backend's own `EXCHANGE_MARKET`
 * spelling (ticker-list contract §3.1, e.g. `MEXC_FUTURES`), so it round-trips through
 * `parseVenue()`. Used by the notification venue mutes.
 */
export const venueKey = (exchange: string, market: Market): VenueKey => `${exchange}_${market}`;

/**
 * A decoded `DEPTH` envelope (doc §3.3–3.4) for one `(exchange, market, symbol)` book.
 * `data: null` removes that exchange's book from the pair.
 */
export interface DepthMessage {
  type: 'DEPTH';
  exchange: Exchange;
  market: Market;
  symbol: string;
  data: VenueBook | null;
}

/** The taker's (aggressor's) side of a large trade (doc §3.8.1): BUY consumed asks, SELL bids. */
export type TradeSide = 'BUY' | 'SELL';

/** A `TRADE` envelope's `data` (doc §3.8): one large executed taker order. Never null. */
export interface TradeData {
  id: string; // opaque, stable across reconnects and server restarts — the dedupe key
  side: TradeSide;
  time: number; // exchange execution time, epoch ms (NOT detection/arrival time)
  notional: number; // quote asset (USDT)
  qty: number; // base asset
  avgPrice: number; // notional / qty — format before display
  firstPrice: number;
  lastPrice: number; // === firstPrice when levels === 1
  levels: number; // ≥ 1; > 1 = a sweep
  threshold: number; // the alert's minimum notional; notional / threshold = relative size
}

/** A decoded `TRADE` envelope (doc §3.8). An event, not state: never updated or removed. */
export interface TradeMessage {
  type: 'TRADE';
  exchange: Exchange;
  market: Market;
  symbol: string;
  data: TradeData;
}

/**
 * A stored trade alert: the envelope flattened, plus `seq`, the client-side arrival number
 * that drives unread tracking (`tradeStore`). Snapshot replays carry `seq: 0` (always read).
 */
export interface TradeAlert extends TradeData {
  exchange: Exchange;
  market: Market;
  symbol: string;
  seq: number;
}

/**
 * The decoded messages the stores consume. The feed client's guard has already dropped
 * unknown types, exchanges with an invalid id (or beyond the registry cap) and malformed
 * envelopes (live and inside a snapshot), so everything here is known-good. A well-formed
 * exchange id the registry doesn't list yet is kept and recorded as provisional.
 *
 * A `SNAPSHOT`'s mixed entries are split by type at decode time: `data` is the depth state
 * (replaces the order book), `trades` the replayed recent alerts (merged by id, never counted
 * as unread).
 */
export type FeedMessage =
  | { type: 'SNAPSHOT'; data: DepthMessage[]; trades: TradeMessage[] }
  | DepthMessage
  | TradeMessage;
