import { request } from '@/lib/api';
import {
  authResponseSchema,
  registerResponseSchema,
  resendResponseSchema,
  userProfileSchema,
  verifyEmailResponseSchema,
  type AuthResponse,
  type LoginRequest,
  type RefreshRequest,
  type RegisterRequest,
  type RegisterResponse,
  type ResendRequest,
  type ResendResponse,
  type UserProfile,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
} from './schemas';

/**
 * The seven auth endpoints as pure functions over `request` + the schemas.
 * NO store access — public endpoints pass no token; the two protected ones take a
 * token argument (the session layer supplies it). Every function is independently
 * callable from a scratch script.
 *
 * Per-endpoint error handling is left to callers (they branch on `ApiError.status`),
 * documented here so Phases 3–5 don't have to re-derive it:
 *
 *   register           | 202     | 409 email taken, 400 all-fields-required
 *   verifyEmail        | 200 alw | none — branch on the `status` field, not HTTP code
 *   resendVerification | 202 alw | none — always generic, no enumeration
 *   login              | 200     | 401 invalid creds, 401 account disabled, 403 email not verified
 *   refresh            | 200     | 400 missing, 401 invalid/expired → hard logout
 *   me                 | 200     | 401 / empty-403 → token rejected
 *   logout             | 204     | best-effort; ignore errors
 */

const BASE = '/api/auth';

// ── Public ──

export const register = (body: RegisterRequest): Promise<RegisterResponse> =>
  request(`${BASE}/register`, { method: 'POST', body, schema: registerResponseSchema });

export const verifyEmail = (body: VerifyEmailRequest): Promise<VerifyEmailResponse> =>
  request(`${BASE}/verify-email`, { method: 'POST', body, schema: verifyEmailResponseSchema });

export const resendVerification = (body: ResendRequest): Promise<ResendResponse> =>
  request(`${BASE}/resend-verification`, { method: 'POST', body, schema: resendResponseSchema });

export const login = (body: LoginRequest): Promise<AuthResponse> =>
  request(`${BASE}/login`, { method: 'POST', body, schema: authResponseSchema });

export const refresh = (body: RefreshRequest): Promise<AuthResponse> =>
  request(`${BASE}/refresh`, { method: 'POST', body, schema: authResponseSchema });

// ── Protected (token supplied by the session layer) ──

export const me = (token: string): Promise<UserProfile> =>
  request(`${BASE}/me`, { method: 'GET', token, schema: userProfileSchema });

export const logout = (token: string): Promise<void> =>
  request(`${BASE}/logout`, { method: 'POST', token }); // 204, no schema
