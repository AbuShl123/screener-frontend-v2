# Phase 2 — Auth API client & session store (concrete implementation plan)

Parent plan: [`auth-templates-implementation.md`](./auth-templates-implementation.md) § Phase 2.
API contract: [`.claude/docs/auth-api.md`](../docs/auth-api.md).

**Goal**: wire up the entire auth data layer with **no pages and no design work**. This phase is
invisible infra — it produces the typed REST client, the seven endpoint functions, and the session
store (tokens + refresh lifecycle + hydrated profile) that Phases 3–6 consume. Reviewable by
`npm run typecheck` plus an optional scratch/console exercise against a running backend.

> **No design templates needed.** This phase renders nothing. The Claude Design MCP is not used.

## What this phase deliberately does NOT do

Keep these out — they belong to later phases, and pulling them in blurs the review boundary:

- No pages, forms, banners, or routes (Phases 3–5).
- No page-level **mutation** hooks — the `login`/`register`/`verify`/`resend` submit hooks
  (`useMutation` wrappers) land with their pages in Phases 3–5. The one exception is the **`/me`
  query** (`useMe`), which is included here because CLAUDE.md assigns the auth profile to the React
  Query cache, so profile ownership must be defined in the data layer, not bolted on per-page.
- **No React in the core** (`client.ts` / `api.ts` / `session.ts` / `storage.ts`) — those stay
  framework-agnostic and unit-testable. `queries.ts` is the single, deliberately thin file that
  imports React Query.
- No app-bootstrap-on-load, no `ProtectedRoute`/`PublicRoute` guards, no navigation/redirect calls
  (Phase 6). The store exposes state and a `clearSession()`; **guards react to that state later** —
  Phase 2 code never touches the router.
- No logout button UI (Phase 6) — but the `logout()` action itself is built here.

---

## Files to create

```
src/
  lib/
    api/
      client.ts        # low-level fetch wrapper + ApiError (auth-agnostic)
      index.ts         # barrel re-export (request, ApiError, types)
  features/
    auth/
      schemas.ts       # Zod response schemas + inferred types + request types
      api.ts           # 7 pure endpoint functions (session-agnostic)
      storage.ts       # localStorage token persistence helpers
      session.ts       # Zustand store: TOKENS ONLY + refresh/timer orchestration (no React); also defines authKeys
      queries.ts       # React Query ownership of the /me profile: re-exports authKeys + useMe
      index.ts         # barrel re-export (useSession, useMe, auth actions, types)
```

