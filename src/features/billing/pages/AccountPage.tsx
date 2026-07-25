import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { ParseKeys } from 'i18next';
import { Button } from '@/components/Button';
import { useMe, type UserProfile } from '@/features/auth';
import { buildPlanViews } from '../catalog';
import { AccountLayout } from '../components/AccountLayout';
import { fmtDate } from '../historyView';
import { useCancelOrder, useLatestOrder, usePlans } from '../queries';
import type { OrderDetails } from '../schemas';

type BillingKey = ParseKeys<'billing'>;

const CURRENCY = 'UZS';
const DAY_MS = 86_400_000;
const RENEWAL_WINDOW_DAYS = 5; // ≤ this many days left → the "renew" CTA opens (monetization §4.3)
const groupFmt = new Intl.NumberFormat('en-US');

const HERO = {
  bid: 'var(--color-bid)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
} as const;

/** Whole days remaining until `iso` (rounded up, floored at 0). */
function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS));
}

const clampPct = (frac: number) => Math.round(Math.min(1, Math.max(0, frac)) * 100);

interface AccessView {
  heroVar: string;
  pillKey: BillingKey;
  statusKey: BillingKey;
  date?: string; // pre-formatted (localized) date, interpolated into `statusKey` when present
  daysNoteKey: BillingKey;
  daysLeft?: number; // count for the pluralized days-left note (undefined for admin's static note)
  meterPct: number;
  subKey: BillingKey;
  primaryKey: BillingKey | null; // null → no CTA (covered / admin)
  footnoteKey: BillingKey;
}

/**
 * Map the `/me` access fields onto the Screener-access card's view model, mirroring the
 * design template's four states plus ADMIN (locked decision: "Admin · Unlimited"):
 *  - ADMIN   → unlimited, full meter, no CTA
 *  - TRIAL   → always "Subscribe" (no renewal-window gating)
 *  - ACTIVE  → "Renew access" once ≤ 5 days remain, otherwise covered (no CTA)
 *  - EXPIRED → "Choose a plan"
 * Every CTA routes to /billing/plans; the meter is a best-effort proportion (7-day trial
 * window, 30-day reference for paid) since /me carries no original grant duration.
 *
 * i18n (§6.2): stays free of `t()` — it emits KEYS + the (localized) date/day-count values;
 * `AccessCard` resolves them at render. The date goes through `fmtDate` (localized, §6.4);
 * the day count is a fixed number fed to the plural note.
 */
function buildAccessView(profile: UserProfile): AccessView {
  const { accessState, accessExpiresAt } = profile;
  const date = accessExpiresAt ? fmtDate(accessExpiresAt) : undefined;

  if (accessState === 'ADMIN') {
    return {
      heroVar: HERO.bid,
      pillKey: 'account.access.admin.pill',
      statusKey: 'account.access.admin.status',
      daysNoteKey: 'account.access.admin.days',
      meterPct: 100,
      subKey: 'account.access.admin.sub',
      primaryKey: null,
      footnoteKey: 'account.access.admin.footnote',
    };
  }

  if (accessState === 'TRIAL') {
    const left = accessExpiresAt ? daysUntil(accessExpiresAt) : 0;
    return {
      heroVar: HERO.warning,
      pillKey: 'account.access.trial.pill',
      statusKey: date ? 'account.access.trial.statusUntil' : 'account.access.trial.status',
      date,
      daysNoteKey: 'account.access.daysLeft',
      daysLeft: left,
      meterPct: clampPct(left / 7),
      subKey: 'account.access.trial.sub',
      primaryKey: 'account.access.trial.primary',
      footnoteKey: 'account.access.trial.footnote',
    };
  }

  if (accessState === 'ACTIVE') {
    const left = accessExpiresAt ? daysUntil(accessExpiresAt) : 0;
    const renewing = left <= RENEWAL_WINDOW_DAYS;
    return {
      heroVar: renewing ? HERO.warning : HERO.bid,
      pillKey: 'account.access.active.pill',
      statusKey: date ? 'account.access.active.statusUntil' : 'account.access.active.status',
      date,
      daysNoteKey: 'account.access.daysLeft',
      daysLeft: left,
      meterPct: clampPct(left / 30),
      subKey: renewing ? 'account.access.active.subRenewing' : 'account.access.active.subCovered',
      primaryKey: renewing ? 'account.access.active.primary' : null,
      footnoteKey: renewing
        ? 'account.access.active.footnoteRenewing'
        : 'account.access.active.footnoteCovered',
    };
  }

  // EXPIRED
  return {
    heroVar: HERO.danger,
    pillKey: 'account.access.expired.pill',
    statusKey: date ? 'account.access.expired.statusEnded' : 'account.access.expired.status',
    date,
    daysNoteKey: 'account.access.daysLeft',
    daysLeft: 0,
    meterPct: 0,
    subKey: 'account.access.expired.sub',
    primaryKey: 'account.access.expired.primary',
    footnoteKey: 'account.access.expired.footnote',
  };
}

