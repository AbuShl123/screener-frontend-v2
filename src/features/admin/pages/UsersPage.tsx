import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { formatDate, fmtRelative } from '@/lib/i18n';
import type { AdminUser } from '../schemas';
import { useAdminUsers } from '../queries';
import { AccountLayout } from '@/features/billing';
import { ACCESS_STATE_COLOR, PAGE_SIZES } from '../usersView';
import { fmtCount } from '../usageChart';
import { GiftAccessModal } from '../components/GiftAccessModal';

/**
 * Users directory (`/account/users`, ADMIN-only) — server-paginated over `GET /api/admin/users`,
 * with Role/Status checkboxes that filter the CURRENTLY-LOADED page client-side (locked decision
 * 3: the API has no server-side search/filter). Filter counts and results are therefore
 * page-scoped, which the "showing N on this page" caption keeps honest.
 *
 * Selection is keyed by user id and kept page-local (cleared on page/size/filter change) so there
 * are never invisible selected rows on other pages — the gift modal shows exactly the selected
 * names as chips. The gift flow bulk-grants free days; on success the users query is invalidated
 * so rows reflect the new `accessExpiresAt`.
 */

type RoleKey = 'USER' | 'ADMIN';
type StatusKey = 'active' | 'inactive';

const isActive = (u: AdminUser) => u.emailVerified && u.enabled;

