import { Button } from '@/components/Button';
import { useLandingNav } from '../useLandingNav';
import { TRIAL_DAYS } from '../constants';

/**
 * Bottom call-to-action (plan §8.1, §10). Dark section; the CTA pair is
 * auth-aware — anonymous gets Create account + Sign in, authenticated gets a
 * single Go to dashboard.
 */
export function CtaSection() {
  const { isAuthed, signIn, createAccount, goDashboard } = useLandingNav();

  return (
    <section className="border-t border-border-subtle">
      <div className="mx-auto max-w-[1140px] px-8 py-[80px] text-center">
        <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
          Get started
        </div>
        <h2 className="mb-[14px] text-[38px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
          Start with {TRIAL_DAYS} days free.
        </h2>
        <p className="mb-8 text-[15px] leading-[1.6] text-text-muted">
          No card needed. Full access from the first minute.
        </p>
        <div className="flex items-center justify-center gap-3">
          {isAuthed ? (
            <Button
              variant="primary"
              fullWidth={false}
              onClick={goDashboard}
              className="px-7 py-[14px]"
            >
              Go to dashboard
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                fullWidth={false}
                onClick={createAccount}
                className="px-7 py-[14px]"
              >
                Create account
              </Button>
              <Button
                variant="outline"
                fullWidth={false}
                onClick={signIn}
                className="min-w-[110px] whitespace-nowrap px-7 py-[14px]"
              >
                Sign in
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
