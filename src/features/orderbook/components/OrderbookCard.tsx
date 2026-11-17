import { memo, useLayoutEffect, useRef, type MouseEvent } from 'react';
import { i18n } from '@/lib/i18n';
import { useOrderbookStore } from '@/stores/orderbookStore';
import type { BookKey, Level } from '@/features/orderbook/types';
import type { SizeMode } from '@/features/orderbook/pages/DashboardPage';
import {
  fmtAge,
  fmtDistance,
  fmtMoney,
  fmtQty,
  fmtSymbol,
  marketBadge,
  priceDecimals,
} from '@/features/orderbook/format';
import { barBackground } from '@/features/orderbook/tiers';
import { exchangeMeta, exchangeRank, useExchangeRegistry } from '@/features/orderbook/exchanges';
import { ExchangeLogo } from '@/features/orderbook/components/ExchangeLogo';
import { visibleVenues } from '@/features/orderbook/exchangeFilter';
import { useExchangeFilterStore } from '@/features/orderbook/exchangeFilterStore';
// The chrome/row-height constants behind this live in `masonry.ts` and must track the
// Tailwind classes below (header, row padding, spread divider).
import { estimateCardHeight } from '@/features/orderbook/masonry';

/**
 * One live order book — design template "Orderbook", variant **1d** (notional /
 * price / distance columns, left-anchored histogram). One card per `(symbol, market)`.
 *
 * Rows from every exchange are merged into one price ladder per side; a leading
 * logo column says which exchange each row came from (template `DashboardPage.dc.html`).
 *
 * Real-time architecture (CLAUDE.md): subscribes ONLY to its own `books[bookKey]`
 * slice, so a BTC store update never re-renders the ETH card. `content-visibility:
 * auto` lets the browser skip layout/paint for off-screen cards even after React
 * updated their DOM — the cheapest lever against "many symbols at once".
 *
 * Tier colors + `barBackground` live in the shared [`tiers`] module (also used by the
 * notification stripe); the market badge in [`marketBadge`].
 */

interface OrderbookCardProps {
  bookKey: BookKey;
  sizeMode: SizeMode;
}

