import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { marketBadge } from '@/features/orderbook/format';
import { useExchangeRegistry } from '@/features/orderbook/exchanges';
import { useExchangeMetadata } from '@/features/orderbook/exchangeMetadata';
import { ExchangeLogo } from '@/features/orderbook/components/ExchangeLogo';
import { useNotificationSettingsStore, type VenueMuteKind } from '../notificationSettingsStore';
import { buildVenueOptions } from '../venueOptions';

/** The table's alert-type columns, in display order (the notification panel's tab order). */
const KINDS: readonly VenueMuteKind[] = ['depth', 'trades'];

/** Shared by the header cells and the checkbox cells so the columns line up. */
const COL = 'flex w-[88px] flex-none justify-center';

/**
 * The exchange-notifications block (Settings → Notifications, below Muted tickers): a table
 * with one row per exchange × each of its markets and one checkbox column per alert type —
 * order book (depth) notifications and large-trade alerts. Unchecking a cell mutes only that
 * type for that venue: new alerts are dropped in `feedClient.flush()` and already-raised ones
 * are hidden from the panel and badges. Order book cards are unaffected, and so is the header's
 * exchange filter: the two preferences are deliberately separate.
 *
 * Rows come from the runtime exchange registry (`/api/exchanges`) — each exchange × its own
 * markets — so a newly listed exchange appears here automatically, with both types on. This
 * block is also rendered on `/account/settings` (outside the dashboard), so it keeps the
 * metadata fresh itself; TanStack Query dedupes it with the dashboard's call.
 */
export function MutedVenues() {
  const { t } = useTranslation('settings');
  useExchangeMetadata();
  const ids = useExchangeRegistry((s) => s.ids);
  const meta = useExchangeRegistry((s) => s.meta);
  const mutedVenues = useNotificationSettingsStore((s) => s.mutedVenues);
  const mutedTradeVenues = useNotificationSettingsStore((s) => s.mutedTradeVenues);
  const setVenueMuted = useNotificationSettingsStore((s) => s.setVenueMuted);

  const OPTIONS = useMemo(() => buildVenueOptions(ids, meta), [ids, meta]);
  const mutedSets = useMemo(
    () => ({ depth: new Set(mutedVenues), trades: new Set(mutedTradeVenues) }),
    [mutedVenues, mutedTradeVenues],
  );
  // Count muted cells of listed venues only, so a stale persisted key can't inflate the counter.
  const mutedCount = OPTIONS.reduce(
    (n, o) => n + KINDS.filter((k) => mutedSets[k].has(o.key)).length,
    0,
  );

  return (
    <section className="flex flex-col gap-[15px]">
      {/* Wraps the count under the description only when they don't fit side by side. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <h3 className="mb-[5px] text-[14px] font-semibold text-text">
            {t('notifications.venues.heading')}
          </h3>
          <p className="max-w-[54ch] text-[13px] leading-[1.55] text-text-secondary">
            {t('notifications.venues.desc')}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.1em] whitespace-nowrap text-text-muted">
          {t('notifications.venues.count', { n: mutedCount })}
        </span>
      </div>

      <div
        role="table"
        aria-label={t('notifications.venues.heading')}
        className="overflow-hidden rounded-[10px] border border-border-subtle bg-input"
      >
        {/* Column headers */}
        <div
          role="row"
          className="flex items-center gap-2 border-b border-border-subtle px-[13px] py-2 font-mono
                     text-[10px] tracking-[0.08em] text-text-muted uppercase"
        >
          <span role="columnheader" className="min-w-0 flex-1">
            {t('notifications.venues.columns.venue')}
          </span>
          {KINDS.map((kind) => (
            <span key={kind} role="columnheader" className={`${COL} text-center leading-tight`}>
              {t(`notifications.venues.columns.${kind}`)}
            </span>
          ))}
        </div>

        {OPTIONS.map((o) => {
          const badge = marketBadge(o.market);
          const name = t('notifications.venues.name', {
            exchange: o.label,
            market: t(`notifications.venues.market.${o.market}`),
          });
          const allMuted = KINDS.every((k) => mutedSets[k].has(o.key));
          return (
            <div
              key={o.key}
              role="row"
              className="flex items-center gap-2 border-b border-border-subtle px-[13px] py-2
                         last:border-b-0"
            >
              <div
                role="rowheader"
                className={`flex min-w-0 flex-1 items-center gap-2.5 ${allMuted ? 'opacity-50' : ''}`}
              >
                <ExchangeLogo id={o.exchange} alt="" className="size-3.5 flex-none" />
                <span className="truncate text-[13px] text-text-strong">{o.label}</span>
                <span
                  className={`flex-none rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>
              {KINDS.map((kind) => {
                const enabled = !mutedSets[kind].has(o.key);
                return (
                  <div key={kind} role="cell" className={COL}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={enabled}
                      aria-label={t(`notifications.venues.toggleAria.${kind}`, { name })}
                      onClick={() => setVenueMuted(kind, o.key, enabled)}
                      className="rounded-md p-1.5 transition-colors hover:bg-white/5"
                    >
                      {/* Same checkbox look as the dashboard's exchange filter menu. */}
                      <span
                        className={`inline-flex h-[15px] w-[15px] items-center justify-center rounded-[3px]
                                    border text-[10px] leading-none ${
                                      enabled
                                        ? 'border-accent bg-accent text-bg'
                                        : 'border-border-input bg-transparent'
                                    }`}
                      >
                        {enabled ? '✓' : ''}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
