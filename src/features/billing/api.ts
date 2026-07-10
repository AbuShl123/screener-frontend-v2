import { request, ApiError } from '@/lib/api';
import { withAuth } from '@/features/auth';
import {
  plansResponseSchema,
  payAsYouGoDaysSchema,
  orderDetailsSchema,
  type PlansResponse,
  type PayAsYouGoDays,
  type OrderDetails,
  type CreateOrderRequest,
} from './schemas';

/**
 * The billing endpoints as pure functions over `request` + the schemas, mirroring
 * the auth module's `api.ts`.
 *
 * The catalog reads (`/api/billing-catalog/*`) are PUBLIC (no JWT) — they take no token
 * and stay outside the session layer entirely. `createOrder` is the first AUTHED billing
 * call: it delegates token orchestration to the auth layer's `withAuth` (refresh-on-401/
 * empty-403-then-retry-once) rather than touching the session store here — so this module
 * still never reads tokens directly, it just hands `withAuth` a `(token) => request(...)`.
 */

const BASE = '/api/billing-catalog';
const ORDERS = '/api/billing/orders';

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

/**
 * `POST /api/billing/orders` — create a pending order and get its `checkoutUrl`
 * (monetization-api.md §4.3). Authed: `withAuth` supplies the bearer and handles the
 * 401/empty-403 refresh+retry. The 409 lost-race retry lives at the mutation layer
 * (`useCreateOrder`) so this stays a single pure call.
 */
export const createOrder = (
  body: CreateOrderRequest,
  signal?: AbortSignal,
): Promise<OrderDetails> =>
  withAuth((token) =>
    request(ORDERS, { method: 'POST', body, token, schema: orderDetailsSchema, signal }),
  );

/**
 * `GET /api/billing/orders/current` — the latest open / most-recent order, the single
 * source of truth the return_url page polls to learn a payment outcome (monetization-api.md
 * §4.3 / §5). Authed via `withAuth` (same refresh-on-401/empty-403-then-retry-once as
 * `createOrder`).
 *
 * A **404 resolves to `null`** — the backend returns it when the account has no order at
 * all, which the status page renders as its distinct "order not found" variant rather than
 * an error. Any other failure still throws.
 */
export const fetchCurrentOrder = (signal?: AbortSignal): Promise<OrderDetails | null> =>
  withAuth((token) =>
    request(`${ORDERS}/current`, { method: 'GET', token, schema: orderDetailsSchema, signal }),
  ).catch((e) => {
    if (e instanceof ApiError && e.status === 404) return null; // no current order
    throw e;
  });

/**
 * `POST /api/billing/orders/current/cancel` — abandon the caller's current order and its
 * unpaid Multicard invoice (monetization-api.md §4.3). Succeeds only when the current order
 * is `PENDING`; returns the now-`CANCELED` `OrderDetailsEntry`. A **409** (order not
 * `PENDING`) or **404** (no orders) still throws — the caller reconciles via `orders/current`.
 * Authed via `withAuth`, same as the other order calls.
 */
export const cancelCurrentOrder = (signal?: AbortSignal): Promise<OrderDetails> =>
  withAuth((token) =>
    request(`${ORDERS}/current/cancel`, {
      method: 'POST',
      token,
      schema: orderDetailsSchema,
      signal,
    }),
  );
