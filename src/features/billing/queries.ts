import { useQuery } from '@tanstack/react-query';
import { fetchPlans, fetchPayAsYouGoDays } from './api';

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
  paygDays: (amount: number) => ['billing', 'payg-days', amount] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: billingKeys.plans,
    queryFn: ({ signal }) => fetchPlans(signal),
    staleTime: 5 * 60_000, // catalog changes rarely
  });
}

/**
 * Amount→days conversion for the pay-as-you-go top-up editor (plan §5). Gated on a
 * positive amount so `0`/empty never hits the network — `enabled: amount > 0` is the
 * load-bearing guard that keeps `data`/`isError` clean in the neutral state. `retry:
 * false` so a bad amount fails straight to the generic hint rather than retry-storming.
 */
export function usePayAsYouGoDays(amount: number) {
  return useQuery({
    queryKey: billingKeys.paygDays(amount),
    queryFn: ({ signal }) => fetchPayAsYouGoDays(amount, signal),
    enabled: amount > 0,
    staleTime: 5 * 60_000, // amount→days is a stable conversion; cache it
    retry: false,
  });
}
