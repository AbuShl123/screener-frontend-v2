import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ParseKeys } from 'i18next';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { logout, useMe } from '@/features/auth';
import { useUsersTotal } from '@/features/admin';

/**
 * Shared account-area shell — header (BrandMark + "Go to dashboard") + left nav + sign-out —
 * extracted from AccountPage so `/account` and `/account/billing-history` render one sidebar
 * with active-route highlighting driven by the current path. Renders `children` as the main
 * content. Kept inside the `billing` feature (both consumers live here); not barrel-exported.
 */

const NAV: { labelKey: ParseKeys<'billing'>; path: string }[] = [
  { labelKey: 'accountNav.account', path: '/account' },
  { labelKey: 'accountNav.billingHistory', path: '/account/billing-history' },
  { labelKey: 'accountNav.settings', path: '/account/settings' },
];
const DISABLED_NAV: ParseKeys<'billing'>[] = ['accountNav.security'];

/**
 * Nav item frame. From `md` up it's the original left rail item (accent bar on the LEFT,
 * `pl-5 pr-[22px]`); below `md` the rail becomes a horizontal strip above the content
 * and each item is a tab (accent bar at the BOTTOM, `px-4`, kept on one line). Color and
 * state classes are added per item.
 */
const NAV_ITEM =
  'flex shrink-0 items-center whitespace-nowrap border-b-2 px-4 py-[11px] text-left text-[14px] ' +
  'md:shrink md:whitespace-normal md:border-b-0 md:border-l-2 md:pl-5 md:pr-[22px]';

export function AccountLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation('billing');
  const { t: tAdmin } = useTranslation('admin');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const me = useMe();
  const isAdmin = me.data?.role === 'ADMIN';
  const usersTotal = useUsersTotal(isAdmin); // gated: only fetched for admins (plan §4b)

  const hasAccess = me.data ? me.data.accessState !== 'EXPIRED' : false;

  const [loggingOut, setLoggingOut] = useState(false);
  async function onSignOut() {
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen flex-col bg-bg font-sans text-text-secondary">
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
            {t('accountNav.goDashboard')}
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

      {/* Below `md` the left nav moves above the content as a horizontal strip (scrollable
          if it doesn't fit), so the content gets the full width. `md`+ is the original layout. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* ===== Left nav ===== */}
        <nav
          className="flex flex-none gap-[2px] overflow-x-auto border-b border-border-subtle px-2
                     md:w-56 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:px-0 md:py-5"
        >
          {NAV.map(({ labelKey, path }) => {
            const active = pathname === path;
            return (
              <button
                key={path}
                type="button"
                onClick={() => !active && navigate(path)}
                className={`${NAV_ITEM} ${
                  active
                    ? 'border-accent bg-accent/[0.08] font-medium text-text'
                    : 'cursor-pointer border-transparent text-text-muted transition-colors hover:text-text'
                }`}
              >
                {t(labelKey)}
              </button>
            );
          })}
          {DISABLED_NAV.map((labelKey) => (
            <div
              key={labelKey}
              className={`${NAV_ITEM} cursor-not-allowed border-transparent text-text-muted opacity-60`}
            >
              {t(labelKey)}
            </div>
          ))}

          {/* ADMIN nav block — role-gated (plan §4). "Account" above stays the profile for
              everyone; these are distinct nav items, matching the design's navAdmin. */}
          {isAdmin && (
            <div
              className="flex flex-none items-center gap-[2px] border-l border-border-subtle pl-2
                         md:mt-[18px] md:flex-initial md:flex-col md:items-stretch md:border-t md:border-l-0 md:pl-0 md:pt-4"
            >
              <div className="px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-text-dim md:px-[22px] md:pb-2">
                {tAdmin('nav.admin')}
              </div>
              {[
                { label: tAdmin('nav.analytics'), path: '/account/analytics', meta: '' },
                {
                  label: tAdmin('nav.users'),
                  path: '/account/users',
                  meta: usersTotal.data != null ? usersTotal.data.toLocaleString('en-US') : '',
                },
              ].map(({ label, path, meta }) => {
                const active = pathname === path;
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => !active && navigate(path)}
                    className={`${NAV_ITEM} justify-between gap-[10px] ${
                      active
                        ? 'border-accent bg-accent/[0.08] font-medium text-text'
                        : 'cursor-pointer border-transparent text-text-muted transition-colors hover:text-text'
                    }`}
                  >
                    <span>{label}</span>
                    {meta && <span className="font-mono text-[11px] text-text-dim">{meta}</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex-1" />
          <div className="flex-none border-border-subtle md:mt-2 md:flex-initial md:border-t md:px-[22px] md:pt-2">
            <button
              type="button"
              onClick={onSignOut}
              disabled={loggingOut}
              className="flex shrink-0 items-center gap-[9px] whitespace-nowrap border-b-2 border-transparent px-4
                         py-[11px] text-[14px] text-danger/70 transition-colors hover:text-danger
                         disabled:cursor-not-allowed disabled:opacity-50
                         md:whitespace-normal md:border-b-0 md:border-l-2 md:pl-5 md:pr-0"
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
              {loggingOut ? t('accountNav.signingOut') : t('accountNav.signOut')}
            </button>
          </div>
        </nav>

        {/* ===== Main content ===== */}
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
