import { useQuery } from '@tanstack/react-query';
import { authKeys, fetchMe, useSession } from './session';

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
