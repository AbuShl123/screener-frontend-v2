import type { BookKey, Exchange, PairBook, VenueBook } from '@/features/orderbook/types';

/**
 * Pure helpers that apply the per-exchange filter (`exchangeFilterStore`) at display time.
 * The filter is ORDER BOOK ONLY: notifications and trade alerts from a hidden exchange keep
 * showing in the panel (per-type notification mutes live in Settings, `settingsFilter.ts`).
 * `hidden` is a handful of entries at most, so `includes` beats building a Set. Every
 * helper short-circuits when nothing is hidden — the common case.
 */

/** The pair's venue books whose exchange isn't hidden. */
export function visibleVenues(book: PairBook, hidden: readonly Exchange[]): VenueBook[] {
  const out: VenueBook[] = [];
  for (const [exchange, venue] of Object.entries(book.venues) as [Exchange, VenueBook | undefined][]) {
    if (venue && !hidden.includes(exchange)) out.push(venue);
  }
  return out;
}

/** True when at least one of the pair's exchanges is visible. Allocation-free (hot path). */
export function isPairVisible(book: PairBook, hidden: readonly Exchange[]): boolean {
  if (hidden.length === 0) return true;
  for (const exchange in book.venues) {
    if (book.venues[exchange as Exchange] && !hidden.includes(exchange as Exchange)) return true;
  }
  return false;
}

/**
 * `keys` minus pairs with no visible exchange. Returns `keys` itself when nothing is hidden,
 * so the unfiltered case keeps the store's array identity. Runs inside a store selector on
 * every flush, so it stays a single cheap pass.
 */
export function filterVisibleKeys(
  keys: BookKey[],
  books: Record<BookKey, PairBook>,
  hidden: readonly Exchange[],
): BookKey[] {
  if (hidden.length === 0) return keys;
  return keys.filter((k) => {
    const book = books[k];
    return book !== undefined && isPairVisible(book, hidden);
  });
}
