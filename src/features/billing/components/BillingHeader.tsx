import { useNavigate } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { useMe } from '@/features/auth';

/**
 * Slim chrome header shared by the billing funnel pages (Choose Plan, Pay by Days,
 * Payment Method), per the design templates: brand left; email + profile avatar
 * (→ /account) + "Go to dashboard" (when the user already has active access) right.
 * Deliberately presentation-light — it is not the dashboard's functional header.
 *
 * `/me` is read for the email/avatar/access state but never blocked on: if the profile
 * hasn't resolved (or failed), those slots are simply blank.
 */
export function BillingHeader() {
  const me = useMe();
  const navigate = useNavigate();

  const initials =
    (me.data ? `${me.data.firstName[0] ?? ''}${me.data.lastName[0] ?? ''}`.toUpperCase() : '') ||
    '·';

  return (
    <header className="flex items-center justify-between border-b border-border-subtle px-10 py-[18px]">
      <BrandMark />
      <div className="flex items-center gap-[18px]">
        {me.data?.email && (
          <span className="font-mono text-[12px] text-text-muted">{me.data.email}</span>
        )}
        <button
          type="button"
          title="Account"
          onClick={() => navigate('/account')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border
                     border-accent/40 bg-accent/[0.18] font-mono text-[12px] font-medium
                     tracking-[0.04em] text-accent transition-colors hover:bg-accent/[0.28]"
        >
          {initials}
        </button>
        {me.data?.accessState === 'ACTIVE' && (
          <Button
            variant="primary"
            fullWidth={false}
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 !py-3"
          >
            Go to dashboard
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-none"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Button>
        )}
      </div>
    </header>
  );
}
