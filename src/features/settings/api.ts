import { request } from '@/lib/api';
import { tickersResponseSchema, type TickersResponse } from './schemas';

/**
 * The active-ticker-list endpoint as a pure function over `request` + the schema. No
 * store access — the session layer supplies the token (via `withAuth` in `queries.ts`).
 *
 * `GET /api/tickers` needs a JWT but NOT an active subscription, so the only failure is
 * the empty-body `403` auth rejection — which `withAuth` handles by refresh-and-retry.
 */
export function tickers(token: string): Promise<TickersResponse> {
  return request('/api/tickers', { method: 'GET', token, schema: tickersResponseSchema });
}
