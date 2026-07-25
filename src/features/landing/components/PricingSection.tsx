import { Trans, useTranslation } from 'react-i18next';
import { buildPlanViews, usePlans } from '@/features/billing';
import { useLandingNav } from '../useLandingNav';
import { TRIAL_DAYS } from '../constants';
import { PlanCard } from './PlanCard';

/**
 * Pricing (plan §8.1, dark section per the v2 template). Renders fallback-first
 * (§2.4): the cards appear immediately from the catalog's built-in prices and live
 * amounts override once `usePlans()` resolves — no skeleton, no layout shift, and a
 * query error just leaves the fallbacks in place. `scroll-mt` clears the sticky
 * header on anchor jumps.
 */
export function PricingSection() {
  const { t } = useTranslation('landing');
  const { data } = usePlans();
  const { startPlan } = useLandingNav();
  const plans = buildPlanViews(data);

  return (
    <section
      id="pricing"
      className="scroll-mt-[72px] border-y border-border-subtle bg-surface text-text-secondary"
    >
      <div className="mx-auto max-w-[1140px] px-8 pb-[80px] pt-[72px]">
        <div className="mb-[14px] font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
          {t('pricing.eyebrow')}
        </div>

        <div className="mb-7 flex flex-wrap items-end justify-between gap-8">
          <h2 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
            {t('pricing.title')}
          </h2>
          <p className="max-w-[44ch] text-[15px] leading-[1.6] text-text-muted">
            {t('pricing.subtitle')}
          </p>
        </div>

        {/* Trial banner — accent-tinted, one-off color-mix values */}
        <div className="mb-8 flex items-center gap-3 rounded-[8px] border border-[color-mix(in_oklab,#4ea8ff_38%,transparent)] bg-[color-mix(in_oklab,#4ea8ff_10%,transparent)] px-4 py-[13px]">
          <span className="whitespace-nowrap rounded-[4px] bg-[#1f6fd4] px-[7px] py-[3px] font-mono text-[9px] font-semibold tracking-[0.08em] text-white">
            {t('pricing.trialBadge', { days: TRIAL_DAYS })}
          </span>
          <span className="text-[14px] text-text-secondary">
            <Trans
              t={t}
              i18nKey="pricing.trialNote"
              values={{ days: TRIAL_DAYS }}
              components={{ strong: <strong className="font-semibold text-text" /> }}
            />
          </span>
        </div>

        <div className="grid grid-cols-4 items-stretch gap-4">
          {plans.map((plan) => (
            <PlanCard key={plan.code} plan={plan} onStart={startPlan} />
          ))}
        </div>

        <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
          {t('pricing.footnote')}
        </div>
      </div>
    </section>
  );
}
