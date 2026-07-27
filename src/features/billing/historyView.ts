import type { ParseKeys } from 'i18next';
import { formatDate } from '@/lib/i18n';
import { PLAN_NAME_KEYS } from './catalog';
import type { OrderStatus, OrderHistoryEntry } from './schemas';

/**
 * Presentation maps + formatting helpers for the Billing-history page, ported faithfully from
 * the "Billing History" design template (its `PLAN`/`STATUS`/`REASON`/`SOURCE` maps and
 * `fmtDate`/`fmtTime`/`days` helpers are the source of truth for copy and colors). Kept out of
 * the page component so it stays lean — the same split as `catalog.ts` for the Account page.
 *
 * i18n (§6.2, labelKey pattern): this module stays FREE of the i18next instance. The
 * status/reason/source maps carry stable `billing:` KEYS (not English prose); the component
 * resolves them with `t()`, preserving fallback-to-raw-code for unmapped codes. Dates go
 * through the shared `formatDate` (§6.4) so they localize; NUMBERS stay fixed-format (§10.1).
 *
 * Colors are design-system theme tokens as `var(--color-…)` strings, applied via inline
 * `style` (the values are data-driven, so they can't be static Tailwind classes).
 */

type BillingKey = ParseKeys<'billing'>;

const groupFmt = new Intl.NumberFormat('en-US');

/** e.g. "Jul 11, 2026" (en) / "11 июл. 2026 г." (ru) — shared with AccountPage (§6.4). */
export function fmtDate(iso: string): string {
  return formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** e.g. "Jul 11, 2026 · 09:15" — localized date plus zero-padded 24h local time, for timeline rows. */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDate(iso)} · ${hh}:${mm}`;
}

/** Whole days an access-duration (in seconds) buys, rounded — matches the design. */
export function days(seconds: number): number {
  return Math.round(seconds / 86_400);
}

/** `{amount} {currency}` with grouped thousands, e.g. "149,000 UZS". */
export function fmtAmount(amount: number, currency: string): string {
  return `${groupFmt.format(amount)} ${currency}`;
}

/** `color-mix` tint of a theme color at `pct`% over transparent — the design's `tint()`. */
export function tint(color: string, pct: number): string {
  return `color-mix(in oklab, ${color} ${pct}%, transparent)`;
}

/**
 * Plan code → display-name KEY for the four known plans, from the copy catalog (the single
 * source of readable plan labels), so history rows show a name (resolved with `t()`) rather
 * than the raw code. An unmapped code is `undefined` → the component falls back to the code.
 */
export const PLAN = PLAN_NAME_KEYS;

/** Order status → timeline/pill label KEY + dot color. */
export const STATUS: Record<OrderStatus, { labelKey: BillingKey; color: string }> = {
  CREATED: { labelKey: 'history.status.created', color: 'var(--color-accent)' },
  PENDING: { labelKey: 'history.status.pending', color: 'var(--color-accent)' },
  PAID: { labelKey: 'history.status.paid', color: 'var(--color-bid)' },
  EXPIRED: { labelKey: 'history.status.expired', color: 'var(--color-text-dim)' },
  FAILED: { labelKey: 'history.status.failed', color: 'var(--color-danger)' },
  CANCELED: { labelKey: 'history.status.canceled', color: 'var(--color-text-dim)' },
  REVERTED: { labelKey: 'history.status.reverted', color: 'var(--color-warning)' },
};

/** Transition reason code → copy KEY (component falls back to the raw code if unmapped). */
export const REASON: Record<string, BillingKey> = {
  SUPERSEDED: 'history.reason.SUPERSEDED',
  USER_CANCELED: 'history.reason.USER_CANCELED',
  INVOICE_EXPIRED: 'history.reason.INVOICE_EXPIRED',
  AMOUNT_MISMATCH: 'history.reason.AMOUNT_MISMATCH',
  UNKNOWN_ORDER: 'history.reason.UNKNOWN_ORDER',
  PROVIDER_ERROR: 'history.reason.PROVIDER_ERROR',
  PROVIDER_REVERT: 'history.reason.PROVIDER_REVERT',
  CALLBACK_GRANT: 'history.reason.CALLBACK_GRANT',
  RECONCILED_GRANT: 'history.reason.RECONCILED_GRANT',
};

/** Grant source → pill label KEY + color (component falls back to the raw source if unmapped). */
export const SOURCE: Record<string, { labelKey: BillingKey; color: string }> = {
  PURCHASE: { labelKey: 'history.source.purchase', color: 'var(--color-accent)' },
  TRIAL: { labelKey: 'history.source.trial', color: 'var(--color-text-muted)' },
  ADMIN: { labelKey: 'history.source.admin', color: 'var(--color-bid)' },
};

export interface TimelineRow {
  key: string;
  dotColor: string;
  toLabelKey: BillingKey;
  timeStr: string;
  /** A mapped/default reason KEY (resolve with `t()`), if any. */
  reasonBaseKey?: BillingKey;
  /** An unmapped reason CODE shown verbatim, if any (mutually exclusive with `reasonBaseKey`). */
  reasonBaseRaw?: string;
  /** Free-form provider/backend detail, shown verbatim and NEVER translated (§6.5). */
  reasonDetail?: string;
}

/**
 * Map a fetched order history (already newest-first from the API) into timeline view rows,
 * mirroring the design's `buildHistory`: dot color + label KEY from `STATUS[toStatus]`, a
 * reason from the `REASON` map (or a self-explanatory default KEY for the reason-less
 * `CREATED`/`PENDING` hops), with an optional free-form `reasonDetail` carried through.
 *
 * Stays free of `t()` (§6.2): it emits KEYS + the verbatim `reasonDetail`; the component
 * resolves the base reason and joins the detail via the `history.reasonWithDetail` template.
 */
export function buildTimeline(entries: OrderHistoryEntry[]): TimelineRow[] {
  return entries.map((e) => {
    const meta = STATUS[e.toStatus];
    // Mapped reason → its key; unmapped reason → verbatim code; reason-less CREATED/PENDING
    // hops → a default key; anything else → no base line.
    let reasonBaseKey: BillingKey | undefined;
    let reasonBaseRaw: string | undefined;
    if (e.reason) {
      const mapped = REASON[e.reason];
      if (mapped) reasonBaseKey = mapped;
      else reasonBaseRaw = e.reason;
    } else if (e.toStatus === 'PENDING') {
      reasonBaseKey = 'history.timeline.awaitingPayment';
    } else if (e.toStatus === 'CREATED') {
      reasonBaseKey = 'history.timeline.orderCreated';
    }
    return {
      key: String(e.seq),
      dotColor: meta.color,
      toLabelKey: meta.labelKey,
      timeStr: fmtDateTime(e.createdAt),
      reasonBaseKey,
      reasonBaseRaw,
      reasonDetail: e.reasonDetail ?? undefined,
    };
  });
}
