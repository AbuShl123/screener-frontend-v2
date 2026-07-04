import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { SplitAuthLayout } from '@/components/layouts/SplitAuthLayout';
import { RegisterMarketing } from '../components/RegisterMarketing';
import { useRegister } from '../queries';
import { registerFormSchema, type RegisterFormValues } from '../validation';

/**
 * `/register` — the 2b register form with the 3d error-banner treatment.
 *
 * One top banner is fed by either of two triggers (submit ApiError takes priority
 * over the client short-password check), and it tints exactly one field's border:
 * the email on a 409, the password on the short-password check. The other client
 * errors (required first/last name, email format) stay as inline field messages.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const registerMut = useRegister();
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) });

  const emailTaken = submitError?.status === 409;
  const passwordTooShort = Boolean(errors.password);

  // Priority: submit server error first, then the elevated short-password check.
  let banner: ReactNode = null;
  if (submitError) {
    banner =
      submitError.status === 409 ? (
        <>
          This email is already registered.{' '}
          <Link to="/login" className="font-medium text-[#F5C0C0]">
            Sign in instead
          </Link>
        </>
      ) : (
        submitError.message
      );
  } else if (passwordTooShort) {
    banner = 'Password must be at least 8 characters long';
  }

  async function onValid(values: RegisterFormValues) {
    setSubmitError(null);
    try {
      const res = await registerMut.mutateAsync(values);
      // Use the server-normalized (lowercased) email for display + resend.
      navigate('/register/check-inbox', { state: { email: res.email } });
    } catch (err) {
      if (err instanceof ApiError) setSubmitError(err);
    }
  }

  // A failed client validation (e.g. short password) never reaches the network;
  // clear any stale submit error so the banner falls through to the client message.
  function onInvalid() {
    setSubmitError(null);
  }

  return (
    <SplitAuthLayout marketing={<RegisterMarketing />}>
      <form
        onSubmit={handleSubmit(onValid, onInvalid)}
        noValidate
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-text">
            Create account
          </h1>
          <p className="text-[14px] leading-[1.55] text-text-secondary">
            Free 7-day trial. No card required.
          </p>
        </div>

        {banner ? <Banner variant="error">{banner}</Banner> : null}

        <div className="flex flex-col gap-[18px]">
          <div className="grid grid-cols-2 gap-[14px]">
            <TextField
              label="First name"
              placeholder="Ada"
              error={errors.firstName?.message}
              {...register('firstName')}
            />
            <TextField
              label="Last name"
              placeholder="Lovelace"
              error={errors.lastName?.message}
              {...register('lastName')}
            />
          </div>
          <TextField
            label="Email"
            type="email"
            placeholder="ada@example.com"
            error={errors.email?.message}
            invalid={emailTaken}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            placeholder="At least 8 characters"
            invalid={passwordTooShort}
            {...register('password')}
          />
        </div>

        <Button type="submit" variant="primary" disabled={registerMut.isPending}>
          {registerMut.isPending ? 'Creating account…' : 'Create account'}
        </Button>

        <p className="text-center text-[14px] text-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent no-underline">
            Sign in
          </Link>
        </p>
      </form>
    </SplitAuthLayout>
  );
}
