// Session (tokens + orchestration; framework-agnostic core)
export {
  useSession,
  loginAndStore,
  fetchMe,
  logout,
  refreshTokens,
} from './session';

// React Query ownership of /me + the login/register/resend/verify mutations
export { useMe, useLogin, useRegister, useResendVerification, useVerifyEmail, authKeys } from './queries';

// Cosmetic resend cooldown (reused by Phases 4/5)
export { useCooldown } from './hooks/useCooldown';

// Pages
export { RegisterPage } from './pages/RegisterPage';
export { CheckInboxPage } from './pages/CheckInboxPage';
export { VerifyEmailPage } from './pages/VerifyEmailPage';
export { LoginPage } from './pages/LoginPage';

// Shared schemas & types
export * from './schemas';

// Form schemas + inferred types
export { registerFormSchema, type RegisterFormValues } from './validation';
export { resendFormSchema, type ResendFormValues } from './validation';
export { loginFormSchema, type LoginFormValues } from './validation';
