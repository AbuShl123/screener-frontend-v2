/**
 * The single source of truth for where an "open my account" link should land, keyed on role.
 *
 * The admin default (Analytics) is a property of the ENTRY LINKS into the account area, not a
 * route redirect: typing `/account` directly always yields the profile (intent respected), while
 * the dashboard profile icon / billing account button send admins to Analytics (plan §4a). Any
 * future "go to account" link must route through here rather than a bare `/account`, or an admin
 * would land on the profile instead of Analytics.
 */
export function accountHome(role?: string): string {
  return role === 'ADMIN' ? '/account/analytics' : '/account';
}
