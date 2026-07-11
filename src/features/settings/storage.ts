/**
 * Thin, synchronous localStorage layer for the notification settings (minimum tier +
 * muted tickers). Mirrors [`auth/storage.ts`](../auth/storage.ts): every access is
 * try/catch-guarded so disabled/private-mode storage can never crash boot, and the
 * store can hydrate synchronously before React mounts (the feed client reads settings
 * via `getState()` on the hot path — see the module plan §3).
 *
 * Settings are device-level, not per-user: they persist across logout/login on the same
 * device, like a theme. No backend endpoint exists for them — they're pure client filters.
 */

const KEYS = {
  minTier: 'screener.settings.minTier',
  mutedTickers: 'screener.settings.mutedTickers', // JSON string[] of bookKey() values
} as const;

export interface StoredSettings {
  minTier: number; // 1–4 (tier 0 is not an offered choice — it never notifies)
  muted: string[]; // bookKey(symbol, market) values
}

const DEFAULTS: StoredSettings = { minTier: 1, muted: [] };

/** Clamp an unknown value to an integer tier in [1, 4]; falls back to 1. */
function clampTier(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(4, Math.max(1, Math.trunc(n)));
}

/** Returns baked-in defaults on any missing/malformed value — never throws. */
export function loadSettings(): StoredSettings {
  try {
    const minTier = clampTier(localStorage.getItem(KEYS.minTier));

    let muted: string[] = [];
    const rawMuted = localStorage.getItem(KEYS.mutedTickers);
    if (rawMuted) {
      const parsed: unknown = JSON.parse(rawMuted);
      if (Array.isArray(parsed)) {
        // Coerce to string[]: drop non-strings, dedupe.
        muted = [...new Set(parsed.filter((v): v is string => typeof v === 'string'))];
      }
    }

    return { minTier, muted };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Best-effort write; a storage failure just means settings stay in-memory this session. */
export function saveSettings(s: StoredSettings): void {
  try {
    localStorage.setItem(KEYS.minTier, String(s.minTier));
    localStorage.setItem(KEYS.mutedTickers, JSON.stringify(s.muted));
  } catch {
    // Storage unavailable — settings behave as in-memory for this session only.
  }
}
