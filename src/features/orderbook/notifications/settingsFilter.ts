import { bookKey, venueKey, type Notification } from '@/features/orderbook/types';

/**
 * Push-boundary filter for the notification pipeline (module plan §3, §5.7): keep only
 * candidates at/above `minTier`, NOT in the muted-ticker set and NOT from a muted
 * `(exchange, market)` venue. Runs in `feedClient.flush()` BEFORE the cooldown dedup, so a
 * filtered candidate is dropped before it can write a cooldown entry — later un-muting or
 * lowering the tier then lets that order announce fresh instead of being silenced by a
 * stale cooldown record.
 *
 * Pure and store-agnostic: it takes prepared `Set`s rather than reading the settings
 * store, so `orderbook` gains no dependency on the `settings` module (`feedClient` is
 * the wiring point).
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
 * True when the notification's `(exchange, market)` venue is muted. Used at DISPLAY time
 * (panel list, `N NEW`, handle badge) so notifications raised before a venue was muted
 * disappear at once and come back on unmute. `mutedVenues` is a handful of entries at most,
 * so `includes` beats building a Set; short-circuits when nothing is muted.
 */
export function isVenueMuted(
  n: Pick<Notification, 'exchange' | 'market'>,
  mutedVenues: readonly string[],
): boolean {
  return mutedVenues.length > 0 && mutedVenues.includes(venueKey(n.exchange, n.market));
}
