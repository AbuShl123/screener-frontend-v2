import { useState } from 'react';
import { useOrderbookStore } from '@/stores/orderbookStore';
import { DashboardHeader } from '@/features/orderbook/components/DashboardHeader';
import { OrderbookCard } from '@/features/orderbook/components/OrderbookCard';
import { useOrderbookFeed } from '@/features/orderbook/useOrderbookFeed';

/** Display unit for card notionals. Template default is `$ USD`. */
export type SizeMode = 'usd' | 'qty';

/**
 * The dashboard: full-width sticky header + a responsive `auto-fill` grid of live
 * order books, one card per `(symbol, market)` streamed over `/ws`.
 *
 * Real-time architecture (CLAUDE.md): the socket writes a Zustand store OUTSIDE
 * React; this page subscribes ONLY to `keys` so it re-renders when the ticker set
 * changes, never on a routine level update. Each card (Session 3) subscribes to its
 * own `books[key]` slice, so a BTC tick never re-renders the ETH card.
 *
 * Display-mode is plain React state: it changes only on click, and re-rendering
 * every card once per toggle is fine.
 */
export function DashboardPage() {
  useOrderbookFeed();

  const [sizeMode, setSizeMode] = useState<SizeMode>('usd');
  const keys = useOrderbookStore((s) => s.keys);
  const status = useOrderbookStore((s) => s.status);

  return (
    <div className="min-h-screen bg-bg text-text">
      <DashboardHeader
        tickerCount={keys.length}
        sizeMode={sizeMode}
        onSizeModeChange={setSizeMode}
      />

      {/* Thin notice so a dead/stalled backend isn't silent (plan §7.1). */}
      {status === 'reconnecting' && (
        <div className="border-b border-border-subtle bg-input px-8 py-2 text-center text-[12px] text-text-muted">
          Reconnecting to the feed…
        </div>
      )}

      <main className="px-8 pt-7 pb-12">
        {keys.length === 0 ? (
          <EmptyState status={status} />
        ) : (
          <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fill,minmax(265px,1fr))]">
            {keys.map((k) => (
              <OrderbookCard key={k} bookKey={k} sizeMode={sizeMode} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/** Centered muted panel shown until the first book arrives (plan §7.1). */
function EmptyState({ status }: { status: ReturnType<typeof useOrderbookStore.getState>['status'] }) {
  const message =
    status === 'auth-failed'
      ? 'Feed unavailable — your session could not be authorized.'
      : status === 'connected'
        ? 'Waiting for order books…'
        : 'Connecting…';

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-[14px] text-text-muted">{message}</p>
    </div>
  );
}
