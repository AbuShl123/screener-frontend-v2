/**
 * Locale-aware DATE formatting — the one place the active language feeds `Intl`.
 *
 * Only dates/times localize (Russian month names, DD.MM ordering); NUMBERS NEVER DO
 * (owner-confirmed — order-book figures, billing amounts, and rule thresholds keep a fixed,
 * universally-readable format via the existing `Intl.NumberFormat` constants, untouched).
 *
 * ⛔ This helper reads `i18n.language`, so it is chrome-only. NEVER call it — or any
 * locale-aware Intl — on the order-book hot path (feedClient flush / applyMessages /
 * selectNotifications / cooldown / OrderbookCard numerics). See §6.4 of the i18n plan.
 */

import { i18n } from './index';
import { resolveLocale } from './config';

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

/**
 * Format an ISO timestamp for display in the active UI language, e.g. "Jul 11, 2026" (en) /
 * "11 авг. 2026" (ru). Reads `i18n.language` at call time so it tracks language switches.
 *
 * Russian's `Intl` short format appends a year marker (" г.") after the year — visually noisy
 * next to the already-abbreviated month ("1 авг. 2026 г."). We format via `formatToParts` and
 * drop any TRAILING literal so that suffix disappears while keeping every locale's ordering and
 * separators intact (English's "Jul 11, 2026" is unaffected — nothing trails its year).
 */
export function formatDate(iso: string, options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS): string {
  const parts = new Intl.DateTimeFormat(resolveLocale(i18n.language), options).formatToParts(new Date(iso));
  let lastFieldIdx = -1;
  parts.forEach((p, i) => {
    if (p.type !== 'literal') lastFieldIdx = i;
  });
  return parts
    .slice(0, lastFieldIdx + 1)
    .map((p) => p.value)
    .join('');
}

/**
 * Localized relative time for "last seen" style labels, e.g. "5 minutes ago" (en) /
 * "5 минут назад" (ru). Bucketed like the design template — minutes under an hour, hours under
 * a day and a half, then days — but rendered through `Intl.RelativeTimeFormat` so the unit and
 * plural agree with the active language. Chrome-only (reads `i18n.language`), same as `formatDate`.
 */
export function fmtRelative(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat(resolveLocale(i18n.language), { numeric: 'always' });
  const diffMs = new Date(iso).getTime() - Date.now(); // negative for the past
  const min = Math.round(diffMs / 60_000);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const h = Math.round(min / 60);
  if (Math.abs(h) < 36) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}
