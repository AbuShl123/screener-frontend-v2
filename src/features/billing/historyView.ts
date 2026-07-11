import { PLAN_NAMES } from './catalog';
import type { OrderStatus, OrderHistoryEntry } from './schemas';

/**
 * Presentation maps + formatting helpers for the Billing-history page, ported faithfully from
 * the "Billing History" design template (its `PLAN`/`STATUS`/`REASON`/`SOURCE` maps and
 * `fmtDate`/`fmtTime`/`days` helpers are the source of truth for copy and colors). Kept out of
 * the page component so it stays lean — the same split as `catalog.ts` for the Account page.
 *
 * Colors are design-system theme tokens as `var(--color-…)` strings, applied via inline
 * `style` (the values are data-driven, so they can't be static Tailwind classes).
 */

const groupFmt = new Intl.NumberFormat('en-US');

/** e.g. "Jul 11, 2026" — shared with AccountPage's date rendering (plan §6). */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** e.g. "Jul 11, 2026 · 09:15" — date plus zero-padded 24h local time, for timeline rows. */
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
 * Plan code → display name for the four known plans, from the copy catalog (the single
 * source of readable plan labels), so history rows show a name rather than the raw code.
 */
export const PLAN = PLAN_NAMES;

/** Order status → timeline/pill label + dot color. */
export const STATUS: Record<OrderStatus, { label: string; color: string }> = {
  CREATED: { label: 'Created', color: 'var(--color-accent)' },
  PENDING: { label: 'Pending', color: 'var(--color-accent)' },
  PAID: { label: 'Paid', color: 'var(--color-bid)' },
  EXPIRED: { label: 'Expired', color: 'var(--color-text-dim)' },
  FAILED: { label: 'Failed', color: 'var(--color-danger)' },
  CANCELED: { label: 'Canceled', color: 'var(--color-text-dim)' },
  REVERTED: { label: 'Refunded', color: 'var(--color-warning)' },
};

/** Transition reason code → human copy (falls back to the raw code if unmapped). */
export const REASON: Record<string, string> = {
  SUPERSEDED: 'Superseded by a newer order',
  USER_CANCELED: 'Canceled before payment',
  INVOICE_EXPIRED: 'Invoice expired — no payment received',
  AMOUNT_MISMATCH: 'Payment amount did not match',
  UNKNOWN_ORDER: 'Unknown order referenced',
  PROVIDER_ERROR: 'Payment failed at provider',
  PROVIDER_REVERT: 'Refund detected — access kept',
  CALLBACK_GRANT: 'Paid & access granted',
  RECONCILED_GRANT: 'Paid & granted (reconciled)',
};

/** Grant source → pill label + color. */
export const SOURCE: Record<string, { label: string; color: string }> = {
  PURCHASE: { label: 'Purchase', color: 'var(--color-accent)' },
  TRIAL: { label: 'Trial', color: 'var(--color-text-muted)' },
  ADMIN: { label: 'Admin gift', color: 'var(--color-bid)' },
};

export interface TimelineRow {
  key: string;
  dotColor: string;
  toLabel: string;
  timeStr: string;
  reasonLine: string;
}

/**
 * Map a fetched order history (already newest-first from the API) into timeline view rows,
 * mirroring the design's `buildHistory`: dot color + label from `STATUS[toStatus]`, a reason
 * line from the `REASON` map (or a self-explanatory default for the reason-less
 * `CREATED`/`PENDING` hops), with an optional free-form `reasonDetail` appended.
 */
export function buildTimeline(entries: OrderHistoryEntry[]): TimelineRow[] {
  return entries.map((e) => {
    const meta = STATUS[e.toStatus];
    const base = e.reason
      ? REASON[e.reason] ?? e.reason
      : e.toStatus === 'PENDING'
        ? 'Awaiting payment'
        : e.toStatus === 'CREATED'
          ? 'Order created'
          : '';
    const reasonLine = e.reasonDetail ? (base ? `${base} — ${e.reasonDetail}` : e.reasonDetail) : base;
    return {
      key: String(e.seq),
      dotColor: meta.color,
      toLabel: meta.label,
      timeStr: fmtDateTime(e.createdAt),
      reasonLine,
    };
  });
}
