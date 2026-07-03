# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A real-time trading terminal frontend for a crypto market screener. It displays live order book
data pushed from a Java/Spring backend over WebSocket, lets users configure how that data is
classified, and handles subscription access/payments. React 19 + TypeScript SPA built with Vite —
no SSR meta-framework.

The project is an early-stage foundation: routing, config, and the query client are wired up, but
the four features below (§ Features) are largely unbuilt. `src/App.tsx` is currently a placeholder
route.

## Commands

```bash
npm run dev         # dev server (HMR) at http://localhost:5173
npm run build        # tsc --noEmit + production build to dist/
npm run typecheck    # type-check only, no emit
npm run preview      # serve the production build locally
```

There is no lint script and no test runner configured yet.

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
  lib/         shared infra: queryClient.ts, future api/ (REST client) and ws/ (socket client)
  stores/      real-time state that lives OUTSIDE React (order book)
  features/    feature modules: auth, order book, rules, billing
  components/  shared UI primitives
```

## Features (high-level landscape)

1. **Order book** — the flagship, performance-critical feature. Live, continuously-updated order
   books; detects meaningful changes (new/removed significant orders) and surfaces them as
   notifications and optional spoken (TTS) alerts. Governed by the real-time architecture above.
2. **Classification rules** — per-user CRUD for the thresholds that drive how order book levels are
   ranked/analyzed. Conventional forms-and-data work validated against backend rules.
3. **Monetization & access** — trials, subscription plans, payments. Presents plans, redirects to a
   hosted payment flow, and reflects access state back to the user by **polling** for payment
   outcome rather than trusting the browser redirect.
4. **Charts** — future work, most likely built on TradingView Lightweight Charts. Not yet scoped.

## Backend auth API contract

Full reference: [`.claude/docs/auth-api.md`](.claude/docs/auth-api.md). Key points to hold in mind
when building the auth feature:

- Base path `/api/auth`. Every non-2xx response across the whole API (not just auth) has the shape
  `{ message, status, path }` — `message` is safe to show directly to the user. No field-level
  validation errors.
- **Registration does not log the user in.** `POST /register` → `202` with no tokens; the account
  is unverified until the user clicks a Confirm button on an SPA verify page (`/verify-email?token=`).
  That page must **not** auto-submit on mount — email link scanners pre-fetch the URL, so the token
  is only consumed by a human-initiated `POST /api/auth/verify-email` click.
- `POST /api/auth/verify-email` always returns `200` with `status: "success" | "expired" | "invalid"`
  — never a 4xx for a bad/expired token. `expired`/`invalid` carry no email (the endpoint never
  receives one), so the resend form on that page must ask the user to type it.
- `POST /api/auth/resend-verification` always returns `202` with an identical generic body
  regardless of whether the account exists/is verified/is on cooldown — deliberate anti-enumeration.
  Don't build UI that tries to distinguish these cases. Client-side cosmetic cooldown (~60s button
  disable) is fine; there's no server signal to key it off of.
- `POST /api/auth/login` returns `401 Invalid credentials` / `401 Account disabled` / **`403 Email
  not verified`**. The `403` case only fires after the password already checked out correct — it's
  the recovery path for a lost/expired verification email, so it must show its own resend button
  (using the email already typed into the login form), distinct from the two `401` messages.
- Tokens: `accessToken` is a JWT (3h default), sent as `Authorization: Bearer <token>` on REST calls
  **and** as `?token=` on the `/ws` WebSocket connection URL — same token, not the refresh token.
  `refreshToken` is opaque (only ever sent to `/api/auth/refresh`); the backend keeps one active
  refresh token per user, so each login/refresh invalidates the previous one. Schedule proactive
  refresh around `expiresIn - 60s` rather than waiting for a 401. Any `401` from `/refresh` itself
  means hard logout — clear storage, route to login.
- `GET /api/auth/me` is the bootstrap/hydration call after login or on page reload. Gate paid
  features on `accessState` (`TRIAL` / `ACTIVE` / `EXPIRED` / `ADMIN`), not on `role`.
