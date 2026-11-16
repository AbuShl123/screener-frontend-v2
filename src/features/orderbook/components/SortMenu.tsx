import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SORT_OPTIONS, type SortMode } from '@/features/orderbook/sortOrderbooks';
import { useAnchoredMenu } from '@/features/orderbook/components/useAnchoredMenu';

interface SortMenuProps {
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
}

/**
 * Header "Sort" control (design template "Dashboard Page — Final"). A button showing the
 * active option opens a small menu; a fixed full-screen catcher div behind the menu closes
 * it on outside click, matching `SettingsModal`'s backdrop-click-to-close convention.
 */
export function SortMenu({ sortMode, onSortModeChange }: SortMenuProps) {
  const { t } = useTranslation('orderbook');
  const [open, setOpen] = useState(false);
  const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(open);
  const activeLabelKey =
    SORT_OPTIONS.find((o) => o.id === sortMode)?.labelKey ?? SORT_OPTIONS[0].labelKey;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    // Below `lg`: half of the header's second row (button fills it). From `lg` up: natural
    // inline width; `min-w-0` + the truncating value let it give way instead of overflowing.
    <div ref={anchorRef} className="relative min-w-0 flex-1 basis-0 lg:flex-initial lg:basis-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full max-w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg
                    border border-border-input px-3 lg:inline-flex lg:w-auto
                    py-2 font-sans text-[13px] transition-colors ${
                      open ? 'bg-white/5 text-text-strong' : 'bg-transparent text-text-secondary hover:bg-white/5 hover:text-text-strong'
                    }`}
      >
        <span className="hidden text-text-dim xl:inline">{t('sort.label')}</span>
        <span className="min-w-0 truncate text-text-strong">{t(activeLabelKey)}</span>
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
            ref={menuRef}
            style={menuStyle}
            className="z-[60] flex min-w-[250px] flex-col gap-0.5
                       rounded-[10px] border border-border bg-surface p-1.5 shadow-[var(--shadow-card)]"
          >
            {SORT_OPTIONS.map((opt) => {
              const active = opt.id === sortMode;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onSortModeChange(opt.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-[11px] py-[9px]
                              text-left font-sans text-[13px] transition-colors hover:bg-white/5 ${
                                active ? 'bg-accent/[0.12] text-text-strong' : 'bg-transparent text-text-secondary'
                              }`}
                >
                  <span>{t(opt.labelKey)}</span>
                  {active && <span className="text-[13px] leading-none text-accent">✓</span>}
                </button>
              );
            })}
          </div>
        </>,
          document.body,
        )}
    </div>
  );
}
