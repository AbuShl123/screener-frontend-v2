// Public surface of the billing feature. Import from `@/features/billing`.

// React Query ownership of the plans catalog + pay-as-you-go days conversion
export { usePlans, usePayAsYouGoDays, billingKeys } from './queries';

// Presentation catalog (copy map + fallback-first merge → PlanView[])
export { buildPlanViews, type PlanView, type PlanCopy } from './catalog';

// Server-response schemas & inferred types
export {
  planSchema,
  plansResponseSchema,
  payAsYouGoDaysSchema,
  type Plan,
  type PlansResponse,
  type PayAsYouGoDays,
} from './schemas';

// Pages
export { CheckoutStubPage } from './pages/CheckoutStubPage';
export { ChoosePlanPage } from './pages/ChoosePlanPage';
export { PayByDaysPage } from './pages/PayByDaysPage';
