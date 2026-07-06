import { BrandMark } from '@/components/BrandMark';

/** Landing footer (plan §8.1): brand + copyright line. */
export function LandingFooter() {
  return (
    <footer className="flex items-center justify-between border-t border-border-subtle px-8 py-6">
      <BrandMark />
      <span className="font-mono text-[10px] tracking-[0.08em] text-text-dim">
        © 2026 screener · real-time market data · 20+ exchanges
      </span>
    </footer>
  );
}
