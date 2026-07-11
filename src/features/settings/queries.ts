import { useQuery } from '@tanstack/react-query';
import { useSession, withAuth } from '@/features/auth';
import * as api from './api';

/**
 * React Query ownership of the active-ticker list (REST / server state → TanStack
 * Query cache, per CLAUDE.md's data-flow split). `withAuth` gives
 * refresh-on-403-then-retry for free.
 */

export const settingsKeys = {
  tickers: ['settings', 'tickers'] as const,
};

/**
 * Fetch `GET /api/tickers`. `enabled` is driven by the Settings modal being open — we
 * don't pull the ticker list until the user actually opens settings. Also gated on an
 * authenticated session so it stays idle before login.
 *
 * The backend refreshes the list every 3–4h; a 30-minute `staleTime` plus the re-fetch
 * on modal open (via `enabled` flipping) is plenty.
 */
export function useTickers(enabled: boolean) {
  const status = useSession((s) => s.status);
  return useQuery({
    queryKey: settingsKeys.tickers,
    queryFn: () => withAuth((token) => api.tickers(token)),
    enabled: enabled && status === 'authenticated',
    staleTime: 30 * 60_000,
  });
}
