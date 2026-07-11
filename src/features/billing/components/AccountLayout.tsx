import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { logout, useMe } from '@/features/auth';

/**
 * Shared account-area shell — header (BrandMark + "Go to dashboard") + left nav + sign-out —
 * extracted from AccountPage so `/account` and `/account/billing-history` render one sidebar
 * with active-route highlighting driven by the current path. Renders `children` as the main
 * content. Kept inside the `billing` feature (both consumers live here); not barrel-exported.
 */

const NAV: { label: string; path: string }[] = [
  { label: 'Account', path: '/account' },
  { label: 'Billing history', path: '/account/billing-history' },
];
const DISABLED_NAV = ['Security', 'Settings'];

export function AccountLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const me = useMe();

  const hasAccess = me.data ? me.data.accessState !== 'EXPIRED' : false;

  const [loggingOut, setLoggingOut] = useState(false);
  async function onSignOut() {
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-text-secondary">
      {/* ===== Top bar ===== */}
      <header className="flex flex-none items-center justify-between border-b border-border-subtle px-6 py-[14px]">
        <BrandMark />
        {hasAccess && (
          <Button
            variant="primary"
            fullWidth={false}
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 !py-3"
          >
            Go to dashboard
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-none"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ===== Left nav ===== */}
        <nav className="flex w-56 flex-none flex-col gap-[2px] border-r border-border-subtle py-5">
          {NAV.map(({ label, path }) => {
            const active = pathname === path;
            return (
              <button
                key={path}
                type="button"
                onClick={() => !active && navigate(path)}
                className={
                  active
                    ? 'flex items-center border-l-2 border-accent bg-accent/[0.08] py-[11px] pl-5 pr-[22px] text-left text-[14px] font-medium text-text'
                    : 'flex cursor-pointer items-center border-l-2 border-transparent py-[11px] pl-5 pr-[22px] text-left text-[14px] text-text-muted transition-colors hover:text-text'
                }
              >
                {label}
              </button>
            );
          })}
          {DISABLED_NAV.map((label) => (
            <div
              key={label}
              className="flex cursor-not-allowed items-center border-l-2 border-transparent py-[11px] pl-5 pr-[22px]
                         text-[14px] text-text-muted opacity-60"
            >
              {label}
            </div>
          ))}
          <div className="flex-1" />
          <div className="mt-2 border-t border-border-subtle px-[22px] pt-2">
            <button
              type="button"
              onClick={onSignOut}
              disabled={loggingOut}
              className="flex items-center gap-[9px] border-l-2 border-transparent py-[11px] pl-5 text-[14px]
                         text-danger/70 transition-colors hover:text-danger disabled:cursor-not-allowed
                         disabled:opacity-50"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-none"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </nav>

        {/* ===== Main content ===== */}
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
