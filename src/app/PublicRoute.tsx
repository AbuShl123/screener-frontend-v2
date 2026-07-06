import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/features/auth';

/**
 * Bounce an already-authenticated user off /login and /register (locked decision 3).
 * /verify-email and /register/check-inbox stay unguarded — a logged-in user might
 * still click a verification link or land on check-inbox.
 */
export function PublicRoute({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
