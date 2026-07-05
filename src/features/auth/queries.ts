import { useMutation, useQuery } from '@tanstack/react-query';
import * as api from './api';
import { authKeys, fetchMe, useSession } from './session';
import type { RegisterRequest, ResendRequest, VerifyEmailRequest } from './schemas';

/**
 * React Query ownership of the `/me` profile. Per CLAUDE.md's data-flow table
 * (REST / server state incl. the auth profile → TanStack Query cache), the hydrated
 * profile is a React Query entry, NOT Zustand state. This is the only Phase 2 file
 * that imports React Query.
 *
 * `authKeys` is defined in `session.ts` (so `logout()` can evict this cache without a
 * dependency cycle) and re-exported here as the public surface.
 */
export { authKeys };

export function useMe() {
  const status = useSession((s) => s.status);
  return useQuery({
    queryKey: authKeys.me,
    queryFn: fetchMe, // handles refresh-on-401 internally via withAuth
    enabled: status === 'authenticated', // stay idle until tokens exist
    staleTime: 60_000,
  });
}

/**
 * Register mutation (POST /register → 202 { status, email }). Thin wrapper so the
 * page gets `isPending`/`error` (an `ApiError` — branch on `.status` for the 409/400
 * banner) for free. No cache writes: register issues no tokens and doesn't feed /me.
 */
export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterRequest) => api.register(body),
  });
}

/**
 * Resend-verification mutation (POST /resend-verification → always 202 generic).
 * Success just means "request accepted" — deliberately no enumeration, so callers
 * show a generic confirmation. No cache writes.
 */
export function useResendVerification() {
  return useMutation({
    mutationFn: (body: ResendRequest) => api.resendVerification(body),
  });
}

/**
 * Verify-email mutation (POST /verify-email → ALWAYS 200 { status }). The three
 * outcomes (success | expired | invalid) are NOT HTTP errors — the page branches on
 * `data.status`, not on isError. A rejected promise here means a genuine transport/5xx
 * fault (see the page's error branch), not a bad token. No cache writes: verify issues
 * no tokens and doesn't feed /me.
 */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: (body: VerifyEmailRequest) => api.verifyEmail(body),
  });
}
