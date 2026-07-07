import { Button } from '@/components/Button';
import type { PlanView } from '@/features/billing';

/**
 * One pricing card (plan §8.3, dark section per the v2 template). Purely
 * presentational — every string is already formatted in the billing catalog's
 * `buildPlanViews`, so this only maps a `PlanView` to layout and forwards the click.
 *
 * The highlighted plan gets an amber (`--color-warning`) ring, a tinted background,
 * and a matching amber CTA (a one-off `color-mix`, not a token); the rest sit on the
 * `--color-input` well with an outline CTA.
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
          ? 'border-2 border-warning bg-[color-mix(in_oklab,#f5b84d_9%,#0d1219)]'
          : 'border border-border bg-input'
      }`}
    >
      <div className="mb-4 flex min-h-5 items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
          {plan.name}
        </span>
        {plan.badge && (
          <span
            className={`rounded-[4px] px-[7px] py-[3px] font-mono text-[9px] tracking-[0.08em] ${
              plan.badgeStyle === 'accent'
                ? 'bg-[color-mix(in_oklab,#f5b84d_22%,transparent)] text-warning'
                : 'bg-[color-mix(in_oklab,#4ea8ff_22%,transparent)] text-accent'
            }`}
          >
            {plan.badge}
          </span>
        )}
      </div>

      <div className="font-mono text-[26px] tracking-[-0.01em] text-text">{plan.price}</div>
      <div className="mb-[14px] mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
        {plan.unit}
      </div>

      <p className="mb-4 flex-1 text-[14px] leading-[1.55] text-text-muted">{plan.desc}</p>

      <div className="mb-4 font-mono text-[11px] text-text-dim">{plan.perDay}</div>

      {plan.highlight ? (
        <button
          onClick={() => onStart(plan.code)}
          className="w-full rounded-[8px] bg-warning px-[14px] py-[14px] font-sans text-[15px] font-medium leading-none text-[#1a1206] transition-[filter] duration-150 hover:brightness-[1.08]"
        >
          Start now
        </button>
      ) : (
        <Button variant="outline" onClick={() => onStart(plan.code)}>
          Start now
        </Button>
      )}
    </div>
  );
}
