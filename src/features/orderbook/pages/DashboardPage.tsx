import { useCallback, useMemo, useState } from 'react';
import { useOrderbookStore } from '@/stores/orderbookStore';
import { DashboardHeader } from '@/features/orderbook/components/DashboardHeader';
import { OrderbookCard } from '@/features/orderbook/components/OrderbookCard';
import { NotificationHandle } from '@/features/orderbook/components/NotificationHandle';
import { NotificationPanel, PANEL_WIDTH } from '@/features/orderbook/components/NotificationPanel';
import { useOrderbookFeed } from '@/features/orderbook/useOrderbookFeed';
import { sortKeys, type SortMode } from '@/features/orderbook/sortOrderbooks';
import { SettingsModal } from '@/features/settings';

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
  const [sortMode, setSortMode] = useState<SortMode>('importance');
  // Owned here because TWO things depend on it: the handle's visibility and `<main>`'s
  // right padding. Default open to match the template exactly.
  const [notifOpen, setNotifOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const keys = useOrderbookStore((s) => s.keys);
  const status = useOrderbookStore((s) => s.status);
  // `books` only matters for 'importance' sort (tier counts change every tick); a selector
  // that returns the same `undefined` reference otherwise means the other three sort modes
  // never subscribe to the per-message firehose, matching CLAUDE.md's real-time architecture.
  const importanceBooks = useOrderbookStore(
    useCallback((s) => (sortMode === 'importance' ? s.books : undefined), [sortMode]),
  );
  const sortedKeys = useMemo(
    () => sortKeys(keys, importanceBooks, sortMode),
    [keys, importanceBooks, sortMode],
  );

  return (
    <div className="min-h-screen bg-bg text-text">
      <DashboardHeader
        tickerCount={keys.length}
        sizeMode={sizeMode}
        onSizeModeChange={setSizeMode}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        onOpenSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
      />

      {/* Thin notice so a dead/stalled backend isn't silent (plan §7.1). */}
      {status === 'reconnecting' && (
        <div className="border-b border-border-subtle bg-input px-8 py-2 text-center text-[12px] text-text-muted">
          Reconnecting to the feed…
        </div>
      )}

      {/* Right padding opens up for the panel; animates in step with the slide. `px-8`
          already gives a 32px right gutter, so open we override to keep it beyond the panel. */}
      <main
        className="px-8 pt-7 pb-12 [transition:padding-right_260ms_cubic-bezier(0.22,0.61,0.36,1)]"
        style={{ paddingRight: notifOpen ? `${PANEL_WIDTH + 32}px` : undefined }}
      >
        {keys.length === 0 ? (
          <EmptyState status={status} />
        ) : (
          <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fill,minmax(265px,1fr))]">
            {sortedKeys.map((k) => (
              <OrderbookCard key={k} bookKey={k} sizeMode={sizeMode} />
            ))}
          </div>
        )}
      </main>

      {/* Fixed-position overlays — siblings of `<main>`, not inside the grid. */}
      <NotificationHandle open={notifOpen} onOpen={() => setNotifOpen(true)} />
      <NotificationPanel open={notifOpen} sizeMode={sizeMode} onClose={() => setNotifOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** Centered muted panel shown until the first book arrives (plan §7.1). */
function EmptyState({ status }: { status: ReturnType<typeof useOrderbookStore.getState>['status'] }) {
  const message =
    status === 'auth-failed'
      ? 'Feed unavailable — your session could not be authorized.'
      : status === 'access-denied'
        ? 'Feed unavailable — an active subscription is required.'
        : status === 'connected'
          ? 'Waiting for order books…'
          : 'Connecting…';

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-[14px] text-text-muted">{message}</p>
    </div>
  );
}
