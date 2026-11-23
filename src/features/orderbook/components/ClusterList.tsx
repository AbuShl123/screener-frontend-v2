import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClusterCard } from '@/features/orderbook/components/ClusterCard';
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
export function ClusterList({ query, sizeMode }: { query: string; sizeMode: SizeMode }) {
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
    <ClusterCard key={cluster.id} {...instrument} cluster={cluster} sizeMode={sizeMode} now={now} />
  ));
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
