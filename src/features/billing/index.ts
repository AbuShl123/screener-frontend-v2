// Public surface of the billing feature. Import from `@/features/billing`.

// React Query ownership of the plans catalog + pay-as-you-go days conversion + create-order
export { usePlans, usePayAsYouGoDays, useCreateOrder, billingKeys } from './queries';

// Presentation catalog (copy map + fallback-first merge → PlanView[])
export { buildPlanViews, type PlanView, type PlanCopy } from './catalog';

// Server-response schemas & inferred types
export {
  planSchema,
  plansResponseSchema,
  payAsYouGoDaysSchema,
  orderStatusSchema,
  orderDetailsSchema,
  type Plan,
  type PlansResponse,
  type PayAsYouGoDays,
  type OrderStatus,
  type OrderDetails,
  type CreateOrderRequest,
} from './schemas';

// Pages
export { CheckoutStubPage } from './pages/CheckoutStubPage';
export { ChoosePlanPage } from './pages/ChoosePlanPage';
export { PayByDaysPage } from './pages/PayByDaysPage';
export { PaymentMethodPage } from './pages/PaymentMethodPage';
