import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router-dom';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { CenteredAuthLayout } from '@/components/layouts/CenteredAuthLayout';
import { AuthBadge } from '../components/AuthBadge';
import { useResendVerification, useVerifyEmail } from '../queries';
import { useCooldown } from '../hooks/useCooldown';
import { resendFormSchema, type ResendFormValues } from '../validation';

/**
 * `/verify-email` — the SPA landing for the email verification link. Reads `?token=`
 * from the URL and renders one of three states, all derived from the `useVerifyEmail`
 * mutation (no local state machine, no `useEffect`):
 *
 *   - 2c "Confirm your email" — token present, idle/pending (or a transport error).
 *   - 3f "Email confirmed"    — verify resolved with `status: "success"`.
 *   - 3g "invalid/expired"    — verify resolved non-success, OR no token in the URL.
 *
 * The POST fires ONLY from the Confirm button's onClick — never on mount — so email
 * link scanners that pre-fetch the URL can't burn the single-use token (API doc §2).
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('token') ?? '').trim();
  const verifyMut = useVerifyEmail();

  const showSuccess = verifyMut.isSuccess && verifyMut.data.status === 'success';
  // No token → 3g without any backend call (nothing to verify). A resolved
  // non-success status (expired | invalid | caught-unexpected) → 3g as well.
  const showInvalid = !token || (verifyMut.isSuccess && verifyMut.data.status !== 'success');

  return (
    <CenteredAuthLayout>
      {showSuccess ? (
        <VerifySuccess />
      ) : showInvalid ? (
        <VerifyInvalid />
      ) : (
        <VerifyConfirm
          onConfirm={() => verifyMut.mutate({ token })}
          pending={verifyMut.isPending}
          errored={verifyMut.isError}
        />
      )}
    </CenteredAuthLayout>
  );
}

/** 2c — token present, awaiting the human-initiated Confirm click. */
function VerifyConfirm({
  onConfirm,
  pending,
  errored,
}: {
  onConfirm: () => void;
  pending: boolean;
  errored: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col gap-[10px]">
        <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-text">
          Confirm your email
        </h1>
        <p className="text-[14px] leading-[1.6] text-text-secondary">
          You&apos;re one click away. Confirm to activate
          <br />
          your account and start screening.
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-2">
        {/* A verify POST always returns 200; isError means a genuine transport/5xx
            fault, NOT a bad token — the token was never consumed, so stay here and
            let the user retry with the button re-enabled (API doc §3.2, plan §2.4). */}
        {errored ? (
          <Banner variant="error" className="w-full text-left">
            Something went wrong. Please try again.
          </Banner>
        ) : null}
        <Button
          variant="primary"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? 'Confirming…' : 'Confirm email'}
        </Button>
        <span className="font-mono text-[11px] text-text-dim">this link is single-use</span>
      </div>
    </div>
  );
}

/** 3f — verify resolved success. Verify issues no tokens: link to login, don't auto-login. */
function VerifySuccess() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <AuthBadge className="text-[25px]">✓</AuthBadge>

      <div className="flex flex-col gap-[10px]">
        <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-text">
          Email confirmed
        </h1>
        <p className="text-[14px] leading-[1.6] text-text-secondary">
          Your account is verified.
          <br />
          Sign in to start screening.
        </p>
      </div>

      <Link
        to="/login"
        className="block w-full rounded-[8px] bg-accent px-[14px] py-[14px] text-center text-[15px] font-medium text-accent-ink no-underline transition-colors duration-150 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Go to sign in
      </Link>
    </div>
  );
}

/**
 * 3g — invalid/expired token, or no token at all. Left-aligned (it holds a form).
 * The resend endpoint never echoes an email back, so the user types one here; the
 * confirmation is purely cosmetic (always 202, no enumeration — API doc §3.3).
 */
function VerifyInvalid() {
  const resendMut = useResendVerification();
  const cooldown = useCooldown(60);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResendFormValues>({ resolver: zodResolver(resendFormSchema) });

  function onValid({ email }: ResendFormValues) {
    cooldown.start(); // cosmetic, on click — blocks rapid double-clicks
    resendMut.mutate({ email }); // always 202; outcome deliberately opaque
  }

  const caption = cooldown.active
    ? `resend available in ${cooldown.remaining} s`
    : resendMut.isSuccess
      ? 'Sent — check your inbox'
      : 'if an unverified account exists, a link will be sent';

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-[10px]">
        <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-text [text-wrap:pretty]">
          This link is invalid or has expired
        </h1>
        <p className="text-[14px] leading-[1.6] text-text-secondary">
          Verification links last 24 hours and work once. Enter your email and we&apos;ll send a
          fresh one.
        </p>
      </div>

      <TextField
        label="Email"
        type="email"
        placeholder="ada@example.com"
        error={errors.email?.message}
        {...register('email')}
      />

      <div className="flex flex-col items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={cooldown.active || resendMut.isPending}
        >
          {resendMut.isPending ? 'Sending…' : 'Send new link'}
        </Button>
        <span className="font-mono text-[11px] text-text-dim">{caption}</span>
      </div>
    </form>
  );
}
