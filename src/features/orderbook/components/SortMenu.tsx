import { useEffect, useState } from 'react';
import { SORT_OPTIONS, type SortMode } from '@/features/orderbook/sortOrderbooks';

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
  const [open, setOpen] = useState(false);
  const activeLabel = SORT_OPTIONS.find((o) => o.id === sortMode)?.label ?? SORT_OPTIONS[0].label;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-lg border border-border-input px-3
                    py-2 font-sans text-[13px] transition-colors ${
                      open ? 'bg-white/5 text-text-strong' : 'bg-transparent text-text-secondary hover:bg-white/5 hover:text-text-strong'
                    }`}
      >
        <span className="text-text-dim">Sort</span>
        <span className="text-text-strong">{activeLabel}</span>
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

      {open && (
        <>
          <div className="fixed inset-0 z-[15]" onClick={() => setOpen(false)} />
          <div
            className="absolute top-[calc(100%+6px)] left-0 z-20 flex min-w-[250px] flex-col gap-0.5
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
                  <span>{opt.label}</span>
                  {active && <span className="text-[13px] leading-none text-accent">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
