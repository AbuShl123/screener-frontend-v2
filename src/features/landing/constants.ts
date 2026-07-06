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
