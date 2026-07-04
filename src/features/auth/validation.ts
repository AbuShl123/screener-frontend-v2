import { z } from 'zod';

/**
 * Client-side register form schema (RHF + Zod). Mirrors the backend's "all four
 * fields required, non-blank" rule; the 8-char password floor is a purely
 * client-side UX guard — the backend enforces NO password length (per the API doc).
 *
 * This is separate from `schemas.ts` (API response validation): one validates user
 * input, the other validates server output — the two Zod concerns stay untangled.
 */
export const registerFormSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  // Zod v4 top-level format (the chained `.email()` is deprecated in v4).
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;
