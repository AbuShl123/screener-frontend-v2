import { useTranslation } from 'react-i18next';
import { ClusterCard } from '@/features/orderbook/components/ClusterCard';
import { useNow } from '@/features/orderbook/components/useNow';
import { matchesCluster } from '@/features/orderbook/notifications/clusterSearch';
import { isClusterMuted } from '@/features/orderbook/notifications/settingsFilter';
import type { ActiveCluster } from '@/features/orderbook/types';
import type { SizeMode } from '@/features/orderbook/pages/DashboardPage';
import { useNotificationSettingsStore } from '@/features/settings';
import { selectActiveClusters, useClusterStore } from '@/stores/clusterStore';

/** How often the cards' ages refresh. */
const AGE_REFRESH_MS = 10_000;

/** Newest first. `firstSeenMillis` never changes for a cluster, so updates don't move cards. */
const compareClusters = (a: ActiveCluster, b: ActiveCluster): number =>
  b.cluster.firstSeenMillis - a.cluster.firstSeenMillis ||
  a.symbol.localeCompare(b.symbol) ||
  a.cluster.id.localeCompare(b.cluster.id);

/**
 * The clusters tab: every currently active, unmuted cluster. This is live state, not a log, so a
 * pulled or filled cluster simply leaves the list. Mounted only while its tab is selected.
 */
export function ClusterList({
  query,
  sizeMode,
  onOpen,
}: {
  query: string;
  sizeMode: SizeMode;
  /** Open a cluster's ladder. Must be stable (the cards are memoized). */
  onOpen: (cluster: ActiveCluster) => void;
}) {
  const { t } = useTranslation('orderbook');
  const active = useClusterStore(selectActiveClusters);
  const muted = useNotificationSettingsStore((s) => s.muted);
  const mutedVenues = useNotificationSettingsStore((s) => s.mutedVenues);
  const now = useNow(AGE_REFRESH_MS);

  const visible = active
    .filter((c) => !isClusterMuted(c, muted, mutedVenues) && matchesCluster(c, query))
    .sort(compareClusters);

  if (visible.length === 0) {
    return (
      <div className="py-7 text-center font-mono text-[12px] tracking-[0.04em] text-text-dim">
        {query.trim() ? t('panel.emptyClustersSearch') : t('panel.emptyClusters')}
      </div>
    );
  }
  return visible.map(({ cluster, ...instrument }) => (
    <ClusterCard
      key={cluster.id}
      {...instrument}
      cluster={cluster}
      sizeMode={sizeMode}
      now={now}
      onOpen={onOpen}
    />
  ));
}
