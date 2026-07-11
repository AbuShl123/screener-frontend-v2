import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession, withAuth } from '@/features/auth';
import * as api from './api';
import type { RuleTarget, TierThreshold } from './schemas';

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

/**
 * Classification-rule queries + mutations (Settings → Classification rules). Conventional
 * REST/server-state per CLAUDE.md — TanStack Query cache, not the real-time store. Every
 * call goes through `withAuth` (refresh-on-403-then-retry); the JSON-body subscription
 * `403` survives that retry and surfaces to the UI as an `ApiError` (handled per plan §7).
 *
 * Both queries take `enabled` driven by *(modal open && tab === 'rules')* so nothing is
 * fetched until the user actually visits the section — same lazy pattern as `useTickers`.
 */
export const rulesKeys = {
  default: ['settings', 'rules', 'default'] as const,
  custom: ['settings', 'rules', 'custom'] as const,
};

/** Ungated (`GET /api/rules/default`) — safe for any authenticated user incl. EXPIRED. */
export function useDefaultRule(enabled: boolean) {
  const status = useSession((s) => s.status);
  return useQuery({
    queryKey: rulesKeys.default,
    queryFn: () => withAuth((t) => api.defaultRule(t)),
    enabled: enabled && status === 'authenticated',
    staleTime: 60 * 60_000, // defaults change rarely
  });
}

/**
 * Gated (`GET /api/rules`, active-subscription). For an EXPIRED user this lands in `isError`
 * with the JSON `403` — the pane degrades to an inline upgrade note rather than crashing.
 */
export function useCustomRules(enabled: boolean) {
  const status = useSession((s) => s.status);
  return useQuery({
    queryKey: rulesKeys.custom,
    queryFn: () => withAuth((t) => api.customRules(t)),
    enabled: enabled && status === 'authenticated',
    staleTime: 5 * 60_000,
    retry: false, // a subscription-403 won't self-resolve — don't hammer it
  });
}

/** `PUT /api/rules` for a single `(symbol, market)` — invalidates the custom list on success. */
export function useSaveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { target: RuleTarget; tiers: TierThreshold[] }) =>
      withAuth((t) =>
        api.putRules(t, { assignments: [{ rule: { tiers: v.tiers }, targets: [v.target] }] }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: rulesKeys.custom }),
  });
}

/** `DELETE /api/rules` for a single `(symbol, market)` — invalidates the custom list on success. */
export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (target: RuleTarget) => withAuth((t) => api.deleteRules(t, { targets: [target] })),
    onSuccess: () => qc.invalidateQueries({ queryKey: rulesKeys.custom }),
  });
}
