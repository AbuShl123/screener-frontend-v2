// Static marketing copy for the landing page (plan §8.1). These are deliberate
// advertising constants, NOT live figures.

/**
 * Trial length shown across the landing (hero, CTA). Landing-feature constant
 * (plan §2.6) — swap for a backend value if trial length is ever exposed.
 */
export const TRIAL_DAYS = 7;

export interface Stat {
  value: string;
  caption: string;
}

/** The four hero stat blocks (plan §8.1). Marketing copy, not live numbers. */
export const STATS: Stat[] = [
  { value: '500+', caption: 'Tickers · spot & futures' },
  { value: '20+', caption: 'Exchanges covered' },
  { value: '<1s', caption: 'Streaming latency' },
  { value: '100K+/s', caption: 'Book updates processed' },
];

/**
 * A feature card's leading glyph (plan §8.1). Either the rotated accent square
 * or a mono text glyph tinted with a theme token.
 */
export type FeatureGlyph =
  | { kind: 'square' }
  | { kind: 'text'; char: string; className: string; tracking?: boolean };

export interface Feature {
  glyph: FeatureGlyph;
  label: string;
  body: string;
}

/** The six static Features cards (plan §8.1). Static advertising copy. */
export const FEATURES: Feature[] = [
  {
    glyph: { kind: 'square' },
    label: 'Live order books',
    body: 'Real-time local books for 500+ spot and futures tickers across 20+ exchanges, streamed over WebSockets in under a second.',
  },
  {
    glyph: { kind: 'square' },
    label: 'Rules you define',
    body: 'Set custom classification thresholds per ticker. Levels are ranked by proximity to the spread and notional value — significance on your terms, not ours.',
  },
  {
    glyph: { kind: 'text', char: '▁▃▂▅▇', className: 'text-accent', tracking: true },
    label: 'Charts',
    body: 'Volume-change charts for every ticker on every exchange, plus candlestick data — see where activity is building before the move.',
  },
  {
    glyph: { kind: 'text', char: '▲', className: 'text-bid' },
    label: 'Open interest alerts',
    body: "When a ticker's open interest grows unusually large, you're notified the moment it happens — not an hour later.",
  },
  {
    glyph: { kind: 'text', char: '◉', className: 'text-accent' },
    label: 'Voice notifications',
    body: 'Alerts are read out loud with text-to-speech. Watch the market without watching the screen.',
  },
  {
    glyph: { kind: 'text', char: '<1s', className: 'text-accent' },
    label: 'Built for volume',
    body: 'Engineered for hundreds of thousands of book updates per second. No queues, no sampling, no lag — the number you see is the market now.',
  },
];
