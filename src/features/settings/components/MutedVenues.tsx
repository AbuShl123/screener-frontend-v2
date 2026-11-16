import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { marketBadge } from '@/features/orderbook/format';
import { useExchangeRegistry } from '@/features/orderbook/exchanges';
import { useExchangeMetadata } from '@/features/orderbook/exchangeMetadata';
import { ExchangeLogo } from '@/features/orderbook/components/ExchangeLogo';
import { useNotificationSettingsStore } from '../notificationSettingsStore';
import { buildVenueOptions } from '../venueOptions';

/**
 * The Muted-exchanges block (Settings → Notifications, below Muted tickers): one row per
 * exchange × each of its markets with an independent Mute / Unmute toggle. A muted venue never
 * produces notifications (dropped in `feedClient.flush()`) and its already-raised ones are
 * hidden from the panel and badges. Order book cards are unaffected, and so is the header's
 * exchange filter: the two preferences are deliberately separate.
 *
 * Rows come from the runtime exchange registry (`/api/exchanges`) — each exchange × its own
 * markets — so a newly listed exchange appears here automatically, unmuted. This block is also
 * rendered on `/account/settings` (outside the dashboard), so it keeps the metadata fresh
 * itself; TanStack Query dedupes it with the dashboard's call.
 */
export function MutedVenues() {
  const { t } = useTranslation('settings');
  useExchangeMetadata();
  const ids = useExchangeRegistry((s) => s.ids);
  const meta = useExchangeRegistry((s) => s.meta);
  const mutedVenues = useNotificationSettingsStore((s) => s.mutedVenues);
  const setVenueMuted = useNotificationSettingsStore((s) => s.setVenueMuted);

  const OPTIONS = useMemo(() => buildVenueOptions(ids, meta), [ids, meta]);
  const mutedSet = useMemo(() => new Set(mutedVenues), [mutedVenues]);
  // Count only venues that are listed, so a stale persisted key can't inflate the counter.
  const mutedCount = OPTIONS.filter((o) => mutedSet.has(o.key)).length;

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

      {/* `@container`: every row picks its layout from the LIST's width (`@xs` = 20rem), so all
          rows switch together — one line from 20rem up (the original layout), the button below
          the name + badge under it — instead of each row wrapping on its own content width. */}
      <div className="@container overflow-hidden rounded-[10px] border border-border-subtle bg-input">
        {OPTIONS.map((o) => {
          const isMuted = mutedSet.has(o.key);
          const badge = marketBadge(o.market);
          const name = t('notifications.venues.name', {
            exchange: o.label,
            market: t(`notifications.venues.market.${o.market}`),
          });
          return (
            <div
              key={o.key}
              className="flex flex-col items-start gap-2 border-b border-border-subtle px-[13px] py-2.5
                         last:border-b-0 @xs:flex-row @xs:items-center @xs:justify-between @xs:gap-2.5"
            >
              <div className={`flex items-center gap-2.5 ${isMuted ? 'opacity-50' : ''}`}>
                <ExchangeLogo id={o.exchange} alt="" className="size-3.5 flex-none" />
                <span className="text-[13px] text-text-strong">{o.label}</span>
                <span
                  className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>
              <button
                type="button"
                aria-pressed={isMuted}
                aria-label={
                  isMuted
                    ? t('notifications.venues.unmuteAria', { name })
                    : t('notifications.venues.muteAria', { name })
                }
                onClick={() => setVenueMuted(o.key, !isMuted)}
                className={`shrink-0 rounded-lg border px-3.5 py-1.5 text-[12px] transition-colors ${
                  isMuted
                    ? 'border-border-input text-text-secondary hover:bg-white/5 hover:text-text-strong'
                    : 'border-accent/45 text-accent hover:bg-accent/10'
                }`}
              >
                {isMuted ? t('notifications.venues.unmute') : t('notifications.venues.mute')}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
