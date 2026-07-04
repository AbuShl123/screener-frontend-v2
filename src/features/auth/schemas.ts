import { z } from 'zod';

/**
 * Zod response schemas (the single source of both the runtime validator and the
 * inferred TS type) plus plain request-body types. Mirrors the auth API contract
 * in `.claude/docs/auth-api.md` exactly.
 *
 * Strings are deliberately NOT over-constrained (no `.email()`/`.uuid()`): these
 * are server-authored values, and a stricter client schema would only manufacture
 * false contract-drift failures.
 */

// ── Requests (plain types; simple enough not to need runtime validation) ──

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ResendRequest {
  email: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

// ── Responses (Zod = validator + inferred type) ──

/** Login & refresh both return this shape. */
export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(), // seconds
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const registerResponseSchema = z.object({
  // Currently always "VERIFICATION_REQUIRED"; typed as string (not enum) per the
  // doc, so future statuses don't break the shape.
  status: z.string(),
  email: z.string(),
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const verifyEmailResponseSchema = z.object({
  // Discriminated result. `.catch('invalid')` means an unexpected/missing value
  // never throws — the verify page treats anything non-success/expired as invalid.
  status: z.enum(['success', 'expired', 'invalid']).catch('invalid'),
});
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;
export type VerifyEmailStatus = VerifyEmailResponse['status'];

export const resendResponseSchema = z.object({ message: z.string() });
export type ResendResponse = z.infer<typeof resendResponseSchema>;

export const userProfileSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  role: z.enum(['USER', 'ADMIN']),
  accessState: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'ADMIN']),
  accessExpiresAt: z.string().nullable(), // ISO-8601 instant, null for ADMIN
});
export type UserProfile = z.infer<typeof userProfileSchema>;
export type AccessState = UserProfile['accessState'];
