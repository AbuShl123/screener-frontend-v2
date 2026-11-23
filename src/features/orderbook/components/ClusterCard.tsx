import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fmtAge,
  fmtBaseQty,
  fmtDistance,
  fmtMoney,
  fmtSymbol,
  marketBadge,
  tradePriceDecimals,
} from '@/features/orderbook/format';
import { exchangeMeta, useExchangeRegistry } from '@/features/orderbook/exchanges';
import { ExchangeLogo } from '@/features/orderbook/components/ExchangeLogo';
import { Metric } from '@/features/orderbook/components/NotificationCard';
import type { Exchange, Market, TrackedCluster } from '@/features/orderbook/types';
import type { SizeMode } from '@/features/orderbook/pages/DashboardPage';

interface ClusterCardProps {
  exchange: Exchange;
  market: Market;
  symbol: string;
  side: 'bid' | 'ask';
  cluster: TrackedCluster;
  sizeMode: SizeMode;
  /** The list's clock (epoch ms), for the age. */
  now: number;
}

/**
 * One active cluster (doc §3.9): instrument / age, total size (follows the header's QTY/$ toggle)
 * / side badge, then price range · levels · distance. The side carries the color, as on
 * `TradeCard`. Takes flat props so `memo` holds while the cluster is unchanged.
 */
export const ClusterCard = memo(function ClusterCard({
  exchange,
  market,
  symbol,
  side,
  cluster: c,
  sizeMode,
  now,
}: ClusterCardProps) {
  const { t } = useTranslation('orderbook');
  useExchangeRegistry((s) => s.version);
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
  const sideClass = isBid
    ? 'text-bid border-bid/40 bg-bid/12'
    : 'text-danger border-danger/40 bg-danger/12';

  return (
    <div className="flex shrink-0 flex-col gap-[11px] rounded-[10px] border border-border bg-input px-[14px] pt-3 pb-[13px]">
      {/* Row 1: exchange + symbol + market  /  age */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-[9px]">
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
        </div>
        <span
          title={t('cluster.age', { age })}
          className="flex-none font-mono text-[11px] tracking-[0.04em] text-text-muted"
        >
          {age}
        </span>
      </div>

      {/* Row 2: total size  /  side */}
      <div className="flex items-center justify-between gap-2.5">
        <span className="font-mono text-[20px] leading-none font-medium tracking-[-0.01em] text-text">
          {sizeMode === 'usd' ? fmtMoney(c.totalNotional) : fmtBaseQty(c.totalQuantity)}
        </span>
        <span
          className={`flex-none rounded-[5px] border px-[7px] py-[3px] font-mono text-[10px]
                      font-semibold tracking-[0.1em] ${sideClass}`}
        >
          {isBid ? t('notification.side.bid') : t('notification.side.ask')}
        </span>
      </div>

      {/* Row 3: metrics */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-5 border-t border-border-subtle pt-2.5">
        <Metric
          label={t('cluster.metric.range')}
          value={`${c.priceFrom.toFixed(dec)} – ${c.priceTo.toFixed(dec)}`}
        />
        <Metric label={t('cluster.metric.levels')} value={String(c.levelCount)} align="right" />
        <Metric
          label={t('notification.metric.dist')}
          value={fmtDistance(c.distance)}
          align="right"
        />
      </div>
    </div>
  );
});
