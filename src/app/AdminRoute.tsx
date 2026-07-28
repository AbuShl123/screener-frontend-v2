import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '@/features/auth';

/**
 * Role gate for the admin screens. Composes ON TOP of `ProtectedRoute`'s token-presence check
 * (so anonymous visitors are already handled) and adds a `role === 'ADMIN'` check via `useMe`.
 *
 * `SessionGate` already holds a splash until `/me` resolves on reload, so `me.data` is normally
 * present here; the `isLoading` branch is belt-and-suspenders for a cache-evicted refetch. A
 * non-admin is bounced to `/account` (the profile) — clean now that `/account` is unconditionally
 * the profile (plan §5). This is UX only, not a security boundary: the four endpoints are all
 * `hasRole("ADMIN")`-gated server-side (plan §access-control).
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isLoading) return null;
  if (me.data?.role !== 'ADMIN') return <Navigate to="/account" replace />;
  return <>{children}</>;
}
