import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { createOrder, fetchPlans, fetchPayAsYouGoDays } from './api';
import type { CreateOrderRequest } from './schemas';

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

/**
 * Create-order mutation (`POST /api/billing/orders`, plan §5.4). On success the caller
 * redirects the tab to `checkoutUrl`; a 4xx surfaces the backend `message` inline.
 *
 * Retries exactly once, and only on a 409 — the transparent recovery for the lost
 * one-open-order race (monetization-api.md §4.3 / N8). A genuine renewal-gate 409 will
 * simply 409 again and surface its message; that one wasted call is acceptable until
 * entitlement state lands to distinguish the two (plan §10). No query key: a mutation
 * needs none.
 */
export function useCreateOrder() {
  return useMutation({
    mutationFn: (body: CreateOrderRequest) => createOrder(body),
    retry: (count, err) => count < 1 && err instanceof ApiError && err.status === 409,
  });
}
