import type { ReactNode } from 'react';
import { useMe, useSession } from '@/features/auth';
import { BrandMark } from '@/components/BrandMark';

/**
 * Blocking bootstrap gate. On a page reload with rehydrated tokens, hold a
 * full-screen splash while `/me` re-validates the session, then render the app.
 *
 * The "is bootstrap in flight?" signal is React Query's `useMe` loading state, not
 * a third Zustand status (the store stays tokens-only). We read `status` (Zustand)
 * for authenticated-vs-not and `useMe()` (React Query) for is-the-profile-validating.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const me = useMe();

  // Only block while a token-bearing session is still validating /me for the first time.
  // - anonymous            → status !== 'authenticated' → false (render routes; guards handle it)
  // - /me resolved (200)   → isLoading false            → false (render routes)
  // - hard auth failure    → withAuth hardLogout flips status to 'anonymous' → false
  // - non-auth error (5xx / network down) → isLoading false → false (render; the dashboard does
  //   NOT block on /me — we do NOT log the user out on a transient error; tokens are still valid)
  const bootstrapping = status === 'authenticated' && me.isLoading;

  if (bootstrapping) return <BootSplash />;
  return <>{children}</>;
}

function BootSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface">
      <BrandMark />
      <p className="text-[13px] text-text-secondary">Restoring your session…</p>
    </div>
  );
}
