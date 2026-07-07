/**
 * Tier → data-viz color scale, shared by the order-book bars ([`OrderbookCard`]) and the
 * notification stripe ([`NotificationCard`]). These are the dashboard's chosen tier colors
 * (Dashboard template props tier1–4), NOT theme tokens — they're tier-scale data-viz values
 * specific to this surface, and the exact values the future "settings" feature would expose.
 * Index 0 (and any out-of-range tier) has no color: the dashboard runs `tier0=hidden`.
 */
export const TIER_COLORS: readonly (string | null)[] = [
  null,
  '#57ff92',
  '#f7bb18',
  '#ff8080',
  '#a12eff',
];

/** Bar fill opacity (%) — the dashboard's `fillOpacity` prop. */
const FILL_OPACITY = 26;

/** Bar background for a tier, or `transparent` for tier 0 / out-of-range (hidden). */
export function barBackground(tier: number): string {
  const hex = TIER_COLORS[tier];
  return hex ? `color-mix(in oklab, ${hex} ${FILL_OPACITY}%, transparent)` : 'transparent';
}
