import { useOrderbookStore } from '@/stores/orderbookStore';
import type { BookKey, Level } from '@/features/orderbook/types';
import type { SizeMode } from '@/features/orderbook/pages/DashboardPage';
import {
  fmtAge,
  fmtDistance,
  fmtMoney,
  fmtQty,
  fmtSymbol,
  priceDecimals,
} from '@/features/orderbook/format';

/**
 * One live order book — design template "Orderbook", variant **1d** (notional /
 * price / distance columns, left-anchored histogram). One card per `(symbol, market)`.
 *
 * Real-time architecture (CLAUDE.md): subscribes ONLY to its own `books[bookKey]`
 * slice, so a BTC store update never re-renders the ETH card. `content-visibility:
 * auto` lets the browser skip layout/paint for off-screen cards even after React
 * updated their DOM — the cheapest lever against "many symbols at once".
 */

/**
 * Tier → bar color. Values are the dashboard's chosen tier scale (Dashboard template
 * props: tier1–4), NOT theme tokens — they're tier-scale data-viz colors specific to
 * this card, and the exact values the future "settings" feature would expose. Index 0
 * (and any out-of-range tier) has no color: the dashboard runs `tier0=hidden`.
 */
const TIER_COLORS: readonly (string | null)[] = [null, '#57ff92', '#f7bb18', '#ff8080', '#a12eff'];
/** Bar fill opacity (%) — the dashboard's `fillOpacity` prop. */
const FILL_OPACITY = 26;

/** Bar background for a tier, or `transparent` for tier 0 / out-of-range (hidden). */
function barBackground(tier: number): string {
  const hex = TIER_COLORS[tier];
  return hex ? `color-mix(in oklab, ${hex} ${FILL_OPACITY}%, transparent)` : 'transparent';
}

interface OrderbookCardProps {
  bookKey: BookKey;
  sizeMode: SizeMode;
}

export function OrderbookCard({ bookKey, sizeMode }: OrderbookCardProps) {
  const book = useOrderbookStore((s) => s.books[bookKey]);

  // Book may vanish (DROP / snapshot shrink) between the parent's `keys` read and
  // this render — the parent drops the card on the same store update, so render null.
  if (!book) return null;

  // Bar scale: the max dollar notional across BOTH sides of this book. Always the
  // dollar notional regardless of the display toggle — relative size shouldn't shift
  // meaning when the unit label changes.
  let maxNotional = 0;
  for (const l of book.bids) maxNotional = Math.max(maxNotional, l.price * l.quantity);
  for (const l of book.asks) maxNotional = Math.max(maxNotional, l.price * l.quantity);

  // Sort by price ourselves — do NOT trust the server's array order. Both sides are
  // laid out high→low top-to-bottom (the standard ladder) so the nearest-spread orders
  // hug the divider: the lowest ask sits immediately ABOVE it (the "5th" / bottom ask),
  // and the highest bid sits immediately BELOW it (the "1st" / top bid).
  const asks = [...book.asks].sort((a, b) => b.price - a.price);
  const bids = [...book.bids].sort((a, b) => b.price - a.price);

  const isFutures = book.market === 'FUTURES';
  // Perpetual futures badged PERP in green (the market convention); spot in warning.
  const badgeClasses = isFutures ? 'text-bid border-bid/50' : 'text-warning border-warning/50';

  return (
    <div
      className="overflow-hidden rounded-[10px] border border-border bg-surface
                 [content-visibility:auto] [contain-intrinsic-size:auto_380px]"
    >
      {/* Card header: market badge + symbol (mid price & column headers off) */}
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-[11px]">
        <span
          className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badgeClasses}`}
        >
          {isFutures ? 'PERP' : 'SPOT'}
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

  return (
    <div
      className="relative grid grid-cols-[1fr_72px_56px] items-center gap-3 px-4 py-1
                 hover:bg-white/[0.04]"
      title={`First seen ${fmtAge(Date.now() - level.firstSeenMillis)} ago`}
    >
      {/* Bar layer, capped at the price column (right-[156px] = 72 + 56 + 2×12 gap + 4 slack) */}
      <div className="absolute inset-y-0 left-0 right-[156px]">
        <div
          className="absolute inset-y-0 left-0 transition-[width,background-color] duration-[120ms] ease-linear"
          style={{ width: `${pct}%`, background: barBackground(level.tier) }}
        />
      </div>

      <span className="relative font-mono text-[12px] text-text-strong">
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
