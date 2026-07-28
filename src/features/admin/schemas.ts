import { z } from 'zod';

/**
 * Zod response schemas for the four ADMIN-only endpoints (source of both the runtime
 * validator and the inferred TS type), mirroring `.claude/docs/admin-users-usage-api.md`.
 * Same split philosophy as auth's `schemas.ts`: server-response shapes are Zod-validated
 * (the REST norm in this codebase; only the WS feed skips Zod), request bodies are plain
 * TS types.
 *
 * Strings are deliberately NOT over-constrained (no `.email()`/`.uuid()`): these are
 * server-authored values, and a stricter client schema would only manufacture false
 * contract-drift failures.
 */

// ── GET /api/admin/users ──

/**
 * `accessState` reuses the exact same vocabulary as auth's `AccessState` — the api doc is
 * explicit that an admin row and that user's own entitlement poll always agree, so the Users
 * state badge reuses the billing state-color logic rather than inventing a second enum.
 */
export const adminUserSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  role: z.enum(['USER', 'ADMIN']),
  emailVerified: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.string(), // ISO-8601 instant
  accessState: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'ADMIN']),
  accessExpiresAt: z.string().nullable(), // ISO-8601 instant, null for admins / no entitlement
  hasPaid: z.boolean(),
  lastSeenAt: z.string().nullable(), // ISO-8601 instant, null if never connected
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUsersPageSchema = z.object({
  users: z.array(adminUserSchema),
  page: z.number(), // zero-based, echoed
  size: z.number(), // echoed AFTER server clamping — don't assume the requested size
  totalElements: z.number(),
  totalPages: z.number(),
});
export type AdminUsersPage = z.infer<typeof adminUsersPageSchema>;

// ── POST /api/admin/entitlement/gift ──

export const giftResultSchema = z.object({
  updatedCount: z.number(), // distinct users gifted (post-dedup) — equals results.length
  grantedDurationSeconds: z.number(),
  results: z.array(
    z.object({
      userId: z.string(),
      // Already reflects stacking on remaining time — authoritative, never re-derive as now+days.
      newExpiresAt: z.string(),
    }),
  ),
});
export type GiftResult = z.infer<typeof giftResultSchema>;

/** Request body (plain type; validated client-side in the modal, not via Zod). */
export interface GiftRequest {
  userIds: string[];
  addPeriodDays: number;
  reason?: string;
}

// ── GET /api/monitoring/presence ──

export const presenceSchema = z.object({
  onlineUsers: z.number(), // distinct connected users — users.length
  totalSessions: z.number(), // open WS sessions across all users (a user's tabs count separately)
  users: z.array(
    z.object({
      userId: z.string(),
      sessions: z.number(),
      custom: z.boolean(),
    }),
  ),
});
export type Presence = z.infer<typeof presenceSchema>;

// ── GET /api/monitoring/usage ──

export const usageSliceSchema = z.object({
  start: z.string(), // ISO-8601 offset datetime, in `zone`
  end: z.string(),
  uniqueConnections: z.number(),
});
export type UsageSlice = z.infer<typeof usageSliceSchema>;

export const usageReportSchema = z.object({
  start: z.string(), // window start (inclusive), projected into `zone`
  end: z.string(), // window end (EXCLUSIVE) — the day after the requested `end`
  zone: z.string(),
  slice: z.string(), // echoed ISO-8601 slice, e.g. "PT24H"
  sliceCount: z.number(), // count of NON-EMPTY slices returned
  totalConnections: z.number(), // sum of uniqueConnections across slices (not distinct-over-range)
  mostActive: usageSliceSchema.nullable(), // null only when the range has zero non-empty slices
  slices: z.array(usageSliceSchema), // NON-EMPTY slices only — gaps must be zero-filled client-side
});
export type UsageReport = z.infer<typeof usageReportSchema>;

/** Query params for `fetchUsage`; all optional (server has defaults). */
export interface UsageParams {
  start?: string; // YYYY-MM-DD (calendar date in `zone`)
  end?: string; // YYYY-MM-DD, inclusive
  slice?: string; // ISO-8601 duration or the P1M/P1Y calendar literals
  zone?: string; // IANA zone id
}
