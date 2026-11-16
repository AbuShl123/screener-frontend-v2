import { create } from 'zustand';
import { loadSettings, saveSettings, type StoredSettings } from './storage';

/**
 * The notification-settings store: minimum tier + muted book keys + muted venues.
 * Framework-agnostic (created with plain `create`, like `useSession` / `useOrderbookStore`)
 * so the feed client can read it synchronously via `getState()` on the flush hot path — no
 * React involvement between a socket message and the push-boundary filter.
 *
 * Hydrated at module load from `loadSettings()` so `getState()` is already correct
 * before React mounts. Each action persists the next values immediately, the same
 * "action persists" shape as `saveTokens` in the auth store.
 *
 * `muted` holds `bookKey(symbol, market)` strings (`SYMBOL:MARKET`) — the app's one
 * canonical book key, so `(BTCUSDT, SPOT)` and `(BTCUSDT, FUTURES)` mute independently.
 *
 * `mutedVenues` holds `venueKey(exchange, market)` strings (`EXCHANGE_MARKET`), so each
 * exchange's spot and futures notifications mute independently. NOTIFICATIONS ONLY: the
 * order book grid and the dashboard's exchange filter never read it.
 */

interface NotificationSettingsState {
  minTier: number; // 1–4, the full tier range (doc §3.5: tier 0 does not exist)
  muted: string[]; // bookKey(symbol, market) values
  mutedVenues: string[]; // venueKey(exchange, market) values
  setMinTier(tier: number): void;
  mute(key: string): void;
  unmute(key: string): void;
  /** Mute or unmute one `(exchange, market)` venue. */
  setVenueMuted(key: string, muted: boolean): void;
}

const initial = loadSettings();

export const useNotificationSettingsStore = create<NotificationSettingsState>((set, get) => {
  /** Apply a partial update and persist the full settings snapshot. */
  const commit = (patch: Partial<StoredSettings>) => {
    set(patch);
    const { minTier, muted, mutedVenues } = get();
    saveSettings({ minTier, muted, mutedVenues });
  };

  return {
    minTier: initial.minTier,
    muted: initial.muted,
    mutedVenues: initial.mutedVenues,

    setMinTier(tier) {
      commit({ minTier: Math.min(4, Math.max(1, Math.trunc(tier))) });
    },

    mute(key) {
      if (get().muted.includes(key)) return; // no-op if already muted
      commit({ muted: [...get().muted, key] });
    },

    unmute(key) {
      commit({ muted: get().muted.filter((k) => k !== key) });
    },

    setVenueMuted(key, muted) {
      const current = get().mutedVenues;
      if (current.includes(key) === muted) return; // already in the requested state
      commit({ mutedVenues: muted ? [...current, key] : current.filter((k) => k !== key) });
    },
  };
});
