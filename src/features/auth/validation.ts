import { z } from 'zod';

/**
 * Client-side register form schema (RHF + Zod). Mirrors the backend's "all four
 * fields required, non-blank" rule; the 8-char password floor is a purely
 * client-side UX guard — the backend enforces NO password length (per the API doc).
 *
 * This is separate from `schemas.ts` (API response validation): one validates user
 * input, the other validates server output — the two Zod concerns stay untangled.
 */
export const registerFormSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    // Zod v4 top-level format (the chained `.email()` is deprecated in v4).
    email: z.email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    repeatPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: 'Passwords do not match',
    path: ['repeatPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

/**
 * Single-field resend form for the verify-email 3g screen. On `expired`/`invalid`
 * (and the no-token case) the verify endpoint never received an email, so the user
 * must type one — same `z.email()` format guard as register's email field, so an
 * obviously-junk value is caught inline before the (always-202) resend fires.
 */
export const resendFormSchema = z.object({
  email: z.email('Enter a valid email'),
});

export type ResendFormValues = z.infer<typeof resendFormSchema>;

/**
 * Client-side login form schema (RHF + Zod). Same `z.email()` format guard as the
 * other schemas, but the password is `min(1)` "required" only — deliberately NO
 * 8-char floor. Register's length rule is a creation-time UX guard; login must accept
 * whatever password the account already has, and the backend enforces no length. Any
 * real credential problem surfaces as the server's 401, not a client-side rule.
 */
export const loginFormSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
