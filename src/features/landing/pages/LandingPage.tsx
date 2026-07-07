import { LandingHeader } from '../components/LandingHeader';
import { HeroSection } from '../components/HeroSection';
import { PricingSection } from '../components/PricingSection';
import { FeaturesSection } from '../components/FeaturesSection';
import { CtaSection } from '../components/CtaSection';
import { LandingFooter } from '../components/LandingFooter';

/**
 * Public marketing home page (plan §8). Reachable in any auth state; the header
 * and CTAs self-adapt via `useLandingNav`.
 *
 * All sections are dark (the v2 design template). Smooth transitions come from
 * stepping the section surface between near-blacks — page `bg` (Hero, CTA) →
 * `surface` (Pricing) → `surface-marketing` (Features) — rather than the v1
 * dark→light→light→dark rhythm. The Pricing/Features sections own their `id` +
 * `scroll-mt` so the header's anchor jumps clear the sticky bar.
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg font-sans text-text-secondary">
      <LandingHeader />
      <HeroSection />
      <PricingSection />
      <FeaturesSection />
      <CtaSection />
      <LandingFooter />
    </div>
  );
}
