/**
 * Tier → data-viz color scale, shared by the order-book bars ([`OrderbookCard`]) and the
 * notification stripe ([`NotificationCard`]). These are the dashboard's chosen tier colors
 * (Dashboard template props tier1–4), NOT theme tokens — they're tier-scale data-viz values
 * specific to this surface, and the exact values the future "settings" feature would expose.
 * Indexed by tier (1–4). Tier 0 does not exist on the wire (doc §3.5); index 0 is only a
 * placeholder so the array can be indexed by tier directly, and has no color.
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

/** Bar background for a tier, or `transparent` for an out-of-range value (the socket is unvalidated). */
export function barBackground(tier: number): string {
  const hex = TIER_COLORS[tier];
  return hex ? `color-mix(in oklab, ${hex} ${FILL_OPACITY}%, transparent)` : 'transparent';
}