export function UsersPage() {
  const { t } = useTranslation('admin');
  const [page, setPage] = useState(1); // 1-based in the UI, 0-based to the API
  const [size, setSize] = useState(20);
  const [roles, setRoles] = useState<Record<RoleKey, boolean>>({ USER: true, ADMIN: false });
  const [statuses, setStatuses] = useState<Record<StatusKey, boolean>>({ active: true, inactive: false });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftBanner, setGiftBanner] = useState<{ days: number; count: number } | null>(null);

  const query = useAdminUsers(page - 1, size);
  const all = query.data?.users ?? [];
  const totalElements = query.data?.totalElements ?? 0;
  const totalPages = Math.max(1, query.data?.totalPages ?? 1);

  // Client-side filters over the loaded page (counts are page-scoped by design).
  const rows = all.filter(
    (u) =>
      roles[u.role] &&
      ((isActive(u) && statuses.active) || (!isActive(u) && statuses.inactive)),
  );
  const roleCount = (r: RoleKey) => all.filter((u) => u.role === r).length;
  const statusCount = (active: boolean) => all.filter((u) => isActive(u) === active).length;

  const selectedRows = rows.filter((u) => selected[u.id]);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  // Any filter/page/size change clears selection (a changed row set makes stale selection confusing).
  const resetSelection = () => setSelected({});
  const toggleRole = (r: RoleKey) => {
    setRoles((p) => ({ ...p, [r]: !p[r] }));
    resetSelection();
  };
  const toggleStatus = (k: StatusKey) => {
    setStatuses((p) => ({ ...p, [k]: !p[k] }));
    resetSelection();
  };
  const toggleRow = (id: string) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const onSelectAll = () => {
    if (allSelected) return setSelected({});
    const next: Record<string, boolean> = {};
    rows.forEach((u) => (next[u.id] = true));
    setSelected(next);
  };
  const goToPage = (next: number) => {
    setPage(Math.min(totalPages, Math.max(1, next)));
    resetSelection();
  };
  const changeSize = (s: number) => {
    setSize(s);
    setPage(1);
    resetSelection();
  };

  const forbidden = query.error instanceof ApiError && query.error.status === 403;

  return (
    <AccountLayout>
      <div className="max-w-[1340px] p-10">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[27px] font-semibold tracking-[-0.01em] text-text">{t('users.title')}</div>
            <div className="mt-2 font-mono text-[12px] text-text-dim">
              {t('users.caption', { total: fmtCount(totalElements), shown: rows.length })}
            </div>
          </div>
        </div>

        {forbidden ? (
          <ForbiddenNote />
        ) : (
          <>
            {/* Gift-done banner */}
            {giftBanner && (
              <div className="mt-[22px] flex items-center gap-3">
                <div className="min-w-0 flex-1 rounded-[8px] border border-[color-mix(in_oklab,var(--color-accent)_38%,transparent)] bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)] px-[14px] py-[13px] text-[14px] leading-[1.5] text-accent">
                  {t('gift.success', {
                    days: giftBanner.days,
                    count: giftBanner.count,
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setGiftBanner(null)}
                  className="flex-none rounded-[8px] border border-border-input bg-transparent px-[14px] py-[11px] font-sans text-[13px]
                             leading-none text-text-muted outline-none transition-colors hover:text-text"
                >
                  {t('gift.dismiss')}
                </button>
              </div>
            )}

            {/* Filter bar */}
            <div className="mt-6 flex flex-wrap items-start gap-8 rounded-[10px] border border-border bg-input px-5 py-[18px]">
              <FilterGroup label={t('users.filter.role')}>
                <FilterCheck on={roles.USER} label={t('users.filter.user')} count={roleCount('USER')} onClick={() => toggleRole('USER')} />
                <FilterCheck on={roles.ADMIN} label={t('users.filter.admin')} count={roleCount('ADMIN')} onClick={() => toggleRole('ADMIN')} />
              </FilterGroup>

              <div className="w-px self-stretch bg-border-subtle" />

              <FilterGroup label={t('users.filter.status')}>
                <FilterCheck on={statuses.active} label={t('users.filter.active')} count={statusCount(true)} onClick={() => toggleStatus('active')} />
                <FilterCheck on={statuses.inactive} label={t('users.filter.inactive')} count={statusCount(false)} onClick={() => toggleStatus('inactive')} />
              </FilterGroup>

              <div className="flex min-w-[120px] flex-1 items-center justify-end">
                <span className="font-mono text-[11px] text-text-dim">{t('users.filter.activeHint')}</span>
              </div>
            </div>

            {/* Selection + gift action */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onSelectAll}
                className="rounded-[8px] border border-border-input bg-transparent px-[15px] py-[11px] font-sans text-[13px] font-medium
                           leading-none text-text-secondary outline-none transition-colors
                           hover:bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)] hover:text-text"
              >
                {allSelected ? t('users.clearSelection') : t('users.selectAll')}
              </button>
              <span
                className="font-mono text-[12px] uppercase tracking-[0.04em]"
                style={{ color: selectedRows.length > 0 ? 'var(--color-accent)' : 'var(--color-text-dim)' }}
              >
                {selectedRows.length > 0 ? t('users.selected', { count: selectedRows.length }) : t('users.noneSelected')}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => selectedRows.length > 0 && setGiftOpen(true)}
                disabled={selectedRows.length === 0}
                className="inline-flex items-center gap-2 rounded-[8px] border border-accent bg-accent px-[18px] py-[13px]
                           font-sans text-[14px] font-semibold leading-none text-accent-ink outline-none transition-[filter]
                           duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
              >
                <GiftIcon />
                {t('users.giftAccess')}
              </button>
            </div>

            {/* Table */}
            <div className="mt-[14px] overflow-hidden rounded-[10px] border border-border">
              <div className="grid grid-cols-[44px_1.25fr_1.5fr_84px_190px_170px] items-center gap-[18px] border-b border-border-subtle bg-input px-4 py-[13px]">
                <div onClick={onSelectAll} className="flex cursor-pointer justify-start">
                  <Check on={allSelected} />
                </div>
                <HeadCell>{t('users.col.name')}</HeadCell>
                <HeadCell>{t('users.col.email')}</HeadCell>
                <HeadCell>{t('users.col.role')}</HeadCell>
                <HeadCell>{t('users.col.expires')}</HeadCell>
                <HeadCell className="text-right">{t('users.col.lastSeen')}</HeadCell>
              </div>

              {query.isLoading ? (
                <div className="px-4 py-11 text-center font-mono text-[12px] text-text-dim">{t('users.loading')}</div>
              ) : rows.length === 0 ? (
                <div className="px-4 py-11 text-center font-mono text-[12px] text-text-dim">{t('users.empty')}</div>
              ) : (
                rows.map((u) => (
                  <UserRow key={u.id} user={u} selected={!!selected[u.id]} onToggle={() => toggleRow(u.id)} />
                ))
              )}

              {/* Pagination footer */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-input px-4 py-[13px]">
                <div className="flex items-center gap-2 font-mono text-[11px] text-text-dim">
                  <span>{t('users.page', { page, total: totalPages })}</span>
                  <span className="text-text-muted">·</span>
                  <span>{t('users.size')}</span>
                  <select
                    value={size}
                    onChange={(e) => changeSize(Number(e.target.value))}
                    className="cursor-pointer rounded-[6px] border border-border-input bg-bg px-2 py-1 font-mono text-[11px] text-text-secondary outline-none"
                  >
                    {PAGE_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <span className="text-text-muted">·</span>
                  <span>{t('users.total', { count: totalElements })}</span>
                </div>
                <div className="flex gap-[6px]">
                  <PagerButton disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                    {t('users.prev')}
                  </PagerButton>
                  <PagerButton disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                    {t('users.next')}
                  </PagerButton>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {giftOpen && (
        <GiftAccessModal
          recipients={selectedRows.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))}
          onClose={() => setGiftOpen(false)}
          onGifted={(result, days) => {
            setGiftOpen(false);
            setSelected({});
            setGiftBanner({ days, count: result.updatedCount });
          }}
        />
      )}
    </AccountLayout>
  );
}

