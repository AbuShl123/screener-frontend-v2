import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { logout, useMe } from '@/features/auth';
import { accountHome } from '@/lib/accountHome';
import { SortMenu } from '@/features/orderbook/components/SortMenu';
import { ExchangeFilterMenu } from '@/features/orderbook/components/ExchangeFilterMenu';
import type { SizeMode } from '@/features/orderbook/pages/DashboardPage';
import type { SortMode } from '@/features/orderbook/sortOrderbooks';

interface DashboardHeaderProps {
  /** Count of pairs visible under the exchange filter (display only). */
  tickerCount: number;
  /** Current display unit for card notionals — owned by `DashboardPage`. */
  sizeMode: SizeMode;
  onSizeModeChange: (mode: SizeMode) => void;
  /** Current card sort order — owned by `DashboardPage`. */
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  /** Open the Settings overlay (owned by `DashboardPage`). */
  onOpenSettings: () => void;
  /** Whether the Settings overlay is open — drives the gear's active styling. */
  settingsOpen: boolean;
}

/**
 * Full-width sticky app header (design template "Dashboard"). QTY / $ USD toggle,
 * Settings, Log out, and the profile avatar (links to `/account`) are all functional.
 * The dashboard deliberately does NOT block on `/me` — if the profile failed to load,
 * the avatar just falls back to "·".
 */
export const DashboardHeader = memo(function DashboardHeader({
  tickerCount,
  sizeMode,
  onSizeModeChange,
  sortMode,
  onSortModeChange,
  onOpenSettings,
  settingsOpen,
}: DashboardHeaderProps) {
  const { t } = useTranslation('orderbook');
  const me = useMe();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    await logout(); // best-effort POST /logout; ALWAYS clears session + evicts /me cache
    // clearSession() flips status → 'anonymous' (guards would redirect on next render);
    // navigate explicitly for an immediate, deterministic bounce.
    navigate('/login', { replace: true });
  }

  const initials =
    (me.data ? `${me.data.firstName[0] ?? ''}${me.data.lastName[0] ?? ''}`.toUpperCase() : '') ||
    '·';

  return (
    <header
      // Height comes from `--header-h` (set on `DashboardPage`'s root), which the notifications
      // panel, its handle and the reconnect notice also read: 60px from `lg` up (one row, the
      // desktop layout), 104px below `lg`, where the header wraps into two rows — Sort and
      // Exchanges move to a second row (`order-last basis-full` below) so nothing scrolls or
      // clips. Below `sm`, secondary info (ticker count) is hidden and spacing tightens.
      // The dropdowns render in a portal (`useAnchoredMenu`), so this layout doesn't affect them.
      className="sticky top-0 z-10 flex h-[var(--header-h)] flex-wrap content-center items-center gap-x-2
                 gap-y-3 border-b border-border bg-surface-marketing px-4
                 sm:gap-x-3 md:gap-x-4 md:px-8 xl:gap-x-6"
    >
      {/* Brand (presentational) */}
      <div className="flex items-center gap-[11px]">
        <span className="h-[14px] w-[14px] rotate-45 rounded-[2px] bg-accent" />
        <span className="hidden font-mono text-[15px] font-medium tracking-[0.24em] text-text-strong md:inline">
          SCREENER
        </span>
      </div>

      <span className="hidden h-[22px] w-px bg-border sm:block" />

      {/* Watchlist context (display only; hidden on phone widths) */}
      <div className="hidden items-baseline gap-2 whitespace-nowrap sm:flex">
        <span className="hidden text-[13px] text-text-secondary xl:inline">{t('header.watchlist')}</span>
        <span className="font-mono text-[11px] tracking-[0.06em] text-text-muted">
          {t('header.tickers', { n: tickerCount })}
        </span>
      </div>

      <span className="hidden h-[22px] w-px bg-border lg:block" />

      {/* Sort + Exchanges. From `lg` up: inline, in their desktop position (inner gap = the
          header gap). Below `lg`: their own full-width second row, each control taking half. */}
      <div
        className="order-last flex min-w-0 basis-full gap-2
                   lg:order-none lg:basis-auto lg:gap-x-4 xl:gap-x-6"
      >
        {/* Sort control (functional) */}
        <SortMenu sortMode={sortMode} onSortModeChange={onSortModeChange} />

        {/* Per-exchange filter (functional; self-subscribes to the filter store) */}
        <ExchangeFilterMenu />
      </div>

      <div className="flex-1" />

      {/* Size toggle (functional) */}
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-input p-[3px]">
        {(['qty', 'usd'] as const).map((mode) => {
          const active = sizeMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onSizeModeChange(mode)}
              className={`rounded-md px-2 py-[5px] font-mono text-[11px] tracking-[0.04em] sm:px-3
                          transition-colors ${
                            active
                              ? 'bg-accent font-semibold text-bg'
                              : 'bg-transparent text-text-secondary hover:text-text-strong'
                          }`}
            >
              {mode === 'qty' ? t('header.size.qty') : t('header.size.usd')}
            </button>
          );
        })}
      </div>

      <span className="h-[22px] w-px bg-border" />

      {/* Settings (opens the overlay; accent border + tinted bg while open) */}
      <button
        type="button"
        title={t('header.settings')}
        onClick={onOpenSettings}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-[16px]
                    transition-colors ${
                      settingsOpen
                        ? 'border-accent bg-white/5 text-text-strong'
                        : 'border-border-input text-text-secondary hover:bg-white/5 hover:text-text-strong'
                    }`}
      >
        ⚙
      </button>

      {/* Log out (functional — ports HomePage's logout) */}
      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        className="rounded-lg border border-border-input px-3 py-2 text-[13px] text-text-secondary sm:px-4
                   whitespace-nowrap transition-colors hover:bg-white/5 hover:text-text-strong
                   disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loggingOut ? t('header.loggingOut') : t('header.logout')}
      </button>

      {/* Profile (initials from /me when available) */}
      <button
        type="button"
        title={t('header.account')}
        onClick={() => navigate(accountHome(me.data?.role))}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border
                   border-accent/40 bg-accent/[0.18] font-mono text-[12px] font-medium
                   tracking-[0.04em] text-accent transition-colors hover:bg-accent/[0.28]"
      >
        {initials}
      </button>
    </header>
  );
});
