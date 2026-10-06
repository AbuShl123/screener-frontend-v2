import { bookKey, type Market } from '@/features/orderbook/types';
import type { Instrument } from './schemas';

/**
 * The searchable book universe derived from `GET /api/tickers`: one entry per tracked
 * `(symbol, market)` pair. The server returns one row per `(venue, symbol)` instrument, so a
 * pair traded on several exchanges arrives once per exchange; rules and mutes are
 * exchange-independent, so the pool de-duplicates by `(symbol, market)`. It is deliberately
 * NOT filtered by the dashboard's exchange registry: a pair tracked only on a not-yet-supported
 * exchange is still a valid rule/mute target. Shared by the Muted-tickers picker and the
 * Classification-rules search so both offer exactly the same pairs from one definition. Books
 * are keyed with `bookKey` (`SYMBOL:MARKET`) app-wide.
 */

/** One selectable `(symbol, market)` book in a settings picker. */
export interface PoolEntry {
  key: string; // bookKey(symbol, market)
  symbol: string; // normalized BASEQUOTE symbol
  market: Market;
}

/**
 * Split an `EXCHANGE_MARKET` venue on its LAST underscore (ticker-list contract §3.1), so an
 * exchange name containing an underscore still parses. Returns `null` for a malformed venue or
 * a market other than SPOT/FUTURES, and the caller skips the row.
 */
export function parseVenue(venue: string): { exchange: string; market: Market } | null {
  const i = venue.lastIndexOf('_');
  if (i <= 0) return null;
  const market = venue.slice(i + 1);
  if (market !== 'SPOT' && market !== 'FUTURES') return null;
  return { exchange: venue.slice(0, i), market };
}

export function buildTickerPool(instruments: Instrument[] | undefined): PoolEntry[] {
  const byKey = new Map<string, PoolEntry>();
  for (const { venue, symbol } of instruments ?? []) {
    const parsed = parseVenue(venue);
    if (!parsed) continue;
    const key = bookKey(symbol, parsed.market);
    if (!byKey.has(key)) byKey.set(key, { key, symbol, market: parsed.market });
  }
  // The server sorts by venue, then symbol. Re-sort by symbol (FUTURES before SPOT) so the
  // pickers' top-8 search results read alphabetically, as they did before multi-exchange.
  return [...byKey.values()].sort(
    (a, b) =>
      (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0) ||
      (a.market === b.market ? 0 : a.market === 'FUTURES' ? -1 : 1),
  );
}
