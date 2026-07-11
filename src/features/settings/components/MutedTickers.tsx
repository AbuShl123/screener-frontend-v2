import { useMemo, useState } from 'react';
import { fmtSymbol, marketBadge } from '@/features/orderbook/format';
import { bookKey, type Market } from '@/features/orderbook/types';
import { useNotificationSettingsStore } from '../notificationSettingsStore';
import { useTickers } from '../queries';

/**
 * The Muted-tickers block (design template Settings → Notifications): search → results →
 * muted chips. A muted `(symbol, market)` book never produces notifications — the filter
 * runs at the push boundary in `feedClient.flush()`.
 *
 * The picker is driven by the live active-ticker list from `GET /api/tickers` (via
 * `useTickers`, fetched only while the modal is open). Muting is opt-in, so a failed
 * fetch degrades gracefully — existing mutes still render and can be removed.
 */

/** One selectable book in the mute picker. */
interface PoolEntry {
  key: string; // bookKey(symbol, market)
  symbol: string; // raw exchange symbol
  market: Market;
}

export function MutedTickers({ open }: { open: boolean }) {
  const muted = useNotificationSettingsStore((s) => s.muted);
  const mute = useNotificationSettingsStore((s) => s.mute);
  const unmute = useNotificationSettingsStore((s) => s.unmute);

  const tickersQuery = useTickers(open);
  const [query, setQuery] = useState('');

  // Ticker pool: a FUTURES row for every ticker (always tracked) + a SPOT row iff hasSpot.
  const pool = useMemo<PoolEntry[]>(() => {
    const list = tickersQuery.data?.tickers ?? [];
    const entries: PoolEntry[] = [];
    for (const t of list) {
      entries.push({ key: bookKey(t.symbol, 'FUTURES'), symbol: t.symbol, market: 'FUTURES' });
      if (t.hasSpot) entries.push({ key: bookKey(t.symbol, 'SPOT'), symbol: t.symbol, market: 'SPOT' });
    }
    return entries;
  }, [tickersQuery.data]);

  const trimmed = query.trim().toUpperCase();
  const mutedSet = useMemo(() => new Set(muted), [muted]);
  const results = trimmed
    ? pool.filter((e) => e.symbol.includes(trimmed) && !mutedSet.has(e.key)).slice(0, 8)
    : [];

  return (
    <section className="flex flex-col gap-[15px]">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="mb-[5px] text-[14px] font-semibold text-text">Muted tickers</h3>
          <p className="max-w-[54ch] text-[13px] leading-[1.55] text-text-secondary">
            Muted ticker + market books never trigger notifications. Search across all tickers to
            mute one.
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.1em] whitespace-nowrap text-text-muted">
          {muted.length} MUTED
        </span>
      </div>

      {/* Search */}
      <div className="relative flex items-center">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-3 text-text-dim"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tickers to mute…"
          className="box-border w-full rounded-lg border border-border-input bg-input py-[11px]
                     pr-3 pl-9 font-mono text-[12px] tracking-[0.02em] text-text outline-none
                     focus:border-accent"
        />
      </div>

      {/* Loading / error hints — the input stays usable; results appear when data lands. */}
      {tickersQuery.isLoading && (
        <p className="font-mono text-[11px] tracking-[0.03em] text-text-dim">Loading tickers…</p>
      )}
      {tickersQuery.isError && (
        <p className="font-mono text-[11px] tracking-[0.03em] text-danger">Couldn't load tickers</p>
      )}

      {/* Search results */}
      {trimmed && (
        <div className="overflow-hidden rounded-[10px] border border-border-subtle bg-input">
          {results.length > 0 ? (
            results.map((e) => {
              const badge = marketBadge(e.market);
              return (
                <div
                  key={e.key}
                  className="flex items-center justify-between gap-2.5 border-b border-border-subtle
                             px-[13px] py-2.5 last:border-b-0"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-[13px] tracking-[0.02em] text-text-strong">
                      {fmtSymbol(e.symbol)}
                    </span>
                    <span
                      className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => mute(e.key)}
                    className="shrink-0 rounded-lg border border-accent/45 px-3.5 py-1.5 text-[12px]
                               text-accent transition-colors hover:bg-accent/10"
                  >
                    Mute
                  </button>
                </div>
              );
            })
          ) : (
            <div className="px-[13px] py-5 text-center font-mono text-[12px] tracking-[0.03em] text-text-dim">
              No tickers match “{query.trim()}”
            </div>
          )}
        </div>
      )}

      {/* Muted list */}
      {muted.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {muted.map((key) => {
            const [symbol, market] = key.split(':') as [string, Market];
            const badge = marketBadge(market);
            return (
              <span
                key={key}
                className="inline-flex items-center gap-2 rounded-full border border-border-input
                           bg-input py-1.5 pr-2 pl-3"
              >
                <span className="font-mono text-[12px] tracking-[0.02em] text-text-strong">
                  {fmtSymbol(symbol)}
                </span>
                <span
                  className={`rounded border px-[5px] py-px font-mono text-[8px] tracking-[0.08em] ${badge.className}`}
                >
                  {badge.label}
                </span>
                <button
                  type="button"
                  onClick={() => unmute(key)}
                  title="Unmute"
                  className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full
                             bg-white/[0.06] text-[13px] leading-none text-text-muted transition-colors
                             hover:bg-danger/20 hover:text-danger"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[10px] border border-dashed border-border-subtle px-[13px] py-4
                        text-center font-mono text-[12px] tracking-[0.03em] text-text-dim">
          No muted tickers — every book can notify
        </div>
      )}
    </section>
  );
}
