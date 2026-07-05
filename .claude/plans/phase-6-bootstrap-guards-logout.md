# Phase 6 — Session bootstrap, route guards, logout

Parent plan: [`auth-templates-implementation.md`](./auth-templates-implementation.md) § Phase 6.
API contract: [`.claude/docs/auth-api.md`](../docs/auth-api.md) §3.6 (logout), §3.7 (`/me`), §4.4
(refresh steady-state).
Builds directly on the Phase 2 session layer ([`phase-2-auth-api-client-session.md`](./phase-2-auth-api-client-session.md)).

**Goal**: tie the four independently-testable flows into one working session lifecycle. On reload,
validate the rehydrated tokens against `/me` behind a blocking splash before showing any authed UI;
guard routes (`ProtectedRoute` for the app, `PublicRoute` to bounce authenticated users off
`/login` and `/register`); give the user a real place to land after login (a minimal authed shell)
and a **Logout** button that exercises the Phase 2 `logout()` action. No new backend calls, no new
endpoint functions — this phase is pure integration wiring over machinery that already exists.

> **No design templates.** The parent design (`Auth Pages.dc.html`) covers only the 10 auth screens;
> there is no mockup for the authenticated app home. The home built here is an explicit **placeholder**
> in the existing dark visual language (reusing `BrandMark` + theme tokens), to be replaced by the
> real app shell (order book / rules / billing) in later feature work. The Claude Design MCP is not used.

---

## 1. Locked decisions (confirmed by the product owner before this plan)

1. **Authenticated landing — minimal authed shell at `/`.** Make `/` a `ProtectedRoute` wrapping a
   small authenticated placeholder: a header bar (`BrandMark` + **Logout**) and the hydrated `/me`
   profile (name, email, role, `accessState`, trial-expiry line). Anonymous visitors to `/` →
   redirect to `/login`. This makes guards + logout + `/me` hydration all exercisable end-to-end now.
2. **Bootstrap UX — blocking splash until `/me`.** On reload with stored tokens, show a full-screen
   loader while `/me` validates (the existing reactive refresh handles an expired access token
   transparently — see §3.2). Render the app only after `/me` resolves; on a hard auth failure the
   session self-clears to anonymous and the guard lands the user on `/login`. No flash of authed UI
   for a stale/invalid session.
3. **`PublicRoute` scope — `/login` and `/register` only.** Redirect an already-authenticated user
   away from those two. Leave `/verify-email` and `/register/check-inbox` reachable in **any** auth
   state (a logged-in user might still click a verification link, or land on check-inbox).
4. **Gating — authentication only; defer `accessState`.** Guards gate purely on logged-in-vs-not.
   The `/me` `accessState` is **displayed** on the home placeholder but **not enforced** — no
   paywalls, no EXPIRED-state routing. Entitlement gating (`TRIAL`/`ACTIVE`/`EXPIRED`/`ADMIN`,
   "trial ends in N days" enforcement) is deferred to the monetization phase, per CLAUDE.md's
   "gate paid features on `accessState`" once paid features exist.
5. **New `src/app/` directory — DECIDED (confirmed).** The Phase 6 files (`SessionGate`,
   `ProtectedRoute`, `PublicRoute`, `HomePage`) are the app's **composition root / shell** — the
   layer that wires features together and enforces app-wide policy (routing + auth guards), analogous
   to a backend's `main()`/`Application` entry point plus its `SecurityConfig`/filter chain. They are
   **not** owned by the auth feature (guards will protect future order-book/rules/billing routes too;
   `HomePage` will host those features), so they do not belong under `features/auth/`; they are not
   dumb reusable widgets (→ not `components/`) and not non-React infra (→ not `lib/`). A dedicated
   top-level `src/app/` shell folder is a standard React convention and the confirmed home for them.
   This is settled — implement it directly; no need to re-raise placement.

---

## 2. What already exists (so this phase adds almost no logic to the core)

The Phase 2 session layer already provides everything the lifecycle needs — this phase only *wires*
it into the router. Concretely, from [`src/features/auth/session.ts`](../../src/features/auth/session.ts):

