import type { ActiveCluster, Cluster, TrackedCluster } from '@/features/orderbook/types';

/**
 * Following a cluster across updates (doc §3.9.1). The wire carries no id, but the same cluster
 * keeps its `firstSeenMillis` and its price range moves gradually.
 */

/** Without a shared `firstSeenMillis`, ranges must overlap by this share of the shorter one. */
const MIN_OVERLAP_SHARE = 0.5;

export interface PriceRange {
  priceFrom: number;
  priceTo: number;
}

/** The overlap's price width; negative when the ranges are disjoint. */
const overlapWidth = (a: PriceRange, b: PriceRange): number =>
  Math.min(a.priceTo, b.priceTo) - Math.max(a.priceFrom, b.priceFrom);

/** True when the ranges overlap enough to be one wall whose bounds moved. */
export function isSameRange(a: PriceRange, b: PriceRange): boolean {
  const width = overlapWidth(a, b);
  if (width < 0) return false;
  const shorter = Math.min(a.priceTo - a.priceFrom, b.priceTo - b.priceFrom);
  return width >= shorter * MIN_OVERLAP_SHARE;
}

/**
 * The held cluster `next` continues. A shared `firstSeenMillis` wins (after a merge the server
 * keeps the older piece's, even when the other piece overlaps more), then the largest overlap,
 * then the older one.
 */
function findMatch(
  held: readonly TrackedCluster[],
  next: Cluster,
): TrackedCluster | undefined {
  return held
    .filter(
      (h) =>
        isSameRange(h, next) ||
        (h.firstSeenMillis === next.firstSeenMillis && overlapWidth(h, next) >= 0),
    )
    .sort(
      (a, b) =>
        Number(b.firstSeenMillis === next.firstSeenMillis) -
          Number(a.firstSeenMillis === next.firstSeenMillis) ||
        overlapWidth(b, next) - overlapWidth(a, next) ||
        a.firstSeenMillis - b.firstSeenMillis,
    )[0];
}

let lastId = 0;

export interface TrackResult {
  tracked: TrackedCluster[];
  /** Clusters with no match on the held side: the ones worth announcing. */
  added: TrackedCluster[];
}

/**
 * Give one side's incoming clusters ids, reusing a held cluster's id for its continuation. When
 * one held cluster splits, the piece that kept its `firstSeenMillis` keeps the id; the others
 * get new ids but are not `added`, since that wall was already announced.
 */
export function trackClusters(
  held: readonly TrackedCluster[],
  incoming: readonly Cluster[],
): TrackResult {
  const matches = incoming.map((cluster) => findMatch(held, cluster));
  const keepsFirstSeen = (i: number) =>
    matches[i]?.firstSeenMillis === incoming[i].firstSeenMillis;
  /** Whether incoming `i` is the one that inherits its match's id. */
  const inherits = (i: number): boolean => {
    const rivals = incoming.flatMap((_, j) => (matches[j] === matches[i] ? [j] : []));
    return (rivals.find(keepsFirstSeen) ?? rivals[0]) === i;
  };

  const tracked = incoming.map((cluster, i): TrackedCluster => {
    const match = matches[i];
    return { ...cluster, id: match && inherits(i) ? match.id : `cluster-${++lastId}` };
  });
  return { tracked, added: tracked.filter((_, i) => matches[i] === undefined) };
}

/**
 * Where a cluster being looked at is now: the active one with its id, else one on the same
 * instrument and side covering the same range (it merged into an older wall, or was pulled and
 * came back), else undefined — it is gone.
 */
export function followCluster(
  active: readonly ActiveCluster[],
  last: ActiveCluster,
): ActiveCluster | undefined {
  const sameSide = active.filter(
    (a) =>
      a.exchange === last.exchange &&
      a.market === last.market &&
      a.symbol === last.symbol &&
      a.side === last.side,
  );
  const id = last.cluster.id;
  return (
    sameSide.find((a) => a.cluster.id === id) ??
    sameSide
      .filter((a) => isSameRange(a.cluster, last.cluster))
      .sort(
        (a, b) =>
          overlapWidth(b.cluster, last.cluster) - overlapWidth(a.cluster, last.cluster),
      )[0]
  );
}
