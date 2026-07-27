import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { useValidationError } from '@/lib/i18n';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { PasswordField } from '@/components/PasswordField';
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
  const { t } = useTranslation(['auth', 'common', 'validation']);
  const fieldError = useValidationError();
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
  // A non-409 server error shows a generic translated banner rather than the raw
  // (English-only) server message, so RU mode stays localized (i18n plan §6.5).
  let banner: ReactNode = null;
  if (submitError) {
    banner =
      submitError.status === 409 ? (
        <Trans
          t={t}
          i18nKey="register.emailTaken"
          components={{ signin: <Link to="/login" className="font-medium text-[#F5C0C0]" /> }}
        />
      ) : (
        t('common:errors.generic')
      );
  } else if (passwordTooShort) {
    banner = t('validation:password.tooShort');
  }

  async function onValid(values: RegisterFormValues) {
    setSubmitError(null);
    try {
      const { repeatPassword: _repeatPassword, ...registerValues } = values;
      const res = await registerMut.mutateAsync(registerValues);
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
            {t('register.title')}
          </h1>
          <p className="text-[14px] leading-[1.55] text-text-secondary">{t('register.subtitle')}</p>
        </div>

        {banner ? <Banner variant="error">{banner}</Banner> : null}

        <div className="flex flex-col gap-[18px]">
          <div className="grid grid-cols-2 gap-[14px]">
            <TextField
              label={t('register.firstNameLabel')}
              placeholder={t('register.firstNamePlaceholder')}
              error={fieldError(errors.firstName?.message)}
              {...register('firstName')}
            />
            <TextField
              label={t('register.lastNameLabel')}
              placeholder={t('register.lastNamePlaceholder')}
              error={fieldError(errors.lastName?.message)}
              {...register('lastName')}
            />
          </div>
          <TextField
            label={t('register.emailLabel')}
            type="email"
            placeholder={t('register.emailPlaceholder')}
            error={fieldError(errors.email?.message)}
            invalid={emailTaken}
            {...register('email')}
          />
          <PasswordField
            label={t('register.passwordLabel')}
            placeholder={t('register.passwordPlaceholder')}
            invalid={passwordTooShort}
            {...register('password')}
          />
          <PasswordField
            label={t('register.repeatPasswordLabel')}
            placeholder={t('register.repeatPasswordPlaceholder')}
            error={fieldError(errors.repeatPassword?.message)}
            {...register('repeatPassword')}
          />
        </div>

        <Button type="submit" variant="primary" disabled={registerMut.isPending}>
          {registerMut.isPending ? t('register.submitting') : t('register.submit')}
        </Button>

        <p className="text-center text-[14px] text-text-secondary">
          {t('register.signinPrompt')}{' '}
          <Link to="/login" className="font-medium text-accent no-underline">
            {t('register.signinLink')}
          </Link>
        </p>
      </form>
    </SplitAuthLayout>
  );
}
