import { useNotificationStore } from '@/stores/notificationStore';

interface NotificationHandleProps {
  /** Whether the panel is open — drives the fade (open ⇒ faded out, non-interactive). */
  open: boolean;
  onOpen: () => void;
}

/**
 * Collapsed notifications handle — a fixed accent pill on the right edge, visible only
 * when the panel is closed. Faithful to the "Dashboard Page Template - Final": 48×48,
 * bell glyph, white count badge notched into the corner. Kept mounted-but-faded (rather
 * than unmounted) so the fade cross-dissolves with the panel slide.
 *
 * Self-subscribes to `unread` (the count since the panel was last opened) so a push
 * re-renders only this handle — never `DashboardPage` and the grid (plan §8a).
 */
export function NotificationHandle({ open, onOpen }: NotificationHandleProps) {
  const unread = useNotificationStore((s) => s.unread);

  return (
    <button
      type="button"
      onClick={onOpen}
      title="Notifications"
      aria-label="Open notifications"
      className={`fixed right-0 top-24 z-40 flex h-12 w-12 items-center justify-center
                  rounded-l-[10px] border border-r-0 border-border bg-accent text-bg shadow-card
                  [transition:opacity_200ms_ease,filter_150ms_ease] hover:brightness-110 ${
                    open ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'
                  }`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unread > 0 && (
        <span
          className="absolute right-1 top-1 inline-flex h-[19px] min-w-[19px] items-center
                     justify-center rounded-full border-2 border-accent bg-white px-1
                     font-mono text-[12px] font-semibold leading-none text-bg"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
