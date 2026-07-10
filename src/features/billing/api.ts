import { request } from '@/lib/api';
import {
  plansResponseSchema,
  payAsYouGoDaysSchema,
  type PlansResponse,
  type PayAsYouGoDays,
} from './schemas';

/**
 * The billing endpoints as pure functions over `request` + the schemas, mirroring
 * the auth module's `api.ts`. NO store access.
 *
 * `GET /api/billing-catalog/plans` is PUBLIC (no JWT) — it takes no token argument and stays
 * outside the session layer's `withAuth` machinery entirely.
 */

const BASE = '/api/billing-catalog';

export const fetchPlans = (signal?: AbortSignal): Promise<PlansResponse> =>
  request(`${BASE}/plans`, { method: 'GET', schema: plansResponseSchema, signal });

/**
 * Convert a top-up amount to days of access (plan §5). Currency is hardcoded `UZS`
 * to match the catalog's fallback. Assumed PUBLIC like `/plans`; if the backend ever
 * returns 401/403, route this through the session layer's `withAuth` instead (plan §9).
 */
export const fetchPayAsYouGoDays = (
  amount: number,
  signal?: AbortSignal,
): Promise<PayAsYouGoDays> => {
  const qs = new URLSearchParams({ currency: 'UZS', amount: String(amount) });
  return request(`${BASE}/pay-as-you-go/days?${qs}`, {
    method: 'GET',
    schema: payAsYouGoDaysSchema,
    signal,
  });
};
