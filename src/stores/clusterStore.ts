import { create } from 'zustand';
import { trackClusters } from '@/features/orderbook/clusterIdentity';
import {
  clusterKey,
  type ActiveCluster,
  type ClusterKey,
  type ClusterMessage,
  type FeedMessage,
  type InstrumentClusters,
} from '@/features/orderbook/types';

/**
 * Layered order clusters (doc §3.9), OUTSIDE React like `orderbookStore`: the feed flush is the
 * ONLY writer, components read via the selectors below.
 *
 * Clusters are STATE, not history, so this follows `orderbookStore` and not `tradeStore`: a
 * message replaces its instrument's whole set, `data: null` removes it, and a `SNAPSHOT`
 * replaces the entire map (an instrument absent from it has no clusters).
 */

type ClusterMap = Readonly<Record<ClusterKey, InstrumentClusters>>;

/**
 * Whether the panel is open on the clusters tab. While it is, new clusters are already on
 * screen, so `announce` doesn't count them as unread. Module-level: nothing renders from it.
 */
let viewing = false;

interface ClusterState {
  /** Instrument key → clusters. A changed instrument gets a fresh object; the rest keep theirs. */
  clusters: ClusterMap;
  /**
   * Every active cluster, flat, grouped by instrument. Rebuilt with each write (so the array is
   * stable between writes); each `cluster` keeps its identity until its instrument changes.
   */
  active: readonly ActiveCluster[];
  /** Ids of announced, still active clusters the user hasn't seen. A removed one drops out. */
  unread: readonly string[];
  /**
   * Apply one flush's `CLUSTER`s and snapshots in arrival order (at most one `set()`). Returns
   * the clusters that appeared in a LIVE message and are still there at the end of the batch;
   * a `SNAPSHOT` entry is never returned, so it can never raise an alert (doc §3.9.3).
   */
  applyMessages(batch: readonly FeedMessage[]): readonly ActiveCluster[];
  /** The flush announces the appeared clusters that survived the mutes and the cooldown. */
  announce(alerts: readonly ActiveCluster[]): void;
  /** The panel opened on / left the clusters tab. Entering marks everything read. */
  setViewing(v: boolean): void;
  /** Session end (feed stop / logout). */
  reset(): void;
}

interface Applied {
  clusters: ClusterMap;
  /** Ids of clusters that have no counterpart in `held`. */
  addedIds: readonly string[];
}

/**
 * Apply one envelope to `clusters`, following identities from `held` (the same map for a live
 * message, the pre-snapshot map for a snapshot entry). Returns the same map if nothing changed.
 */
function applyCluster(clusters: ClusterMap, held: ClusterMap, msg: ClusterMessage): Applied {
  const key = clusterKey(msg.exchange, msg.symbol, msg.market);
  const { data } = msg;

  // Both sides empty never comes by contract; treat it as the removal it would amount to.
  if (data === null || (data.bidClusters.length === 0 && data.askClusters.length === 0)) {
    if (!Object.hasOwn(clusters, key)) return { clusters, addedIds: [] }; // redundant (doc §3.7)
    const { [key]: _removed, ...rest } = clusters;
    return { clusters: rest, addedIds: [] };
  }

  const { exchange, market, symbol } = msg;
  const bids = trackClusters(held[key]?.bidClusters ?? [], data.bidClusters);
  const asks = trackClusters(held[key]?.askClusters ?? [], data.askClusters);
  const entry = {
    exchange, market, symbol,
    bidClusters: bids.tracked,
    askClusters: asks.tracked,
  };
  return {
    clusters: { ...clusters, [key]: entry },
    addedIds: [...bids.added, ...asks.added].map((c) => c.id),
  };
}

function applySnapshot(entries: readonly ClusterMessage[], prev: ClusterMap): ClusterMap {
  const next = entries.reduce(
    (map: ClusterMap, entry) => applyCluster(map, prev, entry).clusters,
    {},
  );
  // Nothing before, nothing now: keep the reference so subscribers aren't woken.
  const bothEmpty = Object.keys(prev).length === 0 && Object.keys(next).length === 0;
  return bothEmpty ? prev : next;
}

function flatten(clusters: ClusterMap): ActiveCluster[] {
  return Object.values(clusters).flatMap(
    ({ exchange, market, symbol, bidClusters, askClusters }): ActiveCluster[] => [
      ...bidClusters.map((cluster) => ({ exchange, market, symbol, side: 'bid' as const, cluster })),
      ...askClusters.map((cluster) => ({ exchange, market, symbol, side: 'ask' as const, cluster })),
    ],
  );
}

export const useClusterStore = create<ClusterState>((set, get) => ({
  clusters: {},
  active: [],
  unread: [],

  applyMessages(batch) {
    const prev = get().clusters;
    let clusters = prev;
    const addedIds = new Set<string>();
    for (const msg of batch) {
      if (msg.type === 'SNAPSHOT') {
        clusters = applySnapshot(msg.clusters, clusters);
      } else if (msg.type === 'CLUSTER') {
        const applied = applyCluster(clusters, clusters, msg);
        clusters = applied.clusters;
        applied.addedIds.forEach((id) => addedIds.add(id));
      }
    }
    if (clusters === prev) return []; // the common flush carries no clusters — wake nobody

    const active = flatten(clusters);
    const activeIds = new Set(active.map((a) => a.cluster.id));
    const { unread } = get();
    set({ clusters, active, unread: unread.filter((id) => activeIds.has(id)) });
    return active.filter((a) => addedIds.has(a.cluster.id));
  },

  announce(alerts) {
    if (viewing || alerts.length === 0) return;
    set((s) => ({ unread: [...s.unread, ...alerts.map((a) => a.cluster.id)] }));
  },

  setViewing(v) {
    viewing = v;
    if (v && get().unread.length > 0) set({ unread: [] });
  },

  reset() {
    set({ clusters: {}, active: [], unread: [] });
  },
}));

/** The active-cluster list. */
export const selectActiveClusters = (s: ClusterState): readonly ActiveCluster[] => s.active;

/** One instrument's clusters, or undefined when it has none. */
export const selectInstrumentClusters =
  (key: ClusterKey) =>
  (s: ClusterState): InstrumentClusters | undefined =>
    s.clusters[key];
