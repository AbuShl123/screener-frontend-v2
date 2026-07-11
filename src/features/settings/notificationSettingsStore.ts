import { create } from 'zustand';
import { loadSettings, saveSettings } from './storage';

/**
 * The notification-settings store: minimum tier + muted book keys. Framework-agnostic
 * (created with plain `create`, like `useSession` / `useOrderbookStore`) so the feed
 * client can read it synchronously via `getState()` on the flush hot path — no React
 * involvement between a socket message and the push-boundary filter.
 *
 * Hydrated at module load from `loadSettings()` so `getState()` is already correct
 * before React mounts. Each action persists the next values immediately, the same
 * "action persists" shape as `saveTokens` in the auth store.
 *
 * `muted` holds `bookKey(symbol, market)` strings (`SYMBOL:MARKET`) — the app's one
 * canonical book key, so `(BTCUSDT, SPOT)` and `(BTCUSDT, FUTURES)` mute independently.
 */

interface NotificationSettingsState {
  minTier: number; // 1–4 (tier 0 is not an offered choice — it never notifies)
  muted: string[]; // bookKey(symbol, market) values
  setMinTier(tier: number): void;
  mute(key: string): void;
  unmute(key: string): void;
}

const initial = loadSettings();

export const useNotificationSettingsStore = create<NotificationSettingsState>((set, get) => ({
  minTier: initial.minTier,
  muted: initial.muted,

  setMinTier(tier) {
    const minTier = Math.min(4, Math.max(1, Math.trunc(tier)));
    set({ minTier });
    saveSettings({ minTier, muted: get().muted });
  },

  mute(key) {
    if (get().muted.includes(key)) return; // no-op if already muted
    const muted = [...get().muted, key];
    set({ muted });
    saveSettings({ minTier: get().minTier, muted });
  },

  unmute(key) {
    const muted = get().muted.filter((k) => k !== key);
    set({ muted });
    saveSettings({ minTier: get().minTier, muted });
  },
}));
