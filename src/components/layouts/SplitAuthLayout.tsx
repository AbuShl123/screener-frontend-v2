import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../BrandMark';
import { TickerStrip } from '../TickerStrip';

interface SplitAuthLayoutProps {
  children: ReactNode;
  showTicker?: boolean;
  /**
   * Replaces the centered middle content of the left marketing panel (the
   * `BrandMark` at top and `TickerStrip` at bottom stay structural). When omitted,
   * the default login/2a content below renders — so no-arg callers are unchanged.
   */
  marketing?: ReactNode;
}

const ASKS = [
  { price: '64,215.0', size: '12.4', widthPct: 14 },
  { price: '64,214.0', size: '41.8', widthPct: 47 },
  { price: '64,213.6', size: '5.2', widthPct: 6 },
];

const BIDS = [
  { price: '64,213.4', size: '7.9', widthPct: 9, sig: false },
  { price: '64,213.0', size: '88.6', widthPct: 78, sig: true },
  { price: '64,212.5', size: '15.0', widthPct: 17, sig: false },
];

export function SplitAuthLayout({
  children,
  showTicker = false,
  marketing,
}: SplitAuthLayoutProps) {
  return (
    <div className="flex min-h-screen bg-surface">
      <div className="flex flex-[1.2] flex-col justify-between border-r border-border-subtle bg-surface-marketing px-16 pt-11">
        <Link
          to="/"
          aria-label="Screener home"
          className="w-fit transition-opacity duration-150 hover:opacity-80"
        >
          <BrandMark />
        </Link>
        <div className="flex flex-1 flex-col justify-center gap-8">
          {marketing ?? <DefaultMarketing />}
        </div>
        <TickerStrip show={showTicker} />
      </div>
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="w-[400px]">{children}</div>
      </div>
    </div>
  );
}

/** The default (login/2a) left-panel content: headline + subtext + order-book preview card. */
function DefaultMarketing() {
  return (
    <>
      <div className="flex flex-col gap-[14px]">
            <h2 className="max-w-[580px] font-sans text-[38px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
              Every level that matters, in real time.
            </h2>
            <p className="max-w-[460px] text-[15px] leading-[1.6] text-text-muted">
              Live order books for 500+ Binance spot and futures tickers,
              classified by your rules, streamed in under a second.
            </p>
          </div>
          <div className="flex w-[440px] flex-col gap-1 rounded-[10px] border border-border bg-input px-5 py-[18px]">
            <div className="mb-2 flex items-baseline justify-between border-b border-border-subtle pb-[10px]">
              <span className="font-mono text-[11px] tracking-[0.08em] text-text-strong">
                BTCUSDT · ORDER BOOK
              </span>
              <span className="font-mono text-[11px] text-text-dim">spread 0.2</span>
            </div>
            {ASKS.map((row) => (
              <div key={row.price} className="grid grid-cols-[86px_56px_1fr] items-center gap-3 py-1">
                <span className="font-mono text-[12px] text-danger">{row.price}</span>
                <span className="text-right font-mono text-[12px] text-text-muted">{row.size}</span>
                <div
                  className="h-2 rounded-[2px]"
                  style={{
                    background: 'color-mix(in oklab, var(--color-danger) 28%, transparent)',
                    width: `${row.widthPct}%`,
                  }}
                />
              </div>
            ))}
            <div className="my-1 border-y border-dashed border-border-subtle py-1 text-center font-mono text-[10px] text-text-dim">
              — 64,213.5 —
            </div>
            {BIDS.map((row) =>
              row.sig ? (
                <div key={row.price} className="grid grid-cols-[86px_56px_1fr] items-center gap-3 py-1">
                  <span className="font-mono text-[12px] text-bid">{row.price}</span>
                  <span className="text-right font-mono text-[12px] text-text-muted">{row.size}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 flex-[0_0_78%] rounded-[2px]"
                      style={{ background: 'color-mix(in oklab, var(--color-bid) 34%, transparent)' }}
                    />
                    <span className="rounded-[4px] border border-accent/50 px-[5px] font-mono text-[9px] tracking-[0.08em] text-accent">
                      SIG
                    </span>
                  </div>
                </div>
              ) : (
                <div key={row.price} className="grid grid-cols-[86px_56px_1fr] items-center gap-3 py-1">
                  <span className="font-mono text-[12px] text-bid">{row.price}</span>
                  <span className="text-right font-mono text-[12px] text-text-muted">{row.size}</span>
                  <div
                    className="h-2 rounded-[2px]"
                    style={{
                      background: 'color-mix(in oklab, var(--color-bid) 28%, transparent)',
                      width: `${row.widthPct}%`,
                    }}
                  />
                </div>
              ),
            )}
          </div>
    </>
  );
}
