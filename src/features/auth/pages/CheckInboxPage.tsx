import { Link, Navigate, useLocation } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { CenteredAuthLayout } from '@/components/layouts/CenteredAuthLayout';
import { AuthBadge } from '../components/AuthBadge';
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
  const { t } = useTranslation('auth');
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
    ? t('checkInbox.captionCooldown', { seconds: cooldown.remaining })
    : resendMut.isSuccess
      ? t('checkInbox.captionSent')
      : t('checkInbox.captionDefault');

  return (
    <CenteredAuthLayout>
      <div className="flex flex-col items-center gap-6 text-center">
        <AuthBadge className="text-[23px]">@</AuthBadge>

        <div className="flex flex-col gap-[10px]">
          <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-text">
            {t('checkInbox.title')}
          </h1>
          <p className="text-[14px] leading-[1.6] text-text-secondary">
            <Trans
              t={t}
              i18nKey="checkInbox.sentTo"
              values={{ email }}
              components={{ br: <br />, strong: <strong className="font-medium text-text-strong" /> }}
            />
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
            {t('checkInbox.resend')}
          </Button>
          <span className="font-mono text-[11px] text-text-dim">{caption}</span>
        </div>

        <Link to="/login" className="text-[14px] text-text-secondary no-underline">
          {t('checkInbox.backToSignIn')}
        </Link>
      </div>
    </CenteredAuthLayout>
  );
}
