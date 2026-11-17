import { visibleVenues } from '@/features/orderbook/exchangeFilter';
import type { Exchange, PairBook } from '@/features/orderbook/types';

/**
 * Masonry layout for the dashboard (plan §3.4, template `DashboardPage.dc.html`): cards are
 * dealt in sort order to the currently shortest column, so variable-height cards don't leave
 * the gaps a strict grid would.
 *
 * Heights are ESTIMATED from row counts, never measured, and the assignment is recomputed
 * only on reorder / column-count change — not when a card grows or shrinks (plan D6). A card
 * changing height between reorders just pushes its own column's stack; nothing hops columns.
 * Live reorders go through `assignColumnsStable`, which keeps cards in their column (US4).
 */

/** Minimum card width and the gap between cards (both axes), in px. Gap matches `gap-5`. */
export const MIN_CARD_WIDTH = 265;
export const CARD_GAP = 20;

/** How many columns fit in `width` px of container: `max(1, floor((width + gap) / (min + gap)))`. */
export const columnCount = (width: number): number =>
  Math.max(1, Math.floor((width + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP)));

// Card chrome (header 42 + rows padding 20 + spread divider 15 + borders 2) plus 26px per
// row (py-1 + 18px line). Kept in step with `OrderbookCard`'s Tailwind classes.
const CARD_CHROME_PX = 80;
const ROW_PX = 26;

/** Rendered height of a card with `rows` levels across both sides, to within a pixel or two. */
export const estimateCardHeight = (rows: number): number => CARD_CHROME_PX + rows * ROW_PX;

/** Levels across both sides and every VISIBLE exchange of a pair — the card's row count. */
export function bookRowCount(book: PairBook | undefined, hidden: readonly Exchange[] = []): number {
  if (!book) return 0;
  let rows = 0;
  for (const venue of visibleVenues(book, hidden)) {
    rows += venue.asks.length + venue.bids.length;
  }
  return rows;
}

/**
 * Deals `keys` (in order) into `colCount` columns, each to the shortest column so far; ties
 * go to the leftmost, so the first row reads left-to-right like a grid. Pure — the caller
 * decides when to recompute.
 */
export function assignColumns<K>(
  keys: readonly K[],
  colCount: number,
  estimateHeight: (key: K) => number,
): K[][] {
  const columns: K[][] = Array.from({ length: colCount }, () => []);
  const heights = new Array<number>(colCount).fill(0);

  for (const key of keys) {
    const shortest = shortestColumn(heights);
    columns[shortest].push(key);
    heights[shortest] += estimateHeight(key) + CARD_GAP;
  }
  return columns;
}

/**
 * How much more imbalance than a fresh deal the stable layout may accumulate before it's
 * thrown away, in px. Roughly one mid-sized card: small drift is invisible, a column ending
 * a whole card short is not.
 */
const REBALANCE_SLACK_PX = 300;

/**
 * Re-deal that keeps every card in the column it already occupies (US4 layout stabilization,
 * refining D6). `assignColumns`' greedy shortest-column deal is order-sensitive: swapping two
 * cards near the top changes the running heights, so every LATER card can land in a different
 * column, and a card that changes column remounts. Under live importance sorting that cascade
 * was the main source of cards jumping around.
 *
 * Here, cards present in `prev` stay in their column; within a column they're re-ordered by
 * their position in `keys`, so a rank change moves a card up or down its own column (a keyed
 * DOM move, no remount) and nothing else. New cards — and cards from a column that no longer
 * exists after the column count dropped — go to the shortest column. If the result ends up
 * noticeably less balanced than a fresh deal (`REBALANCE_SLACK_PX`), the fresh deal wins:
 * balance is restored at the cost of one reshuffle. That also covers a column-count INCREASE,
 * whose new empty column always exceeds the slack.
 *
 * Trade-off: the first row is no longer exactly the top-N in reading order — each column is
 * in sort order, and columns are only approximately interleaved. Callers pass `prev = null`
 * when a precise reading order matters (a sort-mode change).
 */
export function assignColumnsStable<K>(
  keys: readonly K[],
  colCount: number,
  estimateHeight: (key: K) => number,
  prev: readonly (readonly K[])[] | null,
): K[][] {
  // Each estimate walks the pair's venues; memoize so the two deals below share the work.
  const cache = new Map<K, number>();
  const estimate = (k: K): number => {
    let h = cache.get(k);
    if (h === undefined) {
      h = estimateHeight(k);
      cache.set(k, h);
    }
    return h;
  };

  const fresh = assignColumns(keys, colCount, estimate);
  if (!prev) return fresh;

  const prevColumn = new Map<K, number>();
  prev.forEach((column, c) => {
    if (c < colCount) for (const k of column) prevColumn.set(k, c);
  });

  const columns: K[][] = Array.from({ length: colCount }, () => []);
  const heights = new Array<number>(colCount).fill(0);
  const orphans: K[] = [];
  // Iterating `keys` in order keeps every column's retained cards in sort order already.
  for (const k of keys) {
    const c = prevColumn.get(k);
    if (c === undefined) {
      orphans.push(k);
    } else {
      columns[c].push(k);
      heights[c] += estimate(k) + CARD_GAP;
    }
  }
  if (orphans.length > 0) {
    for (const k of orphans) {
      const shortest = shortestColumn(heights);
      columns[shortest].push(k);
      heights[shortest] += estimate(k) + CARD_GAP;
    }
    // Orphans were appended; slot them into sort order within their column.
    const rank = new Map<K, number>();
    keys.forEach((k, i) => rank.set(k, i));
    for (const column of columns) column.sort((a, b) => rank.get(a)! - rank.get(b)!);
  }

  const freshHeights = fresh.map((column) =>
    column.reduce((sum, k) => sum + estimate(k) + CARD_GAP, 0),
  );
  return spread(heights) > spread(freshHeights) + REBALANCE_SLACK_PX ? fresh : columns;
}

/** Index of the shortest column; ties go to the leftmost so a fresh deal reads like a grid. */
function shortestColumn(heights: readonly number[]): number {
  let shortest = 0;
  for (let c = 1; c < heights.length; c++) {
    if (heights[c] < heights[shortest]) shortest = c;
  }
  return shortest;
}

/** Tallest minus shortest column. */
function spread(heights: readonly number[]): number {
  return heights.length === 0 ? 0 : Math.max(...heights) - Math.min(...heights);
}
