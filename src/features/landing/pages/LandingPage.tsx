import { LandingHeader } from '../components/LandingHeader';
import { HeroSection } from '../components/HeroSection';
import { CtaSection } from '../components/CtaSection';
import { LandingFooter } from '../components/LandingFooter';

/**
 * Public marketing home page (plan §8). Reachable in any auth state; the header
 * and CTAs self-adapt via `useLandingNav`.
 *
 * Phase 2: Pricing and Features are empty `<section id>` placeholders so the
 * header's anchor links resolve. Their content lands in Phase 3. The
 * `scroll-mt-[72px]` clears the sticky header on anchor jumps.
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg font-sans text-text-secondary">
      <LandingHeader />
      <HeroSection />
      <section id="pricing" className="scroll-mt-[72px]" />
      <section id="features" className="scroll-mt-[72px]" />
      <CtaSection />
      <LandingFooter />
    </div>
  );
}
