// Public surface of the admin feature. Import from `@/features/admin`.

// Pages
export { AnalyticsPage } from './pages/AnalyticsPage';
export { UsersPage } from './pages/UsersPage';

// React Query ownership of the four ADMIN-only endpoints
export {
  useAdminUsers,
  useUsersTotal,
  usePresence,
  useUsage,
  useGiftEntitlement,
  adminKeys,
} from './queries';

// Server-response schemas & inferred types
export {
  adminUserSchema,
  adminUsersPageSchema,
  giftResultSchema,
  presenceSchema,
  usageReportSchema,
  type AdminUser,
  type AdminUsersPage,
  type GiftResult,
  type GiftRequest,
  type Presence,
  type UsageReport,
  type UsageParams,
} from './schemas';
