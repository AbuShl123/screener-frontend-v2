import { Button } from '@/components/Button';
import type { PlanView } from '@/features/billing';

/**
 * One pricing card (plan §8.3). Purely presentational — every string is already
 * formatted in the billing catalog's `buildPlanViews`, so this only maps a
 * `PlanView` to the template's light-section layout and forwards the click.
 *
 * The highlighted plan gets the accent ring + a tinted background (a one-off
 * `color-mix` per §5, not a token); the rest use the marketing surface tokens.
 */
export function PlanCard({
  plan,
  onStart,
}: {
  plan: PlanView;
  onStart: (code: string) => void;
}) {
  return (
    <div
      className={`flex flex-col rounded-[14px] px-5 py-[22px] ${
        plan.highlight
          ? 'border-2 border-accent bg-[color-mix(in_oklab,#4ea8ff_6%,white)]'
          : 'border border-mkt-border-strong bg-mkt-surface'
      }`}
    >
      <div className="mb-4 flex min-h-5 items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-mkt-text-secondary">
          {plan.name}
        </span>
        {plan.badge && (
          <span
            className={`rounded-[4px] px-[7px] py-[3px] font-mono text-[9px] tracking-[0.08em] ${
              plan.badgeStyle === 'accent'
                ? 'bg-mkt-badge text-white'
                : 'bg-[rgba(10,14,20,0.07)] text-mkt-text-secondary'
            }`}
          >
            {plan.badge}
          </span>
        )}
      </div>

      <div className="font-mono text-[26px] tracking-[-0.01em] text-mkt-heading">{plan.price}</div>
      <div className="mb-[14px] mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-mkt-text-muted">
        {plan.unit}
      </div>

      <p className="mb-4 flex-1 text-[14px] leading-[1.55] text-mkt-text-secondary">{plan.desc}</p>

      <div className="mb-4 font-mono text-[11px] text-mkt-text-muted">{plan.perDay}</div>

      <Button
        variant={plan.highlight ? 'primary' : 'outline'}
        onClick={() => onStart(plan.code)}
      >
        Start now
      </Button>
    </div>
  );
}
