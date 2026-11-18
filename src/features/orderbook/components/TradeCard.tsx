import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  baseAsset,
  fmtBaseQty,
  fmtClock,
  fmtMoney,
  fmtSymbol,
  marketBadge,
  tradeImpact,
  tradePriceDecimals,
  tradeRelativeSize,
  tradeSizeBucket,
} from '@/features/orderbook/format';
import { exchangeMeta, useExchangeRegistry } from '@/features/orderbook/exchanges';
import { ExchangeLogo } from '@/features/orderbook/components/ExchangeLogo';
import { Metric } from '@/features/orderbook/components/NotificationCard';
import type { TradeAlert } from '@/features/orderbook/types';
import type { SizeMode } from '@/features/orderbook/pages/DashboardPage';

interface TradeCardProps {
  trade: TradeAlert;
  sizeMode: SizeMode;
}

/** Pip heights (px) of the 4-step relative-size meter, smallest first. */
const PIP_HEIGHTS = [4, 7, 10, 13];
/** At most this many bars in a sweep's price path (a 40-level sweep still fits the row). */
const MAX_PATH_STEPS = 16;
/** Relative-size bucket (1–4) → i18n key of its name. */
const BUCKET_KEYS = ['notable', 'large', 'veryLarge', 'exceptional'] as const;

/**
 * One large-trade alert (doc §3.8), mirroring the design template's TRADE item:
 * - row 1: exchange logo + symbol + market badge / execution time;
 * - row 2: headline size (follows the header's QTY/$ toggle) + a 4-pip relative-size meter
 *   (`notional / threshold`, doc §3.8.3) / the taker-side badge (side carries the color —
 *   trades have no tier);
 * - row 3: the other size unit · AVG PRICE (FILL PRICE when single-level) · LEVELS;
 * - row 4, sweeps only: SWEPT N LEVELS + signed impact, and a bar path first → last price.
 *
 * Memoized: an alert never changes after arrival, so a depth push re-rendering the panel
 * doesn't re-render hundreds of trade cards. It subscribes to the registry `version` itself
 * so a label/logo arrival still updates it.
 */
