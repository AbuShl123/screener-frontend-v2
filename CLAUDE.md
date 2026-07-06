# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A real-time trading terminal frontend for a crypto market screener. It displays live order book
data pushed from a Java/Spring backend over WebSocket, lets users configure how that data is
classified, and handles subscription access/payments. React 19 + TypeScript SPA built with Vite —
no SSR meta-framework.

**Current state:** the auth feature is fully built (register → verify-email → login → session
bootstrap → route guards → logout), and with it the supporting infra — REST client, session store,
routed app shell, and a Tailwind design system. The three remaining features (§ Features) — order
book, classification rules, billing — are not yet started. `HomePage` is a placeholder
authenticated shell.

## Commands

```bash
npm run dev         # dev server (HMR) at http://localhost:5173
npm run build       # tsc --noEmit + production build to dist/
npm run typecheck   # type-check only, no emit
npm run preview     # serve the production build locally
```

There is no lint script and no test runner configured yet. `npm run typecheck` (or `build`) is the
only automated check — run it before considering a change done.

### Local dev proxy

The dev server proxies `/api` and `/ws` to the backend same-origin (no CORS). Target defaults to
`http://localhost:8080`; override via `VITE_DEV_PROXY_TARGET` in `.env.local` (gitignored) to point
at a different backend.

## Configuration

All runtime config flows through **one** module, [`src/config/env.ts`](src/config/env.ts), which
validates `import.meta.env` with Zod at startup and throws immediately if anything is missing or
malformed. **Nothing else should read `import.meta.env` directly** — import `config` from this
module instead. This keeps the door open to swapping build-time env for runtime config later
without touching call sites.

Every `VITE_*` variable is baked into the client bundle at build time and is therefore public —
never put real secrets in `.env*` files. Four files exist: `.env` (committed safe defaults),
`.env.production` (committed prod values), `.env.example` (template), `.env.local` (gitignored,
machine-specific).

## Path alias

`@/*` maps to `src/*` (configured in both `tsconfig.json` and `vite.config.ts` — keep them in
sync if it changes).

## Styling

Tailwind CSS **v4** (via the `@tailwindcss/vite` plugin), configured entirely in CSS — there is no
`tailwind.config.js`. The design system lives in [`src/index.css`](src/index.css) as an `@theme`
block of CSS custom properties. **Use the semantic token classes, not raw hex/Tailwind palette
colors** — e.g. `bg-surface`, `text-text-secondary`, `border-border-subtle`, `text-accent`,
`text-bid`, `text-danger`. Fonts are `font-sans` (IBM Plex Sans) and `font-mono` (IBM Plex Mono);
the order book / numeric data uses mono. It's a dark theme; there is no light mode. Styling is
Tailwind utility classes inline in JSX — no CSS modules, no styled-components.

## Architecture

### The core idea: keep the real-time firehose out of React

The backend pushes continuous order book updates over WebSocket. Funneling every message into React
component state and re-rendering the tree per-message is the standard failure mode for real-time
UIs — it drops frames once many price levels across many symbols are updating at once.

The design to avoid this:

```
WebSocket ──► plain store OUTSIDE React (Zustand)
                   │
                   ├─► notifications / text-to-speech (subscribe to diffs)
                   │
                   └─► React UI subscribes selectively
                       (only on-screen data re-renders; the hottest surface
                        updates imperatively/via canvas, not full tree diffs)
```

- Live order book state lives in a Zustand store the socket writes to directly — not in React state.
- React components read via fine-grained, selective subscriptions; a price update should only
  re-render the row(s) showing that price, never the whole book.
- The order book grid itself is expected to eventually bypass React's reconciliation for its
  hottest updates (virtualized DOM first, canvas if profiling demands it).
- Notifications and text-to-speech alerts subscribe to store diffs independently of rendering.

**This principle applies only to the order book surface.** Classification rules and
billing/monetization are conventional CRUD screens — use ordinary React state and TanStack Query
there without over-engineering.

### Data-flow split

| Surface | State ownership | Library |
|---|---|---|
| Order book (real-time) | Store outside React, written by the WebSocket client | Zustand |
| REST / server state (rules, billing, auth profile) | TanStack Query cache | `@tanstack/react-query` |
| Forms | Local + schema-validated | React Hook Form + Zod (Zod schemas double as the runtime validator and the TS type source) |

### Directory layout

```
src/
  config/      env.ts — the single validated config source, read by nothing else via import.meta.env
  lib/         shared infra: queryClient.ts, api/ (auth-agnostic REST client), future ws/ (socket client)
  app/         app shell: routed guards + bootstrap gate (SessionGate, ProtectedRoute, PublicRoute, HomePage)
  stores/      real-time state that lives OUTSIDE React (order book) — not yet populated
  features/    feature modules: auth (built), future order book, rules, billing
  components/  shared UI primitives (Button, TextField, Card, Banner, BrandMark, …) + layouts/
```

