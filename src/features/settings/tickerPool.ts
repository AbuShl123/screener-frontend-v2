import { bookKey, type Market } from '@/features/orderbook/types';
import type { Ticker } from './schemas';

/**
 * The searchable book universe derived from `GET /api/tickers`: a FUTURES row for every
 * tracked ticker (always tracked) + a SPOT row iff `hasSpot`. Shared by the Muted-tickers
 * picker and the Classification-rules search so both offer exactly the same `(symbol, market)`
 * pairs from one definition. Books are keyed with `bookKey` (`SYMBOL:MARKET`) app-wide.
 */

/** One selectable `(symbol, market)` book in a settings picker. */
export interface PoolEntry {
  key: string; // bookKey(symbol, market)
  symbol: string; // raw exchange symbol
  market: Market;
}

export function buildTickerPool(tickers: Ticker[] | undefined): PoolEntry[] {
  const entries: PoolEntry[] = [];
  for (const t of tickers ?? []) {
    entries.push({ key: bookKey(t.symbol, 'FUTURES'), symbol: t.symbol, market: 'FUTURES' });
    if (t.hasSpot) entries.push({ key: bookKey(t.symbol, 'SPOT'), symbol: t.symbol, market: 'SPOT' });
  }
  return entries;
}