- **Token rehydration on load** — `useSession` initializes `status: 'authenticated'` synchronously
  from `loadTokens()`, and arms the proactive-refresh timer (`if (initialTokens) scheduleRefresh()`).
- **Reactive refresh-on-401/403** — `withAuth` (used by `fetchMe`) refreshes once and retries on a
  rejected bearer, and `hardLogout()`s on refresh failure (→ `status: 'anonymous'`).
- **`fetchMe()`** — the plain-async `/me` call the React Query `queryFn` (`useMe`) already uses; it
  doubles as the bootstrap validator.
- **`logout()`** — best-effort `POST /logout`, then **always** `clearSession()` + evicts the `/me`
  React Query cache (`queryClient.removeQueries({ queryKey: authKeys.me })`). Idempotent, per doc §3.6.
- **`useMe()`** ([`queries.ts`](../../src/features/auth/queries.ts)) — `enabled: status === 'authenticated'`,
  `staleTime: 60_000`. Since the React Query cache is **not** persisted, a reload always refetches →
  `/me` genuinely re-validates the token every reload.

**Consequence: `session.ts`, `queries.ts`, `api.ts`, `schemas.ts`, `storage.ts` need NO changes in
Phase 6.** All new code is a thin router/UI layer above them.

### 2.1 Deliberately NOT adding a `'bootstrapping'` status to the store

