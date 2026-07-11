import { create } from 'zustand';
import { ApiError } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import * as api from './api';
import { clearTokens, loadTokens, saveTokens } from './storage';
import type { AuthResponse, LoginRequest, UserProfile } from './schemas';

/**
 * The stateful, orchestrating module for TOKENS ONLY. Owns token state, the derived
 * expiry, the proactive-refresh timer, and single-flight refresh. Imports `api.ts`
 * and `storage.ts`; knows nothing about React.
 *
 * It deliberately does NOT hold the `/me` profile — that lives in the React Query
 * cache (`queries.ts`). Nothing outside React reads the profile, so it has no business
 * in this outside-React store; the tokens, by contrast, must live here because the
 * fetch wrapper and (future) WS client need them synchronously.
 *
 * No navigation/router imports: `clearSession()` flips status to 'anonymous' and the
 * Phase 6 route guards react to that — the store never redirects.
 */

/**
 * React Query key for the `/me` profile. Defined HERE (not in `queries.ts`) so that
 * `logout()` below can evict the profile cache without `session.ts` importing
 * `queries.ts` — that would invert the one-way dependency flow (queries → session).
 * It's a plain constant, no React. `queries.ts` re-exports it as the public surface.
 */
export const authKeys = {
  all: ['auth'] as const,
  me: ['auth', 'me'] as const,
};

type SessionStatus = 'anonymous' | 'authenticated';

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null; // epoch ms
  // NOTE: no `profile` field — the /me profile is a React Query cache entry.

  /** Store tokens, derive expiresAt, persist, (re)schedule the proactive refresh. */
  setSession(auth: AuthResponse): void;
  /** Hard logout: cancel timer, clear tokens → status 'anonymous'. No navigation. */
  clearSession(): void;
}

// Module-level, not in store state:
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshPromise: Promise<void> | null = null; // single-flight guard

// Rehydrate raw tokens on module load so a page reload keeps them in memory.
// Fetching /me on reload is Phase 6; here we only restore the tokens themselves.
const initialTokens = loadTokens();

export const useSession = create<SessionState>((set) => ({
  status: initialTokens ? 'authenticated' : 'anonymous',
  accessToken: initialTokens?.accessToken ?? null,
  refreshToken: initialTokens?.refreshToken ?? null,
  expiresAt: initialTokens?.expiresAt ?? null,

  setSession(auth) {
    const expiresAt = Date.now() + auth.expiresIn * 1000;
    set({
      status: 'authenticated',
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt,
    });
    saveTokens({
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt,
    });
    scheduleRefresh();
  },

  clearSession() {
    hardLogout();
  },
}));

// If tokens rehydrated on load, arm the proactive refresh for the existing expiry.
if (initialTokens) scheduleRefresh();

/** (Re)arm the proactive refresh timer for `expiresIn - 60s`, per the API doc. */
function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const { expiresAt } = useSession.getState();
  if (expiresAt == null) return;
  const delay = Math.max(0, expiresAt - Date.now() - 60_000);
  // refreshTokens() already hard-logs-out on failure, so this catch is a no-op.
  refreshTimer = setTimeout(() => {
    void refreshTokens().catch(() => {});
  }, delay);
}

/**
 * Cancel the timer, drop the single-flight promise, clear tokens, reset to anonymous,
 * and wipe the React Query cache. The cache wipe matters beyond `/me`: every REST query
 * (classification rules, billing history, …) is keyed without a user id, so without this
 * a second user logging in on the same tab would see the first user's cached data until
 * a full page reload. This is the single choke point both `logout()` and a failed
 * proactive/401 refresh go through, so it covers forced session death too.
 */
function hardLogout(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  refreshPromise = null;
  clearTokens();
  useSession.setState({
    status: 'anonymous',
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  });
  queryClient.clear();
}

/**
 * Single-flight refresh: N concurrent 401s trigger exactly one `/refresh`. Rotation
 * means the old refresh token is dead afterward, so we ALWAYS store the new pair.
 * Any failure is unrecoverable → hard logout + rethrow.
 */
export function refreshTokens(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const rt = useSession.getState().refreshToken;
    if (!rt) {
      hardLogout();
      throw new ApiError('No refresh token', 401, '/api/auth/refresh');
    }
    try {
      const auth = await api.refresh({ refreshToken: rt });
      useSession.getState().setSession(auth); // stores the new refreshToken
    } catch (e) {
      hardLogout();
      throw e;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Wrap a token-taking api fn so a 401/empty-403 triggers one refresh + retry.
 * Proactive refresh should make this rare; the doc wants it as a backstop.
 *
 * The 403 inclusion is safe: the callers that go through `withAuth` (`/me`, `/logout`,
 * and billing's authed order POST) treat a 403 as Spring Security's empty-body bearer
 * rejection — NOT the login-flow "email not verified" 403 (login never goes through
 * withAuth). Any endpoint routed through here must share that empty-403 contract.
 */
export async function withAuth<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = useSession.getState().accessToken;
  if (!token) {
    hardLogout();
    throw new ApiError('Not authenticated', 401, '');
  }
  try {
    return await fn(token);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      await refreshTokens(); // single-flight; throws on failure (already hard-logged-out)
      const fresh = useSession.getState().accessToken;
      if (!fresh) throw e;
      return await fn(fresh); // retry once with the fresh token
    }
    throw e;
  }
}

// ── Public orchestration wrappers ──

/**
 * Log in and store tokens. Does NOT fetch `/me` — warming the profile query is a
 * page/bootstrap decision (Phases 5–6), so this stays single-purpose.
 */
export async function loginAndStore(body: LoginRequest): Promise<void> {
  const auth = await api.login(body);
  useSession.getState().setSession(auth);
}

/**
 * Fetch the profile. Plain async (no React) so it doubles as the React Query
 * `queryFn` (see `queries.ts`) AND something the Phase 6 bootstrap can `await`
 * directly. Handles refresh-on-401 internally via `withAuth`; writes no store.
 */
export function fetchMe(): Promise<UserProfile> {
  return withAuth((token) => api.me(token));
}

/**
 * Best-effort logout: swallow any network error and ALWAYS clear the session
 * (idempotent discard, per doc §3.6) — `clearSession()` → `hardLogout()` also wipes
 * the React Query cache, so this is the single place that clears both stores.
 */
export async function logout(): Promise<void> {
  try {
    await withAuth((token) => api.logout(token));
  } catch {
    // Ignored — logout is best-effort and idempotent.
  } finally {
    useSession.getState().clearSession();
  }
}
