import type {
  BookKey,
  Exchange,
  Notification,
  PairBook,
  VenueBook,
} from '@/features/orderbook/types';
import { isVenueMuted } from '@/features/orderbook/notifications/settingsFilter';

/**
 * Pure helpers that apply the per-exchange filter (`exchangeFilterStore`) at display time.
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

/**
 * Whether a notification is shown in the panel / counted in badges: its exchange isn't hidden
 * by the header filter AND its `(exchange, market)` venue isn't muted in notification
 * settings. The two preferences stay independent; this is just the one place they combine.
 */
export function isNotificationVisible(
  n: Notification,
  hidden: readonly Exchange[],
  mutedVenues: readonly string[],
): boolean {
  return !hidden.includes(n.exchange) && !isVenueMuted(n, mutedVenues);
}

/**
 * How many of the `unread` newest notifications are visible (see `isNotificationVisible`).
 * The store's `unread` counts the newest N entries (index 0 is newest), so the unread ones
 * are a prefix.
 */
export function countVisibleUnread(
  notifications: readonly Notification[],
  unread: number,
  hidden: readonly Exchange[],
  mutedVenues: readonly string[] = [],
): number {
  if (hidden.length === 0 && mutedVenues.length === 0) return unread;
  const end = Math.min(unread, notifications.length);
  let n = 0;
  for (let i = 0; i < end; i++) {
    if (isNotificationVisible(notifications[i], hidden, mutedVenues)) n++;
  }
  return n;
}
