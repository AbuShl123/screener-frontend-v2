/**
 * Thin, synchronous localStorage layer for auth tokens. Isolated so the store never
 * string-keys localStorage inline, and so the Phase 6 bootstrap can read tokens
 * synchronously before React mounts.
 *
 * Decision locked by the parent plan: BOTH tokens live in localStorage.
 * Every access is guarded — private-mode / disabled storage must not crash boot.
 */

const KEYS = {
  accessToken: 'screener.auth.accessToken',
  refreshToken: 'screener.auth.refreshToken',
  expiresAt: 'screener.auth.expiresAt', // epoch ms, derived from expiresIn at store time
} as const;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Returns null if any key is missing or malformed. */
export function loadTokens(): StoredTokens | null {
  try {
    const accessToken = localStorage.getItem(KEYS.accessToken);
    const refreshToken = localStorage.getItem(KEYS.refreshToken);
    const expiresAtRaw = localStorage.getItem(KEYS.expiresAt);
    if (!accessToken || !refreshToken || !expiresAtRaw) return null;

    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt)) return null;

    return { accessToken, refreshToken, expiresAt };
  } catch {
    return null;
  }
}

export function saveTokens(t: StoredTokens): void {
  try {
    localStorage.setItem(KEYS.accessToken, t.accessToken);
    localStorage.setItem(KEYS.refreshToken, t.refreshToken);
    localStorage.setItem(KEYS.expiresAt, String(t.expiresAt));
  } catch {
    // Storage unavailable — tokens stay in memory for this session only.
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(KEYS.accessToken);
    localStorage.removeItem(KEYS.refreshToken);
    localStorage.removeItem(KEYS.expiresAt);
  } catch {
    // Nothing to do — best-effort.
  }
}
