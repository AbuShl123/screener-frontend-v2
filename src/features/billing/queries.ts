import { useQuery } from '@tanstack/react-query';
import { fetchPlans } from './api';

/**
 * React Query ownership of the billing catalog. Per CLAUDE.md's data-flow table
 * (REST / server state → TanStack Query cache), the plans list lives here.
 *
 * No `enabled` gate: the endpoint is public, so it's safe to run for anonymous
 * visitors (the landing page is its first consumer). `staleTime` is generous —
 * the catalog changes rarely.
 */

export const billingKeys = {
  all: ['billing'] as const,
  plans: ['billing', 'plans'] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: billingKeys.plans,
    queryFn: ({ signal }) => fetchPlans(signal),
    staleTime: 5 * 60_000, // catalog changes rarely
  });
}
