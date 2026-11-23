import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { followCluster } from '@/features/orderbook/clusterIdentity';
import { ExchangeLogo } from '@/features/orderbook/components/ExchangeLogo';
import { Metric } from '@/features/orderbook/components/NotificationCard';
import { useNow } from '@/features/orderbook/components/useNow';
import { exchangeMeta, useExchangeRegistry } from '@/features/orderbook/exchanges';
import {
  fmtAge,
  fmtBaseQty,
  fmtDistance,
  fmtMoney,
  fmtSymbol,
  marketBadge,
  tradePriceDecimals,
} from '@/features/orderbook/format';
import type { ActiveCluster, Cluster } from '@/features/orderbook/types';
import type { SizeMode } from '@/features/orderbook/pages/DashboardPage';
import { selectActiveClusters, useClusterStore } from '@/stores/clusterStore';

/** How often the header's age refreshes. */
const AGE_REFRESH_MS = 1_000;
/** Smallest bar, so a tiny level stays visible as a sliver (as on the order book card). */
const MIN_BAR_PCT = 3;

interface ClusterLadderProps {
  /** The cluster as it was when opened; the view then follows it live. Remount to change it. */
  initial: ActiveCluster;
  sizeMode: SizeMode;
  onBack: () => void;
}

/**
 * One cluster's detail view, inside the panel's clusters tab: a fixed header plus one row per
 * level. Follows the cluster across updates and merges; when it's removed, the last known ladder
 * stays on screen, dimmed under a "gone" notice, until the user goes back or it returns.
 */
export const ClusterLadder = memo(function ClusterLadder({
  initial,
  sizeMode,
  onBack,
}: ClusterLadderProps) {
  const { t } = useTranslation('orderbook');
  const active = useClusterStore(selectActiveClusters);
  // The last state seen, to show when it's gone and to keep following it as its range drifts.
  const [last, setLast] = useState(initial);
  const live = followCluster(active, last);
  if (live && live.cluster !== last.cluster) setLast(live); // derived state, adjusted in render
  const shown = live ?? last;
  const isGone = live === undefined;

  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => backRef.current?.focus(), []);

  return (
    <>
      <div className="flex flex-none flex-col gap-[11px] border-b border-border-subtle px-[14px] py-3">
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          className="self-start text-[12px] text-text-secondary transition-colors hover:text-text-strong"
        >
          ← {t('cluster.back')}
        </button>
        {isGone && (
          <div
            role="status"
            className="rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-2 text-[12px] text-warning"
          >
            {t('cluster.gone')}
          </div>
        )}
        <LadderHeader active={shown} isGone={isGone} />
      </div>
      <div
        className={`scrollbar-slim flex-1 overflow-y-auto py-2 transition-opacity ${isGone ? 'opacity-50' : ''}`}
      >
        <LadderRows cluster={shown.cluster} side={shown.side} sizeMode={sizeMode} />
      </div>
    </>
  );
});

function LadderHeader({ active, isGone }: { active: ActiveCluster; isGone: boolean }) {
  const { t } = useTranslation('orderbook');
  useExchangeRegistry((s) => s.version);
  const now = useNow(AGE_REFRESH_MS, !isGone);
  const { exchange, market, symbol, side, cluster: c } = active;
  const exchangeLabel = exchangeMeta(exchange).label;
  const badge = marketBadge(market);
  const isBid = side === 'bid';
  const dec = tradePriceDecimals(c.priceFrom, c.priceTo);
  const age = fmtAge(now - c.firstSeenMillis, {
    d: t('card.age.d'),
    h: t('card.age.h'),
    m: t('card.age.m'),
    s: t('card.age.s'),
  });

  return (
    <>
      <div className="flex items-center gap-[9px]">
        <ExchangeLogo
          id={exchange}
          alt={exchangeLabel}
          title={exchangeLabel}
          className="size-3.5 flex-none"
        />
        <span className="truncate font-mono text-[14px] tracking-[0.02em] text-text-strong">
          {fmtSymbol(symbol)}
        </span>
        <span
          className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badge.className}`}
        >
          {badge.label}
        </span>
        <span
          className={`ml-auto flex-none rounded-[5px] border px-[7px] py-[3px] font-mono text-[10px]
                      font-semibold tracking-[0.1em] ${
                        isBid
                          ? 'border-bid/40 bg-bid/12 text-bid'
                          : 'border-danger/40 bg-danger/12 text-danger'
                      }`}
        >
          {isBid ? t('notification.side.bid') : t('notification.side.ask')}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-2.5">
        <Metric
          label={t('cluster.metric.range')}
          value={`${c.priceFrom.toFixed(dec)} – ${c.priceTo.toFixed(dec)}`}
        />
        <Metric label={t('cluster.metric.levels')} value={String(c.levelCount)} align="right" />
        <Metric label={t('cluster.metric.notional')} value={fmtMoney(c.totalNotional)} />
        <Metric
          label={t('cluster.metric.qty')}
          value={fmtBaseQty(c.totalQuantity)}
          align="right"
        />
        <div title={t('cluster.distanceHint')}>
          <Metric label={t('notification.metric.dist')} value={fmtDistance(c.distance)} />
        </div>
        <Metric label={t('cluster.metric.age')} value={age} align="right" />
      </div>
    </>
  );
}

/** Memoized apart from the header, whose age ticks every second. */
const LadderRows = memo(function LadderRows({
  cluster,
  side,
  sizeMode,
}: {
  cluster: Cluster;
  side: 'bid' | 'ask';
  sizeMode: SizeMode;
}) {
  const { rows, max, decimals } = useMemo(() => buildRows(cluster), [cluster]);
  return rows.map(({ key, price, quantity, notional }) => (
    <LadderRow
      key={key}
      price={price.toFixed(decimals)}
      size={sizeMode === 'usd' ? fmtMoney(notional) : fmtBaseQty(quantity)}
      pct={max > 0 ? Math.min(100, Math.max(MIN_BAR_PCT, Math.round((notional / max) * 100))) : 0}
      isBid={side === 'bid'}
    />
  ));
});

/** Rows from the highest price down, like the order book card, whatever the side. */
function buildRows(cluster: Cluster) {
  const seen = new Map<number, number>();
  const rows = cluster.levels
    .map((l) => {
      // Prices are unique by contract, but the payload is unvalidated: a repeat gets a suffix.
      const n = seen.get(l.price) ?? 0;
      seen.set(l.price, n + 1);
      return { ...l, key: `${l.price}#${n}`, notional: l.price * l.quantity };
    })
    .sort((a, b) => b.price - a.price);
  return {
    rows,
    max: rows.reduce((m, r) => Math.max(m, r.notional), 0),
    // Over every level: one between the bounds can print with more decimals than they do.
    decimals: rows.reduce((d, r) => Math.max(d, tradePriceDecimals(r.price, r.price)), 0),
  };
}

/** Primitive props only, so an update re-renders just the rows that actually changed. */
const LadderRow = memo(function LadderRow({
  price,
  size,
  pct,
  isBid,
}: {
  price: string;
  size: string;
  pct: number;
  isBid: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-[14px] py-0.5 hover:bg-white/[0.04]">
      <div className="relative py-0.5">
        <div
          className={`absolute inset-y-0 left-0 rounded-r-[2px] ${isBid ? 'bg-bid/25' : 'bg-danger/25'}`}
          style={{ width: `${pct}%` }}
        />
        <span className="relative pl-1.5 font-mono text-[12px] text-text-strong">{size}</span>
      </div>
      <span className={`font-mono text-[12px] ${isBid ? 'text-bid' : 'text-danger'}`}>{price}</span>
    </div>
  );
});
