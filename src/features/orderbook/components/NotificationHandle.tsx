import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DepthIcon, TradeIcon } from '@/features/orderbook/components/alertIcons';
import { useDepthUnread, useTradeUnread } from '@/features/orderbook/notifications/useUnreadCounts';

interface NotificationHandleProps {
  /** Whether the panel is open — drives the fade (open ⇒ faded out, non-interactive). */
  open: boolean;
  /** Open the panel on the order book (depth) tab. */
  onOpenDepth: () => void;
  /** Open the panel on the large-trades tab. */
  onOpenTrades: () => void;
}

/**
 * Collapsed notification handles — one fixed accent pill per alert stream, stacked on the
 * right edge and visible only when the panel is closed (design template "Dashboard Page
 * Template - Final"): 48×48, a depth-ladder glyph and a lightning glyph, each with a white
 * unread badge notched into the corner. Each opens the panel on its own tab. Kept
 * mounted-but-faded (rather than unmounted) so the fade cross-dissolves with the panel slide.
 *
 * Each button self-subscribes to its own unread count, so a push re-renders only that
 * button — never `DashboardPage` and the grid (plan §8a).
 */
export const NotificationHandle = memo(function NotificationHandle({
  open,
  onOpenDepth,
  onOpenTrades,
}: NotificationHandleProps) {
  return (
    // 36px below the header (was `top-24` = 96px under the 60px header), via `--header-h`.
    <div
      className={`fixed right-0 top-[calc(var(--header-h)+36px)] z-40 flex flex-col gap-2
                  [transition:opacity_200ms_ease] ${
                    open ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'
                  }`}
    >
      <DepthHandle onOpen={onOpenDepth} />
      <TradeHandle onOpen={onOpenTrades} />
    </div>
  );
});

function DepthHandle({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation('orderbook');
  // Visible unread only: the header exchange filter and settings venue mutes apply.
  const unread = useDepthUnread();
  return (
    <HandleButton
      title={t('panel.tabs.depthTitle')}
      ariaLabel={t('panel.openDepth')}
      onClick={onOpen}
      icon={<DepthIcon size={20} />}
      unread={unread}
    />
  );
}

function TradeHandle({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation('orderbook');
  // Visible unread only: just the header exchange filter (mutes are depth-only).
  const unread = useTradeUnread();
  return (
    <HandleButton
      title={t('panel.tabs.tradesTitle')}
      ariaLabel={t('panel.openTrades')}
      onClick={onOpen}
      icon={<TradeIcon size={20} strokeWidth={1.8} />}
      unread={unread}
    />
  );
}

function HandleButton({
  title,
  ariaLabel,
  onClick,
  icon,
  unread,
}: {
  title: string;
  ariaLabel: string;
  onClick: () => void;
  icon: ReactNode;
  unread: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className="relative flex h-12 w-12 items-center justify-center rounded-l-[10px] border border-r-0
                 border-border bg-accent text-bg shadow-card [transition:filter_150ms_ease]
                 hover:brightness-110"
    >
      {icon}
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
