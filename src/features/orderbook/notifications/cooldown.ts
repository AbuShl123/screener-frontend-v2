import type { Notification } from '@/features/orderbook/types';

/**
 * De-duplication cooldown for notifications.
 *
 * The feed only sends the top-5 levels per side (doc §3.5), so a resting order at a
 * fixed price routinely drops OUT of that window and re-enters it as other orders
 * compete for the top-5 slots — each re-entry looks like a brand-new level to
 * `selectNotifications` (its price is absent from the previous book) and raises an
 * identical card. This suppresses those repeats: once an order is announced, the same
 * `(symbol, market, side, price, tier)` stays quiet for `COOLDOWN_MS`.
 *
 * `tier` is PART of the key by design: a re-appearance at a DIFFERENT tier means the
 * order became more/less significant (moved toward/away from the spread) and IS worth
 * re-announcing — only an identical-tier repeat is noise.
 *
 * Module-level state, deliberately OUTSIDE React/Zustand (same spirit as the feed
 * singleton): the flush pipeline is the only toucher, and it must not trigger renders.
 */

/** Re-announcement window: the same order stays quiet for this long after being announced. */
const COOLDOWN_MS = 5 * 60_000; // 5 minutes

/** dedup key → epoch ms it was last announced. */
const lastAnnounced = new Map<string, number>();

/** Throttle the prune sweep so it runs at most once per window, not every flush. */
let lastPrune = 0;

const keyOf = (n: Notification): string =>
  `${n.symbol}:${n.market}:${n.side}:${n.price}:${n.tier}`;

/**
 * Filter a flush's raw candidates (oldest→newest) down to those NOT announced within
 * `COOLDOWN_MS` for their dedup key. Announcing a candidate updates its timestamp, so a
 * persistently-flapping order re-announces at most once per window (a quiet heartbeat
 * rather than a stream). Also collapses duplicates WITHIN a single batch, since the map
 * is updated as we go.
 */
export function filterAnnounced(candidates: Notification[]): Notification[] {
  if (candidates.length === 0) return candidates;

  const now = Date.now();
  const fresh: Notification[] = [];
  for (const n of candidates) {
    const key = keyOf(n);
    const last = lastAnnounced.get(key);
    if (last !== undefined && now - last < COOLDOWN_MS) continue; // still in cooldown → suppress
    lastAnnounced.set(key, now);
    fresh.push(n);
  }

  // Opportunistic prune so the map can't grow unbounded over a long session. Entries
  // older than the window can never suppress anything again, so drop them.
  if (now - lastPrune >= COOLDOWN_MS) {
    for (const [key, ts] of lastAnnounced) {
      if (now - ts >= COOLDOWN_MS) lastAnnounced.delete(key);
    }
    lastPrune = now;
  }

  return fresh;
}

/** Forget all cooldown history — called on feed stop / session end so a new session starts clean. */
export function resetCooldown(): void {
  lastAnnounced.clear();
  lastPrune = 0;
}
