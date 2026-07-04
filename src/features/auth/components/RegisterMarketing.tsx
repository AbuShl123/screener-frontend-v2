/**
 * The 2b register left-panel marketing content: headline + subtext + a three-stat
 * row. Passed to `SplitAuthLayout`'s `marketing` slot, which renders these two
 * children inside its centered middle block (the `BrandMark` and `TickerStrip` stay
 * structural in the layout). Distinct from the layout's default login/2a panel.
 */
export function RegisterMarketing() {
  return (
    <>
      <div className="flex flex-col gap-[14px]">
        <h2 className="max-w-[580px] font-sans text-[38px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
          Your thresholds. Your tickers. Sub-second.
        </h2>
        <p className="max-w-[460px] text-[15px] leading-[1.6] text-text-muted">
          Define custom classification rules per ticker and watch significant
          levels surface the moment they form.
        </p>
      </div>
      <div className="flex gap-10">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[24px] font-semibold text-text-strong">500+</span>
          <span className="text-[12px] text-text-muted">spot &amp; futures tickers</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[24px] font-semibold text-text-strong">&lt;1s</span>
          <span className="text-[12px] text-text-muted">streaming latency</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[24px] font-semibold text-text-strong">7 days</span>
          <span className="text-[12px] text-text-muted">free trial, no card</span>
        </div>
      </div>
    </>
  );
}
