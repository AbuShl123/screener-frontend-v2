import type { MouseEvent } from 'react';
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
import { EXCHANGES, exchangeRank } from '@/features/orderbook/exchanges';

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

export function OrderbookCard({ bookKey, sizeMode }: OrderbookCardProps) {
  const book = useOrderbookStore((s) => s.books[bookKey]);

  // Pair may vanish (last venue removed / snapshot shrink) between the parent's `keys` read and
  // this render — the parent drops the card on the same store update, so render null.
  if (!book) return null;

  // Merge every exchange's rows into one ladder per side (plan §3.6): rows are NOT
  // grouped by exchange, each level already carries its own `exchange`.
  const asks: Level[] = [];
  const bids: Level[] = [];
  for (const venue of Object.values(book.venues)) {
    asks.push(...venue.asks);
    bids.push(...venue.bids);
  }

  // Bar scale: the max dollar notional across BOTH sides and ALL exchanges of this card.
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

  const badge = marketBadge(book.market);

  return (
    <div
      className="overflow-hidden rounded-[10px] border border-white/15 bg-surface
                 transition-colors duration-[120ms] ease-[ease]
                 hover:bg-[color-mix(in_oklab,var(--color-surface),white_4%)]
                 [content-visibility:auto]"
      // Placeholder size for a never-rendered off-screen card; once it has rendered, `auto`
      // makes the browser reuse its last real size instead. Cards range from 1 row to 10+,
      // so a fixed guess is wrong for most of them.
      style={{ containIntrinsicSize: `auto ${estimateCardHeight(asks.length + bids.length)}px` }}
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
            key={`ask-${i}`}
            level={level}
            side="ask"
            maxNotional={maxNotional}
            sizeMode={sizeMode}
          />
        ))}
        <div className="mx-4 my-[7px] border-t border-dashed border-border-subtle" />
        {bids.map((level, i) => (
          <Row
            key={`bid-${i}`}
            level={level}
            side="bid"
            maxNotional={maxNotional}
            sizeMode={sizeMode}
          />
        ))}
      </div>
    </div>
  );
}

// Card chrome (header 42 + rows padding 20 + spread divider 15 + borders 2) plus 26px per
// row (py-1 + 18px line). Kept in step with the Tailwind classes below.
const CARD_CHROME_PX = 80;
const ROW_PX = 26;

/** Rendered height of a card with `rows` levels across both sides, to within a pixel or two. */
const estimateCardHeight = (rows: number): number => CARD_CHROME_PX + rows * ROW_PX;

const byPriceDesc = (a: Level, b: Level): number =>
  b.price - a.price || exchangeRank(a.exchange) - exchangeRank(b.exchange);

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
    e.currentTarget.title = `${EXCHANGES[level.exchange].label} · ${i18n.t('orderbook:card.firstSeen', { age })}`;
  };

  return (
    <div
      className="relative grid grid-cols-[12px_1fr_72px_56px] items-center gap-3 px-4 py-1
                 hover:bg-white/[0.04]"
      onMouseEnter={handleMouseEnter}
    >
      {/* Exchange logo, outside the bar so it stays readable over any tier color. A row
          swapping exchanges only swaps `src` between already-decoded images (plan §3.3). */}
      <img
        src={EXCHANGES[level.exchange].logo}
        alt={EXCHANGES[level.exchange].label}
        width={12}
        height={12}
        decoding="async"
        className="block size-3 object-contain"
      />

      {/* Bar layer: starts after the logo column (left-9, from the template) and ends at the
          price column's left edge (right-[156px] = 16 padding + 56 + 72 + 12 gap) */}
      <div className="absolute inset-y-0 left-9 right-[156px]">
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
