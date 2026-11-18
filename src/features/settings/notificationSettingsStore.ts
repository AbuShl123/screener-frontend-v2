import { create } from 'zustand';
import { loadSettings, saveSettings, type StoredSettings } from './storage';

/**
 * The notification-settings store: minimum tier + muted book keys + per-type muted venues.
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
 * It and `minTier` apply to order book (depth) notifications only.
 *
 * `mutedVenues` (order book notifications) and `mutedTradeVenues` (large-trade alerts) hold
 * `venueKey(exchange, market)` strings (`EXCHANGE_MARKET`), so each exchange's spot and futures
 * mute independently, per alert type. NOTIFICATIONS ONLY: the order book grid and the
 * dashboard's exchange filter never read them.
 */

/** Which alert stream a venue mute applies to (the notification panel's two tabs). */
export type VenueMuteKind = 'depth' | 'trades';

interface NotificationSettingsState {
  minTier: number; // 1–4, the full tier range (doc §3.5: tier 0 does not exist)
  muted: string[]; // bookKey(symbol, market) values
  mutedVenues: string[]; // venueKey(exchange, market) values — order book notifications
  mutedTradeVenues: string[]; // venueKey(exchange, market) values — large-trade alerts
  setMinTier(tier: number): void;
  mute(key: string): void;
  unmute(key: string): void;
  /** Mute or unmute one `(exchange, market)` venue for one alert type. */
  setVenueMuted(kind: VenueMuteKind, key: string, muted: boolean): void;
  /** Mutes/unmutes every alert type for all `keys` at once (the per-exchange switch). */
  setVenuesMutedAll(keys: readonly string[], muted: boolean): void;
}

const initial = loadSettings();

export const useNotificationSettingsStore = create<NotificationSettingsState>((set, get) => {
  /** Apply a partial update and persist the full settings snapshot. */
  const commit = (patch: Partial<StoredSettings>) => {
    set(patch);
    const { minTier, muted, mutedVenues, mutedTradeVenues } = get();
    saveSettings({ minTier, muted, mutedVenues, mutedTradeVenues });
  };

  return {
    minTier: initial.minTier,
    muted: initial.muted,
    mutedVenues: initial.mutedVenues,
    mutedTradeVenues: initial.mutedTradeVenues,

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

    setVenueMuted(kind, key, muted) {
      const field = kind === 'depth' ? 'mutedVenues' : 'mutedTradeVenues';
      const current = get()[field];
      if (current.includes(key) === muted) return; // already in the requested state
      commit({ [field]: muted ? [...current, key] : current.filter((k) => k !== key) });
    },

    setVenuesMutedAll(keys, muted) {
      const apply = (current: string[]) => {
        const rest = current.filter((k) => !keys.includes(k));
        return muted ? [...rest, ...keys] : rest;
      };
      const { mutedVenues, mutedTradeVenues } = get();
      commit({ mutedVenues: apply(mutedVenues), mutedTradeVenues: apply(mutedTradeVenues) });
    },
  };
});
