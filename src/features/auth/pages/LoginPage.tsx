import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { useValidationError } from '@/lib/i18n';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { SplitAuthLayout } from '@/components/layouts/SplitAuthLayout';
import { useLogin, useResendVerification } from '../queries';
import { useCooldown } from '../hooks/useCooldown';
import { loginFormSchema, type LoginFormValues } from '../validation';

/**
 * `/login` — the 2a sign-in form with three mutually-exclusive server-error
 * treatments, all derived from a single `submitError`:
 *   3a — 401 (any but "Account disabled"): red "Invalid email or password." banner,
 *        both field borders tinted danger.
 *   3b — 403 (email not verified): amber banner echoing the typed email + an inline
 *        amber "Resend verification email" button (reuses useResendVerification +
 *        useCooldown). Fields NOT tinted — the password already checked out.
 *   3c — 401 "Account disabled": red banner with an inert support link. Not tinted.
 * Anything unexpected (stray 400/5xx) falls back to a generic translated banner — never
 * the raw (English-only) server message, so RU mode stays localized (i18n plan §6.5).
 */
export function LoginPage() {
  const { t } = useTranslation(['auth', 'common']);
  const fieldError = useValidationError();
  const navigate = useNavigate();
  const loginMut = useLogin();
  const resendMut = useResendVerification();
  const cooldown = useCooldown(60);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  // Both 3a and 3c are 401 — they differ only by `message`. Matching the literal
  // 'Account disabled' string couples us to the backend copy, but it's the only
  // signal (no error-code field, per API doc §1); a changed message degrades
  // gracefully to the generic-401 (3a) branch rather than crashing.
  const disabled = submitError?.status === 401 && submitError.message === 'Account disabled';
  const unverified = submitError?.status === 403;
  const invalidCreds = submitError?.status === 401 && !disabled;
  const otherError = Boolean(submitError) && !disabled && !unverified && !invalidCreds;

  async function onValid(values: LoginFormValues) {
    setSubmitError(null);
    try {
      await loginMut.mutateAsync(values); // loginAndStore persists tokens + arms refresh
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setSubmitError(err);
    }
  }

  function onResend() {
    cooldown.start(); // cosmetic, on click — no server cooldown signal
    resendMut.mutate({ email: getValues('email') }); // the 403 path always has a typed email
  }

  return (
    <SplitAuthLayout>
      {/* no `marketing` prop → SplitAuthLayout's default panel IS the 2a content */}
      <form onSubmit={handleSubmit(onValid)} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-text">
            {t('login.title')}
          </h1>
          <p className="text-[14px] leading-[1.55] text-text-secondary">{t('login.subtitle')}</p>
        </div>

        {invalidCreds && <Banner variant="error">{t('login.invalidCreds')}</Banner>}
        {disabled && (
          <Banner variant="error">
            <Trans
              t={t}
              i18nKey="login.disabled"
              components={{ support: <a href="#" className="font-medium text-[#F5C0C0]" /> }}
            />
          </Banner>
        )}
        {unverified && (
          <Banner variant="warning" className="flex flex-col gap-3">
            <p className="m-0 text-[14px] leading-[1.5]">
              <Trans
                t={t}
                i18nKey="login.unverified"
                values={{ email: getValues('email') }}
                components={{ strong: <strong className="font-medium text-[#F8E3BE]" /> }}
              />
            </p>
            {/* TODO: this button might be extracted into a reusable inline Button variant
                (e.g. warning/amber) if a second amber button ever appears — until then,
                inline to match 3b exactly. */}
            <button
              type="button"
              onClick={onResend}
              disabled={cooldown.active || resendMut.isPending}
              className="self-start rounded-[7px] border px-4 py-[9px] text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                color: 'var(--color-warning)',
                borderColor: 'color-mix(in oklab, var(--color-warning) 55%, transparent)',
              }}
            >
              {resendMut.isPending
                ? t('login.resending')
                : cooldown.active
                  ? t('login.resendIn', { seconds: cooldown.remaining })
                  : t('login.resend')}
            </button>
          </Banner>
        )}
        {otherError && <Banner variant="error">{t('common:errors.generic')}</Banner>}

        <div className="flex flex-col gap-[18px]">
          <TextField
            label={t('login.emailLabel')}
            type="email"
            placeholder={t('login.emailPlaceholder')}
            error={fieldError(errors.email?.message)}
            invalid={invalidCreds}
            {...register('email')}
          />
          <TextField
            label={t('login.passwordLabel')}
            type="password"
            placeholder={t('login.passwordPlaceholder')}
            error={fieldError(errors.password?.message)}
            invalid={invalidCreds}
            {...register('password')}
          />
        </div>

        <Button type="submit" variant="primary" disabled={loginMut.isPending}>
          {loginMut.isPending ? t('login.submitting') : t('login.submit')}
        </Button>

        <p className="text-center text-[14px] text-text-secondary">
          {t('login.signupPrompt')}{' '}
          <Link to="/register" className="font-medium text-accent no-underline">
            {t('login.signupLink')}
          </Link>
        </p>
      </form>
    </SplitAuthLayout>
  );
}
