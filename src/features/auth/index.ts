// Session (tokens + orchestration; framework-agnostic core)
export {
  useSession,
  loginAndStore,
  fetchMe,
  logout,
  refreshTokens,
} from './session';

// React Query ownership of /me + the register/resend mutations
export { useMe, useRegister, useResendVerification, authKeys } from './queries';

// Cosmetic resend cooldown (reused by Phases 4/5)
export { useCooldown } from './hooks/useCooldown';

// Pages
export { RegisterPage } from './pages/RegisterPage';
export { CheckInboxPage } from './pages/CheckInboxPage';

// Shared schemas & types
export * from './schemas';

// Register form schema + inferred type
export { registerFormSchema, type RegisterFormValues } from './validation';
