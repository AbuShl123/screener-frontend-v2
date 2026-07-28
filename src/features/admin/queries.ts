import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { fetchAdminUsers, fetchPresence, fetchUsage, giftEntitlement } from './api';
import type { GiftRequest, UsageParams } from './schemas';

/**
 * TanStack Query ownership of the admin data layer (conventional read/CRUD screens — ordinary
 * server state, no real-time / outside-React machinery). Every hook pins `retry: false`: a 403
 * from these endpoints is an authorization result, not a transient failure, so it should land
 * as a terminal state rather than retry-storm or trip the auth layer's logout path (plan §6).
 */

export const adminKeys = {
  all: ['admin'] as const,
  users: (page: number, size: number) => ['admin', 'users', 'page', page, size] as const,
  usersTotal: ['admin', 'users', 'total'] as const,
  presence: ['admin', 'presence'] as const,
  usage: (params: UsageParams) => ['admin', 'usage', params] as const,
};

/**
 * A page of the user directory. `keepPreviousData` (v5 `placeholderData: keepPrevious`) so a
 * page/size change doesn't flash empty; modest `staleTime` since the directory changes rarely.
 */
export function useAdminUsers(page: number, size: number) {
  return useQuery({
    queryKey: adminKeys.users(page, size),
    queryFn: ({ signal }) => fetchAdminUsers(page, size, signal),
    placeholderData: (prev) => prev, // keepPreviousData: hold the last page while the next loads
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * A lightweight `totalElements` probe (`fetchAdminUsers(0, 1)` → `select` the count), cached
 * long. Backs both the sidebar Users badge and the Analytics "online now / N total" denominator
 * without coupling either to a full page fetch — the nav renders even when Users isn't open.
 */
export function useUsersTotal(enabled = true) {
  return useQuery({
    queryKey: adminKeys.usersTotal,
    queryFn: ({ signal }) => fetchAdminUsers(0, 1, signal),
    select: (data) => data.totalElements,
    enabled, // the sidebar renders for admins only, but the hook is called unconditionally — gate it
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Live presence poll for the Analytics "Online now" tile. `refetchInterval` keeps it fresh while
 * the screen is mounted; `enabled` turns it off elsewhere. Cheap in-memory endpoint, safe to
 * poll; `staleTime: 0` so a remount reflects the current instant immediately.
 */
export function usePresence(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.presence,
    queryFn: ({ signal }) => fetchPresence(signal),
    enabled,
    refetchInterval: enabled ? 20_000 : false,
    staleTime: 0,
    retry: false,
  });
}

/**
 * The persisted usage report for the chart + Total-connections/Most-active tiles. Guarded by the
 * caller's client-side `tooFine` check (via `enabled`) so a wide range × fine slice never fires
 * the expensive request the backend would choke on (plan §2b).
 */
export function useUsage(params: UsageParams, enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.usage(params),
    queryFn: ({ signal }) => fetchUsage(params, signal),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Bulk gift-days mutation. On success, invalidate the whole `['admin','users']` subtree — both
 * the paged directory (so rows show the new `accessExpiresAt`) and the total probe. Presence is
 * deliberately NOT invalidated: a gift changes entitlement, not who is currently connected.
 * A 404 (unknown id) rejects all-or-nothing; the caller surfaces `err.message`.
 */
export function useGiftEntitlement() {
  return useMutation({
    mutationFn: (body: GiftRequest) => giftEntitlement(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}
