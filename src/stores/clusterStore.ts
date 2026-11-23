import { create } from 'zustand';
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

interface ClusterState {
  /** Instrument key → clusters. A changed instrument gets a fresh object; the rest keep theirs. */
  clusters: ClusterMap;
  /**
   * Every active cluster, flat, grouped by instrument. Rebuilt with each write (so the array is
   * stable between writes); each `cluster` keeps its identity until its instrument changes.
   */
  active: readonly ActiveCluster[];
  /** Apply one flush's `CLUSTER`s and snapshots in arrival order (at most one `set()`). */
  applyMessages(batch: readonly FeedMessage[]): void;
  /** Session end (feed stop / logout). */
  reset(): void;
}

/** One envelope applied to the map. Returns the same map when nothing changed. */
function applyCluster(clusters: ClusterMap, msg: ClusterMessage): ClusterMap {
  const key = clusterKey(msg.exchange, msg.symbol, msg.market);
  const { data } = msg;

  // Both sides empty never comes by contract; treat it as the removal it would amount to.
  if (data === null || (data.bidClusters.length === 0 && data.askClusters.length === 0)) {
    if (!Object.hasOwn(clusters, key)) return clusters; // redundant removals are normal (doc §3.7)
    const { [key]: _removed, ...rest } = clusters;
    return rest;
  }

  const { exchange, market, symbol } = msg;
  return { ...clusters, [key]: { exchange, market, symbol, ...data } };
}

function applySnapshot(entries: readonly ClusterMessage[], prev: ClusterMap): ClusterMap {
  const next = entries.reduce(applyCluster, {} as ClusterMap);
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

  applyMessages(batch) {
    const prev = get().clusters;
    let clusters = prev;
    for (const msg of batch) {
      if (msg.type === 'SNAPSHOT') clusters = applySnapshot(msg.clusters, clusters);
      else if (msg.type === 'CLUSTER') clusters = applyCluster(clusters, msg);
    }
    if (clusters === prev) return; // the common flush carries no clusters — wake nobody
    set({ clusters, active: flatten(clusters) });
  },

  reset() {
    set({ clusters: {}, active: [] });
  },
}));

/** The active-cluster list. */
export const selectActiveClusters = (s: ClusterState): readonly ActiveCluster[] => s.active;

/** One instrument's clusters, or undefined when it has none. */
export const selectInstrumentClusters =
  (key: ClusterKey) =>
  (s: ClusterState): InstrumentClusters | undefined =>
    s.clusters[key];
