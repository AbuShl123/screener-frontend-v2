import { Link, Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/Button';
import { CenteredAuthLayout } from '@/components/layouts/CenteredAuthLayout';
import { useResendVerification } from '../queries';
import { useCooldown } from '../hooks/useCooldown';

/**
 * `/register/check-inbox` — the 3e screen shown after a 202 register. The email is
 * carried in router location state (the server-normalized address from the 202 body).
 * A hard refresh / direct nav has no state → redirect back to `/register` (guard).
 *
 * Resend is fire-and-forget (always 202, no enumeration): a cosmetic 60s cooldown
 * starts on click to prevent spam, and a generic confirmation shows regardless of
 * outcome — the backend gives no signal to distinguish sent / not-sent / on-cooldown.
 */
export function CheckInboxPage() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;

  const resendMut = useResendVerification();
  const cooldown = useCooldown(60);

  // Guard: no email in location state (hard refresh, direct nav, bookmark).
  if (!email) return <Navigate to="/register" replace />;

  function onResend() {
    cooldown.start(); // cosmetic, on click — blocks rapid double-clicks
    resendMut.mutate({ email: email! }); // always 202; outcome deliberately opaque
  }

  const caption = cooldown.active
    ? `resend available in ${cooldown.remaining} s`
    : resendMut.isSuccess
      ? 'Sent — check your inbox again'
      : 'resend available once per 60 s';

  return (
    <CenteredAuthLayout>
      <div className="flex flex-col items-center gap-6 text-center">
        <div
          className="flex h-[60px] w-[60px] items-center justify-center rounded-full font-mono text-[23px] text-accent"
          style={{
            border: '1px solid color-mix(in oklab, var(--color-accent) 45%, transparent)',
            background: 'color-mix(in oklab, var(--color-accent) 10%, transparent)',
          }}
        >
          @
        </div>

        <div className="flex flex-col gap-[10px]">
          <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-text">
            Check your inbox
          </h1>
          <p className="text-[14px] leading-[1.6] text-text-secondary">
            We sent a verification link to
            <br />
            <strong className="font-medium text-text-strong">{email}</strong>
            <br />
            The link is valid for 24 hours.
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-2">
          <Button
            variant="outline"
            fullWidth={false}
            className="px-5 py-[11px] text-[14px]"
            disabled={cooldown.active || resendMut.isPending}
            onClick={onResend}
          >
            Didn&apos;t get it? Resend
          </Button>
          <span className="font-mono text-[11px] text-text-dim">{caption}</span>
        </div>

        <Link to="/login" className="text-[14px] text-text-secondary no-underline">
          Back to sign in
        </Link>
      </div>
    </CenteredAuthLayout>
  );
}
