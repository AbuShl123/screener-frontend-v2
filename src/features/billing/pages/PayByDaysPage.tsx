import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BillingHeader } from '../components/BillingHeader';
import { buildPlanViews } from '../catalog';
import { useDebouncedValue } from '../useDebouncedValue';
import { usePayAsYouGoDays, usePlans } from '../queries';

const CURRENCY = 'UZS';
const groupFmt = new Intl.NumberFormat('en-US');

/**
 * Pay by Days (`/billing/pay-by-days`, behind ProtectedRoute) — the pay-as-you-go
 * top-up editor, from the "Pay by Days" design template trimmed to the minimal
 * breakdown (plan §7): the `{ days }` response can only populate a day count + an
 * "Access until" line, so the template's daily-rate / you-pay / leftover rows are
 * dropped. "Continue to payment" navigates to / (no real charge yet, §9).
 *
 * Amount model (plan §2): raw digit string in state, non-digits stripped, capped at
 * 12 digits, displayed grouped. Zero/empty never calls the API (the `enabled` guard in
 * `usePayAsYouGoDays`) and shows a neutral `—`. The API call is debounced 350 ms so a
 * fast typist doesn't spray requests. Any failure on a real amount → one generic hint.
 *
 * The per-day rate reuses `usePlans()` + `buildPlanViews()` (same fallback-first pattern
 * as `ChoosePlanPage`): it's shown under "Access until" so a user who forgets the price
 * seen on Choose Plan doesn't have to navigate back, and it seeds the amount input's
 * initial value so the page shows a real days/access-until result on first load instead
 * of a blank input.
 */
