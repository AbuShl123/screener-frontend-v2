import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Banner } from '@/components/Banner';
import { formatDate } from '@/lib/i18n';
import { useMe } from '@/features/auth';
import { BillingHeader } from '../components/BillingHeader';
import { buildPlanViews } from '../catalog';
import { usePlans } from '../queries';
import { usePaymentStatus } from '../usePaymentStatus';

const groupFmt = new Intl.NumberFormat('en-US'); // fixed-format numbers, never localized (§10.1)
// Date localizes (§6.4); "11 Jul 2026" (en) / "11 июл. 2026 г." (ru).
const fmtDate = (iso: string) => formatDate(iso, { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Payment Status (`/billing/status`, behind ProtectedRoute) — the Multicard `return_url`
 * landing page (plan Phase 3, design "Payment Status.dc.html"). It reconstructs the payment
 * outcome **purely by polling `orders/current`** (never trusting the browser return as proof
 * of payment) and renders the design's three states — confirming / success / failed — with
 * the failed state expanded into four distinct variants (timeout / declined / refunded /
 * notfound) per the API's terminal statuses.
 *
 * All the timing/polling lives in `usePaymentStatus`; this page is presentational: it maps
 * the resolved view model + live order/profile data onto the design's centered column.
 */
export function PaymentStatusPage() {
  const { t } = useTranslation('billing');
  const status = usePaymentStatus();
  const me = useMe();
  const { data: plansData } = usePlans();
  const navigate = useNavigate();

  const order = status.order;

  // Order-derived labels (graceful `—` while the first poll is still in flight during
  // `confirming`, when the well shows placeholders).
  const planView = order ? buildPlanViews(plansData).find((p) => p.code === order.planCode) : undefined;
  const planName = planView ? t(planView.nameKey) : (order?.planCode ?? '—');
  const amountLabel = order ? `${groupFmt.format(order.amount)} ${order.currency}` : '—';
  const reference = order?.orderId ?? '—';
  const durationDays = order ? Math.round(order.accessDurationSeconds / 86400) : null;
  const durationLabel =
    durationDays != null ? t('plans.dayCount', { count: durationDays }) : '—';
  const accessUntil = me.data?.accessExpiresAt ? fmtDate(me.data.accessExpiresAt) : null;
  const email = me.data?.email ?? t('paymentStatus.yourEmail');

  const rowSecondary = 'text-text-secondary';
  const rowStrong = 'text-text-strong';
  const rowMuted = 'text-text-muted';
  const rowBid = 'text-bid';

  // Row labels are shared across states (§6.2).
  const rk = {
    plan: t('paymentStatus.rows.plan'),
    paid: t('paymentStatus.rows.paid'),
    amount: t('paymentStatus.rows.amount'),
    accessUntil: t('paymentStatus.rows.accessUntil'),
    reference: t('paymentStatus.rows.reference'),
  };

  // Which content to render: the confirming screen until a resolution is revealed past the floor.
  const key = status.phase === 'result' && status.resolution ? status.resolution.kind : 'confirming';

  const view = ((): StateView => {
    switch (key) {
      case 'success':
        return {
          marker: <Ring tone="bid" glyph="✓" />,
          eyebrow: t('paymentStatus.success.eyebrow'),
          eyebrowCls: 'text-bid',
          title: accessUntil
            ? t('paymentStatus.success.titleUntil', { date: accessUntil })
            : t('paymentStatus.success.title'),
          subtitle: t('paymentStatus.success.subtitle'),
          showWell: true,
          wellLabel: t('paymentStatus.success.wellLabel'),
          pillLabel: t('paymentStatus.success.pill'),
          pillCls: 'bg-bid/15 text-bid',
          rows: [
            {
              k: rk.plan,
              v: t('paymentStatus.success.planValue', { plan: planName, duration: durationLabel }),
              cls: rowSecondary,
            },
            { k: rk.paid, v: amountLabel, cls: rowStrong },
            { k: rk.accessUntil, v: accessUntil ?? '—', cls: rowBid },
            { k: rk.reference, v: reference, cls: rowMuted },
          ],
          primary: { label: t('paymentStatus.success.primary'), onClick: () => navigate('/dashboard') },
          secondary: {
            label: t('paymentStatus.success.secondary'),
            onClick: () => navigate('/account/billing-history'),
          },
          footNote: t('paymentStatus.success.footNote', { email }),
          showProgress: false,
        };

      case 'timeout':
        return {
          marker: <Ring tone="warning" glyph="!" />,
          eyebrow: t('paymentStatus.timeout.eyebrow'),
          eyebrowCls: 'text-warning',
          title: t('paymentStatus.timeout.title'),
          subtitle: t('paymentStatus.timeout.subtitle'),
          banner: {
            variant: 'warning',
            text: t('paymentStatus.timeout.banner'),
          },
          showWell: true,
          wellLabel: t('paymentStatus.timeout.wellLabel'),
          pillLabel: t('paymentStatus.timeout.pill'),
          pillCls: 'bg-danger/15 text-danger',
          rows: [
            { k: rk.plan, v: planName, cls: rowSecondary },
            { k: rk.amount, v: amountLabel, cls: rowStrong },
            { k: rk.reference, v: reference, cls: rowMuted },
          ],
          // Locked decision 2: the timeout order is still resumable — reuse its checkoutUrl.
          primary: {
            label: t('paymentStatus.timeout.primary'),
            onClick: () =>
              order?.checkoutUrl ? window.location.assign(order.checkoutUrl) : navigate('/billing/plans'),
          },
          secondary: {
            label: t('paymentStatus.timeout.secondary'),
            onClick: () => navigate('/billing/plans'),
          },
          footNote: t('paymentStatus.timeout.footNote'),
          showProgress: false,
        };

      case 'declined':
        return {
          marker: <Ring tone="warning" glyph="!" />,
          eyebrow: t('paymentStatus.declined.eyebrow'),
          eyebrowCls: 'text-danger',
          title: t('paymentStatus.declined.title'),
          subtitle: t('paymentStatus.declined.subtitle'),
          banner: {
            variant: 'error',
            // `reasonDetail` is the raw provider/backend message, shown verbatim on purpose
            // (§6.5 intentional exception) — never translated; only the fallback gets a key.
            text: order?.reasonDetail ?? t('paymentStatus.declined.bannerFallback'),
          },
          showWell: true,
          wellLabel: t('paymentStatus.declined.wellLabel'),
          pillLabel: t('paymentStatus.declined.pill'),
          pillCls: 'bg-danger/15 text-danger',
          rows: [
            { k: rk.plan, v: planName, cls: rowSecondary },
            { k: rk.amount, v: amountLabel, cls: rowStrong },
            { k: rk.reference, v: reference, cls: rowMuted },
          ],
          // Terminal failure: start fresh rather than resume a dead order (locked decision 2).
          primary: { label: t('paymentStatus.declined.primary'), onClick: () => navigate('/billing/plans') },
          secondary: { label: t('paymentStatus.declined.secondary'), onClick: () => navigate('/dashboard') },
          footNote: t('paymentStatus.declined.footNote'),
          showProgress: false,
        };

      case 'refunded':
        return {
          marker: <Ring tone="warning" glyph="!" />,
          eyebrow: t('paymentStatus.refunded.eyebrow'),
          eyebrowCls: 'text-warning',
          title: t('paymentStatus.refunded.title'),
          subtitle: t('paymentStatus.refunded.subtitle'),
          banner: {
            variant: 'warning',
            // `reasonDetail` shown verbatim on purpose (§6.5 exception); only the fallback is keyed.
            text: order?.reasonDetail ?? t('paymentStatus.refunded.bannerFallback'),
          },
          showWell: true,
          wellLabel: t('paymentStatus.refunded.wellLabel'),
          pillLabel: t('paymentStatus.refunded.pill'),
          pillCls: 'bg-warning/15 text-warning',
          rows: [
            { k: rk.plan, v: planName, cls: rowSecondary },
            { k: rk.amount, v: amountLabel, cls: rowStrong },
            { k: rk.accessUntil, v: accessUntil ?? '—', cls: rowBid },
            { k: rk.reference, v: reference, cls: rowMuted },
          ],
          // Access is kept (monetization-api.md §3) — the primary sends the user back into the app.
          primary: { label: t('paymentStatus.refunded.primary'), onClick: () => navigate('/dashboard') },
          secondary: {
            label: t('paymentStatus.refunded.secondary'),
            onClick: () => navigate('/billing/plans'),
          },
          footNote: t('paymentStatus.refunded.footNote'),
          showProgress: false,
        };

      case 'notfound':
        return {
          marker: <Ring tone="warning" glyph="!" />,
          eyebrow: t('paymentStatus.notfound.eyebrow'),
          eyebrowCls: 'text-danger',
          title: t('paymentStatus.notfound.title'),
          subtitle: t('paymentStatus.notfound.subtitle'),
          banner: {
            variant: 'warning',
            text: t('paymentStatus.notfound.banner'),
          },
          // On a true 404 (no order at all) the well has nothing to show; hide it. An EXPIRED
          // order still carries data, so keep the well then.
          showWell: order !== null,
          wellLabel: t('paymentStatus.notfound.wellLabel'),
          pillLabel: t('paymentStatus.notfound.pill'),
          pillCls: 'bg-danger/15 text-danger',
          rows: [
            { k: rk.plan, v: planName, cls: rowSecondary },
            { k: rk.amount, v: amountLabel, cls: rowStrong },
            { k: rk.reference, v: reference, cls: rowMuted },
          ],
          primary: { label: t('paymentStatus.notfound.primary'), onClick: () => navigate('/billing/plans') },
          secondary: { label: t('paymentStatus.notfound.secondary'), onClick: () => navigate('/dashboard') },
          footNote: t('paymentStatus.notfound.footNote'),
          showProgress: false,
        };

      case 'confirming':
      default:
        return {
          marker: <Spinner />,
          eyebrow: t('paymentStatus.confirming.eyebrow'),
          eyebrowCls: 'text-accent',
          title: t('paymentStatus.confirming.title'),
          subtitle: t('paymentStatus.confirming.subtitle'),
          showWell: true,
          wellLabel: t('paymentStatus.confirming.wellLabel'),
          pillLabel: t('paymentStatus.confirming.pill'),
          pillCls: 'bg-warning/15 text-warning',
          rows: [
            { k: rk.plan, v: planName, cls: rowSecondary },
            { k: rk.amount, v: amountLabel, cls: rowStrong },
            { k: rk.reference, v: reference, cls: rowMuted },
          ],
          footNote: t('paymentStatus.confirming.footNote'),
          showProgress: true,
        };
    }
  })();

  const hasActions = !!(view.primary || view.secondary);

  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-text-secondary">
      <BillingHeader />

      <main className="flex w-full flex-1 items-center justify-center px-6 pb-[88px] pt-14">
        <div className="flex w-full max-w-[468px] flex-col">
          {/* Status marker */}
          <div className="mb-7 flex justify-center">{view.marker}</div>

          {/* Eyebrow + title + subtitle */}
          <div className="mb-[26px] text-center">
            <div className={`mb-[14px] font-mono text-[11px] uppercase tracking-[0.08em] ${view.eyebrowCls}`}>
              {view.eyebrow}
            </div>
            <h1 className="m-0 mb-[14px] text-balance text-[29px] font-semibold leading-[1.2] tracking-[-0.02em] text-text">
              {view.title}
            </h1>
            <p className="mx-auto max-w-[38ch] text-[15px] leading-[1.6] text-text-muted">{view.subtitle}</p>
          </div>

          {/* Confirming: creep/fast-forward progress bar */}
          {view.showProgress && (
            <div className="mb-[22px]">
              <div className="h-1 overflow-hidden rounded-full bg-input">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${status.progressPct}%`,
                    transition: `width ${status.progressTransitionMs}ms ${status.progressEasing}`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Failure banner */}
          {view.banner && (
            <Banner variant={view.banner.variant} className="mb-[22px]">
              {view.banner.text}
            </Banner>
          )}

          {/* Order detail well */}
          {view.showWell && (
            <div className="rounded-[10px] border border-border bg-input px-[22px] py-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
                  {view.wellLabel}
                </span>
                <span
                  className={`whitespace-nowrap rounded-[4px] px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.08em] ${view.pillCls}`}
                >
                  {view.pillLabel}
                </span>
              </div>
              <div className="flex flex-col gap-[11px]">
                {view.rows.map((r) => (
                  <div key={r.k} className="flex items-center justify-between gap-4">
                    <span className="font-mono text-[12px] tracking-[0.04em] text-text-muted">{r.k}</span>
                    <span className={`text-right font-mono text-[13px] ${r.cls}`}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {hasActions && (
            <div className="mt-6 flex flex-col gap-3">
              {view.primary && (
                <button
                  type="button"
                  onClick={view.primary.onClick}
                  className="w-full rounded-[8px] border border-accent bg-accent py-[14px] font-sans text-[15px]
                             font-medium leading-none text-accent-ink transition-[filter] duration-150 hover:brightness-110"
                >
                  {view.primary.label}
                </button>
              )}
              {view.secondary && (
                <button
                  type="button"
                  onClick={view.secondary.onClick}
                  className="w-full rounded-[8px] border border-accent bg-transparent py-[14px] text-center font-sans
                             text-[15px] font-medium leading-none text-accent transition-colors duration-150 hover:bg-accent/10"
                >
                  {view.secondary.label}
                </button>
              )}
            </div>
          )}

          {/* Footer note */}
          <p className="mx-auto mt-[22px] max-w-[40ch] text-center text-[12px] leading-[1.6] text-text-dim">
            {view.footNote}
          </p>
        </div>
      </main>
    </div>
  );
}

interface StateView {
  marker: ReactNode;
  eyebrow: string;
  eyebrowCls: string;
  title: string;
  subtitle: string;
  banner?: { variant: 'error' | 'warning' | 'success'; text: string };
  showWell: boolean;
  wellLabel: string;
  pillLabel: string;
  pillCls: string;
  rows: { k: string; v: string; cls: string }[];
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  footNote: string;
  showProgress?: boolean;
}

/** Confirming marker — indeterminate accent spinner (design: 72px ring). */
function Spinner() {
  return (
    <div className="h-[72px] w-[72px] animate-spin rounded-full border-[3px] border-input border-t-accent" />
  );
}

/** Resolved marker — a tinted ring with a glyph (green ✓ on success, amber ! on failure). */
function Ring({ tone, glyph }: { tone: 'bid' | 'warning'; glyph: string }) {
  const cls =
    tone === 'bid' ? 'border-bid/55 bg-bid/12 text-bid' : 'border-warning/55 bg-warning/12 text-warning';
  return (
    <div
      className={`flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 text-[32px] leading-none ${cls}`}
    >
      {glyph}
    </div>
  );
}
