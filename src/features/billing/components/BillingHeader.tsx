import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { logout, useMe } from '@/features/auth';

/**
 * Slim chrome header shared by the billing funnel pages (Choose Plan + Pay by Days),
 * per both design templates: brand left; email + divider + Sign out right. Deliberately
 * presentation-light — it is not the dashboard's functional header.
 *
 * `/me` is read for the email but never blocked on: if the profile hasn't resolved (or
 * failed), the slot is simply blank. Sign out mirrors `DashboardHeader.onLogout` — a
 * best-effort logout that always clears the session, then an explicit bounce to /login.
 */
export function BillingHeader() {
  const me = useMe();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function onSignOut() {
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="flex items-center justify-between border-b border-border-subtle px-10 py-[18px]">
      <BrandMark />
      <div className="flex items-center gap-[18px]">
        {me.data?.email && (
          <span className="font-mono text-[12px] text-text-muted">{me.data.email}</span>
        )}
        <span className="h-4 w-px bg-border-input" />
        <button
          type="button"
          onClick={onSignOut}
          disabled={loggingOut}
          className="font-mono text-[12px] uppercase tracking-[0.08em] text-text-dim transition-colors
                     hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </header>
  );
}