export function PayByDaysPage() {
  const { data: plansData } = usePlans();
  const paygPlan = buildPlanViews(plansData).find((p) => p.code === 'pay_as_you_go');

  // Defaults to the current per-day rate (fallback-first, like the rest of the catalog) so
  // the page isn't blank on first load — the user still sees a days/access-until result.
  const [amountStr, setAmountStr] = useState(() => (paygPlan ? String(paygPlan.amount) : ''));
  const amount = amountStr ? parseInt(amountStr, 10) : 0; // digits-only → NaN-safe int
  const debouncedAmount = useDebouncedValue(amount, 350);
  const { data, isFetching, isError } = usePayAsYouGoDays(debouncedAmount);
  const navigate = useNavigate();

  // days: null in every non-positive / errored / not-yet-loaded state (the neutral `—`).
  const days = amount > 0 && !isError ? (data?.days ?? null) : null;
  const canContinue = days != null && days >= 1;
  const loading = amount > 0 && isFetching;

  const amountDisplay = amount ? groupFmt.format(amount) : '';
  const daysDisplay = days != null ? groupFmt.format(days) : '—';
  const daysWord = days === 1 ? 'day' : 'days';

  let accessUntil: string | null = null;
  if (days != null && days >= 1) {
    const end = new Date();
    end.setDate(end.getDate() + days);
    accessUntil = end.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-text-secondary">
      <BillingHeader />

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-10 pb-[120px] pt-12">
        <button
          type="button"
          onClick={() => navigate('/billing/plans')}
          className="mb-[14px] self-start font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim
                     transition-colors hover:text-text-secondary"
        >
          ← Billing · Plans
        </button>

        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-warning">
              Pay by days · Flexible
            </div>
            <h1 className="m-0 max-w-[22ch] text-[38px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
              How much do you want to top up?
            </h1>
          </div>
          <p className="m-0 max-w-[40ch] text-[15px] leading-[1.6] text-text-muted">
            Enter any amount. We'll convert it to days of full terminal access at the current daily
            rate — no auto-renewal, access ends when your days run out.
          </p>
        </div>

        <div className="grid grid-cols-[1.35fr_1fr] items-stretch gap-5">
          {/* ===== Amount editor ===== */}
          <section className="flex flex-col rounded-[14px] border border-border bg-surface px-7 pb-[26px] pt-7">
            <div className="mb-[22px] font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
              Enter amount
            </div>

            <label
              htmlFor="topup"
              className="flex items-center gap-3 rounded-[10px] border border-border-input bg-input px-[18px] py-4
                         focus-within:border-warning"
            >
              <span className="font-mono text-[22px] text-text-dim">{CURRENCY}</span>
              <input
                id="topup"
                name="topup"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={amountDisplay}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                className="min-w-0 flex-1 border-none bg-transparent p-0 text-right font-mono text-[34px]
                           font-medium tracking-[-0.01em] text-text outline-none placeholder:text-text-dim
                           [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
                           [&::-webkit-outer-spin-button]:appearance-none"
              />
            </label>
          </section>

          {/* ===== Days result ===== */}
          <section
            className="flex flex-col rounded-[14px] border-2 border-[color-mix(in_oklab,#f5b84d_55%,transparent)]
                       bg-[color-mix(in_oklab,#f5b84d_8%,#0d1219)] p-7"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-warning">
              That buys you
            </span>

            <div className="flex flex-1 flex-col justify-center py-[14px]">
              <div className="flex items-baseline gap-3">
                <span
                  className={`font-mono text-[88px] font-semibold leading-[0.9] tracking-[-0.03em]
                              transition-opacity ${days != null && days >= 1 ? 'text-warning' : 'text-text-dim'} ${
                                loading ? 'opacity-40' : ''
                              }`}
                >
                  {daysDisplay}
                </span>
                <span className="font-mono text-[20px] text-text-muted">{daysWord}</span>
              </div>
              <div className="mt-[14px] text-[14px] leading-[1.5] text-text-muted">
                of full terminal access
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border-subtle pt-4">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
                Access until
              </span>
              <span
                className={`font-mono text-[13px] ${accessUntil ? 'text-text-secondary' : 'text-text-dim'}`}
              >
                {accessUntil ?? '—'}
              </span>
            </div>

            {paygPlan && (
              <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
                  Rate
                </span>
                <span className="font-mono text-[13px] text-text-secondary">
                  {paygPlan.price} {paygPlan.unit}
                </span>
              </div>
            )}
          </section>
        </div>

        {isError && (
          <div
            className="mt-5 flex items-center gap-3 rounded-[8px] border border-[color-mix(in_oklab,#f5b84d_38%,transparent)]
                       bg-[color-mix(in_oklab,#f5b84d_10%,transparent)] px-4 py-[13px]"
          >
            <span
              className="whitespace-nowrap rounded-[4px] bg-[color-mix(in_oklab,#f5b84d_22%,transparent)] px-[7px] py-[3px]
                         font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-warning"
            >
              Invalid
            </span>
            <span className="text-[14px] text-text-secondary">
              Invalid amount — try entering a different amount.
            </span>
          </div>
        )}
      </main>

      {/* ===== Sticky summary bar ===== */}
      <div
        className="fixed inset-x-0 bottom-0 flex items-center justify-between gap-6 border-t border-border
                   bg-[color-mix(in_oklab,#0a0e14_96%,transparent)] px-10 py-4 backdrop-blur-[8px]"
      >
        <div className="flex flex-wrap items-baseline gap-[14px]">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-warning">
            Pay by days
          </span>
          <span className="font-mono text-[15px] text-text-strong">
            {amountDisplay || '0'} {CURRENCY}
          </span>
          <span className="text-text-dim">→</span>
          <span className="font-mono text-[15px] text-text-secondary">
            {daysDisplay} {daysWord}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/billing/plans')}
            className="font-mono text-[12px] uppercase tracking-[0.08em] text-text-dim transition-colors
                       hover:text-text-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            disabled={!canContinue}
            className="rounded-[8px] border border-warning bg-warning px-[22px] py-[13px] font-sans text-[15px]
                       font-medium leading-none text-[#1a1206] transition-[filter] duration-150
                       hover:brightness-[1.08] disabled:cursor-not-allowed disabled:opacity-40
                       disabled:hover:brightness-100"
          >
            Continue to payment →
          </button>
        </div>
      </div>
    </div>
  );
}
