import { useEffect, useState } from 'react';
import { NotificationCard } from '@/features/orderbook/components/NotificationCard';
import { matches } from '@/features/orderbook/notifications/notificationSearch';
import type { SizeMode } from '@/features/orderbook/pages/DashboardPage';
import { useNotificationStore } from '@/stores/notificationStore';

/**
 * Panel width in px. Single source for both the panel's own width and the right padding
 * `DashboardPage` opens up on `<main>`, so the two stay in sync. The template exposed a
 * 280–460 runtime knob; the app fixes it at the template default — no runtime knob needed.
 */
export const PANEL_WIDTH = 340;

interface NotificationPanelProps {
  open: boolean;
  sizeMode: SizeMode;
  onClose: () => void;
}

/**
 * The slide-out notifications rail (design template "Dashboard Page Template - Final").
 * Always mounted; slides via `transform` so it animates both directions and the list
 * isn't rebuilt on every toggle. This is conventional UI (CLAUDE.md), so plain React
 * state is correct — the open/search state is not on the real-time hot path.
 *
 * `query` lives here because nothing outside the panel needs it. The panel self-subscribes
 * to the notification store (never via `DashboardPage`, which would re-render the grid on
 * every push — plan §8a).
 */
export function NotificationPanel({ open, sizeMode, onClose }: NotificationPanelProps) {
  const [query, setQuery] = useState('');
  const notifications = useNotificationStore((s) => s.notifications);
  const unread = useNotificationStore((s) => s.unread);
  const markRead = useNotificationStore((s) => s.markRead);

  // Reset unread on each open transition (and on initial mount when default-open).
  // Depends on `open` only — NOT on `notifications` — so while the panel is open the
  // header "N NEW" grows to show arrivals-since-open, matching "unread since last opened".
  useEffect(() => {
    if (open) markRead();
  }, [open, markRead]);

  // Newest-first ordering comes from the store (index 0 is newest) — no sort needed.
  const visible = notifications.filter((n) => matches(n, query));

  return (
    <aside
      aria-label="Notifications"
      className="fixed top-[60px] right-0 bottom-0 z-50 flex flex-col border-l border-border
                 bg-surface shadow-card
                 [transition:transform_260ms_cubic-bezier(0.22,0.61,0.36,1)]"
      style={{
        width: PANEL_WIDTH,
        // `+ 40px` overshoot fully hides the box shadow when closed.
        transform: open ? 'translateX(0)' : 'translateX(calc(100% + 40px))',
      }}
    >
      {/* Header */}
      <div className="flex flex-none items-center justify-between gap-3 border-b border-border px-[18px] py-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[15px] font-semibold text-text">Notifications</span>
          <span className="font-mono text-[10px] tracking-[0.08em] text-accent">
            {unread} NEW
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Collapse"
          aria-label="Collapse notifications"
          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg
                     border border-border-input text-[16px] leading-none text-text-secondary
                     transition-colors hover:bg-white/5 hover:text-text-strong"
        >
          ×
        </button>
      </div>

      {/* Search */}
      <div className="flex-none border-b border-border-subtle px-[14px] py-3">
        <div className="relative flex items-center">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-[11px] text-text-dim"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker, price, size…"
            className="w-full rounded-lg border border-border-input bg-input py-[9px] pr-3 pl-8
                       font-mono text-[12px] tracking-[0.02em] text-text outline-none
                       focus:border-accent"
          />
        </div>
      </div>

      {/* List (newest at top) */}
      <div className="scrollbar-slim flex flex-1 flex-col gap-2.5 overflow-y-auto px-[14px] py-[14px]">
        {visible.length === 0 ? (
          <div className="py-7 text-center font-mono text-[12px] tracking-[0.04em] text-text-dim">
            No matching notifications
          </div>
        ) : (
          visible.map((n) => (
            <NotificationCard key={n.id} notification={n} sizeMode={sizeMode} />
          ))
        )}
      </div>
    </aside>
  );
}
