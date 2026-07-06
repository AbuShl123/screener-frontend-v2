// Public surface of the billing feature. Import from `@/features/billing`.

// React Query ownership of the plans catalog
export { usePlans, billingKeys } from './queries';

// Presentation catalog (copy map + fallback-first merge → PlanView[])
export { buildPlanViews, type PlanView, type PlanCopy } from './catalog';

// Server-response schemas & inferred types
export { planSchema, plansResponseSchema, type Plan, type PlansResponse } from './schemas';

// Pages
export { CheckoutStubPage } from './pages/CheckoutStubPage';
