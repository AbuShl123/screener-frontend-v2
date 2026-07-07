import { FEATURES, type FeatureGlyph } from '../constants';

/** The leading glyph of a feature card (rotated accent square or a mono text glyph). */
function Glyph({ glyph }: { glyph: FeatureGlyph }) {
  if (glyph.kind === 'square') {
    return <span className="inline-block h-2 w-2 rotate-45 bg-accent" />;
  }
  return (
    <span
      className={`font-mono text-[12px] leading-none ${glyph.className} ${
        glyph.tracking ? 'tracking-[1px]' : ''
      }`}
    >
      {glyph.char}
    </span>
  );
}

/**
 * Features (plan §8.1, dark section per the v2 template): six static cards from the
 * `FEATURES` constant, on the `--color-surface-marketing` well for a smooth
 * transition out of the Pricing section. `scroll-mt` clears the sticky header on
 * anchor jumps.
 */
export function FeaturesSection() {
  return (
    <section
      id="features"
      className="scroll-mt-[72px] border-b border-border-subtle bg-surface-marketing text-text-secondary"
    >
      <div className="mx-auto max-w-[1140px] px-8 pb-[80px] pt-[72px]">
        <div className="mb-[14px] font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
          What you get
        </div>
        <h2 className="mb-3 text-[34px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
          Your thresholds. Your tickers. Sub-second.
        </h2>
        <p className="mb-10 max-w-[60ch] text-[15px] leading-[1.6] text-text-muted">
          A high-throughput engine watches the market so you don't have to — and tells you, out
          loud, when something matters.
        </p>

        <div className="grid grid-cols-3 gap-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.label}
              className="rounded-[10px] border border-border bg-input px-[22px] py-6"
            >
              <div className="mb-[14px] flex items-center gap-2">
                <Glyph glyph={feature.glyph} />
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
                  {feature.label}
                </span>
              </div>
              <p className="text-[14px] leading-[1.6] text-text-secondary">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
