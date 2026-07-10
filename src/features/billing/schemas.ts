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

/**
 * Order lifecycle status (monetization-api.md §3). Permissive by design — this is a
 * server-authored enum; a stricter/narrower client copy would only manufacture false
 * contract-drift failures on a value we don't act on this phase (we only branch on
 * `checkoutUrl`).
 */
export const orderStatusSchema = z.enum([
  'CREATED',
  'PENDING',
  'PAID',
  'EXPIRED',
  'FAILED',
  'CANCELED',
  'REVERTED',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * `OrderDetailsEntry` — the `POST /api/billing/orders` (and future `orders/current`)
 * response (monetization-api.md §4.3). Only `checkoutUrl` / `status` / `orderId` are
 * consumed this phase; the rest are validated but loosely (server-authored fields,
 * nullable where the backend leaves them unset before payment) so contract drift on an
 * unused field can't blow up the create-order flow.
 */
export const orderDetailsSchema = z.object({
  orderId: z.string(),
  status: orderStatusSchema,
  planCode: z.string(),
  amount: z.number(),
  accessDurationSeconds: z.number(),
  currency: z.string(),
  provider: z.string(),
  reason: z.string().nullable(),
  reasonDetail: z.string().nullable(),
  checkoutUrl: z.string().nullable(),
  providerUuid: z.string().nullable(),
  expiresAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});
export type OrderDetails = z.infer<typeof orderDetailsSchema>;

/**
 * `POST /api/billing/orders` request body. Send only `planCode` (fixed plans) or
 * `planCode` + `amount` (pay-as-you-go). `amount` is a STRING in major units (avoids
 * double-precision loss); never send price/currency — the server resolves those.
 */
export interface CreateOrderRequest {
  planCode: string;
  amount?: string;
}
