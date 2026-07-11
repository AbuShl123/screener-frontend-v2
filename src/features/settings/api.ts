import { request } from '@/lib/api';
import {
  tickersResponseSchema,
  defaultRuleSchema,
  customRulesResponseSchema,
  type TickersResponse,
  type DefaultRule,
  type CustomRule,
  type PutRulesRequest,
  type DeleteRulesRequest,
} from './schemas';

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

/**
 * The classification-rule endpoints (contract per `.claude/docs/classification-rule-api.md`).
 * All take a token and are routed through `withAuth` in `queries.ts`. Two `403` shapes are
 * possible: the empty-body auth rejection (handled by `withAuth`) and the JSON-body
 * "Active subscription required" gate (thrown as an `ApiError` for the UI to catch).
 *
 * `GET /api/rules/default` is ungated (any authenticated user); the other three require an
 * active subscription.
 */
export function defaultRule(token: string): Promise<DefaultRule> {
  return request('/api/rules/default', { method: 'GET', token, schema: defaultRuleSchema });
}

export function customRules(token: string): Promise<CustomRule[]> {
  return request('/api/rules', { method: 'GET', token, schema: customRulesResponseSchema });
}

/** Create/replace custom rules. Returns an empty-body `200` on success. */
export function putRules(token: string, body: PutRulesRequest): Promise<void> {
  return request('/api/rules', { method: 'PUT', token, body });
}

/** Reset the targeted books to the default rule. Idempotent; empty-body `200`. */
export function deleteRules(token: string, body: DeleteRulesRequest): Promise<void> {
  return request('/api/rules', { method: 'DELETE', token, body });
}
