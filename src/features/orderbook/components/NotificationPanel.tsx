import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NotificationCard } from '@/features/orderbook/components/NotificationCard';
import { TradeCard } from '@/features/orderbook/components/TradeCard';
import { SpikeCard } from '@/features/orderbook/components/SpikeCard';
import { ClusterLadder } from '@/features/orderbook/components/ClusterLadder';
import { ClusterList } from '@/features/orderbook/components/ClusterList';
import {
  ClusterIcon,
  DepthIcon,
  SpikeIcon,
  TradeIcon,
} from '@/features/orderbook/components/alertIcons';
import { matches } from '@/features/orderbook/notifications/notificationSearch';
import { matchesTrade } from '@/features/orderbook/notifications/tradeSearch';
import { matchesSpike } from '@/features/orderbook/notifications/spikeSearch';
import {
  useClusterUnread,
  useDepthUnread,
  useSpikeUnread,
  useTradeUnread,
} from '@/features/orderbook/notifications/useUnreadCounts';
import { isVenueMuted } from '@/features/orderbook/notifications/settingsFilter';
import { useExchangeRegistry } from '@/features/orderbook/exchanges';
import type { ActiveCluster } from '@/features/orderbook/types';
import { useNotificationSettingsStore } from '@/features/settings';
import type { SizeMode } from '@/features/orderbook/pages/DashboardPage';
import { useClusterStore } from '@/stores/clusterStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useSpikeStore } from '@/stores/spikeStore';
import { useTradeStore } from '@/stores/tradeStore';

/**
 * Panel width in px. Single source for both the panel's own width and the right padding
 * `DashboardPage` opens up on `<main>`, so the two stay in sync. The template exposed a
 * 280–460 runtime knob; the app fixes it at the template default — no runtime knob needed.
 */
export const PANEL_WIDTH = 340;

/** The panel's alert streams, one tab each. */
export type NotificationTab = 'depth' | 'trades' | 'clusters' | 'spikes';

interface NotificationPanelProps {
  open: boolean;
  /** The active tab. Owned by `DashboardPage`, because each handle opens the panel on its tab. */
  tab: NotificationTab;
  onTabChange: (tab: NotificationTab) => void;
  sizeMode: SizeMode;
  onClose: () => void;
}

/**
 * The slide-out notifications rail (design template "Dashboard Page Template - Final").
 * Always mounted; slides via `transform` so it animates both directions and the list
 * isn't rebuilt on every toggle. This is conventional UI (CLAUDE.md), so plain React
 * state is correct — the search state is not on the real-time hot path.
 *
 * Four tabs: order book (depth) notifications, large-trade alerts, the active clusters and price /
 * volume spikes. The
 * Clear button and the shared search act on the active tab (clusters are live state, so they
 * have nothing to clear). The active tab is always read (its arrivals are on
 * screen), so only an inactive tab's chip can show an unread count.
 *
 * `query` lives here because nothing outside the panel needs it. The panel self-subscribes
 * to the notification and trade stores (never via `DashboardPage`, which would re-render the
 * grid on every push — plan §8a).
 */
