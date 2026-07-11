import type { BookKey, Market, OrderBook } from '@/features/orderbook/types';

export type SortMode = 'importance' | 'alphabetical' | 'spot-first' | 'futures-first';

/** Dropdown option list, in display order (design template "Dashboard Page — Final"). */
export const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'importance', label: 'Importance level' },
  { id: 'alphabetical', label: 'Alphabetical' },
  { id: 'spot-first', label: 'Spot first, then futures' },
  { id: 'futures-first', label: 'Futures first, then spot' },
];

/** Pulls `MARKET` back out of a `bookKey` (`SYMBOL:MARKET`) without touching `books`. */
function marketOf(key: BookKey): Market {
  return key.slice(key.lastIndexOf(':') + 1) as Market;
}

/** Count of levels (bids + asks) per tier; index 0 unused — tier 0 never counts as "important". */
function tierCounts(book: OrderBook): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const level of book.bids) counts[level.tier]++;
  for (const level of book.asks) counts[level.tier]++;
  return counts;
}

/** More tier-4 orders always outranks any amount of tier-3 (and so on down to tier-1). */
function compareImportance(a: OrderBook, b: OrderBook): number {
  const ca = tierCounts(a);
  const cb = tierCounts(b);
  for (let tier = 4; tier >= 1; tier--) {
    if (cb[tier] !== ca[tier]) return cb[tier] - ca[tier];
  }
  return 0;
}

/**
 * Reorders `keys` per `mode`. `keys` arrives already alphabetical (the store's default —
 * `orderbookStore.ts`'s `compareKeys`), so `Array.sort`'s stability keeps that as the
 * tiebreaker for every mode without needing a secondary compare.
 *
 * `books` is read only for `'importance'`; the other modes derive everything they need
 * (symbol, market) from the key string itself. That lets the caller skip subscribing to
 * `books` — and the resulting per-tick re-render — unless importance sorting is selected.
 */
export function sortKeys(
  keys: BookKey[],
  books: Record<BookKey, OrderBook> | undefined,
  mode: SortMode,
): BookKey[] {
  switch (mode) {
    case 'alphabetical':
      return keys;

    case 'spot-first':
    case 'futures-first': {
      const first: Market = mode === 'spot-first' ? 'SPOT' : 'FUTURES';
      return [...keys].sort((a, b) => {
        const ma = marketOf(a);
        const mb = marketOf(b);
        return ma === mb ? 0 : ma === first ? -1 : 1;
      });
    }

    case 'importance':
      if (!books) return keys;
      return [...keys].sort((a, b) => compareImportance(books[a], books[b]));
  }
}
