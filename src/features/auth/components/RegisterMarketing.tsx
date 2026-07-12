import { useTranslation } from 'react-i18next';

/**
 * The 2b register left-panel marketing content: headline + subtext + a three-stat
 * row. Passed to `SplitAuthLayout`'s `marketing` slot, which renders these two
 * children inside its centered middle block (the `BrandMark` and `TickerStrip` stay
 * structural in the layout). Distinct from the layout's default login/2a panel.
 */
export function RegisterMarketing() {
  const { t } = useTranslation('auth');
  return (
    <>
      <div className="flex flex-col gap-[14px]">
        <h2 className="max-w-[580px] font-sans text-[38px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
          {t('marketing.heading')}
        </h2>
        <p className="max-w-[460px] text-[15px] leading-[1.6] text-text-muted">
          {t('marketing.body')}
        </p>
      </div>
      <div className="flex gap-10">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[24px] font-semibold text-text-strong">
            {t('marketing.stats.tickersValue')}
          </span>
          <span className="text-[12px] text-text-muted">{t('marketing.stats.tickersCaption')}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[24px] font-semibold text-text-strong">
            {t('marketing.stats.latencyValue')}
          </span>
          <span className="text-[12px] text-text-muted">{t('marketing.stats.latencyCaption')}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[24px] font-semibold text-text-strong">
            {t('marketing.stats.trialValue')}
          </span>
          <span className="text-[12px] text-text-muted">{t('marketing.stats.trialCaption')}</span>
        </div>
      </div>
    </>
  );
}
