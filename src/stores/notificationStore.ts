import { create } from 'zustand';
import type { Notification } from '@/features/orderbook/types';

/**
 * Notifications state that lives OUTSIDE React (same pattern as `orderbookStore`): the
 * feed pipeline is the ONLY writer, the panel/handle read via selectors. This is the
 * "notifications subscribe to store diffs independently of rendering" sink from
 * CLAUDE.md's architecture diagram. See plan §5.
 */

const CAP = 500; // newest-first ring buffer; older than this are evicted (see plan §2 for the rationale)

/**
 * Whether the panel is open on the depth tab. While it is, arrivals are already on screen, so
 * `push` doesn't count them as unread. Module-level (not state): nothing renders from it.
 */
let viewing = false;

interface NotificationState {
  notifications: Notification[]; // newest at index 0
  unread: number; // count since the panel was last opened
  push(batch: Notification[]): void;
  markRead(): void; // panel-open transition → 0
  /** The panel opened on / left the depth tab. Entering marks everything read. */
  setViewing(v: boolean): void;
  clear(): void; // feed stop / session end
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unread: 0,

  push(batch) {
    if (batch.length === 0) return; // common case — most flushes raise nothing; don't wake subscribers
    set((s) => ({
      // batch is oldest→newest (arrival order); reverse so the newest lands at index 0.
      notifications: [...batch].reverse().concat(s.notifications).slice(0, CAP),
      unread: viewing ? 0 : s.unread + batch.length,
    }));
  },

  markRead() {
    set((s) => (s.unread === 0 ? s : { unread: 0 })); // already 0 → no needless notification
  },

  setViewing(v) {
    viewing = v;
    if (v) useNotificationStore.getState().markRead();
  },

  clear() {
    set({ notifications: [], unread: 0 });
  },
}));
