import { useNavigate } from 'react-router-dom';
import { useSession } from '@/features/auth';

/**
 * Centralizes every landing-page CTA's destination and the auth-aware split
 * (plan §9). Reads auth state from the session store so the header/CTAs can
 * adapt (§10). Handlers are recreated per render but that's fine — they're
 * passed straight to `onClick`, never into dependency arrays.
 *
 * An authed `startPlan` routes into the real payment flow: pay-as-you-go goes
 * to the days editor, every other plan goes straight to Payment Method with
 * `?plan=CODE`.
 */
export function useLandingNav() {
  const navigate = useNavigate();
  const isAuthed = useSession((s) => s.status === 'authenticated');

  return {
    isAuthed,
    signIn: () => navigate('/login'),
    createAccount: () => navigate('/register'),
    startTrial: () => navigate('/register'),
    goDashboard: () => navigate('/dashboard'),
    startPlan: (code: string) =>
      isAuthed
        ? navigate(
            code === 'pay_as_you_go'
              ? '/billing/pay-by-days'
              : `/billing/payment?plan=${encodeURIComponent(code)}`,
          )
        : // ?plan is a forward-looking breadcrumb for a future resume-after-signup;
          // RegisterPage ignores it today (plan §9).
          navigate(`/register?plan=${encodeURIComponent(code)}`),
  };
}
