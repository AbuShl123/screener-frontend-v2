import { z } from 'zod';

/**
 * Zod response schemas for the billing catalog (the single source of both the
 * runtime validator and the inferred TS type), per CLAUDE.md's REST rule.
 * Mirrors the `GET /api/billing/plans` contract (plan §6).
 *
 * `code` / `displayName` / `currency` are server-authored and deliberately not
 * over-constrained — a stricter client schema would only manufacture false
 * contract-drift failures. `durationDays` is null for the PER_DAY plan.
 */

export const planSchema = z.object({
  code: z.string(),
  displayName: z.string(),
  type: z.enum(['FIXED', 'PER_DAY']),
  durationDays: z.number().int().positive().nullable(),
  amount: z.number(),
});
export type Plan = z.infer<typeof planSchema>;

export const plansResponseSchema = z.object({
  currency: z.string(),
  plans: z.array(planSchema),
});
export type PlansResponse = z.infer<typeof plansResponseSchema>;
