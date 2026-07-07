import type { Level, Notification, OrderBook } from '@/features/orderbook/types';

let counter = 0; // module-local monotonic id source (stable React keys, one card per event)

/** The ADD/UPDATE shape applyMessages passes in (symbol/market + both level arrays). */
interface AddUpdate {
  symbol: string;
  market: OrderBook['market'];
  bids: Level[];
  asks: Level[];
}

/**
 * Candidates raised by ONE ADD/UPDATE message, diffed against the book's PREVIOUS levels.
 * `prev` is the stored book BEFORE this message overwrites it (undefined = brand-new book).
 *
 * Pure and side-effect-free apart from the module-local `counter` (id source). SNAPSHOT
 * and DROP never reach here — the caller only invokes this on ADD/UPDATE — so the initial
 * snapshot and every reconnect snapshot raise nothing (plan §3).
 */
export function selectNotifications(prev: OrderBook | undefined, msg: AddUpdate): Notification[] {
  const out: Notification[] = [];
  scanSide(out, prev?.bids, msg.bids, 'bid', msg);
  scanSide(out, prev?.asks, msg.asks, 'ask', msg);
  return out;
}

function scanSide(
  out: Notification[],
  prevLevels: Level[] | undefined,
  nextLevels: Level[],
  side: 'bid' | 'ask',
  msg: AddUpdate,
): void {
  for (const level of nextLevels) {
    if (level.tier === 0) continue; // (a) tier 0 → never notify

    // (b) no existing book for this ticker → every non-zero level qualifies.
    // (c) existing book but no level at this price → qualifies.
    // (d) existing level at this price → qualifies ONLY if the tier changed.
    if (prevLevels) {
      // Float `===` is correct here: a retained level keeps its identical server-sent
      // price across updates, so it matches; a genuinely new price is a different number.
      const existing = prevLevels.find((l) => l.price === level.price);
      if (existing && existing.tier === level.tier) continue; // unchanged → skip
    }

    out.push({
      id: `n${++counter}`,
      symbol: msg.symbol,
      market: msg.market,
      side,
      price: level.price,
      notional: level.price * level.quantity, // $ notional (base for $ and QTY display)
      tier: level.tier as 1 | 2 | 3 | 4, // tier 0 already excluded above
      distance: level.distance,
      timeMillis: Date.now(), // detection time (see plan §2)
    });
  }
}
