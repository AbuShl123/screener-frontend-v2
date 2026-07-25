import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { useLandingNav } from '../useLandingNav';

const navLinkClass =
  'text-text-muted transition-colors hover:text-text';

/**
 * Sticky landing header (plan §10). Nav anchors show in both auth states; the
 * right-hand CTAs are auth-aware — anonymous gets Sign in + Create account,
 * authenticated gets a single Go to dashboard.
 */
export function LandingHeader() {
  const { t } = useTranslation('landing');
  const { isAuthed, signIn, createAccount, goDashboard } = useLandingNav();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border-subtle bg-[rgba(6,8,12,0.82)] px-8 py-[14px] backdrop-blur-[8px]">
      <BrandMark />

      <nav className="flex items-center gap-7 font-mono text-[11px] uppercase tracking-[0.08em]">
        <a href="#pricing" className={navLinkClass}>
          {t('header.pricing')}
        </a>
        <a href="#features" className={navLinkClass}>
          {t('header.features')}
        </a>
      </nav>

      <div className="flex items-center gap-[10px]">
        {isAuthed ? (
          <Button
            variant="primary"
            fullWidth={false}
            onClick={goDashboard}
            className="whitespace-nowrap px-[18px] py-[10px] text-[14px]"
          >
            {t('header.goDashboard')}
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              fullWidth={false}
              onClick={signIn}
              className="min-w-[92px] whitespace-nowrap px-[18px] py-[10px] text-[14px]"
            >
              {t('header.signIn')}
            </Button>
            <Button
              variant="primary"
              fullWidth={false}
              onClick={createAccount}
              className="whitespace-nowrap px-[18px] py-[10px] text-[14px]"
            >
              {t('header.createAccount')}
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
