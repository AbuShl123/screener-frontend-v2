import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrderbookStore } from '@/stores/orderbookStore';
import { DashboardHeader } from '@/features/orderbook/components/DashboardHeader';
import { OrderbookCard } from '@/features/orderbook/components/OrderbookCard';
import { NotificationHandle } from '@/features/orderbook/components/NotificationHandle';
import { NotificationPanel, PANEL_WIDTH } from '@/features/orderbook/components/NotificationPanel';
import { useOrderbookFeed } from '@/features/orderbook/useOrderbookFeed';
import { sortKeys, type SortMode } from '@/features/orderbook/sortOrderbooks';
import {
  assignColumns,
  bookRowCount,
  columnCount,
  estimateCardHeight,
} from '@/features/orderbook/masonry';
import type { BookKey } from '@/features/orderbook/types';
import { SettingsModal } from '@/features/settings';

/** Display unit for card notionals. Template default is `$ USD`. */
export type SizeMode = 'usd' | 'qty';

/**
 * The dashboard: full-width sticky header + a masonry layout of live order books, one
 * card per `(symbol, market)` streamed over `/ws`.
 *
 * Real-time architecture (CLAUDE.md): the socket writes a Zustand store OUTSIDE
 * React; this page subscribes ONLY to `keys` so it re-renders when the ticker set
 * changes, never on a routine level update. Each card (Session 3) subscribes to its
 * own `books[key]` slice, so a BTC tick never re-renders the ETH card.
 *
 * Masonry (plan §3.4, D6): cards are dealt to columns by ESTIMATED height, and only when
 * the order or the column count changes. Heights are read non-reactively, so a card
 * growing or shrinking never re-renders the page or moves a card to another column.
 *
 * Display-mode is plain React state: it changes only on click, and re-rendering
 * every card once per toggle is fine.
 */
export function DashboardPage() {
  useOrderbookFeed();

  const { t } = useTranslation('orderbook');
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
  // Importance mode re-sorts on every flush, and `sortKeys` returns a fresh array each time.
  // Keep the previous identity while the ORDER is unchanged so the masonry memo below
  // only re-deals on a real reorder (plan D6), not once per tick.
  const prevSortedKeys = useRef<BookKey[]>(keys);
  const sortedKeys = useMemo(() => {
    const next = sortKeys(keys, importanceBooks, sortMode);
    if (!sameOrder(prevSortedKeys.current, next)) prevSortedKeys.current = next;
    return prevSortedKeys.current;
  }, [keys, importanceBooks, sortMode]);

  const gridRef = useRef<HTMLDivElement>(null);
  const colCount = useColumnCount(gridRef);
  // Deps are deliberately `[sortedKeys, colCount]` ONLY: heights come from `getState()`,
  // a snapshot at (re)deal time, never a subscription.
  const columns = useMemo(() => {
    const { books } = useOrderbookStore.getState();
    return assignColumns(sortedKeys, colCount, (k) => estimateCardHeight(bookRowCount(books[k])));
  }, [sortedKeys, colCount]);

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
          {t('dashboard.reconnecting')}
        </div>
      )}

      {/* Right padding opens up for the panel; animates in step with the slide. `px-8`
          already gives a 32px right gutter, so open we override to keep it beyond the panel. */}
      <main
        className="px-8 pt-7 pb-12 [transition:padding-right_260ms_cubic-bezier(0.22,0.61,0.36,1)]"
        style={{ paddingRight: notifOpen ? `${PANEL_WIDTH + 32}px` : undefined }}
      >
        {/* Always mounted (even while empty) so the column count is measured before the
            first card arrives. Columns are keyed by index: a column-count change keeps the
            surviving columns, so cards that stay in their column don't remount. */}
        <div ref={gridRef}>
          {keys.length === 0 ? (
            <EmptyState status={status} />
          ) : (
            <div className="flex items-start gap-5">
              {columns.map((column, i) => (
                <div key={i} className="flex min-w-0 flex-1 flex-col gap-5">
                  {column.map((k) => (
                    <OrderbookCard key={k} bookKey={k} sizeMode={sizeMode} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Fixed-position overlays — siblings of `<main>`, not inside the grid. */}
      <NotificationHandle open={notifOpen} onOpen={() => setNotifOpen(true)} />
      <NotificationPanel open={notifOpen} sizeMode={sizeMode} onClose={() => setNotifOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** True when both arrays hold the same keys in the same order. */
function sameOrder(a: BookKey[], b: BookKey[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Masonry column count for the element's width, kept current by a `ResizeObserver`. Measured
 * in a layout effect so the first paint already has the right count. State is set only when
 * the COUNT changes (React bails out on an equal value), so the notification panel's
 * animated padding doesn't re-render the page per frame — it just drops a column once.
 */
function useColumnCount(ref: RefObject<HTMLElement | null>): number {
  const [count, setCount] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCount(columnCount(el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return count;
}

/** Centered muted panel shown until the first book arrives (plan §7.1). */
function EmptyState({ status }: { status: ReturnType<typeof useOrderbookStore.getState>['status'] }) {
  const { t } = useTranslation('orderbook');
  const message =
    status === 'auth-failed'
      ? t('dashboard.empty.authFailed')
      : status === 'access-denied'
        ? t('dashboard.empty.accessDenied')
        : status === 'connected'
          ? t('dashboard.empty.waiting')
          : t('dashboard.empty.connecting');

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-[14px] text-text-muted">{message}</p>
    </div>
  );
}
