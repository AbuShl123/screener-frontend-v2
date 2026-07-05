import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/features/auth';

/**
 * Redirect anonymous visitors to /login. Evaluated only after SessionGate has let
 * routes render, so `status` is already final here (never mid-bootstrap). Gating is
 * token-presence only (locked decision 4) — this does not read `accessState`.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
