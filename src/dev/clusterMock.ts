import type { Cluster, ClusterData, Level, VenueBook } from '@/features/orderbook/types';
import { injectRawMessage } from '@/lib/ws/feedClient';
import { useOrderbookStore } from '@/stores/orderbookStore';

/**
 * DEV-ONLY mock harness for `CLUSTER` messages (backend delivery is off). Builds frames exactly
 * as the server would send them and pushes them through the feed client's real parse → guard →
 * flush path. Loaded only by the serve-only `devMocks` plugin in `vite.config.ts`; nothing in
 * `src/` may import it.
 *
 * Use it from the browser console on the dashboard: `__clusterMock.appear()`, or
 * `__clusterMock.demo()` for every scenario in sequence.
 */

const ARB = { exchange: 'BINANCE', market: 'SPOT', symbol: 'ARBUSDT' } as const;
const SOL = { exchange: 'BYBIT', market: 'FUTURES', symbol: 'SOLUSDT' } as const;
type Instrument = typeof ARB | typeof SOL;

const DEMO_STEP_MS = 3_000;
const PRICE_DECIMALS = 8;
/** Size multipliers cycled over the levels so ladder bars differ visibly. */
const SIZE_PATTERN = [1, 0.92, 0.97, 0.85, 1.08, 0.9] as const;

interface WallSpec {
  from: number;
  step: number;
  count: number;
  levelNotional: number;
  distance: number;
  firstSeenMillis: number;
}

type WireCluster = Omit<Cluster, 'levels'> & { levels: [price: number, quantity: number][] };
type WireData = Record<keyof ClusterData, WireCluster[]>;

function wall(spec: WallSpec): WireCluster {
  const levels = Array.from({ length: spec.count }, (_, i): [number, number] => {
    const price = Number((spec.from + i * spec.step).toFixed(PRICE_DECIMALS));
    return [price, (spec.levelNotional * SIZE_PATTERN[i % SIZE_PATTERN.length]) / price];
  });
  return {
    priceFrom: levels[0][0],
    priceTo: levels[levels.length - 1][0],
    levelCount: levels.length,
    totalNotional: Math.round(levels.reduce((sum, [p, q]) => sum + p * q, 0)),
    totalQuantity: levels.reduce((sum, [, q]) => sum + q, 0),
    distance: spec.distance,
    firstSeenMillis: spec.firstSeenMillis,
    levels,
  };
}

/** Fixed per page load: `firstSeenMillis` must not change when a cluster is updated. */
const FIRST_SEEN = Date.now() - 60_000;

const arbBid = (levelNotional: number): WireCluster =>
  wall({ from: 0.07, step: 0.0001, count: 41, levelNotional, distance: 0.0269, firstSeenMillis: FIRST_SEEN });
const arbAsk = (): WireCluster =>
  wall({ from: 0.078, step: 0.0001, count: 24, levelNotional: 90_000, distance: 0.0183, firstSeenMillis: FIRST_SEEN });
/** At the backend's 200-level cap, for checking the ladder's render cost. */
const solAsk = (): WireCluster =>
  wall({ from: 182, step: 0.01, count: 200, levelNotional: 60_000, distance: 0.0041, firstSeenMillis: FIRST_SEEN });

const clusterFrame = (instrument: Instrument, data: WireData | null) =>
  ({ type: 'CLUSTER', ...instrument, data });

const send = (frame: unknown): void => injectRawMessage(JSON.stringify(frame));

const tuple = (l: Level) => [l.price, l.quantity, l.tier, l.firstSeenMillis, l.distance];
const wireBook = (b: VenueBook) => ({ bids: b.bids.map(tuple), asks: b.asks.map(tuple) });

/** The current order book re-encoded, so a mock `SNAPSHOT` doesn't wipe the live board. */
const currentDepth = () =>
  Object.values(useOrderbookStore.getState().books).flatMap(({ symbol, market, venues }) =>
    Object.entries(venues).flatMap(([exchange, book]) =>
      book ? [{ type: 'DEPTH', exchange, market, symbol, data: wireBook(book) }] : [],
    ),
  );

const clusterMock = {
  /** First appearance: one bid wall on ARBUSDT. */
  appear: () => send(clusterFrame(ARB, { bidClusters: [arbBid(100_000)], askClusters: [] })),
  /** The same wall, its total up by 25%. */
  update: () => send(clusterFrame(ARB, { bidClusters: [arbBid(125_000)], askClusters: [] })),
  /** A second cluster on the other side of the same instrument. */
  otherSide: () => send(clusterFrame(ARB, { bidClusters: [arbBid(125_000)], askClusters: [arbAsk()] })),
  /** A 200-level wall on another instrument. */
  appearLarge: () => send(clusterFrame(SOL, { bidClusters: [], askClusters: [solAsk()] })),
  /** Explicit removals (`data: null`). */
  remove: () => send(clusterFrame(ARB, null)),
  removeLarge: () => send(clusterFrame(SOL, null)),
  /** A reconnect: the `SNAPSHOT` holds two clusters. Must restore them without alerting. */
  reconnect: () =>
    send({
      type: 'SNAPSHOT',
      data: [
        ...currentDepth(),
        clusterFrame(ARB, { bidClusters: [arbBid(125_000)], askClusters: [] }),
        clusterFrame(SOL, { bidClusters: [], askClusters: [solAsk()] }),
      ],
    }),
  /** A `SNAPSHOT` without clusters: every instrument must end up with none. */
  emptySnapshot: () => send({ type: 'SNAPSHOT', data: currentDepth() }),
  /** Unusable payloads: must be ignored without throwing or removing anything. */
  malformed: () => {
    for (const data of [undefined, 'nope', 7, [], {}, { bidClusters: [null, { priceFrom: 'x' }] }]) {
      send({ type: 'CLUSTER', ...ARB, data });
    }
  },
  /** Every scenario in order, one per `DEMO_STEP_MS`. */
  demo: () => {
    const { appear, update, otherSide, appearLarge, remove, reconnect, emptySnapshot } = clusterMock;
    [appear, update, otherSide, appearLarge, remove, reconnect, emptySnapshot].forEach((step, i) =>
      setTimeout(step, i * DEMO_STEP_MS),
    );
  },
};

declare global {
  interface Window {
    __clusterMock?: typeof clusterMock;
  }
}

window.__clusterMock = clusterMock;
