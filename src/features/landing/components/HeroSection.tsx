import { Button } from '@/components/Button';
import { TickerStrip } from '@/components/TickerStrip';
import { useLandingNav } from '../useLandingNav';
import { STATS, TRIAL_DAYS } from '../constants';
import { OrderBookPreview } from './OrderBookPreview';

function scrollToPricing() {
  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function StatsRow() {
  return (
    <div className="mx-auto grid max-w-[1140px] grid-cols-4 gap-6 px-8 pb-[56px]">
      {STATS.map((stat) => (
        <div key={stat.caption} className="border-t border-border-subtle pt-4">
          <div className="font-mono text-[24px] text-text-strong">{stat.value}</div>
          <div className="mt-[6px] font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
            {stat.caption}
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
  const { isAuthed, startTrial, goDashboard } = useLandingNav();

  return (
    <section className="border-b border-border-subtle">
      <div className="mx-auto grid max-w-[1140px] grid-cols-[1.05fr_0.95fr] items-center gap-16 px-8 pb-[72px] pt-[88px]">
        <div>
          <div className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
            Real-time market intelligence
          </div>
          <h1 className="mb-[22px] text-[44px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
            Every level that matters, in real time.
          </h1>
          <p className="mb-8 max-w-[52ch] text-[16px] leading-[1.6] text-text-secondary">
            Screener maintains live order books for{' '}
            <span className="font-mono text-text-strong">500+</span> spot and futures tickers across{' '}
            <span className="font-mono text-text-strong">20+</span> crypto exchanges, classifies
            every price level against your own thresholds, and streams the result to you in under a
            second.
          </p>
          <div className="mb-[14px] flex items-center gap-3">
            {isAuthed ? (
              <Button
                variant="primary"
                fullWidth={false}
                onClick={goDashboard}
                className="px-6 py-[14px]"
              >
                Go to dashboard
              </Button>
            ) : (
              <Button
                variant="primary"
                fullWidth={false}
                onClick={startTrial}
                className="px-6 py-[14px]"
              >
                Start {TRIAL_DAYS}-day free trial
              </Button>
            )}
            <Button
              variant="outline"
              fullWidth={false}
              onClick={scrollToPricing}
              className="px-6 py-[14px]"
            >
              See pricing
            </Button>
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-dim">
            free on first registration · no card needed
          </div>
        </div>

        <OrderBookPreview />
      </div>

      <StatsRow />

      <TickerStrip show centered />
    </section>
  );
}
