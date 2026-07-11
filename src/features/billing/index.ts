// Public surface of the billing feature. Import from `@/features/billing`.

// React Query ownership of the plans catalog + pay-as-you-go days conversion + create-order +
// the billing-history reads (orders list, per-order status history, entitlement ledger)
export {
  usePlans,
  usePayAsYouGoDays,
  useCreateOrder,
  useLatestOrder,
  useCancelOrder,
  useOrders,
  useOrderHistory,
  useEntitlementHistory,
  billingKeys,
} from './queries';

// Presentation catalog (copy map + fallback-first merge → PlanView[])
export { buildPlanViews, type PlanView, type PlanCopy } from './catalog';

// Server-response schemas & inferred types
export {
  planSchema,
  plansResponseSchema,
  payAsYouGoDaysSchema,
  orderStatusSchema,
  orderDetailsSchema,
  ordersListSchema,
  orderHistoryEntrySchema,
  orderHistorySchema,
  entitlementLedgerEntrySchema,
  entitlementHistorySchema,
  type Plan,
  type PlansResponse,
  type PayAsYouGoDays,
  type OrderStatus,
  type OrderDetails,
  type OrderHistoryEntry,
  type EntitlementLedgerEntry,
  type CreateOrderRequest,
} from './schemas';

// Pages
export { AccountPage } from './pages/AccountPage';
export { BillingHistoryPage } from './pages/BillingHistoryPage';
export { CheckoutStubPage } from './pages/CheckoutStubPage';
export { ChoosePlanPage } from './pages/ChoosePlanPage';
export { PayByDaysPage } from './pages/PayByDaysPage';
export { PaymentMethodPage } from './pages/PaymentMethodPage';
export { PaymentStatusPage } from './pages/PaymentStatusPage';
