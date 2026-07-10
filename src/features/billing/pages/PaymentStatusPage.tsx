import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner } from '@/components/Banner';
import { useMe } from '@/features/auth';
import { BillingHeader } from '../components/BillingHeader';
import { buildPlanViews } from '../catalog';
import { usePlans } from '../queries';
import { usePaymentStatus } from '../usePaymentStatus';

const groupFmt = new Intl.NumberFormat('en-US');
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDate = (iso: string) => dateFmt.format(new Date(iso));

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
  const status = usePaymentStatus();
  const me = useMe();
  const { data: plansData } = usePlans();
  const navigate = useNavigate();

  const order = status.order;

  // Order-derived labels (graceful `—` while the first poll is still in flight during
  // `confirming`, when the well shows placeholders).
  const planName = order
    ? (buildPlanViews(plansData).find((p) => p.code === order.planCode)?.name ?? order.planCode)
    : '—';
  const amountLabel = order ? `${groupFmt.format(order.amount)} ${order.currency}` : '—';
  const reference = order?.orderId ?? '—';
  const durationDays = order ? Math.round(order.accessDurationSeconds / 86400) : null;
  const durationLabel = durationDays != null ? `${durationDays} ${durationDays === 1 ? 'day' : 'days'}` : '—';
  const accessUntil = me.data?.accessExpiresAt ? fmtDate(me.data.accessExpiresAt) : null;
  const email = me.data?.email ?? 'your email';

  const rowSecondary = 'text-text-secondary';
  const rowStrong = 'text-text-strong';
  const rowMuted = 'text-text-muted';
  const rowBid = 'text-bid';

  // Which content to render: the confirming screen until a resolution is revealed past the floor.
  const key = status.phase === 'result' && status.resolution ? status.resolution.kind : 'confirming';

  const view = ((): StateView => {
    switch (key) {
      case 'success':
        return {
          marker: <Ring tone="bid" glyph="✓" />,
          eyebrow: 'Payment confirmed',
          eyebrowCls: 'text-bid',
          title: accessUntil ? `You're all in until ${accessUntil}` : "You're all in",
          subtitle:
            'Full terminal access is live on your account — real-time books, custom rules and alerts across every supported ticker.',
          showWell: true,
          wellLabel: 'Receipt',
          pillLabel: 'Paid',
          pillCls: 'bg-bid/15 text-bid',
          rows: [
            { k: 'Plan', v: `${planName} · ${durationLabel}`, cls: rowSecondary },
            { k: 'Paid', v: amountLabel, cls: rowStrong },
            { k: 'Access until', v: accessUntil ?? '—', cls: rowBid },
            { k: 'Reference', v: reference, cls: rowMuted },
          ],
          primary: { label: 'Open terminal →', onClick: () => navigate('/dashboard') },
          secondary: { label: 'View billing history', onClick: () => navigate('/dashboard') },
          footNote: `A receipt has been emailed to ${email}. No auto-renewal — access simply ends when your subscription runs out.`,
          showProgress: false,
        };

      case 'timeout':
        return {
          marker: <Ring tone="warning" glyph="!" />,
          eyebrow: 'Payment not completed',
          eyebrowCls: 'text-warning',
          title: 'Payment not completed',
          subtitle:
            "We didn't receive a confirmation from Multicard in time. Your plan hasn't been activated and you have not been charged.",
          banner: {
            variant: 'warning',
            text: "We couldn't confirm this payment within 90 seconds. If your card was charged it will be reversed automatically — nothing was activated.",
          },
          showWell: true,
          wellLabel: 'Attempted order',
          pillLabel: 'Not confirmed',
          pillCls: 'bg-danger/15 text-danger',
          rows: [
            { k: 'Plan', v: planName, cls: rowSecondary },
            { k: 'Amount', v: amountLabel, cls: rowStrong },
            { k: 'Reference', v: reference, cls: rowMuted },
          ],
          // Locked decision 2: the timeout order is still resumable — reuse its checkoutUrl.
          primary: {
            label: 'Retry payment',
            onClick: () =>
              order?.checkoutUrl ? window.location.assign(order.checkoutUrl) : navigate('/billing/plans'),
          },
          secondary: { label: 'Choose another plan', onClick: () => navigate('/billing/plans') },
          footNote:
            'Charged anyway? Any unconfirmed authorisation is released by your bank automatically, usually within a few business days.',
          showProgress: false,
        };

      case 'declined':
        return {
          marker: <Ring tone="warning" glyph="!" />,
          eyebrow: 'Payment failed',
          eyebrowCls: 'text-danger',
          title: 'Payment failed',
          subtitle: 'Something went wrong. Please try again — no money was charged.',
          banner: {
            variant: 'error',
            text: order?.reasonDetail ?? 'The payment provider reported an error.',
          },
          showWell: true,
          wellLabel: 'Attempted order',
          pillLabel: 'Failed',
          pillCls: 'bg-danger/15 text-danger',
          rows: [
            { k: 'Plan', v: planName, cls: rowSecondary },
            { k: 'Amount', v: amountLabel, cls: rowStrong },
            { k: 'Reference', v: reference, cls: rowMuted },
          ],
          // Terminal failure: start fresh rather than resume a dead order (locked decision 2).
          primary: { label: 'Retry payment', onClick: () => navigate('/billing/plans') },
          secondary: { label: 'Back to dashboard', onClick: () => navigate('/dashboard') },
          footNote:
            "No charge was made. You can try another card or plan whenever you're ready.",
          showProgress: false,
        };

      case 'refunded':
        return {
          marker: <Ring tone="warning" glyph="!" />,
          eyebrow: 'Payment refunded',
          eyebrowCls: 'text-warning',
          title: 'Money refunded',
          subtitle:
            'This payment was refunded and the charge reversed. Your existing access stays active until it expires.',
          banner: {
            variant: 'warning',
            text: order?.reasonDetail ?? 'This payment was reversed by the provider.',
          },
          showWell: true,
          wellLabel: 'Refunded order',
          pillLabel: 'Refunded',
          pillCls: 'bg-warning/15 text-warning',
          rows: [
            { k: 'Plan', v: planName, cls: rowSecondary },
            { k: 'Amount', v: amountLabel, cls: rowStrong },
            { k: 'Access until', v: accessUntil ?? '—', cls: rowBid },
            { k: 'Reference', v: reference, cls: rowMuted },
          ],
          // Access is kept (monetization-api.md §3) — the primary sends the user back into the app.
          primary: { label: 'Open terminal →', onClick: () => navigate('/dashboard') },
          secondary: { label: 'Choose another plan', onClick: () => navigate('/billing/plans') },
          footNote: 'The refund should appear on your statement within a few business days.',
          showProgress: false,
        };

      case 'notfound':
        return {
          marker: <Ring tone="warning" glyph="!" />,
          eyebrow: 'Order not found',
          eyebrowCls: 'text-danger',
          title: 'Order not found',
          subtitle:
            "We couldn't find an active order, or your invoice has been canceled. Did you cancel your payment?",
          banner: {
            variant: 'warning',
            text: 'If you canceled your order, ignore this message. Otherwise try refreshing this page or start the payment again.',
          },
          // On a true 404 (no order at all) the well has nothing to show; hide it. An EXPIRED
          // order still carries data, so keep the well then.
          showWell: order !== null,
          wellLabel: 'Order',
          pillLabel: 'Not found',
          pillCls: 'bg-danger/15 text-danger',
          rows: [
            { k: 'Plan', v: planName, cls: rowSecondary },
            { k: 'Amount', v: amountLabel, cls: rowStrong },
            { k: 'Reference', v: reference, cls: rowMuted },
          ],
          primary: { label: 'Start payment', onClick: () => navigate('/billing/plans') },
          secondary: { label: 'Back to dashboard', onClick: () => navigate('/dashboard') },
          footNote: 'Already paid? Give it a minute and refresh — confirmations can lag behind the redirect.',
          showProgress: false,
        };

      case 'confirming':
      default:
        return {
          marker: <Spinner />,
          eyebrow: 'Billing · Multicard',
          eyebrowCls: 'text-accent',
          title: 'Confirming your payment…',
          subtitle:
            'Your bank and Multicard are settling the transaction. This can take up to a minute — keep this tab open.',
          showWell: true,
          wellLabel: 'Pending order',
          pillLabel: 'Awaiting confirmation',
          pillCls: 'bg-warning/15 text-warning',
          rows: [
            { k: 'Plan', v: planName, cls: rowSecondary },
            { k: 'Amount', v: amountLabel, cls: rowStrong },
            { k: 'Reference', v: reference, cls: rowMuted },
          ],
          footNote:
            "Do not refresh or navigate away. If confirmation takes longer than 90 seconds we'll stop and let you retry.",
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
