import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/stores/notificationStore';
import { countVisibleUnread } from '@/features/orderbook/exchangeFilter';
import { useExchangeFilterStore } from '@/features/orderbook/exchangeFilterStore';
import { useNotificationSettingsStore } from '@/features/settings';

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
export const NotificationHandle = memo(function NotificationHandle({
  open,
  onOpen,
}: NotificationHandleProps) {
  const { t } = useTranslation('orderbook');
  // Badge counts only unread notifications from exchanges the header filter leaves visible and
  // venues not muted in notification settings. `notifications` changes on every push, exactly
  // when `unread` does, so this subscribes to nothing more frequent than before.
  const notifications = useNotificationStore((s) => s.notifications);
  const totalUnread = useNotificationStore((s) => s.unread);
  const hidden = useExchangeFilterStore((s) => s.hidden);
  const mutedVenues = useNotificationSettingsStore((s) => s.mutedVenues);
  const unread = countVisibleUnread(notifications, totalUnread, hidden, mutedVenues);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={t('panel.title')}
      aria-label={t('panel.open')}
      // 36px below the header (was `top-24` = 96px under the 60px header), via `--header-h`.
      className={`fixed right-0 top-[calc(var(--header-h)+36px)] z-40 flex h-12 w-12 items-center justify-center
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
});
