import { request } from '@/lib/api';
import { withAuth } from '@/features/auth';
import {
  adminUsersPageSchema,
  giftResultSchema,
  presenceSchema,
  usageReportSchema,
  type AdminUsersPage,
  type GiftRequest,
  type GiftResult,
  type Presence,
  type UsageParams,
  type UsageReport,
} from './schemas';

/**
 * The four ADMIN-only endpoints as pure functions over `request()` + the schemas, mirroring
 * billing's `api.ts`. All four are admin-authed, so every one goes through the auth layer's
 * `withAuth((token) => request(...))` — this module never reads tokens directly.
 *
 * The empty-body `403` these return for a non-admin/anonymous caller is Spring Security's
 * bearer rejection — the exact contract `withAuth` already handles (refresh-then-retry once).
 * A *persistent* 403 is an authorization result, not a session failure: the query layer
 * (`queries.ts`) pins `retry: false` so it surfaces as a terminal "forbidden" state and never
 * triggers a logout (plan §6).
 */

const ADMIN = '/api/admin';
const MONITORING = '/api/monitoring';

/** Server clamps `size` to [1,100] silently — clamp here too so labels/paging stay honest. */
const clampSize = (size: number) => Math.min(100, Math.max(1, Math.trunc(size)));

/**
 * `GET /api/admin/users?page&size` — paginated user directory, newest first. The response
 * echoes the actually-applied `size` (post-clamp); consumers should read that back rather than
 * assume the requested value.
 */
export const fetchAdminUsers = (
  page: number,
  size: number,
  signal?: AbortSignal,
): Promise<AdminUsersPage> => {
  const qs = new URLSearchParams({
    page: String(Math.max(0, Math.trunc(page))),
    size: String(clampSize(size)),
  });
  return withAuth((token) =>
    request(`${ADMIN}/users?${qs}`, { method: 'GET', token, schema: adminUsersPageSchema, signal }),
  );
};

/**
 * `POST /api/admin/entitlement/gift` — bulk-grant free days, stacked on each user's remaining
 * access (all-or-nothing: one unknown id rejects the whole request with 404). On a 404 the
 * backend body lists the unknown id(s) — we let the `ApiError` propagate so the mutation can
 * surface `err.message`.
 */
export const giftEntitlement = (body: GiftRequest, signal?: AbortSignal): Promise<GiftResult> =>
  withAuth((token) =>
    request(`${ADMIN}/entitlement/gift`, {
      method: 'POST',
      body,
      token,
      schema: giftResultSchema,
      signal,
    }),
  );

/**
 * `GET /api/monitoring/presence` — live in-memory snapshot of who is connected right now.
 * Never errors on empty (`{onlineUsers:0,…}`), so there's no empty-state error path.
 */
export const fetchPresence = (signal?: AbortSignal): Promise<Presence> =>
  withAuth((token) =>
    request(`${MONITORING}/presence`, { method: 'GET', token, schema: presenceSchema, signal }),
  );

/**
 * `GET /api/monitoring/usage?…` — persisted distinct-users-per-slice history. `zone` is passed
 * explicitly (default `Asia/Tashkent`, the server default) so slice labels are deterministic
 * regardless of any server-default drift. Undefined params are omitted from the query string.
 */
export const fetchUsage = (params: UsageParams, signal?: AbortSignal): Promise<UsageReport> => {
  const qs = new URLSearchParams();
  if (params.start) qs.set('start', params.start);
  if (params.end) qs.set('end', params.end);
  if (params.slice) qs.set('slice', params.slice);
  qs.set('zone', params.zone ?? 'Asia/Tashkent');
  return withAuth((token) =>
    request(`${MONITORING}/usage?${qs}`, { method: 'GET', token, schema: usageReportSchema, signal }),
  );
};