Design rule enforced by this layering: **imports flow one way**,
`queries.ts → session.ts → api.ts → client.ts`. `client.ts` and `api.ts` know nothing about the
store; `session.ts` knows nothing about React. So the core stays trivially testable and there is no
import cycle. All refresh/token orchestration lives in `session.ts`; the `/me` profile is owned by
React Query in `queries.ts` (per CLAUDE.md's server-state assignment — see §5).

> **Implementation note — `authKeys` lives in `session.ts`, not `queries.ts`.** An earlier draft of
> this plan placed `authKeys` in `queries.ts` while also having `session.ts`'s `logout()` evict the
> profile cache via `queryClient.removeQueries({ queryKey: authKeys.me })`. That would force
> `session.ts` to import `queries.ts` — inverting the one-way flow above (`queries.ts → session.ts`)
> and re-introducing the exact cycle the layering exists to prevent. Resolution: **define `authKeys`
> in `session.ts`** (it's a plain constant array, no React) and **re-export it from `queries.ts`** as
> the public surface. The dependency arrow stays correct (`queries.ts → session.ts`), `logout()` can
> evict the cache without importing React-Query code, and callers still import `authKeys` from
> `queries.ts`/the barrel exactly as before. The §5/§5b snippets below are annotated accordingly.

---

## 1. `src/lib/api/client.ts` — low-level fetch wrapper

Auth-agnostic HTTP primitive. Knows about JSON, the standard error envelope, and Zod validation —
nothing about tokens beyond attaching a bearer string if one is handed to it.

### `ApiError`

```ts
export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(message: string, status: number, path: string);
}
```

Thrown for every non-2xx response. `message` comes straight from the backend envelope
(`{ message, status, path }`) which the contract guarantees is user-safe. Callers branch on
`error.status` (e.g. login's 401 vs 403) and can show `error.message` directly.

### `request<T>()`

```ts
interface RequestOptions<T> {
  method?: 'GET' | 'POST';        // default 'GET'
  body?: unknown;                 // JSON-serialized if present
  token?: string | null;         // → Authorization: Bearer <token> when truthy
  schema?: z.ZodType<T>;         // response validation; omit for empty-body responses
  signal?: AbortSignal;
}

export async function request<T>(path: string, options?: RequestOptions<T>): Promise<T>;
```

Behavior, in order:

1. **URL**: `` `${config.apiBaseUrl}${path}` ``. Call sites pass full paths including the `/api`
   prefix (e.g. `/api/auth/login`). In dev `apiBaseUrl` is `''` → same-origin → the Vite proxy
   forwards `/api`; in prod it's the absolute base. (Import `config` from `@/config/env` — never read
   `import.meta.env` here.)
2. **Headers**: `Accept: application/json`; add `Content-Type: application/json` only when a `body`
   is present; add `Authorization: Bearer <token>` only when `token` is truthy.
3. **Send**: `fetch` with `method`, JSON-stringified `body`, `signal`.
4. **Parse body defensively**. Read text first, then `JSON.parse` in a try/catch. Handle three
   empty-body cases the contract calls out explicitly:
   - `204 No Content` (logout) → resolve `undefined` (no schema expected).
   - **Empty-body `403`** from Spring Security on `/me` when the bearer is missing/expired — the doc
     says auth failures below MVC do **not** carry the JSON envelope. Synthesize an
     `ApiError('Unauthorized', 403, path)` so the store's refresh-on-401/403 path still triggers
     instead of a JSON-parse crash. (See §5 note: treat 401 **and** this empty 403 as "token
     rejected".)
   - Any other body that fails to parse as JSON on a non-2xx → `ApiError` with a generic message.
5. **Non-2xx** → build `ApiError`. Prefer `body.message`/`body.status`/`body.path` from the envelope;
   fall back to the HTTP status text and the request `path` when the envelope is absent.
6. **2xx with `schema`** → `schema.parse(json)` and return the typed result. A schema mismatch throws
   (surfaces a backend/contract drift early — do not silently swallow).
7. **2xx without `schema`** → return `undefined as T` (empty-body success like logout).

`index.ts` re-exports `request`, `ApiError`.

---

## 2. `src/features/auth/schemas.ts` — Zod schemas & types

One Zod schema per response shape (the source of both the runtime validator and the TS type), plus
plain TS types for request bodies. Mirror the contract exactly.

```ts
// ── Requests (plain types; simple enough not to need runtime validation here) ──
export interface RegisterRequest { firstName: string; lastName: string; email: string; password: string; }
export interface LoginRequest    { email: string; password: string; }
export interface VerifyEmailRequest { token: string; }
export interface ResendRequest   { email: string; }
export interface RefreshRequest  { refreshToken: string; }

// ── Responses (Zod = validator + inferred type) ──
export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),           // seconds
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const registerResponseSchema = z.object({
  status: z.string(),              // currently always "VERIFICATION_REQUIRED"; string, not enum, per doc
  email: z.string(),
});

export const verifyEmailResponseSchema = z.object({
  // discriminated result; unknown/missing value defensively treated as "invalid"
  status: z.enum(['success', 'expired', 'invalid']).catch('invalid'),
});
export type VerifyEmailStatus = z.infer<typeof verifyEmailResponseSchema>['status'];

export const resendResponseSchema = z.object({ message: z.string() });

export const userProfileSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  role: z.enum(['USER', 'ADMIN']),
  accessState: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'ADMIN']),
  accessExpiresAt: z.string().nullable(),   // ISO-8601 instant, null for ADMIN
});
export type UserProfile = z.infer<typeof userProfileSchema>;
export type AccessState = UserProfile['accessState'];
```

Notes:
- `verifyEmailResponseSchema` uses `.catch('invalid')` so an unexpected status never throws — the
  verify page (Phase 4) treats anything non-`success`/`expired` as invalid anyway.
- Do **not** over-constrain strings (no `.email()`/`.uuid()`); these are server-authored values, and
  a stricter client schema would only manufacture false contract-drift failures.

---

## 3. `src/features/auth/api.ts` — the seven endpoint functions

Pure functions over `request` + the schemas. **No store access.** Public endpoints pass no token;
the two protected ones accept a token argument (the store supplies it — see §5). This keeps every
function independently callable from a scratch script.

```ts
const BASE = '/api/auth';

// Public
export const register = (body: RegisterRequest) =>
  request(`${BASE}/register`, { method: 'POST', body, schema: registerResponseSchema });

export const verifyEmail = (body: VerifyEmailRequest) =>
  request(`${BASE}/verify-email`, { method: 'POST', body, schema: verifyEmailResponseSchema });

export const resendVerification = (body: ResendRequest) =>
  request(`${BASE}/resend-verification`, { method: 'POST', body, schema: resendResponseSchema });

export const login = (body: LoginRequest) =>
  request(`${BASE}/login`, { method: 'POST', body, schema: authResponseSchema });

export const refresh = (body: RefreshRequest) =>
  request(`${BASE}/refresh`, { method: 'POST', body, schema: authResponseSchema });

// Protected (token passed in by the session layer)
export const me = (token: string) =>
  request(`${BASE}/me`, { method: 'GET', token, schema: userProfileSchema });

export const logout = (token: string) =>
  request(`${BASE}/logout`, { method: 'POST', token });   // 204, no schema
```

Per-endpoint status handling is left to callers (they branch on `ApiError.status`), but document the
mapping in comments so Phases 3–5 don't have to re-derive it:

| Function | Success | Error statuses the caller must branch on |
|---|---|---|
| `register` | 202 | 409 email taken, 400 all-fields-required |
| `verifyEmail` | 200 (always) | none — branch on `status` field, not HTTP code |
| `resendVerification` | 202 (always) | none — always generic, no enumeration |
| `login` | 200 | 401 invalid creds, 401 account disabled, 403 email not verified |
| `refresh` | 200 | 400 missing, 401 invalid/expired → hard logout |
| `me` | 200 | 401 / empty-403 → token rejected |
| `logout` | 204 | best-effort; ignore errors |

---

## 4. `src/features/auth/storage.ts` — token persistence

Thin, synchronous localStorage layer. Isolated so the store never string-keys localStorage inline
and so bootstrap (Phase 6) can read tokens synchronously before React mounts.

```ts
const KEYS = {
  accessToken:  'screener.auth.accessToken',
  refreshToken: 'screener.auth.refreshToken',
  expiresAt:    'screener.auth.expiresAt',   // epoch ms, derived from expiresIn at store time
} as const;

export interface StoredTokens { accessToken: string; refreshToken: string; expiresAt: number; }

export function loadTokens(): StoredTokens | null;   // null if any key missing/malformed
export function saveTokens(t: StoredTokens): void;
export function clearTokens(): void;                 // removes all three keys
```

Guard every `localStorage` access in try/catch (private-mode / disabled storage must not crash boot).
Decision locked by the parent plan: **both tokens in `localStorage`** (§ "Decisions locked in").

---

## 5. `src/features/auth/session.ts` — Zustand store + refresh orchestration

The stateful, orchestrating module for **tokens only**. Owns token state, the derived expiry, the
proactive-refresh timer, and the single-flight refresh logic. Imports `api.ts` and `storage.ts`.
**It does not hold the `/me` profile** — that lives in the React Query cache (see §5b). Keeping
profile out of here is the whole point of the split: nothing outside React reads the profile, so it
has no business in the outside-React store, whereas the tokens do (fetch wrapper + WS client need
them synchronously).

### Store shape

```ts
type SessionStatus = 'anonymous' | 'authenticated';

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;     // epoch ms
  // NOTE: no `profile` field — the /me profile is a React Query cache entry, not store state.

  // actions
  setSession(auth: AuthResponse): void;   // store tokens, derive expiresAt, persist, (re)schedule refresh
  clearSession(): void;                    // hard logout: cancel timer, clear tokens → status 'anonymous'
}
```

Initialize `accessToken/refreshToken/expiresAt` from `loadTokens()` at store-create time so a
page reload keeps the tokens in memory (status starts `'authenticated'` if tokens load, else
`'anonymous'`). **Fetching `/me` on reload is Phase 6** — Phase 2 only rehydrates the raw tokens.

### Module-level (not in store state)

- `let refreshTimer: ReturnType<typeof setTimeout> | null` — the proactive timer.
- `let refreshPromise: Promise<void> | null` — single-flight guard so N concurrent 401s trigger
  exactly one `/refresh`.

### Refresh lifecycle

**`setSession(auth)`**: compute `expiresAt = Date.now() + auth.expiresIn * 1000`; update store;
`saveTokens(...)`; call `scheduleRefresh()`.

**`scheduleRefresh()`**:
```
clearTimeout(refreshTimer);
const delay = Math.max(0, expiresAt - Date.now() - 60_000);   // expiresIn - 60s, per doc
refreshTimer = setTimeout(() => { refreshTokens().catch(() => {}); }, delay);
```
`refreshTokens()` already hard-logs-out on failure, so the timer's catch is a no-op.

**`refreshTokens()` (single-flight)**:
```
if (refreshPromise) return refreshPromise;
refreshPromise = (async () => {
  const rt = get().refreshToken;
  if (!rt) { hardLogout(); throw new ApiError('No refresh token', 401, '/api/auth/refresh'); }
  try {
    const auth = await api.refresh({ refreshToken: rt });   // rotation: old refresh token now dead
    get().setSession(auth);                                  // ALWAYS store the new refreshToken
  } catch (e) {
    hardLogout();                                            // any 401 from /refresh = unrecoverable
    throw e;
  } finally {
    refreshPromise = null;
  }
})();
return refreshPromise;
```

**`clearSession()` / `hardLogout()`**: `clearTimeout(refreshTimer)`; `refreshPromise = null`;
`clearTokens()`; reset store to anonymous/null. **No navigation here** — Phase 6 guards observe
`status === 'anonymous'` and redirect. (Documenting this boundary is important: the store must not
import the router.)

### Authenticated-call helper (reactive refresh-on-401)

For the two protected endpoints, wrap the token-taking api fns so a 401/empty-403 triggers one
refresh + retry. Proactive refresh should make this rare, but the doc wants it as a backstop.

```ts
async function withAuth<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = get().accessToken;
  if (!token) { hardLogout(); throw new ApiError('Not authenticated', 401, ''); }
  try {
    return await fn(token);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      await refreshTokens();               // single-flight; throws → propagate (already hard-logged-out)
      return await fn(get().accessToken!); // retry once with the fresh token
    }
    throw e;
  }
}
```

> Note the 403 inclusion: only `/me` and `/logout` go through `withAuth`, and for those a 403 means
> the empty-body Spring-Security rejection (expired/missing bearer), **not** the login-flow "email not
> verified" 403 (login never goes through `withAuth`). So treating 401/403 identically here is safe.

### Public actions exported (from `session.ts`)

```ts
// authKeys is defined HERE (not queries.ts) so logout() can evict the /me cache without
// session.ts importing queries.ts — see the layering note at the top of this doc.
export const authKeys = { all: ['auth'] as const, me: ['auth', 'me'] as const };

export const useSession = create<SessionState>(...);      // the Zustand hook/store (tokens only)

// thin orchestration wrappers over api.ts:
export async function loginAndStore(body: LoginRequest): Promise<void>;  // api.login → setSession (does NOT fetch /me; that's the page/bootstrap's call)
export async function fetchMe(): Promise<UserProfile>;                   // withAuth(api.me) — the queryFn React Query calls (see §5b)
export async function logout(): Promise<void>;                          // withAuth(api.logout) best-effort, then clearSession() + drop the /me cache
export { refreshTokens };                                               // exported for Phase 6 bootstrap use
```

- `loginAndStore` only stores tokens; whether to immediately warm the `/me` query is a page decision
  (Phase 5) — keep this function single-purpose.
- `fetchMe` is a plain async function (no React) so it doubles as the React Query `queryFn` **and**
  as something the Phase 6 bootstrap can `await` directly. It does not write to any store.
- `logout` swallows any error from the network call and **always** `clearSession()` (idempotent
  discard, per doc §3.6), then clears the profile from the React Query cache
  (`queryClient.removeQueries({ queryKey: authKeys.me })` — importing the singleton `queryClient`
  from `@/lib/queryClient`; it's a plain object, no React, and `authKeys` is defined locally in this
  file — see the layering note at the top). This is the one spot that touches both stores, and it's
  deliberately the single place that clears both on logout/hard-logout.

`index.ts` re-exports `useSession`, `loginAndStore`, `fetchMe`, `logout`, `useMe`, and the shared
types.

## 5b. `src/features/auth/queries.ts` — React Query ownership of `/me`

Per CLAUDE.md's data-flow table (**REST / server state incl. auth profile → TanStack Query cache**),
the hydrated profile is a React Query entry, **not** Zustand state. This is the only Phase 2 file
that imports React Query.

`authKeys` is **not** defined here — it lives in `session.ts` (so `logout()` can evict this cache
without a dependency cycle; see the layering note at the top of this doc) and is re-exported from
this file as the public surface.

```ts
export { authKeys } from './session';   // re-export; defined in session.ts, not here

export function useMe() {
  const status = useSession((s) => s.status);
  return useQuery({
    queryKey: authKeys.me,
    queryFn: fetchMe,                 // from session.ts; handles refresh-on-401 internally via withAuth
    enabled: status === 'authenticated',   // don't fire /me when there's no token
    staleTime: 60_000,
  });
}
```

- `enabled` gates the query on the token store's `status`, so `useMe()` stays idle until tokens
  exist (login success or reload-with-tokens) and automatically re-runs when they appear.
- Because `fetchMe` → `withAuth` handles the refresh-and-retry, React Query only ever sees a clean
  success or a genuine hard failure (refresh already exhausted → session cleared) — it does not need
  its own retry/refresh logic for auth.
- Invalidation is the payment-polling hook later: `queryClient.invalidateQueries({ queryKey:
  authKeys.me })` after a payment redirect refetches `accessState` (Phase: monetization) — the exact
  capability that freezing profile into Zustand would have thrown away.

---

## 6. Cross-cutting decisions (called out so review is quick)

- **React confined to `queries.ts`.** The core (`client.ts`/`api.ts`/`session.ts`/`storage.ts`)
  imports no `react`/`react-dom`/`@tanstack/react-query`; only `queries.ts` does. Verifiable with a
  grep. (Zustand's `create` gives a hook but is not React.)
- **Profile is React Query state, not Zustand.** The Zustand store holds tokens only; the `/me`
  profile lives at `authKeys.me` in the shared `queryClient`. Single source of truth for server
  state, per CLAUDE.md's data-flow table.
- **`config` is the only env source.** `client.ts` imports `config` from `@/config/env`; no file added
  in this phase reads `import.meta.env`.
- **Error surface is uniform.** Everything that fails throws `ApiError` (or a Zod error on contract
  drift). Pages branch on `err.status`; no function returns an ad-hoc `{ ok: false }`.
- **React Query usage in Phase 2 is just the `me` query + its key.** The existing `queryClient` config
  stays as-is; Phase 3–5 add the `useMutation` submit hooks alongside their pages.
- **Timers cleared on logout** to avoid a dangling `setTimeout` firing `/refresh` after sign-out.

---

## 7. How to review / verify this phase

1. `npm run typecheck` — must pass clean (the primary gate; there's no UI to look at).
2. `npm run build` — ensures the new modules bundle without dead-import/cycle issues.
3. **Import-boundary sanity**: grep that `client.ts`/`api.ts` don't import from `session.ts`, that
   `session.ts` doesn't import from `queries.ts`, and that no **core** file
   (`client`/`api`/`session`/`storage`) imports `react` or `@tanstack/react-query` — only
   `queries.ts` may. (Confirms the acyclic layering and the profile-in-React-Query split.)
4. **Optional live smoke test** against a running backend (`VITE_DEV_PROXY_TARGET` pointed at it),
   via a throwaway scratch script or the browser console on the running dev server:
   - `register` a new email → expect `202 { status, email }`.
   - `login` with a real verified account → tokens stored; check `localStorage` has all three keys
     and `useSession.getState().status === 'authenticated'`.
   - `fetchMe()` → resolves the profile with `accessState` present (and, once wired, `useMe()`
     populates the `['auth','me']` React Query cache entry — not the Zustand store).
   - Manually corrupt/expire the stored `accessToken`, call `fetchMe()` again → observe one
     `/refresh` fired and the call retried (reactive path).
   - `login` with wrong password → `ApiError` with `status 401`, message `Invalid credentials`.
   - `logout()` → localStorage keys gone, `status === 'anonymous'`.
   This scratch harness is throwaway — it is **not** committed; it only de-risks Phase 2 before the
   Phase 5 login page exercises the same paths for real.

---

## Commit

Single commit, message along the lines of:
`Add auth API client & session store (Phase 2)`. No design assets, no routes, no page components —
pure `src/lib/api` + `src/features/auth` infra.