export const TradeCard = memo(function TradeCard({ trade: t, sizeMode }: TradeCardProps) {
  const { t: tr } = useTranslation('orderbook');
  useExchangeRegistry((s) => s.version);
  const exchangeLabel = exchangeMeta(t.exchange).label;
  const badge = marketBadge(t.market);
  const isUsd = sizeMode === 'usd';
  const isBuy = t.side === 'BUY';
  const isSweep = t.levels > 1;
  const symbol = fmtSymbol(t.symbol);

  const dec = tradePriceDecimals(t.firstPrice, t.lastPrice);
  const money = fmtMoney(t.notional);
  const qty = fmtBaseQty(t.qty) + ' ' + baseAsset(t.symbol);
  const relative = tradeRelativeSize(t.notional, t.threshold);
  const bucket = tradeSizeBucket(relative);
  const relLabel = tr('trade.relative.label', {
    size: tr(`trade.relative.${BUCKET_KEYS[bucket - 1]}`),
    symbol,
    ratio: relative.toFixed(1),
  });

  // Side color: taker buy in the bid green, taker sell in danger red (the template's pairing).
  const sideText = isBuy ? 'text-bid' : 'text-danger';
  const sideBadge = isBuy ? 'border-bid/40 bg-bid/12' : 'border-danger/40 bg-danger/12';

  return (
    <div className="flex shrink-0 flex-col gap-[11px] rounded-[10px] border border-border bg-input px-[14px] pt-3 pb-[13px]">
      {/* Row 1: exchange + symbol + market  /  execution time */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-[9px]">
          <ExchangeLogo
            id={t.exchange}
            alt={exchangeLabel}
            title={exchangeLabel}
            className="size-3.5 flex-none"
          />
          <span className="font-mono text-[14px] tracking-[0.02em] text-text-strong">{symbol}</span>
          <span
            className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <span className="font-mono text-[11px] tracking-[0.04em] text-text-muted">
          {fmtClock(t.time)}
        </span>
      </div>

      {/* Row 2: headline size + relative-size meter  /  taker side */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-end gap-[9px]">
          <span className="font-mono text-[20px] leading-none font-medium tracking-[-0.01em] text-text">
            {isUsd ? money : qty}
          </span>
          <span
            role="img"
            aria-label={relLabel}
            title={relLabel}
            className="inline-flex h-[13px] items-end gap-0.5 pb-0.5"
          >
            {PIP_HEIGHTS.map((h, i) => (
              <span
                key={h}
                className={`block w-[3px] rounded-[1px] ${i < bucket ? 'bg-text-strong' : 'bg-white/[0.14]'}`}
                style={{ height: h }}
              />
            ))}
          </span>
        </div>
        <span
          className={`inline-flex flex-none items-center gap-[5px] whitespace-nowrap rounded-[5px] border px-[7px] py-[3px]
                      font-mono text-[10px] font-semibold tracking-[0.1em] ${sideText} ${sideBadge}`}
        >
          {isBuy ? '▲' : '▼'} {isBuy ? tr('trade.side.buy') : tr('trade.side.sell')}
        </span>
      </div>

      {/* Row 3: metrics grid */}
      <div className="grid grid-cols-3 gap-2.5 border-t border-border-subtle pt-2.5">
        <Metric
          label={isUsd ? tr('trade.metric.qty') : tr('trade.metric.notional')}
          value={isUsd ? qty : money}
        />
        <Metric
          label={isSweep ? tr('trade.metric.avgPrice') : tr('trade.metric.fillPrice')}
          value={t.avgPrice.toFixed(dec)}
        />
        <Metric
          label={tr('trade.metric.levels')}
          value={isSweep ? String(t.levels) : tr('trade.singleLevel')}
          align="right"
        />
      </div>

      {/* Row 4 (sweeps only): price path from the first to the last level taken */}
      {isSweep && <SweepPath trade={t} decimals={dec} sideText={sideText} />}
    </div>
  );
});

function SweepPath({
  trade: t,
  decimals,
  sideText,
}: {
  trade: TradeAlert;
  decimals: number;
  sideText: string;
}) {
  const { t: tr } = useTranslation('orderbook');
  const isBuy = t.side === 'BUY';
  const first = t.firstPrice.toFixed(decimals);
  const last = t.lastPrice.toFixed(decimals);
  const impact = (isBuy ? '+' : '−') + (tradeImpact(t.firstPrice, t.lastPrice) * 100).toFixed(2) + '%';

  // BUY climbs the asks (bars rise), SELL walks down the bids (bars fall); later bars are
  // more opaque so the direction of travel reads at a glance.
  const n = Math.min(Math.max(t.levels, 2), MAX_PATH_STEPS);
  const steps = Array.from({ length: n }, (_, i) => {
    const k = i / (n - 1);
    const rise = isBuy ? k : 1 - k;
    return { h: Math.round(3 + rise * 13), op: 0.4 + 0.6 * k };
  });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-white/[0.025] px-2.5 pt-[9px] pb-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9px] tracking-[0.1em] text-text-muted">
          {tr('trade.swept', { n: t.levels })}
        </span>
        <span className={`font-mono text-[11px] tracking-[0.02em] ${sideText}`}>
          <span className="text-[9px] tracking-[0.1em] text-text-muted">{tr('trade.impact')}</span>{' '}
          {impact}
        </span>
      </div>
      <div className="flex items-end gap-2.5">
        <span className="flex-none font-mono text-[11px] leading-none text-text-muted">{first}</span>
        <div
          role="img"
          aria-label={tr('trade.path', { n: t.levels, from: first, to: last })}
          className={`flex h-4 min-w-0 flex-1 items-end justify-between border-b border-border-input ${sideText}`}
        >
          {steps.map((s, i) => (
            <span
              key={i}
              className="block w-1 rounded-t-[1px] bg-current"
              style={{ height: s.h, opacity: s.op }}
            />
          ))}
        </div>
        <span className="flex-none font-mono text-[11px] leading-none text-text-strong">{last}</span>
      </div>
    </div>
  );
}
