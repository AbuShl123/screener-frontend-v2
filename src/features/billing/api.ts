import { request } from '@/lib/api';
import { plansResponseSchema, type PlansResponse } from './schemas';

/**
 * The billing endpoints as pure functions over `request` + the schemas, mirroring
 * the auth module's `api.ts`. NO store access.
 *
 * `GET /api/billing/plans` is PUBLIC (no JWT) — it takes no token argument and stays
 * outside the session layer's `withAuth` machinery entirely.
 */

const BASE = '/api/billing';

export const fetchPlans = (signal?: AbortSignal): Promise<PlansResponse> =>
  request(`${BASE}/plans`, { method: 'GET', schema: plansResponseSchema, signal });
