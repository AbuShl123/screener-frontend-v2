import { useNavigate } from 'react-router-dom';
import { BillingHeader } from '../components/BillingHeader';
import { PlanChoiceCard } from '../components/PlanChoiceCard';
import { buildPlanViews } from '../catalog';
import { usePlans } from '../queries';

/**
 * Choose Plan (`/billing/plans`, behind ProtectedRoute). Mirrors the "Choose Plan"
 * design template. Clicking a card navigates immediately:
 *  - `pay_as_you_go` → /billing/pay-by-days (the top-up editor)
 *  - every other plan → /billing/payment?plan=CODE (the Payment Method page).
 *
 * Fallback-first like `PricingSection`: `buildPlanViews(data)` renders all four cards
 * instantly from hardcoded fallbacks, and live amounts swap in when `usePlans` resolves.
 */
export function ChoosePlanPage() {
  const { data } = usePlans();
  const plans = buildPlanViews(data);
  const navigate = useNavigate();

  function onChoose(code: string) {
    if (code === 'pay_as_you_go') navigate('/billing/pay-by-days');
    else navigate(`/billing/payment?plan=${code}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-text-secondary">
      <BillingHeader />

      <main className="mx-auto flex w-full max-w-[1220px] flex-1 flex-col px-10 pb-16 pt-14">
        <div className="mb-[14px] font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
          Billing · Choose a plan
        </div>

        <div className="mb-20 flex flex-wrap items-end justify-between gap-8">
          <h1 className="m-0 max-w-[20ch] text-[38px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
            Pick how you want to pay.
          </h1>
          <p className="m-0 max-w-[46ch] text-[15px] leading-[1.6] text-text-muted">
            Every plan unlocks the full terminal — 500+ tickers, custom rules, charts and alerts.
            The only difference is duration and price.
          </p>
        </div>

        <div className="grid grid-cols-4 items-stretch gap-4">
          {plans.map((plan) => (
            <PlanChoiceCard key={plan.code} plan={plan} onSelect={() => onChoose(plan.code)} />
          ))}
        </div>

        <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
          all plans · 500+ tickers · custom rules · charts · oi alerts · voice notifications
        </div>
      </main>
    </div>
  );
}
