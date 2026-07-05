import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '@/lib/api';
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
 * Anything unexpected (stray 400/5xx) falls back to a red banner showing the raw
 * (user-safe) server message rather than mislabeling it as a known state.
 */
export function LoginPage() {
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
      navigate('/', { replace: true });
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
          <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-text">Sign in</h1>
          <p className="text-[14px] leading-[1.55] text-text-secondary">
            Welcome back. Your books are still running.
          </p>
        </div>

        {invalidCreds && <Banner variant="error">Invalid email or password.</Banner>}
        {disabled && (
          <Banner variant="error">
            Your account has been disabled. Contact{' '}
            <a href="#" className="font-medium text-[#F5C0C0]">
              support
            </a>
            .
          </Banner>
        )}
        {unverified && (
          <Banner variant="warning" className="flex flex-col gap-3">
            <p className="m-0 text-[14px] leading-[1.5]">
              Please verify your email before logging in. We sent a link to{' '}
              <strong className="font-medium text-[#F8E3BE]">{getValues('email')}</strong>.
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
                ? 'Sending…'
                : cooldown.active
                  ? `Resend in ${cooldown.remaining}s`
                  : 'Resend verification email'}
            </button>
          </Banner>
        )}
        {otherError && <Banner variant="error">{submitError!.message}</Banner>}

        <div className="flex flex-col gap-[18px]">
          <TextField
            label="Email"
            type="email"
            placeholder="ada@example.com"
            error={errors.email?.message}
            invalid={invalidCreds}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            placeholder="••••••••••••"
            error={errors.password?.message}
            invalid={invalidCreds}
            {...register('password')}
          />
        </div>

        <Button type="submit" variant="primary" disabled={loginMut.isPending}>
          {loginMut.isPending ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="text-center text-[14px] text-text-secondary">
          New to Screener?{' '}
          <Link to="/register" className="font-medium text-accent no-underline">
            Create an account
          </Link>
        </p>
      </form>
    </SplitAuthLayout>
  );
}