/**
 * Account / Profile page (`/account`, behind ProtectedRoute), from the "User Profile Account
 * Page" design template. Composes four surfaces over `/me` + `orders/current` + the plan
 * catalog:
 *  1. Unpaid-invoice banner — shown when `orders/current` is `PENDING`; retry (→ checkoutUrl),
 *     choose another plan (→ /billing/plans), or cancel (`orders/current/cancel`).
 *  2. Screener-access card — access state / expiry / renew|subscribe CTA (see `buildAccessView`).
 *  3. Account info — email, name, role, and registered date.
 *  4. Pay-by-days mini editor — a compact version of PayByDaysPage that hands the entered amount
 *     to the Payment Method page.
 */
export function AccountPage() {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();
  const me = useMe();
  const profile = me.data;
  const { data: order } = useLatestOrder();
  const { data: plansData } = usePlans();
  const cancelOrder = useCancelOrder();

  const accessView = profile ? buildAccessView(profile) : null;
  const pendingOrder = order?.status === 'PENDING' ? order : null;
  const pendingPlan = pendingOrder
    ? buildPlanViews(plansData).find((p) => p.code === pendingOrder.planCode)
    : undefined;
  const pendingPlanName = pendingOrder
    ? pendingPlan
      ? t(pendingPlan.nameKey)
      : pendingOrder.planCode
    : '';

  return (
    <AccountLayout>
      <div className="flex max-w-[1100px] flex-wrap items-start gap-6 p-10">
        {/* Left column */}
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-5">
          {pendingOrder && (
            <UnpaidInvoiceCard
              order={pendingOrder}
              planName={pendingPlanName}
              cancelling={cancelOrder.isPending}
              onRetry={() => {
                if (pendingOrder.checkoutUrl) window.location.assign(pendingOrder.checkoutUrl);
                else navigate('/billing/plans');
              }}
              onChoosePlan={() => navigate('/billing/plans')}
              onCancel={() => cancelOrder.mutate()}
            />
          )}

          {accessView && (
            <AccessCard view={accessView} onPrimary={() => navigate('/billing/plans')} />
          )}

          <AccountInfoCard
            email={profile?.email ?? '—'}
            fullName={profile ? `${profile.firstName} ${profile.lastName}` : '—'}
            role={profile?.role ?? '—'}
            registeredAt={profile?.registeredAt}
          />
        </div>

        {/* Right column */}
        <PayByDaysCard plansData={plansData} />
      </div>
    </AccountLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Unpaid invoice
// ─────────────────────────────────────────────────────────────────────────────

interface UnpaidInvoiceCardProps {
  order: OrderDetails;
  planName: string;
  cancelling: boolean;
  onRetry: () => void;
  onChoosePlan: () => void;
  onCancel: () => void;
}

function UnpaidInvoiceCard({
  order,
  planName,
  cancelling,
  onRetry,
  onChoosePlan,
  onCancel,
}: UnpaidInvoiceCardProps) {
  const { t } = useTranslation('billing');
  const days = Math.round(order.accessDurationSeconds / 86_400);
  const durationLabel = t('plans.dayCount', { count: days });

  return (
    <div className="rounded-[10px] border border-[color-mix(in_oklab,var(--color-danger)_38%,transparent)] bg-surface px-[22px] py-5">
      <div className="flex items-center gap-[10px]">
        <span className="h-[7px] w-[7px] flex-none rounded-full bg-danger" />
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-danger">
          {t('account.unpaidInvoice.label')}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-[10px]">
        <span className="text-[16px] font-semibold text-text">
          {planName} &mdash; {durationLabel}
        </span>
        <span className="font-mono text-[14px] text-text-strong">
          {groupFmt.format(order.amount)} {CURRENCY}
        </span>
        <span className="font-mono text-[12px] text-text-dim">
          {t('account.unpaidInvoice.issued', {
            date: fmtDate(order.createdAt),
            ref: order.orderId.slice(0, 8),
          })}
        </span>
      </div>

      <p className="mt-[6px] max-w-[480px] text-[13px] leading-[1.6] text-text-secondary">
        {t('account.unpaidInvoice.body')}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-[8px] border border-danger bg-danger px-4 py-[10px] text-[14px] font-medium
                     leading-none text-bg transition-[filter] duration-150 hover:brightness-110"
        >
          {t('account.unpaidInvoice.retry')}
        </button>
        <button
          type="button"
          onClick={onChoosePlan}
          className="rounded-[8px] border border-[color-mix(in_oklab,var(--color-danger)_55%,transparent)]
                     bg-transparent px-4 py-[10px] text-[14px] font-medium leading-none text-danger
                     transition-colors duration-150 hover:bg-danger/10"
        >
          {t('account.unpaidInvoice.choosePlan')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="rounded-[8px] border border-transparent bg-transparent px-4 py-[10px] text-[14px]
                     font-medium leading-none text-text-muted transition-colors duration-150
                     hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cancelling ? t('account.unpaidInvoice.cancelling') : t('account.unpaidInvoice.cancel')}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screener access
// ─────────────────────────────────────────────────────────────────────────────

function AccessCard({ view, onPrimary }: { view: AccessView; onPrimary: () => void }) {
  const { t } = useTranslation('billing');
  const daysNote =
    view.daysLeft != null ? t(view.daysNoteKey, { count: view.daysLeft }) : t(view.daysNoteKey);
  return (
    <div className="rounded-[14px] border border-border bg-surface p-7 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
          {t('account.access.label')}
        </span>
        <span
          className="inline-flex items-center gap-[7px] rounded-full border px-3 py-[5px] font-mono text-[11px]
                     uppercase tracking-[0.08em]"
          style={{
            color: view.heroVar,
            borderColor: `color-mix(in oklab, ${view.heroVar} 35%, transparent)`,
            backgroundColor: `color-mix(in oklab, ${view.heroVar} 10%, transparent)`,
          }}
        >
          <span className="h-[6px] w-[6px] rounded-full" style={{ background: view.heroVar }} />
          {t(view.pillKey)}
        </span>
      </div>

      <div className="mt-5 text-[27px] font-semibold tracking-[-0.01em] text-text">
        {t(view.statusKey, view.date ? { date: view.date } : undefined)}
      </div>

      <div className="mt-[14px] flex items-center gap-[14px]">
        <span
          className="whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.08em]"
          style={{ color: view.heroVar }}
        >
          {daysNote}
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-[2px] bg-input">
          <div
            className="h-full rounded-[2px]"
            style={{ width: `${view.meterPct}%`, background: view.heroVar }}
          />
        </div>
      </div>

      <p className="mt-[14px] max-w-[520px] text-[14px] leading-[1.6] text-text-secondary">
        {t(view.subKey)}
      </p>

      <div className="mt-[22px] flex flex-wrap items-center gap-[14px] border-t border-border-subtle pt-5">
        {view.primaryKey && (
          <Button variant="primary" fullWidth={false} onClick={onPrimary}>
            {t(view.primaryKey)}
          </Button>
        )}
        <span className="font-mono text-[12px] text-text-dim">{t(view.footnoteKey)}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account info
// ─────────────────────────────────────────────────────────────────────────────

function AccountInfoCard({
  email,
  fullName,
  role,
  registeredAt,
}: {
  email: string;
  fullName: string;
  role: string;
  registeredAt: string | undefined;
}) {
  const { t } = useTranslation('billing');
  return (
    <div className="rounded-[10px] border border-border bg-input px-6 pb-[6px] pt-[22px]">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
        {t('account.info.title')}
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-[13px]">
        <span className="text-[14px] text-text-muted">{t('account.info.email')}</span>
        <span className="min-w-0 text-right font-mono text-[14px] text-text-strong [overflow-wrap:anywhere]">
          {email}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-[13px]">
        <span className="text-[14px] text-text-muted">{t('account.info.fullName')}</span>
        <span className="font-mono text-[14px] text-text-strong">{fullName}</span>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-[13px]">
        <span className="text-[14px] text-text-muted">{t('account.info.role')}</span>
        <span className="font-mono text-[14px] text-text-strong">{role}</span>
      </div>
      <div className="flex items-center justify-between gap-4 py-[13px]">
        <span className="text-[14px] text-text-muted">{t('account.info.registered')}</span>
        <span className="font-mono text-[14px] text-text-strong">
          {registeredAt ? fmtDate(registeredAt) : '—'}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pay by days (mini)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compact pay-as-you-go editor — the mini sibling of PayByDaysPage. The day count is derived
 * client-side (`ceil(amount / pricePerDay)`, exactly what the template does); the authoritative
 * `pay-as-you-go/days` endpoint is re-checked downstream on the Payment Method page, so a mini
 * card doesn't need to spend a request per keystroke. "Top up" carries the amount to the payment
 * page via the same `?plan=pay_as_you_go&amount=N` contract PayByDaysPage uses.
 */
function PayByDaysCard({ plansData }: { plansData: Parameters<typeof buildPlanViews>[0] }) {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();
  const paygPlan = buildPlanViews(plansData).find((p) => p.code === 'pay_as_you_go');
  const pricePerDay = paygPlan?.amount ?? 10_000;

  const [amount, setAmount] = useState(50_000);
  const setClamped = (n: number) => setAmount(Math.max(0, Math.min(10_000_000, n)));

  const days = pricePerDay > 0 ? Math.ceil(amount / pricePerDay) : 0;
  const amountStr = amount > 0 ? groupFmt.format(amount) : '';

  return (
    <div
      className="flex-[1_1_320px] max-w-[360px] rounded-[14px] border
                 border-[color-mix(in_oklab,var(--color-warning)_45%,transparent)] bg-surface p-6
                 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
          {t('account.payByDays.label')}
        </span>
        <span
          className="rounded-[4px] border border-[color-mix(in_oklab,var(--color-warning)_35%,transparent)]
                     bg-[color-mix(in_oklab,var(--color-warning)_12%,transparent)] px-[10px] py-1 font-mono
                     text-[10px] uppercase tracking-[0.08em] text-warning"
        >
          {t('account.payByDays.flexible')}
        </span>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-mono text-[30px] font-semibold text-text">
          {groupFmt.format(pricePerDay)}
        </span>
        <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-text-muted">
          {t('account.payByDays.perDayUnit', { currency: CURRENCY })}
        </span>
      </div>

      <p className="mt-[10px] text-[13px] leading-[1.6] text-text-secondary">
        {t('account.payByDays.body')}
      </p>

      <div className="mt-8 flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => setClamped((Math.ceil(amount / pricePerDay) - 1) * pricePerDay)}
          className="w-11 flex-none rounded-[8px] border border-border-input bg-input font-mono text-[18px]
                     leading-none text-text-strong outline-none transition-colors
                     hover:bg-[color-mix(in_oklab,var(--color-warning)_10%,var(--color-input))]"
        >
          −
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-border-input bg-input px-[14px]">
          <input
            value={amountStr}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, '');
              setClamped(digits ? parseInt(digits, 10) : 0);
            }}
            inputMode="numeric"
            autoComplete="off"
            className="min-w-0 flex-1 border-none bg-transparent py-[13px] text-right font-mono text-[16px]
                       font-semibold text-text outline-none"
          />
          <span className="flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
            {CURRENCY}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setClamped((Math.floor(amount / pricePerDay) + 1) * pricePerDay)}
          className="w-11 flex-none rounded-[8px] border border-border-input bg-input font-mono text-[18px]
                     leading-none text-text-strong outline-none transition-colors
                     hover:bg-[color-mix(in_oklab,var(--color-warning)_10%,var(--color-input))]"
        >
          +
        </button>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border-subtle pt-[14px]">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
          {t('account.payByDays.ratio', {
            amount: groupFmt.format(amount),
            price: groupFmt.format(pricePerDay),
          })}
        </span>
        <span className="font-mono text-[18px] font-semibold text-warning">
          {t('account.payByDays.resultDays', { count: days })}
        </span>
      </div>

      <button
        type="button"
        onClick={() => navigate(`/billing/payment?plan=pay_as_you_go&amount=${amount}`)}
        disabled={days < 1}
        className="mt-[14px] w-full rounded-[8px] border border-warning bg-warning px-4 py-[14px] font-sans
                   text-[15px] font-semibold leading-none text-bg transition-[filter] duration-150
                   hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40
                   disabled:hover:brightness-100"
      >
        {days > 0 ? t('account.payByDays.topUp', { count: days }) : t('account.payByDays.enterAmount')}
      </button>

      <div className="mt-3 text-center font-mono text-[11px] text-text-dim">
        {t('account.payByDays.footnote')}
      </div>
    </div>
  );
}
