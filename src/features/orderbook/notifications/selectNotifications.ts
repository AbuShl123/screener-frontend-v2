import type { DepthMessage, Level, Notification, VenueBook } from '@/features/orderbook/types';

let counter = 0; // module-local monotonic id source (stable React keys, one card per event)

/** The book identity a raised notification carries. */
type Identity = Pick<DepthMessage, 'exchange' | 'symbol' | 'market'>;

/**
 * Candidates raised by ONE live `DEPTH` message for ONE exchange's book, diffed against
 * that exchange's PREVIOUS levels (plan §3.5). `prev` is the stored venue BEFORE this
 * message overwrites it (undefined = the exchange's book is new to the pair).
 *
 * Pure and side-effect-free apart from the module-local `counter` (id source). Snapshot
 * entries and `data: null` removals never reach here — the store only invokes this for
 * live upserts — so the initial snapshot and every reconnect snapshot raise nothing.
 */
export function selectNotifications(
  prev: VenueBook | undefined,
  id: Identity,
  next: VenueBook,
): Notification[] {
  const out: Notification[] = [];
  scanSide(out, prev?.bids, next.bids, 'bid', id);
  scanSide(out, prev?.asks, next.asks, 'ask', id);
  return out;
}

function scanSide(
  out: Notification[],
  prevLevels: Level[] | undefined,
  nextLevels: Level[],
  side: 'bid' | 'ask',
  id: Identity,
): void {
  for (const level of nextLevels) {
    // (a) no previous book for this exchange → every level qualifies.
    // (b) previous book but no level at this price → qualifies.
    // (c) previous level at this price → qualifies ONLY if the tier changed.
    if (prevLevels) {
      // Float `===` is correct here: a retained level keeps its identical server-sent
      // price across updates, so it matches; a genuinely new price is a different number.
      const existing = prevLevels.find((l) => l.price === level.price);
      if (existing && existing.tier === level.tier) continue; // unchanged → skip
    }

    out.push({
      id: `n${++counter}`,
      exchange: id.exchange,
      symbol: id.symbol,
      market: id.market,
      side,
      price: level.price,
      notional: level.price * level.quantity, // $ notional (base for $ and QTY display)
      tier: level.tier,
      distance: level.distance,
      timeMillis: Date.now(), // detection time (see plan §2)
    });
  }
}
