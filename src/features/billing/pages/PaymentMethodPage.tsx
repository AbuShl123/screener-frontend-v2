import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { useMe } from '@/features/auth';
import { BillingHeader } from '../components/BillingHeader';
import { buildPlanViews } from '../catalog';
import { useCreateOrder, usePayAsYouGoDays, usePlans } from '../queries';
import type { CreateOrderRequest } from '../schemas';
import multicardLogo from '../assets/multicard.svg';

const CURRENCY = 'UZS';
const groupFmt = new Intl.NumberFormat('en-US');

// Future providers, rendered as disabled "coming soon" placeholders so the layout is
// already designed for them (design: Payment Method.dc.html § SOON_METHODS). Static copy.
const SOON_METHODS: { name: string; glyph: string }[] = [
  { name: 'Visa / Mastercard', glyph: 'VC' },
  { name: 'Apple Pay', glyph: '' },
  { name: 'Kaspi', glyph: 'KZ' },
  { name: 'PayPal', glyph: 'PP' },
  { name: 'Russian cards (МИР)', glyph: 'RU' },
  { name: 'Crypto (USDT)', glyph: '₮' },
];

/**
 * Payment Method (`/billing/payment?plan=CODE[&amount=N]`, behind ProtectedRoute) — the
 * screen between plan selection and Multicard's hosted checkout, from the "Payment Method"
 * design template. This is where a real order is created and the browser hands off to the
 * payment provider (plan §6).
 *
 * The chosen plan is read from the URL (survives reload / the Multicard round-trip, matches
 * the `?plan=CODE` convention): `?plan=CODE` for a fixed plan, plus `&amount=N` for
 * pay-as-you-go. Multicard is the sole live method (pre-selected, fixed); every other tile is
 * a static disabled "coming soon" placeholder — there is no method-selection state machine.
 *
 * "Pay with Multicard →" issues `POST /api/billing/orders` (`useCreateOrder`) and, on 200,
 * redirects the SAME tab to the returned `checkoutUrl`. A 4xx surfaces the backend message
 * inline without leaving the page. The return_url / polling page is the next phase (plan §10).
 */
