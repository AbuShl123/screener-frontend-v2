import {
  countUnreadTrades,
  countVisibleUnread,
} from '@/features/orderbook/notifications/settingsFilter';
import { useNotificationSettingsStore } from '@/features/settings';
import { useNotificationStore } from '@/stores/notificationStore';
import { useTradeStore } from '@/stores/tradeStore';

/**
 * Unread depth notifications that are visible, i.e. not from an order-book-muted venue. The
 * header exchange filter does NOT apply (it hides order book cards only). Shared by the handle
 * badge and the tab chip.
 */
export function useDepthUnread(): number {
  // `notifications` changes on every push, exactly when `unread` does.
  const notifications = useNotificationStore((s) => s.notifications);
  const unread = useNotificationStore((s) => s.unread);
  const mutedVenues = useNotificationSettingsStore((s) => s.mutedVenues);
  return countVisibleUnread(notifications, unread, mutedVenues);
}

/**
 * Unread trade alerts that are visible, i.e. not from a trade-muted venue. The selector returns
 * a number, so callers re-render only when it changes.
 */
export function useTradeUnread(): number {
  const mutedTradeVenues = useNotificationSettingsStore((s) => s.mutedTradeVenues);
  return useTradeStore((s) => countUnreadTrades(s.trades, s.readSeq, mutedTradeVenues));
}
