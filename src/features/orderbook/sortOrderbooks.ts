import type { ParseKeys } from 'i18next';
import type { BookKey, Market, PairBook } from '@/features/orderbook/types';

export type SortMode = 'importance' | 'alphabetical' | 'spot-first' | 'futures-first';

/**
 * Dropdown option list, in display order (design template "Dashboard Page — Final").
 * Each option carries a stable `orderbook` namespace KEY (not English prose), resolved
 * with `t()` in `SortMenu` at render — same labelKey pattern as landing's `constants.ts`
 * and settings' `SettingsModal` NAV. `ParseKeys<'orderbook'>` makes a typo a compile error.
 */
export const SORT_OPTIONS: { id: SortMode; labelKey: ParseKeys<'orderbook'> }[] = [
  { id: 'importance', labelKey: 'sort.options.importance' },
  { id: 'alphabetical', labelKey: 'sort.options.alphabetical' },
  { id: 'spot-first', labelKey: 'sort.options.spotFirst' },
  { id: 'futures-first', labelKey: 'sort.options.futuresFirst' },
];

/** Pulls `MARKET` back out of a `bookKey` (`SYMBOL:MARKET`) without touching `books`. */
function marketOf(key: BookKey): Market {
  return key.slice(key.lastIndexOf(':') + 1) as Market;
}

/** Count of levels (bids + asks, across every exchange of the pair) per tier; index 0 unused. */
function tierCounts(book: PairBook): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const venue of Object.values(book.venues)) {
    for (const level of venue.bids) counts[level.tier]++;
    for (const level of venue.asks) counts[level.tier]++;
  }
  return counts;
}

/** More tier-4 orders always outranks any amount of tier-3 (and so on down to tier-1). */
function compareImportance(a: PairBook, b: PairBook): number {
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
  books: Record<BookKey, PairBook> | undefined,
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
