import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { exchangeMeta, useExchangeRegistry } from '@/features/orderbook/exchanges';
import { isLastVisible, useExchangeFilterStore } from '@/features/orderbook/exchangeFilterStore';
import { ExchangeLogo } from '@/features/orderbook/components/ExchangeLogo';
import { useAnchoredMenu } from '@/features/orderbook/components/useAnchoredMenu';

/**
 * Header "Exchanges" multi-select. Same trigger, menu surface, outside-click catcher and
 * Escape-to-close as `SortMenu`; rows add the exchange logo and a checkbox. The menu stays
 * open while toggling (multi-select). The last visible exchange can't be unchecked.
 *
 * Reads and writes `useExchangeFilterStore` directly (no props): unlike the sort mode, the
 * filter is a persisted store, not page state. Rows are the exchange registry's current ids
 * (from `/api/exchanges`), so a new exchange appears here with no code change.
 */
export function ExchangeFilterMenu() {
  const { t } = useTranslation('orderbook');
  const [open, setOpen] = useState(false);
  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(open);
  const ids = useExchangeRegistry((s) => s.ids);
  useExchangeRegistry((s) => s.version); // re-render on label/logo changes
  const hidden = useExchangeFilterStore((s) => s.hidden);
  const toggle = useExchangeFilterStore((s) => s.toggle);
  const showAll = useExchangeFilterStore((s) => s.showAll);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const visible = ids.filter((e) => !hidden.includes(e));
  const summary =
    hidden.length === 0
      ? t('exchangeFilter.all')
      : visible.length <= 2
        ? visible.map((e) => exchangeMeta(e).label).join(', ')
        : t('exchangeFilter.count', { n: visible.length, total: ids.length });

  return (
    // Same responsive sizing as `SortMenu`'s trigger (half of row 2 below `lg`, inline above).
    <div ref={anchorRef} className="relative min-w-0 flex-1 basis-0 lg:flex-initial lg:basis-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full max-w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg
                    border border-border-input px-3 lg:inline-flex lg:w-auto
                    py-2 font-sans text-[13px] transition-colors ${
                      open ? 'bg-white/5 text-text-strong' : 'bg-transparent text-text-secondary hover:bg-white/5 hover:text-text-strong'
                    }`}
      >
        <span className="hidden text-text-dim xl:inline">{t('exchangeFilter.label')}</span>
        <span className="min-w-0 truncate text-text-strong">{summary}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-none transition-transform duration-150 ${open ? 'rotate-180' : 'rotate-0'}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Portaled to <body>: see `useAnchoredMenu` for why the menu can't live in the header. */}
      {open &&
        createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            role="menu"
            ref={menuRef}
            style={menuStyle}
            className="z-[60] flex min-w-[220px] flex-col gap-0.5
                       rounded-[10px] border border-border bg-surface p-1.5 shadow-[var(--shadow-card)]"
          >
            {ids.map((exchange) => {
              const checked = !hidden.includes(exchange);
              const locked = isLastVisible(hidden, ids, exchange);
              const meta = exchangeMeta(exchange);
              return (
                <button
                  key={exchange}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  aria-disabled={locked}
                  title={locked ? t('exchangeFilter.lastOne') : undefined}
                  onClick={locked ? undefined : () => toggle(exchange)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-[11px] py-[9px] text-left
                              font-sans text-[13px] transition-colors ${
                                locked ? 'cursor-not-allowed' : 'hover:bg-white/5'
                              } ${checked ? 'bg-accent/[0.12] text-text-strong' : 'bg-transparent text-text-secondary'}`}
                >
                  <ExchangeLogo id={exchange} alt="" className="size-3.5 flex-none" />
                  <span className="flex-1">{meta.label}</span>
                  <span
                    className={`inline-flex h-[14px] w-[14px] flex-none items-center justify-center rounded-[3px]
                                border text-[10px] leading-none ${
                                  checked
                                    ? `border-accent bg-accent text-bg ${locked ? 'opacity-50' : ''}`
                                    : 'border-border-input bg-transparent'
                                }`}
                  >
                    {checked ? '✓' : ''}
                  </span>
                </button>
              );
            })}

            {hidden.length > 0 && (
              <>
                <div className="mx-1 my-1 h-px bg-border-subtle" />
                <button
                  type="button"
                  onClick={showAll}
                  className="w-full rounded-lg px-[11px] py-[7px] text-left font-sans text-[12px]
                             text-accent transition-colors hover:bg-white/5"
                >
                  {t('exchangeFilter.showAll')}
                </button>
              </>
            )}
          </div>
        </>,
          document.body,
        )}
    </div>
  );
}
