import type { AccessState } from '@/features/auth';

/**
 * `accessState` → theme color for the Users state pill, matching the design's `STATE_COLOR` and
 * the billing access-card hero semantics (ACTIVE/ADMIN positive, TRIAL warning, EXPIRED danger).
 * The api doc says this enum is identical to the user-facing one, so we reuse those colors rather
 * than inventing a second map — kept as a small colocated code→display map, the same pattern as
 * billing's `historyView` `STATUS`/`SOURCE` maps.
 */
export const ACCESS_STATE_COLOR: Record<AccessState, string> = {
  ACTIVE: 'var(--color-bid)',
  TRIAL: 'var(--color-warning)',
  EXPIRED: 'var(--color-danger)',
  ADMIN: 'var(--color-accent)',
};

/** Page-size options for the directory footer (default 20). */
export const PAGE_SIZES = [10, 20, 50, 100] as const;