// `memo`: in importance sort `DashboardPage` re-renders on every flush; a card should only
// re-render on its own subscriptions (its pair's book, the exchange filter) or a prop change.
export const OrderbookCard = memo(function OrderbookCard({ bookKey, sizeMode }: OrderbookCardProps) {
  const book = useOrderbookStore((s) => s.books[bookKey]);
  const hidden = useExchangeFilterStore((s) => s.hidden);
  // Exchange order (equal-price tie-break), labels and logos come from the runtime registry;
  // re-render when it changes (metadata arrival — rare, never per tick).
  useExchangeRegistry((s) => s.version);

  // Only exchanges the header filter leaves visible. Computed before the early returns below
  // because the row reserve is a hook and must run on every render.
  const venues = book ? visibleVenues(book, hidden) : [];
  let rowCount = 0;
  for (const venue of venues) rowCount += venue.asks.length + venue.bids.length;
  // A filter change resets the reserve: the card should snap to its new visible rows.
  const reservedRows = useReservedRows(rowCount, hidden);

  // Pair may vanish (last venue removed / snapshot shrink) between the parent's `keys` read and
  // this render — the parent drops the card on the same store update, so render null. A pair
  // with no visible exchange is likewise already dropped by the parent's visible-keys selector.
  if (!book || venues.length === 0) return null;

  // Merge every visible exchange's rows into one ladder per side (plan §3.6): rows are NOT
  // grouped by exchange, each level already carries its own `exchange`.
  const asks: Level[] = [];
  const bids: Level[] = [];
  for (const venue of venues) {
    asks.push(...venue.asks);
    bids.push(...venue.bids);
  }

  // Bar scale: the max dollar notional across BOTH sides and all VISIBLE exchanges of this card.
  // Always the dollar notional regardless of the display toggle — relative size shouldn't
  // shift meaning when the unit label changes.
  let maxNotional = 0;
  for (const l of bids) maxNotional = Math.max(maxNotional, l.price * l.quantity);
  for (const l of asks) maxNotional = Math.max(maxNotional, l.price * l.quantity);

  // Sort by price ourselves — the server orders each side by importance, not price. Both
  // sides are laid out high→low top-to-bottom (the standard ladder) so the nearest-spread
  // orders hug the divider: the lowest ask sits immediately ABOVE it, and the highest bid
  // sits immediately BELOW it. Equal prices on two exchanges tie-break by registry order
  // (plan D5) so the rows don't swap places between ticks.
  asks.sort(byPriceDesc);
  bids.sort(byPriceDesc);
  // Identity keys, NOT positional ones: with `ask-${i}` a level appearing above shifted every
  // row below it onto a different price, and each bar's width transition animated between
  // unrelated orders. Keyed by exchange + price, a row's DOM (and its transition) follows the
  // same resting order across ticks; a genuinely new level mounts at its final width.
  const askKeys = levelKeys(asks);
  const bidKeys = levelKeys(bids);

  const badge = marketBadge(book.market);

  return (
    <div
      className="overflow-hidden rounded-[10px] border border-white/15 bg-surface
                 transition-colors duration-[120ms] ease-[ease]
                 hover:bg-[color-mix(in_oklab,var(--color-surface),white_4%)]
                 [content-visibility:auto]"
      // `containIntrinsicSize`: placeholder size for a never-rendered off-screen card; once it
      // has rendered, `auto` makes the browser reuse its last real size instead. Cards range
      // from 1 row to 10+, so a fixed guess is wrong for most of them.
      // `minHeight`: the delayed-shrink reserve (see `useReservedRows`) — the card grows at once
      // but keeps recently-seen rows' height for a while, so top-5 churn doesn't make it bob.
      style={{
        containIntrinsicSize: `auto ${estimateCardHeight(reservedRows)}px`,
        minHeight: estimateCardHeight(reservedRows),
      }}
    >
      {/* Card header: market badge + symbol (mid price & column headers off) */}
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-[11px]">
        <span
          className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badge.className}`}
        >
          {badge.label}
        </span>
        <span className="font-mono text-[13px] tracking-[0.04em] text-text">
          {fmtSymbol(book.symbol)}
        </span>
      </div>

      {/* Rows: asks (nearest above), dashed spread divider, bids (nearest below) */}
      <div className="pt-2 pb-3">
        {asks.map((level, i) => (
          <Row
            key={askKeys[i]}
            level={level}
            side="ask"
            maxNotional={maxNotional}
            sizeMode={sizeMode}
          />
        ))}
        <div className="mx-4 my-[7px] border-t border-dashed border-border-subtle" />
        {bids.map((level, i) => (
          <Row
            key={bidKeys[i]}
            level={level}
            side="bid"
            maxNotional={maxNotional}
            sizeMode={sizeMode}
          />
        ))}
      </div>
    </div>
  );
});

const byPriceDesc = (a: Level, b: Level): number =>
  b.price - a.price || exchangeRank(a.exchange) - exchangeRank(b.exchange);

/**
 * Stable React keys for one side's rows: `EXCHANGE:price`. A price is unique per exchange per
 * side by contract, but the socket payload is unvalidated (types.ts), so a duplicate gets a
 * `#n` suffix rather than a React duplicate-key error.
 */
function levelKeys(levels: Level[]): string[] {
  const seen = new Set<string>();
  return levels.map((l) => {
    const base = `${l.exchange}:${l.price}`;
    let key = base;
    for (let n = 2; seen.has(key); n++) key = `${base}#${n}`;
    seen.add(key);
    return key;
  });
}

/**
 * How long a card keeps the height of rows that have left before shrinking, in ms. Levels
 * churn in and out of the top-5 window every few seconds; holding the height this long
 * absorbs that churn, while a book that genuinely thinned out still tightens up within a
 * few seconds' glance.
 */
const SHRINK_DELAY_MS = 10_000;

/**
 * Delayed-shrink row reserve — damping, not fixed-height placeholders. Returns the row count
 * the card should reserve space for: it rises IMMEDIATELY with `rows` (content is never
 * clipped) but falls only once `rows` has stayed below it for `SHRINK_DELAY_MS`. A change of
 * `resetKey` (the exchange filter) snaps it to `rows` at once.
 *
 * The shrink is evaluated on the card's next render (it re-renders on every update to its
 * book), so no timer is needed; a book that stops updating keeps its reserve until it does.
 * Render only READS the ref; the bookkeeping is written in a layout effect.
 */
function useReservedRows(rows: number, resetKey: unknown): number {
  const state = useRef({ reserved: rows, belowSince: 0, resetKey });
  const s = state.current;

  let reserved = s.reserved;
  if (s.resetKey !== resetKey || rows >= reserved) {
    reserved = rows;
  } else if (s.belowSince !== 0 && Date.now() - s.belowSince >= SHRINK_DELAY_MS) {
    reserved = rows;
  }

  useLayoutEffect(() => {
    const cur = state.current;
    if (reserved === rows) cur.belowSince = 0; // at (or snapped to) the real height
    else if (cur.belowSince === 0) cur.belowSince = Date.now(); // just dropped below the reserve
    cur.reserved = reserved;
    cur.resetKey = resetKey;
  });

  return reserved;
}

interface RowProps {
  level: Level;
  side: 'ask' | 'bid';
  maxNotional: number;
  sizeMode: SizeMode;
}

function Row({ level, side, maxNotional, sizeMode }: RowProps) {
  const notional = level.price * level.quantity;
  // 3% floor keeps tiny orders visible as a sliver; guard divide-by-zero on an
  // empty/all-zero book (max === 0 → no bar).
  const pct =
    maxNotional > 0 ? Math.min(100, Math.max(3, Math.round((notional / maxNotional) * 100))) : 0;

  // i18n HARD RULE (plan §6.4) still holds: this Row re-renders per animation frame for
  // an actively-updating book, so NOTHING i18n — not even a useTranslation() hook call —
  // runs in the render body. The tooltip is only ever relevant on hover, and it's never
  // rendered in JSX (written imperatively to the DOM), so it needs no reactivity: we read
  // the i18n singleton directly inside onMouseEnter. That runs one translate per hover,
  // zero per render, keeping the render body truly i18n-free. The next hover after a
  // language switch picks up the new locale on its own — no subscription needed.
  const handleMouseEnter = (e: MouseEvent<HTMLDivElement>) => {
    const age = fmtAge(Date.now() - level.firstSeenMillis, {
      d: i18n.t('orderbook:card.age.d'),
      h: i18n.t('orderbook:card.age.h'),
      m: i18n.t('orderbook:card.age.m'),
      s: i18n.t('orderbook:card.age.s'),
    });
    e.currentTarget.title = `${exchangeMeta(level.exchange).label} · ${i18n.t('orderbook:card.firstSeen', { age })}`;
  };

  return (
    <div
      className="relative grid grid-cols-[16px_1fr_72px_56px] items-center gap-3 px-4 py-1
                 hover:bg-white/[0.04]"
      onMouseEnter={handleMouseEnter}
    >
      {/* Exchange logo, outside the bar so it stays readable over any tier color. A row
          swapping exchanges only swaps `src` between already-decoded images (plan §3.3). */}
      <ExchangeLogo id={level.exchange} className="size-4" />

      {/* Bar layer: starts after the logo column (left-[44px] = 16 padding + 16 logo + 12 gap) and ends at the
          price column's left edge (right-[156px] = 16 padding + 56 + 72 + 12 gap) */}
      <div className="absolute inset-y-0 left-[44px] right-[156px]">
        <div
          className="absolute inset-y-0 left-0 transition-[width,background-color] duration-[120ms] ease-linear"
          style={{ width: `${pct}%`, background: barBackground(level.tier) }}
        />
      </div>

      <span className="relative pl-1.5 font-mono text-[12px] text-text-strong">
        {sizeMode === 'usd' ? fmtMoney(notional) : fmtQty(level.quantity)}
      </span>
      <span
        className={`relative text-right font-mono text-[12px] ${side === 'ask' ? 'text-danger' : 'text-bid'}`}
      >
        {level.price.toFixed(priceDecimals(level.price))}
      </span>
      <span className="relative text-right font-mono text-[11px] text-text-muted">
        {fmtDistance(level.distance)}
      </span>
    </div>
  );
}
