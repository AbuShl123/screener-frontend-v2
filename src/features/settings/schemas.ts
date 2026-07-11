import { z } from 'zod';
import type { Market } from '@/features/orderbook/types';

/**
 * Zod validation for `GET /api/tickers` (REST → validated, per CLAUDE.md). Shape per
 * [`.claude/docs/classification-rule-api.md`](../../../.claude/docs/classification-rule-api.md)
 * "Fetching the Active Ticker List". These schemas are both the runtime validator and
 * the TS type source.
 */

export const tickerSchema = z.object({
  symbol: z.string(),
  hasFutures: z.boolean(),
  hasSpot: z.boolean(),
});

export const tickersResponseSchema = z.object({
  total: z.number(),
  spotCount: z.number(),
  futuresCount: z.number(),
  tickers: z.array(tickerSchema),
});

export type Ticker = z.infer<typeof tickerSchema>;
export type TickersResponse = z.infer<typeof tickersResponseSchema>;

/**
 * Classification-rule server-response schemas (REST → validated). Contract per
 * [`.claude/docs/classification-rule-api.md`](../../../.claude/docs/classification-rule-api.md)
 * — `GET /api/rules/default` and `GET /api/rules`. Both validator and TS-type source.
 *
 * The request-body shapes below (`PutRulesRequest` / `DeleteRulesRequest`) are plain TS
 * interfaces with NO runtime validation — same treatment as the auth request types, since
 * we author them and they never cross the wire untrusted.
 */

export const tierThresholdSchema = z.object({
  tier: z.number(), // 1–4
  minNotional: z.number(), // USD
  maxDistance: z.number(), // fraction, 0.05 = 5%
});

export const defaultRuleSchema = z.object({
  normalTiers: z.array(tierThresholdSchema),
  highLiquiditySymbols: z.array(z.string()),
  highLiquidityTiers: z.array(tierThresholdSchema),
});

export const customRuleSchema = z.object({
  symbol: z.string(),
  market: z.enum(['SPOT', 'FUTURES']),
  tiers: z.array(tierThresholdSchema),
});

export const customRulesResponseSchema = z.array(customRuleSchema);

export type TierThreshold = z.infer<typeof tierThresholdSchema>;
export type DefaultRule = z.infer<typeof defaultRuleSchema>;
export type CustomRule = z.infer<typeof customRuleSchema>;

/** One `(symbol, market)` target for a `PUT`/`DELETE`. */
export interface RuleTarget {
  symbol: string;
  market: Market;
}

/** `PUT /api/rules` body — bulk upsert (we always send a single assignment + target). */
export interface PutRulesRequest {
  assignments: { rule: { tiers: TierThreshold[] }; targets: RuleTarget[] }[];
}

/** `DELETE /api/rules` body — reset the listed targets to the default rule. */
export interface DeleteRulesRequest {
  targets: RuleTarget[];
}