### App shell & routing

[`src/App.tsx`](src/App.tsx) is the route table, wrapped in [`SessionGate`](src/app/SessionGate.tsx):

- **`SessionGate`** — on a page reload with rehydrated tokens, it holds a full-screen splash while
  `GET /me` re-validates the session, then renders routes. The "bootstrapping?" signal is React
  Query's `useMe` loading state (`status === 'authenticated' && me.isLoading`), *not* a third Zustand
  status — the token store stays tokens-only. A transient `/me` failure does **not** log the user
  out; `HomePage` shows a retry fallback.
- **`ProtectedRoute`** — redirects anonymous visitors to `/login`. Gating is **token-presence only**,
  it does NOT read `accessState` (paid-feature gating comes later).
- **`PublicRoute`** — bounces an already-authenticated user off `/login` and `/register`.
- `/verify-email` and `/register/check-inbox` are unguarded in any auth state (a logged-in user may
  still click a verification link).

### Auth feature module (`src/features/auth/`)

The auth module has a deliberate, strictly one-way dependency flow — respect it when extending:

```
pages/ (React) ──► queries.ts (React Query) ──► session.ts (Zustand, tokens-only) ──► api.ts ──► lib/api/client.ts
                                                        └──► storage.ts (localStorage)
```

- **`lib/api/client.ts`** — the low-level `request()` HTTP primitive. Auth-agnostic: knows JSON, the
  backend's `{ message, status, path }` error envelope (thrown as `ApiError`), and Zod validation;
  attaches a bearer token only if one is handed in. Knows nothing about the store.
- **`api.ts`** — the seven auth endpoints as pure functions over `request()` + schemas. No store
  access; protected endpoints take a token argument.
- **`session.ts`** — the framework-agnostic orchestration core. Owns **TOKENS ONLY** in a Zustand
  store, plus derived expiry, the proactive-refresh timer, and single-flight refresh. Deliberately
  does NOT hold the `/me` profile (that's React Query's job) and does NOT navigate — `clearSession()`
  flips status to `'anonymous'` and the route guards react. `withAuth()` here wraps token-taking
  calls with refresh-on-401/403-then-retry-once.
- **`storage.ts`** — thin, guarded localStorage layer for tokens (both access + refresh tokens live
  in localStorage). Every access is try/catch-guarded so private-mode storage can't crash boot.
- **`queries.ts`** — React Query ownership of the `/me` profile (`useMe`) + the login/register/
  resend/verify mutations. The only place the `/me` profile lives.
- **`schemas.ts`** vs **`validation.ts`** — two separate Zod concerns kept untangled: `schemas.ts`
  validates **server responses** (source of both validator and TS type); `validation.ts` holds the
  **form-input** schemas (React Hook Form). Note `authKeys` is defined in `session.ts` (so `logout()`
  can evict the `/me` cache without a `session → queries` cycle) and re-exported from `queries.ts`.

Import auth surface from the barrel [`@/features/auth`](src/features/auth/index.ts).

## Features (high-level landscape)

1. **Auth** — ✅ built. Register/verify/login/session/logout per the contract below.
2. **Order book** — the flagship, performance-critical feature. Live, continuously-updated order
   books; detects meaningful changes (new/removed significant orders) and surfaces them as
   notifications and optional spoken (TTS) alerts. Governed by the real-time architecture above.
   Socket protocol: [`.claude/docs/websocket-feed-api.md`](.claude/docs/websocket-feed-api.md).
3. **Classification rules** — per-user CRUD for the thresholds that drive how order book levels are
   ranked/analyzed. Conventional forms-and-data work validated against backend rules.
4. **Monetization & access** — trials, subscription plans, payments. Presents plans, redirects to a
   hosted payment flow, and reflects access state back to the user by **polling** for payment
   outcome rather than trusting the browser redirect.
5. **Charts** — future work, most likely built on TradingView Lightweight Charts. Not yet scoped.

## Reference docs

- [`.claude/docs/auth-api.md`](.claude/docs/auth-api.md) — full auth API contract (summarized below).
- [`.claude/docs/websocket-feed-api.md`](.claude/docs/websocket-feed-api.md) — the `/ws` socket
  protocol: connection, token-as-query-param, every message type and payload shape.
- [`.claude/docs/frontend-architecture.md`](.claude/docs/frontend-architecture.md) — the high-level
  "what and why" of the frontend direction (a proposed default, not a locked mandate).

## Testing changes

**Do NOT use the Playwright MCP (or any browser automation) to test the app after implementing
something.** The user tests manually. After a change, run `npm run typecheck` to confirm it
compiles — that's the expected verification step. Don't spin up the dev server to drive the UI
yourself unless explicitly asked.
