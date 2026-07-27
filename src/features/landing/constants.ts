// Structural marketing constants for the landing page (plan §8.1). The user-facing
// text has been extracted to the `landing` i18n namespace (plan §3 rollout): these
// arrays now carry only the non-localized bits — the fixed marketing figures and the
// glyph shapes — plus a stable key into `landing.json`, resolved with `t()` at render
// (the §6.2 labelKey pattern). Adding/removing a card is still a one-line edit here.

import type { ParseKeys } from 'i18next';

/** A type-checked key into the `landing` namespace — a typo here is a compile error. */
type LandingKey = ParseKeys<'landing'>;

/**
 * Trial length shown across the landing (hero, CTA). Landing-feature constant
 * (plan §2.6) — swap for a backend value if trial length is ever exposed.
 * Interpolated into the `{{days}}` slot of the trial copy, never concatenated.
 */
export const TRIAL_DAYS = 7;

export interface Stat {
  /** Fixed marketing figure — a universally-readable number, never localized (plan §10.1). */
  value: string;
  /** Key into `landing:hero.stats.*`, resolved with `t()` in the component. */
  captionKey: LandingKey;
}

/** The four hero stat blocks (plan §8.1). Values are fixed marketing figures. */
export const STATS: Stat[] = [
  { value: '500+', captionKey: 'hero.stats.tickers' },
  { value: '20+', captionKey: 'hero.stats.exchanges' },
  { value: '<1s', captionKey: 'hero.stats.latency' },
  { value: '100K+/s', captionKey: 'hero.stats.updates' },
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
  /** Key into `landing:features.items.*.label`, resolved with `t()` in the component. */
  labelKey: LandingKey;
  /** Key into `landing:features.items.*.body`, resolved with `t()` in the component. */
  bodyKey: LandingKey;
}

/** The six static Features cards (plan §8.1). Copy lives in `landing:features.items.*`. */
export const FEATURES: Feature[] = [
  {
    glyph: { kind: 'square' },
    labelKey: 'features.items.liveBooks.label',
    bodyKey: 'features.items.liveBooks.body',
  },
  {
    glyph: { kind: 'square' },
    labelKey: 'features.items.rules.label',
    bodyKey: 'features.items.rules.body',
  },
  {
    glyph: { kind: 'text', char: '▁▃▂▅▇', className: 'text-accent', tracking: true },
    labelKey: 'features.items.charts.label',
    bodyKey: 'features.items.charts.body',
  },
  {
    glyph: { kind: 'text', char: '▲', className: 'text-bid' },
    labelKey: 'features.items.oiAlerts.label',
    bodyKey: 'features.items.oiAlerts.body',
  },
  {
    glyph: { kind: 'text', char: '◉', className: 'text-accent' },
    labelKey: 'features.items.voice.label',
    bodyKey: 'features.items.voice.body',
  },
  {
    glyph: { kind: 'text', char: '<1s', className: 'text-accent' },
    labelKey: 'features.items.volume.label',
    bodyKey: 'features.items.volume.body',
  },
];
