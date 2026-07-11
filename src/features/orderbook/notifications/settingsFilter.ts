import { bookKey, type Notification } from '@/features/orderbook/types';

/**
 * Push-boundary filter for the notification pipeline (module plan §3, §5.7): keep only
 * candidates at/above `minTier` and NOT in the muted set. Runs in `feedClient.flush()`
 * BEFORE the cooldown dedup, so a muted/below-tier candidate is dropped before it can
 * write a cooldown entry — later un-muting or lowering the tier then lets that order
 * announce fresh instead of being silenced by a stale cooldown record.
 *
 * Pure and store-agnostic: it takes a prepared `Set` rather than reading the settings
 * store, so `orderbook` gains no dependency on the `settings` module (`feedClient` is
 * the wiring point).
 */
export function filterBySettings(
  candidates: Notification[],
  minTier: number,
  muted: ReadonlySet<string>,
): Notification[] {
  if (candidates.length === 0) return candidates;
  if (minTier <= 1 && muted.size === 0) return candidates; // fast path: nothing configured
  return candidates.filter(
    (n) => n.tier >= minTier && !muted.has(bookKey(n.symbol, n.market)),
  );
}
