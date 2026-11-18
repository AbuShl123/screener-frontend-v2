import { countUnreadTrades, countVisibleUnread } from '@/features/orderbook/exchangeFilter';
import { useExchangeFilterStore } from '@/features/orderbook/exchangeFilterStore';
import { useNotificationSettingsStore } from '@/features/settings';
import { useNotificationStore } from '@/stores/notificationStore';
import { useTradeStore } from '@/stores/tradeStore';

/**
 * Unread depth notifications that are visible: the header exchange filter and the settings
 * venue mutes apply. Shared by the handle badge and the tab chip.
 */
export function useDepthUnread(): number {
  // `notifications` changes on every push, exactly when `unread` does.
  const notifications = useNotificationStore((s) => s.notifications);
  const unread = useNotificationStore((s) => s.unread);
  const hidden = useExchangeFilterStore((s) => s.hidden);
  const mutedVenues = useNotificationSettingsStore((s) => s.mutedVenues);
  return countVisibleUnread(notifications, unread, hidden, mutedVenues);
}

/**
 * Unread trade alerts that are visible: only the header exchange filter applies (mutes are
 * depth-only). The selector returns a number, so callers re-render only when it changes.
 */
export function useTradeUnread(): number {
  const hidden = useExchangeFilterStore((s) => s.hidden);
  return useTradeStore((s) => countUnreadTrades(s.trades, s.readSeq, hidden));
}
