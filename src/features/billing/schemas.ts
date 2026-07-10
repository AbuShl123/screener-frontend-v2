import { z } from 'zod';

/**
 * Zod response schemas for the billing catalog (the single source of both the
 * runtime validator and the inferred TS type), per CLAUDE.md's REST rule.
 * Mirrors the `GET /api/billing-catalog/plans` contract (plan §6).
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

/**
 * Response of `GET /api/billing-catalog/pay-as-you-go/days` — the amount→days
 * conversion for the pay-as-you-go top-up editor (plan §5). `days` is a
 * non-negative integer; `0` means the entered amount doesn't buy a full day.
 */
export const payAsYouGoDaysSchema = z.object({
  days: z.number().int().nonnegative(),
});
export type PayAsYouGoDays = z.infer<typeof payAsYouGoDaysSchema>;
