import { z } from 'zod';

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
