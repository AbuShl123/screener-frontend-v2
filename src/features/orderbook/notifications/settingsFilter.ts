import {
  bookKey,
  venueKey,
  type FeedMessage,
  type Market,
  type Notification,
  type TradeAlert,
} from '@/features/orderbook/types';

/**
 * Notification-settings filters, applied at two points:
 *
 * - the PUSH boundary in `feedClient.flush()` (`filterBySettings`, `dropMutedTrades`), so a
 *   muted candidate never reaches its store;
 * - DISPLAY time in the panel, tab chips and handle badges (`isVenueMuted` and the counters),
 *   so alerts raised before a venue was muted disappear at once and come back on unmute.
 *
 * Venue mutes are per alert type: `mutedVenues` silences a venue's order book (depth)
 * notifications, `mutedTradeVenues` its large-trade alerts. The minimum tier and the muted
 * tickers apply to depth notifications only. The header's exchange filter is NOT a
 * notification filter (it hides order book cards only), so nothing here reads it.
 *
 * Pure and store-agnostic: callers pass the settings in, so `orderbook` gains no dependency on
 * the `settings` module (`feedClient` and the React hooks are the wiring points).
 */

/**
 * Keep only depth candidates at/above `minTier`, NOT in the muted-ticker set and NOT from a
 * depth-muted `(exchange, market)` venue. Runs BEFORE the cooldown dedup, so a filtered
 * candidate is dropped before it can write a cooldown entry — later un-muting or lowering the
 * tier then lets that order announce fresh instead of being silenced by a stale cooldown record.
 */
export function filterBySettings(
  candidates: Notification[],
  minTier: number,
  muted: ReadonlySet<string>,
  mutedVenues: ReadonlySet<string> = new Set(),
): Notification[] {
  if (candidates.length === 0) return candidates;
  // Fast path: nothing configured.
  if (minTier <= 1 && muted.size === 0 && mutedVenues.size === 0) return candidates;
  return candidates.filter(
    (n) =>
      n.tier >= minTier &&
      !muted.has(bookKey(n.symbol, n.market)) &&
      !mutedVenues.has(venueKey(n.exchange, n.market)),
  );
}

/**
 * The batch handed to `useTradeStore.ingest()`, minus trade alerts from trade-muted venues
 * (live `TRADE`s and a `SNAPSHOT`'s replayed `trades`). Returns `batch` itself when nothing is
 * muted (the common case) and copies a snapshot only when it actually loses a trade. Depth
 * entries pass through untouched — the trade store ignores them anyway.
 */
export function dropMutedTrades(
  batch: readonly FeedMessage[],
  mutedTradeVenues: readonly string[],
): readonly FeedMessage[] {
  if (mutedTradeVenues.length === 0) return batch;
  const out: FeedMessage[] = [];
  for (const msg of batch) {
    if (msg.type === 'TRADE') {
      if (!isVenueMuted(msg, mutedTradeVenues)) out.push(msg);
    } else if (msg.type === 'SNAPSHOT' && msg.trades.length > 0) {
      const trades = msg.trades.filter((t) => !isVenueMuted(t, mutedTradeVenues));
      out.push(trades.length === msg.trades.length ? msg : { ...msg, trades });
    } else {
      out.push(msg);
    }
  }
  return out;
}

/**
 * True when the alert's `(exchange, market)` venue is in `mutedVenues` — pass the depth or the
 * trade list to match the alert's type. A handful of entries at most, so `includes` beats
 * building a Set; short-circuits when nothing is muted.
 */
export function isVenueMuted(
  n: { exchange: string; market: Market },
  mutedVenues: readonly string[],
): boolean {
  return mutedVenues.length > 0 && mutedVenues.includes(venueKey(n.exchange, n.market));
}

/**
 * How many of the `unread` newest depth notifications are not venue-muted. The store's
 * `unread` counts the newest N entries (index 0 is newest), so the unread ones are a prefix.
 */
export function countVisibleUnread(
  notifications: readonly Notification[],
  unread: number,
  mutedVenues: readonly string[],
): number {
  if (mutedVenues.length === 0) return unread;
  const end = Math.min(unread, notifications.length);
  let n = 0;
  for (let i = 0; i < end; i++) {
    if (!isVenueMuted(notifications[i], mutedVenues)) n++;
  }
  return n;
}

/**
 * Unread trade alerts that are not venue-muted: `seq > readSeq` (see `tradeStore`). The list
 * is sorted by exchange time, not arrival, so unread alerts aren't a prefix — a full pass over
 * at most a few hundred entries, run only when the trade store or the mutes change.
 */
export function countUnreadTrades(
  trades: readonly TradeAlert[],
  readSeq: number,
  mutedTradeVenues: readonly string[],
): number {
  let n = 0;
  for (const t of trades) if (t.seq > readSeq && !isVenueMuted(t, mutedTradeVenues)) n++;
  return n;
}