export const NotificationPanel = memo(function NotificationPanel({
  open,
  tab,
  onTabChange,
  sizeMode,
  onClose,
}: NotificationPanelProps) {
  const { t } = useTranslation('orderbook');
  const [query, setQuery] = useState('');
  // The cluster whose ladder replaces the clusters list, as it was when opened.
  const [openCluster, setOpenCluster] = useState<ActiveCluster | null>(null);
  const closeLadder = useCallback(() => setOpenCluster(null), []);
  const notifications = useNotificationStore((s) => s.notifications);
  const setDepthViewing = useNotificationStore((s) => s.setViewing);
  const clearDepth = useNotificationStore((s) => s.clear);
  const trades = useTradeStore((s) => s.trades);
  const setTradesViewing = useTradeStore((s) => s.setViewing);
  const clearTrades = useTradeStore((s) => s.clear);
  const mutedVenues = useNotificationSettingsStore((s) => s.mutedVenues);
  const mutedTradeVenues = useNotificationSettingsStore((s) => s.mutedTradeVenues);
  const setClustersViewing = useClusterStore((s) => s.setViewing);
  const spikes = useSpikeStore((s) => s.spikes);
  const setSpikesViewing = useSpikeStore((s) => s.setViewing);
  const clearSpikes = useSpikeStore((s) => s.clear);
  const depthUnread = useDepthUnread();
  const tradeUnread = useTradeUnread();
  const clusterUnread = useClusterUnread();
  const spikeUnread = useSpikeUnread();
  // Depth cards and the searches read exchange labels/logos from the registry non-reactively;
  // this re-renders them when it changes (metadata arrival — rare).
  useExchangeRegistry((s) => s.version);

  // Tell each store whether its stream is on screen. Entering marks it read, and while it stays
  // on screen the store doesn't count arrivals as unread, so the active tab's count stays 0
  // (no per-push effect, no flash of a non-zero chip). Unmount → neither is viewed.
  useEffect(() => {
    setDepthViewing(open && tab === 'depth');
    setTradesViewing(open && tab === 'trades');
    setSpikesViewing(open && tab === 'spikes');
    // An open ladder hides the list, so clusters appearing meanwhile do count as unread.
    setClustersViewing(open && tab === 'clusters' && openCluster === null);
  }, [open, tab, openCluster, setDepthViewing, setTradesViewing, setSpikesViewing, setClustersViewing]);
  useEffect(
    () => () => {
      setDepthViewing(false);
      setTradesViewing(false);
      setSpikesViewing(false);
      setClustersViewing(false);
    },
    [setDepthViewing, setTradesViewing, setSpikesViewing, setClustersViewing],
  );

  const isDepth = tab === 'depth';
  const isTrades = tab === 'trades';
  const isClusters = tab === 'clusters';
  const isSpikes = tab === 'spikes';
  const ladder = isClusters ? openCluster : null;

  // Newest-first ordering comes from the stores — no sort needed. Only the active tab's list
  // is filtered. Each tab applies its own per-type venue mutes from Settings at DISPLAY time, so
  // alerts raised before a mute disappear at once (new ones are dropped in `feedClient`). The
  // header exchange filter deliberately does NOT apply: it hides order book cards only.
  const visibleDepth = isDepth
    ? notifications.filter((n) => !isVenueMuted(n, mutedVenues) && matches(n, query))
    : [];
  const visibleTrades = isTrades
    ? trades.filter((tr) => !isVenueMuted(tr, mutedTradeVenues) && matchesTrade(tr, query))
    : [];
  const visibleSpikes = isSpikes ? spikes.filter((sp) => matchesSpike(sp, query)) : [];
  const isEmpty = isTrades
    ? visibleTrades.length === 0
    : isSpikes
      ? visibleSpikes.length === 0
      : visibleDepth.length === 0;
  const canClear = isTrades
    ? trades.length > 0
    : isSpikes
      ? spikes.length > 0
      : notifications.length > 0;
  const clearLabel = isTrades
    ? t('panel.clearTrades')
    : isSpikes
      ? t('panel.clearSpikes')
      : t('panel.clearAll');
  const onClear = isTrades ? clearTrades : isSpikes ? clearSpikes : clearDepth;

  return (
    <aside
      aria-label={t('panel.title')}
      // Starts right under the header (`--header-h`, set on `DashboardPage`: 60px / 104px).
      className="fixed top-[var(--header-h)] right-0 bottom-0 z-50 flex flex-col border-l border-border
                 bg-surface shadow-card
                 [transition:transform_260ms_cubic-bezier(0.22,0.61,0.36,1)]"
      style={{
        // Never wider than the viewport: on a phone-width window the panel overlays the grid.
        width: `min(${PANEL_WIDTH}px, 100vw)`,
        // `+ 40px` overshoot fully hides the box shadow when closed.
        transform: open ? 'translateX(0)' : 'translateX(calc(100% + 40px))',
      }}
    >
      {/* Header */}
      <div className="flex flex-none items-center justify-between gap-3 border-b border-border px-[18px] py-4">
        {/* No `N NEW` here: it counted the active tab, which is always read while shown. */}
        <span className="text-[15px] font-semibold text-text">{t('panel.title')}</span>
        <div className="flex items-center gap-2">
          {/* Clear all — empties the ACTIVE tab (depth: does not affect the cooldown dedup;
              trades: cleared alerts stay out of later snapshot replays). */}
          {!isClusters && (
            <button
              type="button"
              onClick={onClear}
              disabled={!canClear}
              title={clearLabel}
              aria-label={clearLabel}
              className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg
                         border border-border-input text-text-secondary transition-colors
                         hover:bg-white/5 hover:text-danger
                         disabled:pointer-events-none disabled:opacity-40"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title={t('panel.collapse')}
            aria-label={t('panel.collapseAria')}
            className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg
                       border border-border-input text-[16px] leading-none text-text-secondary
                       transition-colors hover:bg-white/5 hover:text-text-strong"
          >
            ×
          </button>
        </div>
      </div>

      {/* Tabs: one per alert stream */}
      <div
        role="tablist"
        aria-label={t('panel.tabs.label')}
        className="flex flex-none gap-1 border-b border-border-subtle px-[14px]"
      >
        <TabButton
          id="notif-tab-depth"
          active={isDepth}
          onClick={() => onTabChange('depth')}
          icon={<DepthIcon size={15} />}
          label={t('panel.tabs.depth')}
          title={t('panel.tabs.depthTitle')}
          count={depthUnread}
        />
        <TabButton
          id="notif-tab-trades"
          active={isTrades}
          onClick={() => onTabChange('trades')}
          icon={<TradeIcon size={15} />}
          label={t('panel.tabs.trades')}
          title={t('panel.tabs.tradesTitle')}
          count={tradeUnread}
        />
        <TabButton
          id="notif-tab-clusters"
          active={isClusters}
          onClick={() => {
            if (isClusters) closeLadder(); // clicking the active tab returns to the list
            onTabChange('clusters');
          }}
          icon={<ClusterIcon size={15} />}
          label={t('panel.tabs.clusters')}
          title={t('panel.tabs.clustersTitle')}
          count={clusterUnread}
        />
        <TabButton
          id="notif-tab-spikes"
          active={isSpikes}
          onClick={() => onTabChange('spikes')}
          icon={<SpikeIcon size={15} />}
          label={t('panel.tabs.spikes')}
          title={t('panel.tabs.spikesTitle')}
          count={spikeUnread}
        />
      </div>

      {ladder ? (
        <div
          role="tabpanel"
          aria-labelledby="notif-tab-clusters"
          className="flex min-h-0 flex-1 flex-col"
        >
          <ClusterLadder
            key={ladder.cluster.id}
            initial={ladder}
            sizeMode={sizeMode}
            onBack={closeLadder}
          />
        </div>
      ) : (
        <>
          {/* Search (shared by all tabs) */}
          <div className="flex-none border-b border-border-subtle px-[14px] py-3">
            <div className="relative flex items-center">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute left-[11px] text-text-dim"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('panel.searchPlaceholder')}
                className="w-full rounded-lg border border-border-input bg-input py-[9px] pr-3 pl-8
                           font-mono text-[12px] tracking-[0.02em] text-text outline-none
                           focus:border-accent"
              />
            </div>
          </div>

          {/* List (newest at top) */}
          <div
            role="tabpanel"
            aria-labelledby={`notif-tab-${tab}`}
            className="scrollbar-slim flex flex-1 flex-col gap-2.5 overflow-y-auto px-[14px] py-[14px]"
          >
            {isClusters ? (
              <ClusterList query={query} sizeMode={sizeMode} onOpen={setOpenCluster} />
            ) : isEmpty ? (
              <div className="py-7 text-center font-mono text-[12px] tracking-[0.04em] text-text-dim">
                {isTrades
                  ? t('panel.emptyTrades')
                  : isSpikes
                    ? t('panel.emptySpikes')
                    : t('panel.empty')}
              </div>
            ) : isTrades ? (
              visibleTrades.map((tr) => <TradeCard key={tr.id} trade={tr} sizeMode={sizeMode} />)
            ) : isSpikes ? (
              visibleSpikes.map((sp) => <SpikeCard key={sp.id} spike={sp} />)
            ) : (
              visibleDepth.map((n) => (
                <NotificationCard key={n.id} notification={n} sizeMode={sizeMode} />
              ))
            )}
          </div>
        </>
      )}
    </aside>
  );
});

/**
 * One tab: icon + label + unread chip (only when > 0; the active tab's count is always 0, see
 * the stores' `setViewing`). Tabs size to their content (`flex-auto`) rather than splitting
 * equally, and the label never wraps. Labels are short because four must fit the 340px panel;
 * `title` carries the full name.
 */
function TabButton({
  id,
  active,
  onClick,
  icon,
  label,
  title,
  count,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  title: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      title={title}
      onClick={onClick}
      className={`-mb-px inline-flex min-w-0 flex-auto items-center justify-center gap-1.5 border-b-2 px-1
                  pt-3 pb-[11px] font-sans text-[13px] transition-colors hover:text-text-strong ${
                    active ? 'border-accent text-text' : 'border-transparent text-text-muted'
                  }`}
    >
      <span className="flex-none">{icon}</span>
      {/* `truncate` = nowrap + ellipsis, the last resort on a very narrow viewport. */}
      <span className="min-w-0 truncate">{label}</span>
      {count > 0 && (
        <span
          className="inline-flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-full
                     bg-white/[0.08] px-[5px] font-mono text-[10px] leading-none font-semibold
                     text-text-secondary"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
