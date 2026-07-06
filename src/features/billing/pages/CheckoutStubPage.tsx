import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/Card';
import { buildPlanViews } from '../catalog';

/**
 * Stub checkout route (`/billing/checkout?plan=CODE`), mounted behind `ProtectedRoute`
 * so a direct anonymous hit is bounced to /login. This is the seam the real payment
 * flow drops into later (plan §11); it makes no network calls.
 *
 * It reads `?plan=CODE`, resolves it against the presentation catalog (fallback prices —
 * no query) to show the chosen plan's name + price, and offers links back to pricing and
 * to the dashboard. A missing/unknown `plan` degrades to a neutral "choose a plan" state.
 */
export function CheckoutStubPage() {
  const [params] = useSearchParams();
  const code = params.get('plan');
  const plan = code ? buildPlanViews().find((p) => p.code === code) : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <Card className="w-full max-w-[440px] p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent">Checkout</p>
        <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.01em] text-text">
          Payment coming soon
        </h1>

        {plan ? (
          <div className="mt-6 rounded-[10px] border border-border bg-input p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
              Selected plan
            </p>
            <p className="mt-2 text-[17px] font-medium text-text-strong">{plan.name}</p>
            <p className="mt-1 font-mono text-[15px] text-text-secondary">
              {plan.price} <span className="text-text-muted">{plan.unit}</span>
            </p>
          </div>
        ) : (
          <p className="mt-6 text-[14px] leading-[1.55] text-text-secondary">
            No plan selected. Head back to pricing to choose one.
          </p>
        )}

        <p className="mt-6 text-[14px] leading-[1.55] text-text-secondary">
          The payment flow isn't wired up yet — this is a placeholder for it.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            to="/#pricing"
            className="rounded-[8px] border border-accent bg-transparent px-[14px] py-[13px] text-center text-[15px] font-medium text-accent no-underline transition-colors duration-150 hover:bg-accent/10"
          >
            Back to pricing
          </Link>
          <Link
            to="/dashboard"
            className="text-center text-[14px] text-text-secondary no-underline hover:text-text"
          >
            Go to dashboard
          </Link>
        </div>
      </Card>
    </div>
  );
}
