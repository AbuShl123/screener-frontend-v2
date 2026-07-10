import type { PlanView } from '../catalog';

/**
 * One selectable plan card for the Choose Plan grid (plan §6). Billing-local — NOT
 * landing's `PlanCard`, which hard-codes a single "Start now" CTA (plan §4). The shared
 * surface is the catalog's `PlanView`; the chrome is not.
 *
 * Only the CTA button navigates — the card itself is a non-interactive `<div>` so
 * clicking anywhere else (e.g. reading the description) doesn't trigger navigation.
 * `highlight` (always pay-as-you-go) is the only visual axis, matching landing's
 * amber ring + tint + amber CTA.
 */
export function PlanChoiceCard({ plan, onSelect }: { plan: PlanView; onSelect: () => void }) {
  const cardClass = plan.highlight
    ? 'border-2 border-warning bg-[color-mix(in_oklab,#f5b84d_9%,#0d1219)]'
    : 'border border-border bg-input';

  const ctaClass = plan.highlight
    ? 'bg-warning text-[#1a1206] hover:brightness-110'
    : 'border border-accent text-accent hover:bg-[color-mix(in_oklab,#4ea8ff_10%,transparent)]';

  return (
    <div className={`flex min-h-[440px] flex-col rounded-[14px] px-6 py-7 text-left ${cardClass}`}>
      <div className="mb-[18px] flex min-h-5 items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
          {plan.name}
        </span>
        {plan.badge && (
          <span
            className={`rounded-[4px] px-[7px] py-[3px] font-mono text-[9px] uppercase tracking-[0.08em] ${
              plan.badgeStyle === 'accent'
                ? 'bg-[color-mix(in_oklab,#f5b84d_22%,transparent)] text-warning'
                : 'bg-[color-mix(in_oklab,#4ea8ff_22%,transparent)] text-accent'
            }`}
          >
            {plan.badge}
          </span>
        )}
      </div>

      <div className="font-mono text-[30px] tracking-[-0.01em] text-text">{plan.price}</div>
      <div className="mb-4 mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
        {plan.unit}
      </div>

      <p className="mb-[18px] flex-1 text-[14px] leading-[1.55] text-text-muted">{plan.desc}</p>

      <div className="mb-[18px] font-mono text-[11px] text-text-dim">{plan.perDay}</div>

      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-[8px] px-[14px] py-[14px] text-center font-sans text-[15px]
                    font-medium leading-none transition-[filter,background-color] duration-150
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                    focus-visible:outline-accent ${ctaClass}`}
      >
        {plan.highlight ? 'Start now' : 'Choose plan'}
      </button>
    </div>
  );
}
