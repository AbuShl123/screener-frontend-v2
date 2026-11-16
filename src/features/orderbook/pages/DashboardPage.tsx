import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useOrderbookStore } from '@/stores/orderbookStore';
import { filterVisibleKeys } from '@/features/orderbook/exchangeFilter';
import { useExchangeFilterStore } from '@/features/orderbook/exchangeFilterStore';
import { DashboardHeader } from '@/features/orderbook/components/DashboardHeader';
import { OrderbookCard } from '@/features/orderbook/components/OrderbookCard';
import { NotificationHandle } from '@/features/orderbook/components/NotificationHandle';
import { NotificationPanel, PANEL_WIDTH } from '@/features/orderbook/components/NotificationPanel';
import { useOrderbookFeed } from '@/features/orderbook/useOrderbookFeed';
import { useExchangeMetadata } from '@/features/orderbook/exchangeMetadata';
import { sortKeys, type SortMode } from '@/features/orderbook/sortOrderbooks';
import {
  assignColumnsStable,
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
 * Re-deals are STABLE (US4): cards keep their column and only re-order within it, except
 * on a sort-mode change or when the layout has drifted too far out of balance.
 *
 * Display-mode is plain React state: it changes only on click, and re-rendering
 * every card once per toggle is fine.
 */
export function DashboardPage() {
  useOrderbookFeed();
  // Supported exchanges/markets from `/api/exchanges` → the runtime registry. Never blocks
  // rendering; the page itself reads nothing from the query.
  useExchangeMetadata();

  const { t } = useTranslation('orderbook');
  const [sizeMode, setSizeMode] = useState<SizeMode>('usd');
  const [sortMode, setSortMode] = useState<SortMode>('importance');
  const isWide = useMediaQuery(WIDE_QUERY);
  // Owned here because TWO things depend on it: the handle's visibility and `<main>`'s
  // right padding. Default open to match the template on wide screens; on narrow ones the
  // panel would overlay the grid, so it starts closed there.
  const [notifOpen, setNotifOpen] = useState(() => matchesMedia(WIDE_QUERY));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const keys = useOrderbookStore((s) => s.keys);
  const status = useOrderbookStore((s) => s.status);
  const hidden = useExchangeFilterStore((s) => s.hidden);
  // Pairs with at least one visible exchange. The selector reads `books`, so it RUNS on every
  // flush, but `useShallow` keeps the previous array while its elements are unchanged — the
  // page re-renders only when the VISIBLE SET changes, preserving the keys-only property.
  // With nothing hidden it returns `keys` itself.
  const visibleKeys = useOrderbookStore(
    useShallow((s) => filterVisibleKeys(s.keys, s.books, hidden)),
  );
  // `books` only matters for 'importance' sort (tier counts change every tick); a selector
  // that returns the same `undefined` reference otherwise means the other three sort modes
  // never subscribe to the per-message firehose, matching CLAUDE.md's real-time architecture.
  const importanceBooks = useOrderbookStore(
    useCallback((s) => (sortMode === 'importance' ? s.books : undefined), [sortMode]),
  );
  // Importance mode re-sorts on every flush, and `sortKeys` returns a fresh array each time.
  // Keep the previous identity while the ORDER is unchanged so the masonry memo below
  // only re-deals on a real reorder (plan D6), not once per tick.
  const prevSortedKeys = useRef<BookKey[]>(visibleKeys);
  const sortedKeys = useMemo(() => {
    const next = sortKeys(visibleKeys, importanceBooks, sortMode, hidden);
    if (!sameOrder(prevSortedKeys.current, next)) prevSortedKeys.current = next;
    return prevSortedKeys.current;
  }, [visibleKeys, importanceBooks, sortMode, hidden]);

  const gridRef = useRef<HTMLDivElement>(null);
  const colCount = useColumnCount(gridRef);
  // The previous deal, so live reorders / ticker-set changes / filter changes / a column-count
  // drop keep cards in their column (`assignColumnsStable`) instead of cascading every card
  // after the first change into a new column (and remounting it). A SORT-MODE change starts
  // from scratch: the user asked for a new order and expects it to read left-to-right.
  const prevLayout = useRef<{ columns: BookKey[][]; sortMode: SortMode } | null>(null);
  // Deps are deliberately `[sortedKeys, colCount, hidden, sortMode]` ONLY: heights come from
  // `getState()`, a snapshot at (re)deal time, never a subscription. `hidden` is a dep because
  // a filter change alters every multi-exchange card's estimated height (visible rows only).
  const columns = useMemo(() => {
    const { books } = useOrderbookStore.getState();
    const prev = prevLayout.current?.sortMode === sortMode ? prevLayout.current.columns : null;
    const next = assignColumnsStable(
      sortedKeys,
      colCount,
      (k) => estimateCardHeight(bookRowCount(books[k], hidden)),
      prev,
    );
    prevLayout.current = { columns: next, sortMode };
    return next;
  }, [sortedKeys, colCount, hidden, sortMode]);

  // Below `lg` the panel overlays the grid instead of squeezing it (a 372px gutter leaves no
  // room for cards), so it only pushes `<main>` on wide screens.
  const panelPushes = notifOpen && isWide;

  // Stable callbacks so the memoized header / panel / handle / settings modal skip the page's
  // per-flush re-renders (importance sort subscribes the page to `books`).
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openNotifications = useCallback(() => setNotifOpen(true), []);
  const closeNotifications = useCallback(() => setNotifOpen(false), []);

  return (
    // `--header-h`: the header's height — the single source for everything positioned under it
    // (header itself, notifications panel + handle, reconnect notice). One 60px row from `lg`
    // up; two rows (104px) below, where Sort/Exchanges wrap — the same `lg` breakpoint as
    // `WIDE_QUERY`, so the two-row header always pairs with the overlaying panel.
    <div className="min-h-screen bg-bg text-text [--header-h:104px] lg:[--header-h:60px]">
      <DashboardHeader
        tickerCount={visibleKeys.length}
        sizeMode={sizeMode}
        onSizeModeChange={setSizeMode}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        onOpenSettings={openSettings}
        settingsOpen={settingsOpen}
      />

      {/* Thin notice so a dead/stalled backend isn't silent (plan §7.1). A fixed overlay just
          under the sticky header — NOT in the document flow, so it appearing/disappearing
          never shifts the grid. Stops at the panel's edge while the panel pushes the content;
          non-interactive so it never blocks a click on the cards beneath it. */}
      {status === 'reconnecting' && (
        <div
          role="status"
          className="pointer-events-none fixed top-[var(--header-h)] left-0 z-[9] border-b border-border-subtle
                     bg-input px-4 py-2 text-center text-[12px] text-text-muted md:px-8"
          style={{ right: panelPushes ? PANEL_WIDTH : 0 }}
        >
          {t('dashboard.reconnecting')}
        </div>
      )}

      {/* Right padding opens up for the panel; animates in step with the slide. The base
          horizontal padding is the right gutter, so open we override to keep it beyond the panel. */}
      <main
        className="px-4 pt-7 pb-12 md:px-8 [transition:padding-right_260ms_cubic-bezier(0.22,0.61,0.36,1)]"
        style={{ paddingRight: panelPushes ? `${PANEL_WIDTH + 32}px` : undefined }}
      >
        {/* Always mounted (even while empty) so the column count is measured before the
            first card arrives. Columns are keyed by index: a column-count change keeps the
            surviving columns, so cards that stay in their column don't remount. */}
        <div ref={gridRef}>
          {keys.length === 0 ? (
            <EmptyState status={status} />
          ) : visibleKeys.length === 0 ? (
            // Books exist, but only on exchanges the header filter hides.
            <EmptyMessage message={t('dashboard.empty.filtered')} />
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
      <NotificationHandle open={notifOpen} onOpen={openNotifications} />
      <NotificationPanel open={notifOpen} sizeMode={sizeMode} onClose={closeNotifications} />
      <SettingsModal open={settingsOpen} onClose={closeSettings} />
    </div>
  );
}

/** Tailwind's `lg` breakpoint: at and above it, the notification panel pushes the grid. */
const WIDE_QUERY = '(min-width: 1024px)';

/** Synchronous one-off read (for initial state); `true` where `matchMedia` is unavailable. */
function matchesMedia(query: string): boolean {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? true
    : window.matchMedia(query).matches;
}

/** Live media-query match. Re-renders only when the match flips, never per resize frame. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchesMedia(query));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
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

  return <EmptyMessage message={message} />;
}

function EmptyMessage({ message }: { message: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-[14px] text-text-muted">{message}</p>
    </div>
  );
}
