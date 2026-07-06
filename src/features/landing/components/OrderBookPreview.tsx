import { useEffect, useState } from 'react';

/**
 * Decorative, animated order-book mock for the hero (plan §8.2).
 *
 * IMPORTANT: this is a self-contained visual flourish. It is NOT wired to the
 * real WebSocket feed or the `orderbookStore`, and deliberately holds its data
 * in local React state. CLAUDE.md's "keep the firehose out of React" rule is
 * about the *real* order-book surface — 10 rows jittering every 1.4s is trivial
 * and does not apply here. Honors `prefers-reduced-motion` (renders a static
 * snapshot, no interval) and cleans up its interval on unmount.
 */

interface RawRow {
  p: number;
  s: number;
  sig: boolean;
}

interface BookState {
  asks: RawRow[];
  bids: RawRow[];
  mid: number;
}

const INITIAL: BookState = {
  asks: [
    { p: 64231.0, s: 3.42, sig: false },
    { p: 64224.5, s: 6.1, sig: false },
    { p: 64219.0, s: 18.4, sig: true },
    { p: 64216.5, s: 4.85, sig: false },
    { p: 64214.0, s: 2.31, sig: false },
  ],
  bids: [
    { p: 64213.0, s: 2.94, sig: false },
    { p: 64211.5, s: 5.62, sig: false },
    { p: 64208.0, s: 21.2, sig: true },
    { p: 64204.5, s: 7.48, sig: false },
    { p: 64198.0, s: 3.15, sig: false },
  ],
  mid: 64213.5,
};

const INTERVAL_MS = 1400;

function fmtPrice(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface DisplayRow {
  price: string;
  size: string;
  depth: number; // percentage 0..100
  sig: boolean;
}

function bookRows(rows: RawRow[]): DisplayRow[] {
  const max = Math.max(...rows.map((r) => r.s));
  return rows.map((r) => ({
    price: fmtPrice(r.p),
    size: r.s.toFixed(2),
    depth: Math.round((r.s / max) * 100),
    sig: r.sig,
  }));
}

function jitter(rows: RawRow[]): RawRow[] {
  return rows.map((r) => {
    const f = 1 + (Math.random() - 0.5) * 0.14;
    return { ...r, s: Math.max(0.4, r.s * f) };
  });
}

function BookRow({ row, side }: { row: DisplayRow; side: 'ask' | 'bid' }) {
  const priceColor = side === 'ask' ? 'text-danger' : 'text-bid';
  const barBg =
    side === 'ask'
      ? 'color-mix(in oklab, var(--color-danger) 30%, transparent)'
      : 'color-mix(in oklab, var(--color-bid) 30%, transparent)';
  return (
    <div className="grid grid-cols-[1fr_1fr_1.1fr] items-center gap-2 rounded-[2px] px-2 py-[5px]">
      <span className={`flex items-center gap-[6px] font-mono text-[12px] ${priceColor}`}>
        {row.price}
        {row.sig && (
          <span className="rounded-[4px] bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)] px-[5px] py-[2px] font-mono text-[9px] tracking-[0.08em] text-accent">
            SIG
          </span>
        )}
      </span>
      <span className="text-right font-mono text-[12px] text-text-muted">{row.size}</span>
      <span className="flex justify-end">
        <span
          className="h-2 rounded-[2px]"
          style={{ width: `${row.depth}%`, background: barBg }}
        />
      </span>
    </div>
  );
}

export function OrderBookPreview() {
  const [book, setBook] = useState<BookState>(INITIAL);

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const id = setInterval(() => {
      setBook((s) => ({
        asks: jitter(s.asks),
        bids: jitter(s.bids),
        mid: s.mid + (Math.random() - 0.5) * 1.2,
      }));
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const asks = bookRows(book.asks);
  const bids = bookRows(book.bids);

  return (
    <div className="rounded-[14px] border border-border bg-surface p-[18px] pb-[14px] shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
      {/* Header */}
      <div className="mb-[14px] flex items-center justify-between">
        <div className="flex items-center gap-[10px]">
          <span className="font-mono text-[12px] tracking-[0.08em] text-text-strong">BTCUSDT</span>
          <span className="font-mono text-[10px] tracking-[0.08em] text-text-dim">
            PERP · BINANCE
          </span>
        </div>
        <span className="rounded-[4px] bg-[color-mix(in_oklab,var(--color-accent)_16%,transparent)] px-[7px] py-[3px] font-mono text-[9px] tracking-[0.08em] text-accent">
          LIVE
        </span>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[1fr_1fr_1.1fr] gap-2 px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-dim">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Depth</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-[2px] rounded-[10px] border border-border-subtle bg-input p-2">
        {asks.map((row, i) => (
          <BookRow key={`ask-${i}`} row={row} side="ask" />
        ))}

        <div className="my-[3px] flex items-center justify-center gap-[10px] border-y border-dashed border-border-input py-[7px]">
          <span className="font-mono text-[10px] text-text-dim">—</span>
          <span className="font-mono text-[12px] text-text-strong">{fmtPrice(book.mid)}</span>
          <span className="font-mono text-[10px] text-text-dim">—</span>
        </div>

        {bids.map((row, i) => (
          <BookRow key={`bid-${i}`} row={row} side="bid" />
        ))}
      </div>

      <div className="pt-[12px] text-center font-mono text-[10px] uppercase tracking-[0.08em] text-text-dim">
        classified by your rules · streamed in &lt;1s
      </div>
    </div>
  );
}
