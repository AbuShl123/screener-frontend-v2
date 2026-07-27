import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { TickerStrip } from '@/components/TickerStrip';
import { useLandingNav } from '../useLandingNav';
import { STATS, TRIAL_DAYS } from '../constants';
import { OrderBookPreview } from './OrderBookPreview';

function scrollToPricing() {
  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function StatsRow() {
  const { t } = useTranslation('landing');
  return (
    <div className="mx-auto grid max-w-[1140px] grid-cols-4 gap-6 px-8 pb-[56px]">
      {STATS.map((stat) => (
        <div key={stat.captionKey} className="border-t border-border-subtle pt-4">
          <div className="font-mono text-[24px] text-text-strong">{stat.value}</div>
          <div className="mt-[6px] font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
            {t(stat.captionKey)}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Hero (plan §8.1): headline + lead copy + auth-aware CTA row, the decorative
 * OrderBookPreview, the 4-stat row, and the reused TickerStrip.
 */
export function HeroSection() {
  const { t } = useTranslation('landing');
  const { isAuthed, startTrial, goDashboard } = useLandingNav();

  return (
    <section className="border-b border-border-subtle">
      <div className="mx-auto grid max-w-[1140px] grid-cols-[1.05fr_0.95fr] items-center gap-16 px-8 pb-[72px] pt-[88px]">
        <div>
          <div className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
            {t('hero.eyebrow')}
          </div>
          <h1 className="mb-[22px] text-[44px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
            {t('hero.title')}
          </h1>
          <p className="mb-8 max-w-[52ch] text-[16px] leading-[1.6] text-text-secondary">
            {/* Full sentence as one key; the styled figures are marked with <mono> so word
                order can differ in RU (plan §5 — never concatenate translated fragments). */}
            <Trans
              t={t}
              i18nKey="hero.lead"
              components={{ mono: <span className="font-mono text-text-strong" /> }}
            />
          </p>
          <div className="mb-[14px] flex items-center gap-3">
            {isAuthed ? (
              <Button
                variant="primary"
                fullWidth={false}
                onClick={goDashboard}
                className="px-6 py-[14px]"
              >
                {t('hero.goDashboard')}
              </Button>
            ) : (
              <Button
                variant="primary"
                fullWidth={false}
                onClick={startTrial}
                className="px-6 py-[14px]"
              >
                {t('hero.startTrial', { days: TRIAL_DAYS })}
              </Button>
            )}
            <Button
              variant="outline"
              fullWidth={false}
              onClick={scrollToPricing}
              className="px-6 py-[14px]"
            >
              {t('hero.seePricing')}
            </Button>
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
            {t('hero.noCard')}
          </div>
        </div>

        <OrderBookPreview />
      </div>

      <StatsRow />

      <TickerStrip show centered />
    </section>
  );
}