// ── Row ──

function UserRow({ user, selected, onToggle }: { user: AdminUser; selected: boolean; onToggle: () => void }) {
  const { t } = useTranslation('admin');
  const active = isActive(user);
  const stateColor = ACCESS_STATE_COLOR[user.accessState];
  const statusTitle = active
    ? t('users.status.activeTitle')
    : user.emailVerified
      ? t('users.status.disabledTitle')
      : t('users.status.unverifiedTitle');

  return (
    <div
      onClick={onToggle}
      className="grid cursor-pointer grid-cols-[44px_1.25fr_1.5fr_84px_190px_170px] items-center gap-[18px] border-b
                 border-l-2 border-border-subtle px-4 py-[14px] transition-colors hover:bg-white/[0.02]"
      style={{
        borderLeftColor: selected ? 'var(--color-accent)' : 'transparent',
        background: selected ? 'color-mix(in oklab, var(--color-accent) 7%, transparent)' : 'transparent',
      }}
    >
      <div className="flex justify-start">
        <Check on={selected} />
      </div>
      <div className="flex min-w-0 items-center gap-[9px]">
        <span
          className="h-[7px] w-[7px] flex-none rounded-full"
          style={{ background: active ? 'var(--color-bid)' : 'var(--color-text-dim)' }}
          title={statusTitle}
        />
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-medium text-text">
          {user.firstName} {user.lastName}
        </span>
      </div>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] text-text-secondary">
        {user.email}
      </span>
      <span
        className="font-mono text-[11px] uppercase tracking-[0.06em]"
        style={{ color: user.role === 'ADMIN' ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
      >
        {user.role}
      </span>
      <div className="flex min-w-0 items-center gap-[9px]">
        {user.accessState !== 'ADMIN' && (
          <span
            className="inline-flex w-[74px] flex-none justify-center whitespace-nowrap rounded-[4px] border px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.06em]"
            style={{
              color: stateColor,
              background: `color-mix(in oklab, ${stateColor} 12%, transparent)`,
              borderColor: `color-mix(in oklab, ${stateColor} 35%, transparent)`,
            }}
          >
            {t(`users.state.${user.accessState}`)}
          </span>
        )}
        <span className="whitespace-nowrap font-mono text-[12px] text-text-strong">
          {user.role === 'ADMIN' || !user.accessExpiresAt ? '—' : formatDate(user.accessExpiresAt)}
        </span>
      </div>
      <span
        className="whitespace-nowrap text-right font-mono text-[12px]"
        style={{ color: user.lastSeenAt ? 'var(--color-text-secondary)' : 'var(--color-text-dim)' }}
      >
        {user.lastSeenAt ? fmtRelative(user.lastSeenAt) : t('users.never')}
      </span>
    </div>
  );
}

// ── Small pieces ──

function Check({ on }: { on: boolean }) {
  return (
    <span
      className="flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border font-mono text-[11px] leading-none text-bg"
      style={{
        borderColor: on ? 'var(--color-accent)' : 'var(--color-border-input)',
        background: on ? 'var(--color-accent)' : 'transparent',
      }}
    >
      {on ? '✓' : ''}
    </span>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[11px]">
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">{label}</span>
      <div className="flex gap-[18px]">{children}</div>
    </div>
  );
}

function FilterCheck({ on, label, count, onClick }: { on: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <div onClick={onClick} className="flex cursor-pointer items-center gap-[9px]">
      <Check on={on} />
      <span
        className="font-mono text-[12px] uppercase tracking-[0.04em]"
        style={{ color: on ? 'var(--color-text)' : 'var(--color-text-muted)' }}
      >
        {label}
      </span>
      <span className="font-mono text-[11px] text-text-dim">{fmtCount(count)}</span>
    </div>
  );
}

function HeadCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted ${className}`}>
      {children}
    </span>
  );
}

function PagerButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[8px] border border-border-input bg-transparent px-[13px] py-[9px] font-mono text-[12px] leading-none
                 outline-none transition-colors enabled:hover:text-text disabled:cursor-not-allowed"
      style={{ color: disabled ? 'var(--color-text-dim)' : 'var(--color-text-secondary)' }}
    >
      {children}
    </button>
  );
}

function ForbiddenNote() {
  const { t } = useTranslation('admin');
  return (
    <div className="mt-8 rounded-[10px] border border-border bg-input px-6 py-8 text-center">
      <div className="text-[15px] font-semibold text-text">{t('forbidden.title')}</div>
      <div className="mt-2 text-[13px] text-text-secondary">{t('forbidden.body')}</div>
    </div>
  );
}

function GiftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}
