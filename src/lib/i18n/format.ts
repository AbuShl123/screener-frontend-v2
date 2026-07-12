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
 * "11 июл. 2026 г." (ru). Reads `i18n.language` at call time so it tracks language switches.
 */
export function formatDate(iso: string, options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS): string {
  return new Date(iso).toLocaleDateString(resolveLocale(i18n.language), options);
}
