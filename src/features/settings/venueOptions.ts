import type { Exchange, ExchangeMeta } from '@/features/orderbook/exchanges';
import { venueKey, type Market } from '@/features/orderbook/types';

/** One `(exchange, market)` row in the Muted-exchanges settings block. */
export interface VenueOption {
  key: string; // venueKey(exchange, market) — the persisted mute identifier
  exchange: Exchange;
  market: Market;
  label: string;
}

/**
 * Every mutable notification venue: each exchange in the runtime registry × the markets THAT
 * exchange has (from `/api/exchanges`), in registry order then market order. A Spot-only or
 * Futures-only exchange gets one row, and a newly listed exchange gets its rows with no code
 * change. Mutes persist the MUTED set and are never pruned, so new rows start unmuted and a
 * temporarily unlisted venue keeps its mute for when it comes back.
 */
export function buildVenueOptions(
  ids: readonly Exchange[],
  meta: Readonly<Record<Exchange, ExchangeMeta>>,
): VenueOption[] {
  return ids.flatMap((exchange) =>
    meta[exchange].markets.map((market) => ({
      key: venueKey(exchange, market),
      exchange,
      market,
      label: meta[exchange].label,
    })),
  );
}
