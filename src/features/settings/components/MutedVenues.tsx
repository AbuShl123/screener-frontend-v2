import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { marketBadge } from '@/features/orderbook/format';
import { useExchangeRegistry, type Exchange } from '@/features/orderbook/exchanges';
import { useExchangeMetadata } from '@/features/orderbook/exchangeMetadata';
import { ExchangeLogo } from '@/features/orderbook/components/ExchangeLogo';
import { DepthIcon, TradeIcon } from '@/features/orderbook/components/alertIcons';
import { useNotificationSettingsStore, type VenueMuteKind } from '../notificationSettingsStore';
import { buildVenueOptions, type VenueOption } from '../venueOptions';

/** The alert feeds, in display order (the notification panel's tab order). */
const KINDS: readonly VenueMuteKind[] = ['depth', 'trades'];

function FeedIcon({ kind, size }: { kind: VenueMuteKind; size: number }) {
  return kind === 'depth' ? <DepthIcon size={size} /> : <TradeIcon size={size} />;
}

/**
 * The exchange-notifications block (Settings → Notifications, below Muted tickers): one card per
 * exchange, one row per market of that exchange, and one toggle button per alert feed — order
 * book (depth) notifications and large-trade alerts. The card header's switch mutes/unmutes
 * every feed of every market of that exchange at once. Muting drops new alerts in
 * `feedClient.flush()` and hides already-raised ones from the panel and badges. Order book
 * cards are unaffected, and so is the header's exchange filter: the two preferences are
 * deliberately separate.
 *
 * Cards come from the runtime exchange registry (`/api/exchanges`) — each exchange × its own
 * markets — so a newly listed exchange appears here automatically, with every feed on. This
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

  const options = useMemo(() => buildVenueOptions(ids, meta), [ids, meta]);
  const groups = useMemo(() => {
    const byExchange = new Map<Exchange, VenueOption[]>();
    for (const o of options) {
      const list = byExchange.get(o.exchange);
      if (list) list.push(o);
      else byExchange.set(o.exchange, [o]);
    }
    return [...byExchange.entries()].map(([exchange, venues]) => ({ exchange, venues }));
  }, [options]);
  const mutedSets = useMemo(
    () => ({ depth: new Set(mutedVenues), trades: new Set(mutedTradeVenues) }),
    [mutedVenues, mutedTradeVenues],
  );
  // Count muted feeds of listed venues only, so a stale persisted key can't inflate the counter.
  const mutedCount = options.reduce(
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
          <p className="max-w-[58ch] text-[13px] leading-[1.55] text-text-secondary">
            {t('notifications.venues.desc')}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.1em] whitespace-nowrap text-text-muted">
          {t('notifications.venues.count', { n: mutedCount })}
        </span>
      </div>

      {/* Legend: the same glyphs as the notification panel tabs. */}
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5 font-mono text-[10px] tracking-[0.08em] text-text-muted uppercase">
        {KINDS.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <FeedIcon kind={kind} size={12} />
            {t(`notifications.venues.legend.${kind}`)}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {groups.map((g) => (
          <ExchangeCard key={g.exchange} exchange={g.exchange} venues={g.venues} mutedSets={mutedSets} />
        ))}
      </div>
    </section>
  );
}

interface ExchangeCardProps {
  exchange: Exchange;
  venues: readonly VenueOption[];
  mutedSets: Readonly<Record<VenueMuteKind, ReadonlySet<string>>>;
}

function ExchangeCard({ exchange, venues, mutedSets }: ExchangeCardProps) {
  const { t } = useTranslation('settings');
  const setVenueMuted = useNotificationSettingsStore((s) => s.setVenueMuted);
  const setVenuesMutedAll = useNotificationSettingsStore((s) => s.setVenuesMutedAll);

  const label = venues[0].label;
  const total = venues.length * KINDS.length;
  const mutedN = venues.reduce(
    (n, o) => n + KINDS.filter((k) => mutedSets[k].has(o.key)).length,
    0,
  );
  const allMuted = mutedN === total;
  const anyOn = !allMuted;

  const status =
    mutedN === 0
      ? t('notifications.venues.status.allOn')
      : allMuted
        ? t('notifications.venues.status.allMuted')
        : t('notifications.venues.status.some', { n: mutedN, total });
  const statusColor = mutedN === 0 ? 'text-text-muted' : allMuted ? 'text-danger' : 'text-warning';

  return (
    <div
      className={`overflow-hidden rounded-[10px] border border-border-subtle transition-colors ${
        allMuted ? 'bg-transparent' : 'bg-input'
      }`}
    >
      {/* Header: logo + name + status, and the exchange-wide switch */}
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3.5">
        <span className={`flex-none transition-opacity ${allMuted ? 'opacity-45' : ''}`}>
          <ExchangeLogo id={exchange} alt="" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={`truncate text-[15px] leading-[1.15] font-medium ${
              allMuted ? 'text-text-muted' : 'text-text-strong'
            }`}
          >
            {label}
          </span>
          <span className={`font-mono text-[10px] leading-none tracking-[0.1em] ${statusColor}`}>
            {status}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={anyOn}
          aria-label={t('notifications.venues.switchAria', { exchange: label })}
          title={t(
            anyOn ? 'notifications.venues.switchTitle.mute' : 'notifications.venues.switchTitle.unmute',
            { exchange: label },
          )}
          onClick={() =>
            setVenuesMutedAll(
              venues.map((o) => o.key),
              anyOn,
            )
          }
          className={`relative h-[22px] w-10 flex-none cursor-pointer rounded-full border p-0 transition-colors ${
            anyOn ? 'border-accent bg-accent' : 'border-border-input bg-white/8'
          }`}
        >
          <span
            className={`absolute top-[2px] left-[2px] size-4 rounded-full transition-[transform,background-color] ${
              anyOn ? 'translate-x-[18px] bg-white' : 'translate-x-0 bg-text-muted'
            }`}
          />
        </button>
      </div>

      {/* One row per market: badge + a toggle per alert feed */}
      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
        {venues.map((o) => {
          const badge = marketBadge(o.market);
          const name = t('notifications.venues.name', {
            exchange: o.label,
            market: t(`notifications.venues.market.${o.market}`),
          });
          return (
            <div key={o.key} className="flex items-center gap-2">
              <span className="w-[50px] flex-none">
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] ${badge.className}`}
                >
                  {badge.label}
                </span>
              </span>
              {KINDS.map((kind) => {
                const on = !mutedSets[kind].has(o.key);
                const aria = t(`notifications.venues.toggleAria.${kind}`, { name });
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={on}
                    aria-label={aria}
                    title={`${aria} — ${t(on ? 'notifications.venues.toggleTitle.on' : 'notifications.venues.toggleTitle.muted')}`}
                    onClick={() => setVenueMuted(kind, o.key, on)}
                    className={`inline-flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center
                                gap-2 rounded-lg border px-2.5 text-[13px] whitespace-nowrap transition-colors ${
                                  on
                                    ? 'border-solid border-accent/45 bg-accent/13 text-text-strong hover:bg-accent/20'
                                    : 'border-dashed border-border-input bg-transparent text-text-muted hover:bg-white/4 hover:text-text-strong'
                                }`}
                  >
                    <span
                      className={`relative inline-flex size-[15px] flex-none ${on ? 'text-accent' : 'text-text-muted'}`}
                    >
                      <FeedIcon kind={kind} size={15} />
                      {!on && (
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          aria-hidden="true"
                          className="absolute inset-0"
                        >
                          <path d="M3 3l18 18" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{t(`notifications.venues.feed.${kind}`)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