export function PaymentMethodPage() {
  const [params] = useSearchParams();
  const planCode = params.get('plan') ?? 'monthly';
  const amountStr = params.get('amount'); // present only for pay-as-you-go
  const amount = amountStr ? parseInt(amountStr, 10) : 0;
  const isPayg = planCode === 'pay_as_you_go';

  const { data: plansData } = usePlans();
  const plan = buildPlanViews(plansData).find((p) => p.code === planCode);
  const me = useMe();
  // Re-derive the day count from the entered amount via the same authoritative endpoint the
  // Pay by Days page used (single source of truth). Gated internally on amount > 0, and the
  // shared query key means it's already warm when arriving from Pay by Days.
  const { data: paygData } = usePayAsYouGoDays(isPayg ? amount : 0);

  const createOrder = useCreateOrder();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // ── Guards (after all hooks) ──
  // Pay-as-you-go with no usable amount can't build a summary — send the user back to pick one.
  if (isPayg && amount <= 0) return <Navigate to="/billing/pay-by-days" replace />;
  // Unknown fixed plan → degrade to a neutral "choose a plan" state (like CheckoutStubPage).
  if (!plan) return <UnknownPlanState />;

  // ── Summary view model ──
  const accessDays = isPayg ? (paygData?.days ?? null) : plan.durationDays;
  const total = isPayg ? amount : plan.amount;
  const totalFmt = groupFmt.format(total);

  const durationLabel =
    accessDays != null ? `${accessDays} ${accessDays === 1 ? 'day' : 'days'}` : '—';
  const planPeriodLabel = isPayg
    ? `Pay by days · ${durationLabel} of full terminal access`
    : `${durationLabel} of full terminal access`;

  // Access until — extend from the user's current expiry if it hasn't lapsed, else from today
  // (mirrors PayByDaysPage's derivation verbatim for correct stacking).
  let accessUntil: string | null = null;
  if (accessDays != null && accessDays >= 1) {
    const now = new Date();
    const currentExpiry = me.data?.accessExpiresAt ? new Date(me.data.accessExpiresAt) : null;
    const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const end = new Date(base);
    end.setDate(end.getDate() + accessDays);
    accessUntil = end.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  // ── Pay ──
  function onPay() {
    setCheckoutError(null);
    const body: CreateOrderRequest = isPayg ? { planCode, amount: String(amount) } : { planCode };
    createOrder.mutate(body, {
      onSuccess: (order) => {
        // Same-tab handoff to the provider's hosted page. checkoutUrl should always be
        // present on a fresh create; guard defensively.
        if (order.checkoutUrl) window.location.assign(order.checkoutUrl);
        else setCheckoutError('Could not start checkout. Please try again.');
      },
    });
  }

  // Backend 4xx `message` is user-safe (bad amount, renewal-gate copy, …); fall back otherwise.
  const errorMessage =
    checkoutError ??
    (createOrder.isError
      ? createOrder.error instanceof ApiError
        ? createOrder.error.message
        : 'Something went wrong. Please try again.'
      : null);

  const paying = createOrder.isPending;

  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-text-secondary">
      <BillingHeader />

      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-10 pb-[120px] pt-12">
        <Link
          to="/billing/plans"
          className="mb-[14px] self-start font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim
                     no-underline transition-colors hover:text-text-secondary"
        >
          ← Billing · Plans
        </Link>

        <div className="grid grid-cols-[1.4fr_1fr] items-start gap-25">
          {/* ===== Payment methods ===== */}
          <section className="flex flex-col gap-[22px]">
            <div>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
                Billing · Payment method
              </div>
              <h1 className="m-0 max-w-[20ch] text-[38px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
                How do you want to pay?
              </h1>
            </div>

            <p className="m-0 max-w-[48ch] text-[15px] leading-[1.6] text-text-muted">
              Pick a method to complete your subscription. More providers are being added — for now
              Multicard covers Uzbek bank cards.
            </p>

            {/* Multicard — the one supported method, selected by default */}
            <div
              className="flex w-full items-center gap-4 rounded-[14px] border-2 border-accent
                         bg-[color-mix(in_oklab,#4ea8ff_8%,#0d1219)] px-5 py-[18px] text-left"
            >
              <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-[#531edc]">
                <img src={multicardLogo} alt="Multicard" width={52} height={52} className="block h-[52px] w-[52px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-[10px]">
                  <span className="text-[16px] font-medium text-text-strong">Multicard</span>
                  <span className="rounded-[4px] bg-[color-mix(in_oklab,#3edc97_18%,transparent)] px-[6px] py-[2px]
                                   font-mono text-[9px] uppercase tracking-[0.08em] text-bid">
                    Supported
                  </span>
                </div>
                <div className="mt-[5px] text-[13px] leading-[1.5] text-text-muted">
                  Uzbek bank cards — UZCARD &amp; HUMO. Charged in UZS. Instant activation.
                </div>
              </div>
              <span className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-2 border-accent">
                <span className="h-[10px] w-[10px] rounded-full bg-accent" />
              </span>
            </div>

            {/* Coming soon */}
            <div className="mt-[6px] flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
                Coming soon
              </span>
              <span className="font-mono text-[11px] tracking-[0.04em] text-text-dim">
                {SOON_METHODS.length} more on the way
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {SOON_METHODS.map((m) => (
                <div
                  key={m.name}
                  className="flex cursor-not-allowed items-center gap-3 rounded-[12px] border border-dashed border-border
                             bg-[color-mix(in_oklab,#0d1219_60%,transparent)] px-4 py-[14px] opacity-[0.62]"
                >
                  <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[8px] border border-border-subtle
                                   bg-input font-mono text-[13px] text-text-dim">
                    {m.glyph || '••'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-muted">{m.name}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-dim">Soon</span>
                </div>
              ))}
            </div>
          </section>

          {/* ===== Order summary ===== */}
          <section className="sticky top-6 flex flex-col rounded-[14px] border border-border bg-surface p-[38px]">
            <div className="mb-7 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
                Order summary
              </span>
              <Link
                to="/billing/plans"
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent no-underline"
              >
                Change
              </Link>
            </div>

            <div className="mb-1 flex items-center gap-[10px]">
              <span className="text-[20px] font-semibold text-text-strong">{plan.name}</span>
              {plan.badge && (
                <span
                  className={`whitespace-nowrap rounded-[4px] px-[7px] py-[2px] font-mono text-[9px] uppercase tracking-[0.08em] ${
                    plan.badgeStyle === 'muted'
                      ? 'bg-[color-mix(in_oklab,#4ea8ff_22%,transparent)] text-accent'
                      : 'bg-[color-mix(in_oklab,#f5b84d_22%,transparent)] text-warning'
                  }`}
                >
                  {plan.badge}
                </span>
              )}
            </div>
            <div className="mb-[30px] text-[13px] leading-[1.5] text-text-muted">{planPeriodLabel}</div>

            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] tracking-[0.04em] text-text-muted">Duration</span>
                <span className="font-mono text-[14px] text-text-secondary">{durationLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] tracking-[0.04em] text-text-muted">Access until</span>
                <span className="font-mono text-[14px] text-bid">{accessUntil ?? '—'}</span>
              </div>
              {isPayg && (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] tracking-[0.04em] text-text-muted">Rate</span>
                  <span className="font-mono text-[14px] text-text-secondary">
                    {plan.price} {plan.unit}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] tracking-[0.04em] text-text-muted">Method</span>
                <span className="font-mono text-[14px] text-text-secondary">Multicard</span>
              </div>
            </div>

            <div className="mt-[30px] mb-[26px] h-px bg-border-subtle" />

            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-text-muted">
                You pay
              </span>
              <span className="flex items-baseline gap-[6px]">
                <span className="font-mono text-[28px] font-semibold tracking-[-0.01em] text-text">
                  {totalFmt}
                </span>
                <span className="font-mono text-[13px] text-text-dim">{CURRENCY}</span>
              </span>
            </div>

            <div className="mt-6 text-[12px] leading-[1.5] text-text-dim">
              You will be redirected to Multicard to complete payment securely. No auto-renewal —
              access ends when your subscription runs out.
            </div>
          </section>
        </div>

        {errorMessage && (
          <div
            className="mt-5 flex items-center gap-3 rounded-[8px] border border-[color-mix(in_oklab,#f5b84d_38%,transparent)]
                       bg-[color-mix(in_oklab,#f5b84d_10%,transparent)] px-4 py-[13px]"
          >
            <span
              className="whitespace-nowrap rounded-[4px] bg-[color-mix(in_oklab,#f5b84d_22%,transparent)] px-[7px] py-[3px]
                         font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-warning"
            >
              Error
            </span>
            <span className="text-[14px] text-text-secondary">{errorMessage}</span>
          </div>
        )}
      </main>

      {/* ===== Sticky action bar ===== */}
      <div
        className="fixed inset-x-0 bottom-0 flex items-center justify-between gap-6 border-t border-border
                   bg-[color-mix(in_oklab,#0a0e14_96%,transparent)] px-10 py-4 backdrop-blur-[8px]"
      >
        <div className="flex flex-wrap items-baseline gap-[14px]">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent">Multicard</span>
          <span className="font-mono text-[15px] text-text-strong">
            {totalFmt} {CURRENCY}
          </span>
          <span className="text-text-dim">·</span>
          <span className="font-mono text-[15px] text-text-secondary">{plan.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/billing/plans"
            className="font-mono text-[12px] uppercase tracking-[0.08em] text-text-dim no-underline
                       transition-colors hover:text-text-secondary"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={onPay}
            disabled={paying}
            className="rounded-[8px] bg-accent px-[22px] py-[13px] font-sans text-[15px] font-medium leading-none
                       text-accent-ink transition-[filter] duration-150 hover:brightness-110
                       disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
          >
            {paying ? 'Redirecting…' : 'Pay with Multicard →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Neutral degrade for a missing/unknown `?plan` (direct hit or a plan the backend no longer
 * sells) — mirrors CheckoutStubPage's "no plan selected" fallback with a link back to pricing.
 */
function UnknownPlanState() {
  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-text-secondary">
      <BillingHeader />
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-start px-10 pt-24">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
          Billing · Payment method
        </div>
        <h1 className="m-0 text-[28px] font-semibold tracking-[-0.01em] text-text">No plan selected</h1>
        <p className="mt-4 text-[15px] leading-[1.6] text-text-muted">
          We couldn't find the plan you were paying for. Head back to choose one.
        </p>
        <Link
          to="/billing/plans"
          className="mt-8 rounded-[8px] border border-accent bg-transparent px-[16px] py-[12px] text-[15px]
                     font-medium text-accent no-underline transition-colors duration-150 hover:bg-accent/10"
        >
          Back to plans
        </Link>
      </main>
    </div>
  );
}
