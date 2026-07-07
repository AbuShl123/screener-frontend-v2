import {
  fmtClock,
  fmtDistance,
  fmtMoney,
  fmtQty,
  fmtSymbol,
  marketBadge,
  priceDecimals,
} from '@/features/orderbook/format';
import { TIER_COLORS } from '@/features/orderbook/tiers';
import type { Notification } from '@/features/orderbook/types';
import type { SizeMode } from '@/features/orderbook/pages/DashboardPage';

interface NotificationCardProps {
  notification: Notification;
  sizeMode: SizeMode;
}

/**
 * One notification, mirroring the template's item: a solid tier stripe down the left
 * edge, a header row (symbol + market badge + side / time), and a 3-column metrics grid
 * (PRICE / NOTIONAL·SIZE / DIST). The middle metric follows the header's QTY/$ toggle,
 * exactly like [`OrderbookCard`]. The stripe uses full tier color (no opacity mix — the
 * template stripe is solid, unlike the row bars).
 */
export function NotificationCard({ notification: n, sizeMode }: NotificationCardProps) {
  const badge = marketBadge(n.market);
  const isUsd = sizeMode === 'usd';

  return (
    <div className="relative shrink-0 overflow-hidden rounded-[10px] border border-border bg-input">
      {/* Tier stripe — solid color (tier is 1–4, so a color always exists). */}
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: TIER_COLORS[n.tier] ?? 'var(--color-text-muted)' }}
      />

      <div className="flex flex-col gap-[11px] pt-3 pr-[14px] pb-[13px] pl-[17px]">
        {/* Row 1: symbol + market badge + side  /  time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-[9px]">
            <span className="font-mono text-[14px] tracking-[0.02em] text-text-strong">
              {fmtSymbol(n.symbol)}
            </span>
            <span
              className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badge.className}`}
            >
              {badge.label}
            </span>
            <span className="font-mono text-[11px] font-semibold tracking-[0.12em] text-text-strong">
              {n.side === 'bid' ? 'BID' : 'ASK'}
            </span>
          </div>
          <span className="font-mono text-[11px] tracking-[0.04em] text-text-dim">
            {fmtClock(n.timeMillis)}
          </span>
        </div>

        {/* Row 2: 3-col metrics grid */}
        <div className="grid grid-cols-3 gap-2.5 border-t border-border-subtle pt-2.5">
          <Metric label="PRICE" value={n.price.toFixed(priceDecimals(n.price))} />
          <Metric
            label={isUsd ? 'NOTIONAL' : 'SIZE'}
            value={isUsd ? fmtMoney(n.notional) : fmtQty(n.notional / n.price)}
          />
          <Metric label="DIST" value={fmtDistance(n.distance)} align="right" />
        </div>
      </div>
    </div>
  );
}

/** One stacked label/value cell in the metrics grid. */
function Metric({
  label,
  value,
  align,
}: {
  label: string;
  value: string;
  align?: 'right';
}) {
  return (
    <div className={`flex flex-col gap-[3px] ${align === 'right' ? 'text-right' : ''}`}>
      <span className="font-mono text-[9px] tracking-[0.1em] text-text-muted">{label}</span>
      <span className="font-mono text-[13px] text-text-strong">{value}</span>
    </div>
  );
}
