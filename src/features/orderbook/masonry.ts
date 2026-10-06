import type { PairBook } from '@/features/orderbook/types';

/**
 * Masonry layout for the dashboard (plan §3.4, template `DashboardPage.dc.html`): cards are
 * dealt in sort order to the currently shortest column, so variable-height cards don't leave
 * the gaps a strict grid would.
 *
 * Heights are ESTIMATED from row counts, never measured, and the assignment is recomputed
 * only on reorder / column-count change — not when a card grows or shrinks (plan D6). A card
 * changing height between reorders just pushes its own column's stack; nothing hops columns.
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

/** Levels across both sides and every exchange of a pair — the card's row count. */
export function bookRowCount(book: PairBook | undefined): number {
  if (!book) return 0;
  let rows = 0;
  for (const venue of Object.values(book.venues)) {
    if (venue) rows += venue.asks.length + venue.bids.length;
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
    let shortest = 0;
    for (let c = 1; c < colCount; c++) {
      if (heights[c] < heights[shortest]) shortest = c;
    }
    columns[shortest].push(key);
    heights[shortest] += estimateHeight(key) + CARD_GAP;
  }
  return columns;
}
