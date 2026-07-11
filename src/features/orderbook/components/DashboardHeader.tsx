import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout, useMe } from '@/features/auth';
import type { SizeMode } from '@/features/orderbook/pages/DashboardPage';

interface DashboardHeaderProps {
  /** Live ticker count from the store's `keys.length` (display only). */
  tickerCount: number;
  /** Current display unit for card notionals — owned by `DashboardPage`. */
  sizeMode: SizeMode;
  onSizeModeChange: (mode: SizeMode) => void;
}

/**
 * Full-width sticky app header (design template "Dashboard"). QTY / $ USD toggle,
 * Log out, and the profile avatar (links to `/account`) are functional; Settings
 * is still an inert placeholder. The dashboard deliberately does NOT block on
 * `/me` — if the profile failed to load, the avatar just falls back to "·".
 */
export function DashboardHeader({ tickerCount, sizeMode, onSizeModeChange }: DashboardHeaderProps) {
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
      className="sticky top-0 z-10 flex h-[60px] items-center gap-6 border-b border-border
                 bg-surface-marketing px-8"
    >
      {/* Brand (presentational) */}
      <div className="flex items-center gap-[11px]">
        <span className="h-[14px] w-[14px] rotate-45 rounded-[2px] bg-accent" />
        <span className="font-mono text-[15px] font-medium tracking-[0.24em] text-text-strong">
          SCREENER
        </span>
      </div>

      <span className="h-[22px] w-px bg-border" />

      {/* Watchlist context (display only) */}
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] text-text-secondary">Watchlist</span>
        <span className="font-mono text-[11px] tracking-[0.06em] text-text-muted">
          {tickerCount} TICKERS
        </span>
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
              className={`rounded-md px-3 py-[5px] font-mono text-[11px] tracking-[0.04em]
                          transition-colors ${
                            active
                              ? 'bg-accent font-semibold text-bg'
                              : 'bg-transparent text-text-secondary hover:text-text-strong'
                          }`}
            >
              {mode === 'qty' ? 'QTY' : '$ USD'}
            </button>
          );
        })}
      </div>

      <span className="h-[22px] w-px bg-border" />

      {/* Settings (inert placeholder) */}
      <button
        type="button"
        title="Settings"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border
                   border-border-input text-[16px] text-text-secondary transition-colors
                   hover:bg-white/5 hover:text-text-strong"
      >
        ⚙
      </button>

      {/* Log out (functional — ports HomePage's logout) */}
      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        className="rounded-lg border border-border-input px-4 py-2 text-[13px] text-text-secondary
                   whitespace-nowrap transition-colors hover:bg-white/5 hover:text-text-strong
                   disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loggingOut ? 'Signing out…' : 'Log out'}
      </button>

      {/* Profile (initials from /me when available) */}
      <button
        type="button"
        title="Account"
        onClick={() => navigate('/account')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border
                   border-accent/40 bg-accent/[0.18] font-mono text-[12px] font-medium
                   tracking-[0.04em] text-accent transition-colors hover:bg-accent/[0.28]"
      >
        {initials}
      </button>
    </header>
  );
}
