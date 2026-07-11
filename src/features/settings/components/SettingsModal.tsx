import { useEffect, useState } from 'react';
import { NotificationsSettings } from './NotificationsSettings';
import { ClassificationRules } from './ClassificationRules';

/**
 * Full-screen Settings overlay (design template "Dashboard Page — Final"). A left nav
 * rail switches sections; **Notifications** and **Classification rules** are built —
 * **Appearance** is shown but inert (dimmed, `SOON` chip) per the module plans.
 *
 * The dialog is ALWAYS mounted and toggled via opacity/visibility/pointer-events + a
 * subtle scale (matching the template), which preserves the entrance/exit transition and
 * avoids a remount. `onClose` fires on backdrop click, the header ×, and Escape.
 */

type Tab = 'notifications' | 'rules' | 'appearance';

interface NavItem {
  id: Tab;
  label: string;
  disabled: boolean;
}

const NAV: NavItem[] = [
  { id: 'notifications', label: 'Notifications', disabled: false },
  { id: 'rules', label: 'Classification rules', disabled: false },
  { id: 'appearance', label: 'Appearance', disabled: true },
];

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('rules');

  // Close on Escape while open (backdrop click + header × cover the pointer cases).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open so the dashboard behind the modal can't scroll.
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-8
                 [background:color-mix(in_oklab,var(--color-bg)_72%,transparent)]
                 [backdrop-filter:blur(3px)]
                 [transition:opacity_160ms_ease,visibility_160ms_ease]"
      style={{
        opacity: open ? 1 : 0,
        visibility: open ? 'visible' : 'hidden',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
        className="flex h-[min(88vh,660px)] w-full max-w-[1040px] flex-col overflow-hidden
                   rounded-[14px] border border-border bg-surface shadow-[var(--shadow-card)]
                   [transition:transform_180ms_cubic-bezier(0.22,0.61,0.36,1)]"
        style={{ transform: open ? 'scale(1)' : 'scale(0.985)' }}
      >
        {/* Header */}
        <div className="flex flex-none items-center justify-between gap-3 border-b border-border px-5 py-[17px]">
          <span className="text-[16px] font-semibold text-text">Settings</span>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border
                       border-border-input text-[16px] leading-none text-text-secondary transition-colors
                       hover:bg-white/5 hover:text-text-strong"
          >
            ×
          </button>
        </div>

        {/* Body: nav rail + content */}
        <div className="flex min-h-0 flex-1">
          {/* Nav rail */}
          <nav className="flex w-[260px] flex-none flex-col gap-[3px] border-r border-border-subtle
                          bg-surface-marketing px-3 py-4">
            {NAV.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.disabled ? undefined : () => setTab(item.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-[11px]
                              py-[9px] text-left text-[13px] transition-colors ${
                                item.disabled
                                  ? 'cursor-default text-text-dim'
                                  : active
                                    ? 'bg-accent/[0.13] text-text'
                                    : 'text-text-secondary hover:bg-white/[0.04] hover:text-text'
                              }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`h-[9px] w-[9px] flex-none rotate-45 rounded-[2px] ${
                        active ? 'bg-accent' : 'border border-border-input'
                      }`}
                    />
                    {item.label}
                  </span>
                  {item.disabled && (
                    <span className="rounded border border-border-input px-1 py-px font-mono text-[8px] tracking-[0.12em] text-text-dim">
                      SOON
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-[26px] pt-6 pb-[30px] scrollbar-slim">
            {tab === 'notifications' && <NotificationsSettings open={open} />}
            {tab === 'rules' && <ClassificationRules open={open} />}
          </div>
        </div>
      </div>
    </div>
  );
}
