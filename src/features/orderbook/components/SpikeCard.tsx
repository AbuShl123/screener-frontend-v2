import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fmtClock,
  fmtMoney,
  fmtSymbol,
  marketBadge,
  tradePriceDecimals,
} from '@/features/orderbook/format';
import { exchangeMeta, useExchangeRegistry } from '@/features/orderbook/exchanges';
import { ExchangeLogo } from '@/features/orderbook/components/ExchangeLogo';
import { Metric } from '@/features/orderbook/components/NotificationCard';
import type { SpikeAlert } from '@/features/orderbook/types';

interface SpikeCardProps {
  spike: SpikeAlert;
}

/**
 * One price or volume spike (doc §3.10), in the same card shape as `TradeCard`:
 * - row 1: exchange logo + symbol + market badge / time;
 * - row 2: the headline change (`+6.34%`, or `+215%` for volume) / a kind badge
 *   (PUMP / DUMP in the side colours, VOLUME in the accent);
 * - row 3: FROM → TO (prices, or window volumes) and the WINDOW.
 *
 * Memoized: an alert never changes after arrival.
 */
export const SpikeCard = memo(function SpikeCard({ spike: s }: SpikeCardProps) {
  const { t } = useTranslation('orderbook');
  useExchangeRegistry((st) => st.version);
  const exchangeLabel = exchangeMeta(s.exchange).label;
  const badge = marketBadge(s.market);
  const minutes = Math.round(s.windowSec / 60);
  const window = t('spike.window', { n: minutes });

  let headline: string;
  let kindLabel: string;
  let tone: string;
  let toneBadge: string;
  let from: string;
  let to: string;
  if (s.kind === 'PRICE') {
    const up = s.direction === 'UP';
    headline = (up ? '+' : '−') + Math.abs(s.pct).toFixed(2) + '%';
    kindLabel = up ? t('spike.pump') : t('spike.dump');
    tone = up ? 'text-bid' : 'text-danger';
    toneBadge = up ? 'border-bid/40 bg-bid/12' : 'border-danger/40 bg-danger/12';
    const dec = tradePriceDecimals(s.fromPrice, s.toPrice);
    from = s.fromPrice.toFixed(dec);
    to = s.toPrice.toFixed(dec);
  } else {
    headline = s.pct === null ? t('spike.newVolume') : '+' + s.pct.toFixed(0) + '%';
    kindLabel = t('spike.volume');
    tone = 'text-accent';
    toneBadge = 'border-accent/40 bg-accent/12';
    from = fmtMoney(s.prevVolume);
    to = fmtMoney(s.volume);
  }

  return (
    <div className="flex shrink-0 flex-col gap-[11px] rounded-[10px] border border-border bg-input px-[14px] pt-3 pb-[13px]">
      {/* Row 1: exchange + symbol + market  /  time */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-[9px]">
          <ExchangeLogo
            id={s.exchange}
            alt={exchangeLabel}
            title={exchangeLabel}
            className="size-3.5 flex-none"
          />
          <span className="font-mono text-[14px] tracking-[0.02em] text-text-strong">
            {fmtSymbol(s.symbol)}
          </span>
          <span
            className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <span className="font-mono text-[11px] tracking-[0.04em] text-text-muted">
          {fmtClock(s.time)}
        </span>
      </div>

      {/* Row 2: headline change  /  kind */}
      <div className="flex items-center justify-between gap-2.5">
        <span className={`font-mono text-[20px] leading-none font-medium tracking-[-0.01em] ${tone}`}>
          {headline}
        </span>
        <span
          className={`inline-flex flex-none items-center whitespace-nowrap rounded-[5px] border px-[7px] py-[3px]
                      font-mono text-[10px] font-semibold tracking-[0.1em] ${tone} ${toneBadge}`}
        >
          {kindLabel}
        </span>
      </div>

      {/* Row 3: from → to  /  window */}
      <div className="grid grid-cols-[auto_1fr] gap-x-5 border-t border-border-subtle pt-2.5">
        <Metric
          label={s.kind === 'PRICE' ? t('spike.metric.price') : t('spike.metric.volume')}
          value={`${from} → ${to}`}
        />
        <Metric label={t('spike.metric.window')} value={window} align="right" />
      </div>
    </div>
  );
});
