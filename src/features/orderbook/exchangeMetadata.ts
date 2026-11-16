import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useSession, withAuth } from '@/features/auth';
import { parseExchangesPayload, useExchangeRegistry } from '@/features/orderbook/exchanges';
import { useOrderbookStore } from '@/stores/orderbookStore';

/**
 * `GET /api/exchanges` → the exchange registry (contract:
 * `.claude/docs/changes/exchange-metadata-api.md`). Conventional REST via TanStack Query, but
 * the RESULT is applied to the framework-agnostic registry store inside the query function,
 * so it happens exactly once per successful fetch with no effect-driven re-application.
 *
 * Failure handling: a network/HTTP error or a malformed payload throws, the query errors, and
 * the registry keeps whatever it had (cache or seed). A valid EMPTY list is applied as-is.
 * The feed and the dashboard never wait on this query.
 */

const exchangeKeys = { all: ['exchanges'] as const };

/** Minimum gap between two metadata requests, whatever triggered them. */
const MIN_REFETCH_GAP_MS = 60_000;

/** Start time of the latest request attempt (success OR failure) — the refetch throttle. */
let lastAttemptAt = 0;

async function fetchExchanges() {
  lastAttemptAt = Date.now();
  // `z.unknown()` only passes the JSON through (`request` returns nothing without a schema);
  // the strict validation — whole-payload accept/reject — is `parseExchangesPayload`.
  const raw = await withAuth((token) =>
    request('/api/exchanges', { method: 'GET', token, schema: z.unknown() }),
  );
  const entries = parseExchangesPayload(raw);
  if (entries === null) {
    // Never let a malformed payload replace a valid registry.
    throw new Error('Malformed /api/exchanges response');
  }
  useExchangeRegistry.getState().setFromServer(entries);
  return entries;
}

/**
 * Ask for fresh metadata, at most once per `MIN_REFETCH_GAP_MS` since the last ATTEMPT.
 * Only refetches an active (mounted + enabled) query, so it does nothing before login.
 */
function requestRefresh(): void {
  if (Date.now() - lastAttemptAt < MIN_REFETCH_GAP_MS) return;
  void queryClient.invalidateQueries({ queryKey: exchangeKeys.all, refetchType: 'active' });
}

// Refetch triggers, wired once at module load (no React effects, so no render loops):
// 1. the feed revealed an exchange the metadata doesn't list. `provisionalSeq` only grows on a
//    first sighting from the feed, never from a server response, so a refetch can't re-trigger it.
useExchangeRegistry.subscribe((s, prev) => {
  if (s.provisionalSeq > prev.provisionalSeq) requestRefresh();
});
// 2. the socket came back after a drop — the backend may have restarted with new adapters.
useOrderbookStore.subscribe((s, prev) => {
  if (s.status === 'connected' && prev.status === 'reconnecting') requestRefresh();
});

/**
 * Keeps the registry in sync with the backend while mounted. Called by `DashboardPage` and by
 * the Settings "Muted exchanges" block (also shown on `/account/settings`); TanStack Query
 * dedupes the two. Returns nothing: consumers read the registry store, not the query.
 */
export function useExchangeMetadata(): void {
  const status = useSession((s) => s.status);
  useQuery({
    queryKey: exchangeKeys.all,
    queryFn: fetchExchanges,
    enabled: status === 'authenticated',
    staleTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