The store stays **tokens-only** (Phase 2's core invariant). The "is bootstrap in flight?" signal is
**React Query's `useMe` loading state**, not a third Zustand status. Reasons:

- `useMe` already models exactly this: `enabled` gates it on token presence, and its
  `isLoading`/`isError`/`data` cover the whole bootstrap outcome space.
- Adding a `'bootstrapping'` status would duplicate that state in two places and force the store to
  know about the `/me` fetch — re-coupling the outside-React token store to the profile it was
  deliberately kept ignorant of. Keep the split.

So the gate reads **`status` (Zustand)** for *authenticated-vs-not* and **`useMe()` (React Query)**
for *is-the-profile-still-validating* — each store owns the piece it already owns.

---

## 3. Design

### 3.1 New files & the one modified file

```
src/
  app/                       # NEW dir: app-shell / routing-session integration (not part of a feature)
    SessionGate.tsx          # NEW — blocking bootstrap splash while /me validates on reload
    ProtectedRoute.tsx       # NEW — redirect to /login when anonymous
    PublicRoute.tsx          # NEW — redirect to / when authenticated (login/register only)
    HomePage.tsx             # NEW — minimal authed shell: header (BrandMark + Logout) + /me profile
  App.tsx                    # MODIFY — wrap <Routes> in <SessionGate>; apply guards; home → HomePage
```

The new `src/app/` dir is a **decided** placement (locked decision 5): it is the app's composition
root / shell — routing-session glue and the post-auth home — that sits *above* the auth feature and
will host non-auth routes later (order book, rules, billing). Putting them under `features/auth/`
would wrongly imply auth ownership; they are not dumb widgets (→ not `components/`) nor non-React
infra (→ not `lib/`). `src/app/` reads as "the shell that composes features," parallel to
`src/components/` (shared UI) and `src/lib/` (shared infra), and follows the standard React
"application shell" convention. No `features/auth/index.ts` change is needed — `HomePage` imports the
already-exported `useMe`, `logout`, `useSession` from `@/features/auth`.

### 3.2 Bootstrap flow (blocking splash) — how the pieces compose

```
page reload
  │
  ├─ useSession init (synchronous): tokens in localStorage?
  │     no  → status 'anonymous'                        → SessionGate renders routes immediately
  │     yes → status 'authenticated' + scheduleRefresh  → SessionGate must validate before rendering
  │
  └─ SessionGate (status 'authenticated'):
        useMe() fires (enabled) → fetchMe() → withAuth(api.me)
          │
          ├─ access token still valid → 200 profile ─────────────► success → render routes
          │
          ├─ access token expired → 401 → withAuth refreshes once
          │        refresh ok  → retry /me → 200 ─────────────────► success → render routes
          │        refresh 401 → hardLogout() → status 'anonymous' ► useMe disabled/errored;
          │                                                          gate stops splashing → routes
          │                                                          → ProtectedRoute → /login
          │
          └─ (splash shows for the whole in-flight window above)
```

Key point: **we do not add explicit "refresh-first-if-the-token-looks-expired" logic.** The parent
plan floated it as an option, but the existing machinery already covers it two ways:

- **Reactively** — an expired token makes `/me` return 401, and `withAuth` refreshes+retries.
- **Proactively** — on reload `scheduleRefresh()` computes `delay = max(0, expiresAt - now - 60s)`;
  for an already-expired token that's `0`, so the timer fires `refreshTokens()` immediately, in
  parallel with `useMe`. The **single-flight `refreshPromise` guard** in `session.ts` collapses the
  timer's refresh and `withAuth`'s refresh into one `/refresh` call — no double refresh.

Adding a bespoke pre-check would duplicate this and risk a second refresh path. Lean on what's there.

### 3.3 `SessionGate.tsx`

Wraps `<Routes>`. Shows the splash **only** while an authenticated session's `/me` is doing its first
validation; otherwise renders children.

```tsx
import type { ReactNode } from 'react';
import { useMe, useSession } from '@/features/auth';
import { BrandMark } from '@/components/BrandMark';

export function SessionGate({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const me = useMe();

  // Only block while a token-bearing session is still validating /me for the first time.
  // - anonymous            → status !== 'authenticated' → false (render routes; guards handle it)
  // - /me resolved (200)   → isLoading false            → false (render routes)
  // - hard auth failure    → withAuth hardLogout flips status to 'anonymous' → false
  // - non-auth error (5xx / network down) → isLoading false → false (render; HomePage shows a
  //   retry fallback — we do NOT log the user out on a transient error; tokens are still valid)
  const bootstrapping = status === 'authenticated' && me.isLoading;

  if (bootstrapping) return <BootSplash />;
  return <>{children}</>;
}

function BootSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface">
      <BrandMark />
      <p className="text-[13px] text-text-secondary">Restoring your session…</p>
    </div>
  );
}
```

- `me.isLoading` (React Query v5) is `true` only during the first fetch with no data; it is `false`
  when the query is disabled-and-empty (anonymous), succeeded, or errored — so every terminal state
  correctly stops the splash.
- The splash is a tiny inline component (centered `BrandMark` + a muted line) in the existing dark
  theme — **no new spinner primitive** (none exists, and one full-screen loader doesn't justify one).
  A Phase 7 polish pass can add motion/`aria-busy` if desired.

### 3.4 `ProtectedRoute.tsx` & `PublicRoute.tsx`

Plain wrapper components (children-prop pattern, matching the existing per-route `element` style in
`App.tsx` — no `<Outlet>` restructuring needed). They evaluate **only after** `SessionGate` has let
routes render, so `status` is already final (never mid-bootstrap here).

```tsx
// ProtectedRoute.tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/features/auth';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

```tsx
// PublicRoute.tsx — bounce an authenticated user off /login and /register
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/features/auth';

export function PublicRoute({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- **No redirect loop.** `/login` guarded by `PublicRoute` → authenticated user sent to `/` →
  `ProtectedRoute` sees authenticated → renders `HomePage`. Anonymous at `/` → `ProtectedRoute` →
  `/login` → `PublicRoute` sees anonymous → renders `LoginPage`. Each direction terminates.
- **`replace`** on both so guard redirects don't pollute history.
- Gating is token-presence only (locked decision 4) — `ProtectedRoute` does not read `accessState`.

### 3.5 `HomePage.tsx` — the minimal authed shell (placeholder)

Replaces the current inline `Placeholder` in `App.tsx`. A header bar (`BrandMark` left, **Logout**
right) over a centered profile block sourced from `useMe()`.

```tsx
import { useNavigate } from 'react-router-dom';
import { useMe, logout } from '@/features/auth';
import { BrandMark } from '@/components/BrandMark';
import { useState } from 'react';

export function HomePage() {
  const me = useMe();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    await logout();                       // best-effort POST /logout; ALWAYS clears session + /me cache
    // clearSession() flips status → 'anonymous'; ProtectedRoute would redirect on the next render,
    // but navigate explicitly for an immediate, deterministic bounce.
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface text-text">
      <header className="flex items-center justify-between border-b border-border-subtle px-10 py-[22px]">
        <BrandMark />
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          className="rounded-[7px] border border-border px-4 py-[9px] text-[14px] font-medium
                     text-text-secondary transition-colors hover:bg-white/5
                     disabled:cursor-not-allowed disabled:opacity-50
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {loggingOut ? 'Signing out…' : 'Log out'}
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-8">
        {me.isSuccess && me.data ? (
          <div className="flex w-[420px] flex-col gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight">
              Welcome back, {me.data.firstName}.
            </h1>
            <p className="text-[14px] text-text-secondary">{me.data.email}</p>
            <p className="text-[13px] text-text-secondary">
              Access: <span className="text-text">{me.data.accessState}</span>
              {me.data.accessExpiresAt && ` · expires ${new Date(me.data.accessExpiresAt).toLocaleDateString()}`}
            </p>
            <p className="text-[13px] text-text-secondary">Foundation is up. No features yet.</p>
          </div>
        ) : (
          // Defensive: a transient /me failure (5xx/network) leaves the user authenticated but
          // profile-less; offer a retry rather than a blank screen or a wrongful logout.
          <div className="flex flex-col items-center gap-3">
            <p className="text-[14px] text-text-secondary">Couldn’t load your profile.</p>
            <button type="button" onClick={() => me.refetch()}
              className="text-[14px] font-medium text-accent">Retry</button>
          </div>
        )}
      </main>
    </div>
  );
}
```

- **Logout timing** — `logout()` runs the network call best-effort and `clearSession()` in its
  `finally`, so the session is always cleared. The explicit `navigate('/login')` gives an immediate
  bounce; even without it the `ProtectedRoute` would redirect once `status` flips (both are correct —
  the navigate is the deterministic, no-flicker path). The `Signing out…` disabled state prevents a
  double-click.
- **`accessState` is shown, not enforced** (locked decision 4).
- **Displayed profile is the same cached `/me`** the `SessionGate` just validated — no second fetch
  on a normal navigation (shared React Query key, within `staleTime`).

### 3.6 `App.tsx` (modify)

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { CheckInboxPage, LoginPage, RegisterPage, VerifyEmailPage } from '@/features/auth';
import { SessionGate } from '@/app/SessionGate';
import { ProtectedRoute } from '@/app/ProtectedRoute';
import { PublicRoute } from '@/app/PublicRoute';
import { HomePage } from '@/app/HomePage';

export default function App() {
  return (
    <SessionGate>
      <Routes>
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        {/* Unguarded in any auth state (locked decision 3): a logged-in user may still click a
            verify link or land on check-inbox. */}
        <Route path="/register/check-inbox" element={<CheckInboxPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionGate>
  );
}
```

- Inline `Placeholder` is removed (superseded by `HomePage`).
- `SessionGate` wraps **all** routes so the bootstrap splash gates the whole app on reload (including
  a brief splash right after login while `/me` warms — acceptable and consistent; see §5).
- `SessionGate`/guards call `useSession`/`useMe` and must sit inside the providers — they do, since
  `App` already renders under `QueryClientProvider` + `BrowserRouter` (`main.tsx`, unchanged).

---

## 4. Edge cases & how they resolve

| Scenario | Behavior |
|---|---|
| Reload, no tokens | `status 'anonymous'` synchronously → no splash → `/` `ProtectedRoute` → `/login`. |
| Reload, valid token | Splash → `/me` 200 → app renders on `/`. |
| Reload, expired access token (valid refresh) | Splash → `/me` 401 → `withAuth` refresh+retry (single-flight, may share the delay-0 proactive refresh) → 200 → app. |
| Reload, expired/invalid refresh token | Splash → `/me` 401 → refresh 401 → `hardLogout()` → anonymous → splash clears → `/login`. Storage cleared. |
| Reload, backend down (network/5xx) | Splash clears (non-auth error), tokens **kept** (not an auth failure), `HomePage` shows "Couldn't load your profile — Retry". No wrongful logout. |
| Authenticated user visits `/login` or `/register` | `PublicRoute` → `/`. |
| Anonymous user visits `/` (or any unknown path → `/`) | `ProtectedRoute` → `/login`. |
| Logout | `logout()` clears session + evicts `/me` cache → `navigate('/login')`; a later login refetches `/me` fresh. |
| Login success (Phase 5 `navigate('/')`) | `status` → authenticated; `SessionGate` briefly splashes while `/me` warms, then `HomePage`. |
| Proactive refresh fires while sitting on `HomePage` | `refreshTokens()` rotates tokens silently; on failure `hardLogout()` → `ProtectedRoute` redirects to `/login` on the next render. |

---

## 5. Known minor behaviors (accepted, not bugs)

- **Brief post-login splash.** Phase 5's login navigates to `/` without prefetching `/me`, so
  `SessionGate` shows the splash for one `/me` round-trip after login. This is consistent with the
  blocking-bootstrap decision and is fine. *Optional* future nicety: warm `/me` in the login success
  path (`queryClient.prefetchQuery({ queryKey: authKeys.me, queryFn: fetchMe })`) to skip it — not
  included here to keep Phase 6 minimal and Phase 5 untouched.
- **`HomePage` is a placeholder**, not a designed screen — it exists to make the lifecycle testable
  and will be replaced by the real authenticated app shell in later feature work.
- **No `accessState` enforcement** — displayed only (locked decision 4).

---

## 6. Out of scope (later phases / not Phase 6)

- **Entitlement gating on `accessState`** (paywalls, EXPIRED routing, "trial ends in N days"
  enforcement) — monetization phase.
- **The real authenticated app shell** (order book, rules, billing, nav) — later feature work;
  `HomePage` is a throwaway placeholder.
- **Multi-tab session sync** (a `storage`-event listener so logout in one tab logs out the others) —
  not requested; a possible later hardening item.
- **`aria-live`/motion polish** on the splash and richer logout feedback — Phase 7 visual QA.
- **WebSocket auth** (`?token=` reconnect on refresh) — order-book feature, out of scope here.

---

## 7. Verification

- `npm run typecheck` and `npm run build` pass.
- `npm run dev`, against a running backend (`VITE_DEV_PROXY_TARGET`, or the proxy default
  `localhost:8080`):
  - **Reload keeps you logged in** — log in, land on `/` (`HomePage` shows your name/email/`accessState`),
    reload → brief "Restoring your session…" splash → back on `HomePage`. Confirm `/me` fires once in
    the Network tab.
  - **Silent refresh** — with a short access-token expiry (or by editing `screener.auth.expiresAt` in
    `localStorage` to a past value), reload → observe one `/refresh` then `/me` succeed, no bounce to
    login.
  - **Hard-expired session** — clear/replace the `refreshToken` in `localStorage` with a garbage
    value, reload → splash → `/refresh` 401 → redirected to `/login`, `localStorage` auth keys gone.
  - **Guards** — while logged out, visiting `/` redirects to `/login`; while logged in, visiting
    `/login` or `/register` redirects to `/`. Confirm `/verify-email?token=…` and
    `/register/check-inbox` remain reachable while logged in.
  - **Logout** — click **Log out** on `HomePage` → `POST /logout` (Network tab, best-effort), auth
    keys removed from `localStorage`, redirected to `/login`; the `['auth','me']` cache is gone
    (a subsequent login refetches the profile).
  - **Transient-failure resilience** — stop the backend, then reload while holding valid tokens →
    splash clears and `HomePage` shows the "Couldn't load your profile — Retry" fallback (you are
    NOT logged out); bring the backend back and click **Retry** → profile loads.
- Manual a11y sanity: the Logout button is focusable/labeled; tab order on `HomePage` is sane. Full
  `aria` polish is Phase 7.

---

## 8. Commit

Single commit, e.g. `Add session bootstrap, route guards & logout (Phase 6)` — the `src/app/`
shell (`SessionGate` blocking bootstrap splash, `ProtectedRoute`/`PublicRoute`, the placeholder
authed `HomePage` with Logout), and the `App.tsx` rewire that applies them. No changes to the Phase 2
session/query core, no new endpoints, no design assets.
