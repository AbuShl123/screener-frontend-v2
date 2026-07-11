# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A real-time trading terminal frontend for a crypto market screener. It displays live order book
data pushed from a Java/Spring backend over WebSocket, lets users configure how that data is
classified, and handles subscription access/payments. React 19 + TypeScript SPA built with Vite —
no SSR meta-framework.

**Current state:** auth (register → verify-email → login → session bootstrap → route guards →
logout), the live order book dashboard (WS feed → Zustand store → cards + sort menu + notifications
panel + cooldown-deduped alerts), classification rules CRUD, client-side notification preferences
(minimum tier + muted tickers), the public landing page, and the full payment/monetization flow
(plan catalog → checkout redirect → polling-based payment status → account page + billing history)
are all built. Not yet started: charts. An i18n (English/Russian) rollout is designed but not
implemented — see [`.claude/plans/i18n-localization.md`](.claude/plans/i18n-localization.md).

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

The design that avoids this, as actually implemented:

```
WebSocket (feedClient.ts, module-level singleton)
    │  coalesces messages into a buffer, flushes once per animation frame
    │  (a hidden-tab fallback timer covers throttled rAF)
    ▼
useOrderbookStore (Zustand, OUTSIDE React) ──► React UI subscribes selectively
    │  applyMessages() diffs each ADD/UPDATE       (only on-screen data re-renders;
    │  against the PRE-overwrite book and           `DashboardPage` subscribes only to
    │  returns raised notifications                 `keys`, each card only to its own
    ▼                                                `books[key]` slice)
cooldown.ts (dedup by symbol:market:side:price:tier, 5 min window)
    ▼
useNotificationStore (Zustand, OUTSIDE React) ──► NotificationPanel / NotificationHandle
```

- Live order book state lives in `useOrderbookStore` (`src/stores/orderbookStore.ts`); the feed
  client (`src/lib/ws/feedClient.ts`) is the **only** writer. It's framework-agnostic — no React
  imports, same pattern as `session.ts` — and driven by a single `useOrderbookFeed()` effect hook
  called once from `DashboardPage`.
- A changed book gets a fresh object identity; untouched books keep theirs, and `keys` (the sorted
  ticker list) only gets a new array identity when the *set* of tickers changes — never on a
  routine level update. This is what makes fine-grained selector subscriptions actually pay off.
- The socket payload is **not** run through Zod (unlike REST) — see the comment in
  `src/features/orderbook/types.ts` for why: it's a high-frequency, server-generated, perf-critical
  path, and a cheap structural guard in `feedClient.ts` (switch on `type`, `[]`-fallback arrays) is
  the deliberate tradeoff instead.
- Notifications are a downstream consumer of the same batch, not a separate subscription: each
  flush's `applyMessages()` return value (raised notifications) is deduped by `cooldown.ts` (top-5
  churn would otherwise re-announce a resting order every time it re-enters/exits the window) and
  pushed into `useNotificationStore`, entirely decoupled from React rendering.
- The order book grid itself is expected to eventually bypass React's reconciliation for its
  hottest updates (virtualized DOM first, canvas if profiling demands it) — not yet needed at
  current scale.

**This principle applies only to the order book surface.** Classification rules and
billing/monetization are conventional CRUD screens — use ordinary React state and TanStack Query
there without over-engineering. Billing's plan catalog (`src/features/billing/catalog.ts`) is a
good example of the conventional-screen pattern: fallback-first rendering (hardcoded fallback
price/type/duration per plan code so the pricing section is correct and layout-stable with zero
spinner) merged with live API data once it resolves.

### Data-flow split

| Surface | State ownership | Library |
|---|---|---|
| Order book (real-time) | Store outside React, written by the WebSocket client | Zustand |
| Notifications (real-time) | Store outside React, written by the flush pipeline (not the socket directly) | Zustand |
| REST / server state (rules, billing, auth profile) | TanStack Query cache | `@tanstack/react-query` |
| Forms | Local + schema-validated | React Hook Form + Zod (Zod schemas double as the runtime validator and the TS type source) |

### Directory layout

```
src/
  config/      env.ts — the single validated config source, read by nothing else via import.meta.env
  lib/         shared infra: queryClient.ts, api/ (auth-agnostic REST client), ws/feedClient.ts (socket singleton)
  app/         app shell: routed guards + bootstrap gate (SessionGate, ProtectedRoute, PublicRoute)
  stores/      real-time state that lives OUTSIDE React — orderbookStore, notificationStore
  features/    feature modules: auth, orderbook (dashboard), billing (plans/checkout/account), settings
               (classification rules + notification prefs), landing
  components/  shared UI primitives (Button, TextField, PasswordField, Card, Banner, BrandMark, …) + layouts/
```

### App shell & routing

[`src/App.tsx`](src/App.tsx) is the route table, wrapped in [`SessionGate`](src/app/SessionGate.tsx):

- **`SessionGate`** — on a page reload with rehydrated tokens, it holds a full-screen splash while
  `GET /me` re-validates the session, then renders routes. The "bootstrapping?" signal is React
  Query's `useMe` loading state (`status === 'authenticated' && me.isLoading`), *not* a third Zustand
  status — the token store stays tokens-only.
- **`ProtectedRoute`** — redirects anonymous visitors to `/login`. Gating is **token-presence only**,
  it does NOT read `accessState` — wraps `/dashboard`, `/account`, `/account/billing-history`, and
  every `/billing/*` route, but none of them individually re-check subscription access beyond that
  (see the Monetization note on advisory-only gating below).
- **`PublicRoute`** — bounces an already-authenticated user off `/login` and `/register`.
- `/` (the landing page) and `/verify-email` / `/register/check-inbox` are unguarded in any auth
  state — the landing page self-adapts to auth state instead of redirecting (see
  `useLandingNav` in the landing feature), and a logged-in user may still click a verification link.

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
  calls with refresh-on-401/403-then-retry-once; `feedClient.ts` reuses this same refresh-then-retry
  shape for the socket (a 1008 close code = auth failure at handshake).
- **`storage.ts`** — thin, guarded localStorage layer for tokens (both access + refresh tokens live
  in localStorage). Every access is try/catch-guarded so private-mode storage can't crash boot.
- **`queries.ts`** — React Query ownership of the `/me` profile (`useMe`) + the login/register/
  resend/verify mutations. The only place the `/me` profile lives.
- **`schemas.ts`** vs **`validation.ts`** — two separate Zod concerns kept untangled: `schemas.ts`
  validates **server responses** (source of both validator and TS type); `validation.ts` holds the
  **form-input** schemas (React Hook Form). Note `authKeys` is defined in `session.ts` (so `logout()`
  can evict the `/me` cache without a `session → queries` cycle) and re-exported from `queries.ts`.

Import auth surface from the barrel [`@/features/auth`](src/features/auth/index.ts). The orderbook,
billing, and landing features follow the same barrel-export convention (`index.ts` re-exports the
public surface; nothing outside the feature reaches into its internals).

### Order book feature module (`src/features/orderbook/`)

- **`types.ts`** — the wire data model (`OrderBook`, `Level`, `FeedMessage`, `Notification`) as
  plain TS types, deliberately not Zod-validated (see above). `bookKey(symbol, market)` is the
  single canonical way to key a book — always use it rather than hand-rolling the string.
- **`useOrderbookFeed.ts`** — the effect hook that starts/stops the module-level feed singleton for
  the component's lifetime; `startFeed`/`stopFeed` are idempotent so React StrictMode's
  mount→unmount→mount is safe.
- **`notifications/selectNotifications.ts`** — pure diff function: given a book's previous state and
  an incoming ADD/UPDATE, decides which levels are notification-worthy (tier 0 never notifies; a new
  price or a tier change does).
- **`notifications/cooldown.ts`** — module-level (outside Zustand) dedup map keyed by
  `symbol:market:side:price:tier`, 5-minute window, so top-5-window churn doesn't spam repeat
  alerts for the same resting order.
- **`tiers.ts`** — the tier→color scale shared by order book bars and notification stripes; these
  are data-viz values for this surface, not design-system theme tokens.
- Components (`DashboardHeader`, `OrderbookCard`, `NotificationPanel`, `NotificationHandle`,
  `NotificationCard`) are conventional React reading from the stores via selectors — see
  `DashboardPage.tsx` for how the page composes them.

### Billing feature module (`src/features/billing/`)

Public plan catalog (`GET /api/billing-catalog/plans`, no JWT) consumed by both the landing page's
pricing section and the in-app paywall — `catalog.ts` deliberately lives in `billing`, not
`landing`, for that reuse. Fallback-first rendering there (hardcoded price/type/duration per plan
code merged with live data) is the reference pattern for conventional-screen work; reuse it rather
than adding spinners for data that has a sane default.

The full purchase flow is built: `ChoosePlanPage` (plan catalog + pay-as-you-go amount entry) →
`PayByDaysPage` / `PaymentMethodPage` → `POST /api/billing/orders` → redirect to the provider's
(Multicard) hosted `checkoutUrl` → `PaymentStatusPage` (the `return_url` target). The critical
mental model, straight from the backend contract: **the browser's return from checkout proves
nothing** — the backend only grants access via a server-to-server callback (or a reconciliation
sweep), so `PaymentStatusPage`/`usePaymentStatus.ts` resolve the outcome purely by polling
`GET /api/billing/orders/current` until it lands on a terminal status, never by trusting the
redirect. `CheckoutStubPage` (`/billing/checkout`) predates the real flow and is now stale — it makes no
network calls and its own comment calls it a placeholder — but it's still routed; don't treat it as
part of the current purchase flow.

`AccountPage` + `BillingHistoryPage` (orders + entitlement-ledger tabs) share `AccountLayout`, a
sidebar shell separate from the dashboard chrome. `historyView.ts` holds the code→label/color maps
(`STATUS`, `REASON`, `SOURCE`) for rendering backend enums — the same "map server codes to display
metadata in a small colocated module" pattern used by `catalog.ts`; extend those maps rather than
switching on the raw enum inline in JSX.

Full endpoint contract: [`.claude/docs/monetization-api.md`](.claude/docs/monetization-api.md).
Flow/UX rationale and the negative-path table (cancelled payment, lost tab, retried order, etc.):
[`.claude/docs/payment-flow-frontend.md`](.claude/docs/payment-flow-frontend.md).

### Settings feature module (`src/features/settings/`)

Two independent concerns share this module, both surfaced through `SettingsModal` (opened from the
dashboard header, not a routed page):

- **Classification rules** (`ClassificationRules.tsx`, `RuleEditor.tsx`, `CustomRulesList.tsx`,
  `rulesValidation.ts`) — per-`(symbol, market)` CRUD over the tier thresholds that decide which
  order book levels get highlighted. Server-backed via `api.ts` (`GET /api/rules/default`,
  `GET/PUT/DELETE /api/rules`), read/written through `queries.ts` (TanStack Query) — a conventional
  CRUD screen, not the real-time pattern. `rulesValidation.ts` mirrors the backend's per-tier checks
  client-side so bad input gets instant feedback instead of a round-tripped `400`. Requires an
  active subscription (a JSON-body 403 gate, distinct from the empty-body auth 403 — see
  `UpgradeNote.tsx`). Domain model and thresholds:
  [`.claude/docs/classification-rule-api.md`](.claude/docs/classification-rule-api.md).
- **Notification preferences** (`NotificationsSettings.tsx`, `MinimumTierControl.tsx`,
  `MutedTickers.tsx`, `notificationSettingsStore.ts`) — minimum tier + muted book keys. **Client-side
  only** (persisted to localStorage via `storage.ts`, no backend endpoint). The store is
  framework-agnostic (plain Zustand `create`, no React coupling) and hydrated at module load
  specifically so `feedClient.ts` can read it synchronously via `getState()` on the flush hot path
  to filter which notifications get raised — same outside-React shape as `session.ts` and
  `orderbookStore.ts`.

## Features (high-level landscape)

1. **Auth** — ✅ built. Register/verify/login/session/logout.
2. **Order book** — ✅ built (flagship, performance-critical). Live, continuously-updated order
   books; detects meaningful changes (new/removed significant orders) and surfaces them as
   notifications, with a sort menu and per-user mute/tier filtering (see Settings below). Spoken/TTS
   alerts are not yet implemented. Governed by the real-time architecture above. Socket protocol:
   [`.claude/docs/websocket-feed-api.md`](.claude/docs/websocket-feed-api.md).
3. **Classification rules** — ✅ built. Per-user CRUD for the tier thresholds that drive how order
   book levels are ranked/highlighted. Conventional forms-and-data work validated against backend
   rules (client-side mirror in `rulesValidation.ts`).
4. **Monetization & access** — ✅ built. Plan catalog, pay-as-you-go, hosted-checkout redirect,
   polling-based payment status resolution, account page, and billing/entitlement history. Note the
   access **gate itself is advisory-only client-side** — the backend doesn't yet enforce entitlement
   on REST/WS, per `monetization-api.md` §4.2.
5. **Charts** — future work, most likely built on TradingView Lightweight Charts. Not yet scoped.
6. **i18n (English/Russian)** — designed, not implemented. `react-i18next`, browser-language
   detection, feature-mirrored namespaces. Full inventory + rollout phasing in
   [`.claude/plans/i18n-localization.md`](.claude/plans/i18n-localization.md) before starting any
   extraction work.

## Reference docs

- [`.claude/docs/auth-api.md`](.claude/docs/auth-api.md) — full auth API contract.
- [`.claude/docs/websocket-feed-api.md`](.claude/docs/websocket-feed-api.md) — the `/ws` socket
  protocol: connection, token-as-query-param, every message type and payload shape.
- [`.claude/docs/classification-rule-api.md`](.claude/docs/classification-rule-api.md) — the tier
  model (notional × distance thresholds) and the per-user custom-rule CRUD contract.
- [`.claude/docs/monetization-api.md`](.claude/docs/monetization-api.md) — endpoint-level contract
  for plans, entitlement, and orders (enums, request/response shapes, status codes).
- [`.claude/docs/payment-flow-frontend.md`](.claude/docs/payment-flow-frontend.md) — the narrative
  UX flow built on top of that contract: page transitions, polling/timeout behavior, and the full
  negative-path table (cancelled/lost/retried payments).
- [`.claude/docs/billing-history-api.md`](.claude/docs/billing-history-api.md) — order history and
  entitlement-ledger endpoints backing `BillingHistoryPage`.
- [`.claude/docs/frontend-architecture.md`](.claude/docs/frontend-architecture.md) — the high-level
  "what and why" of the frontend direction (a proposed default, not a locked mandate).
- [`.claude/docs/landing-page.md`](.claude/docs/landing-page.md) — how the public landing page +
  billing data layer are built: module shape, routing, the plans data flow, and design-token usage.
- [`.claude/plans/`](.claude/plans/) — phase-by-phase implementation plans for each feature as it
  was built; useful for the *why* behind a design decision that isn't obvious from the code alone.
  [`.claude/plans/i18n-localization.md`](.claude/plans/i18n-localization.md) is a proposed plan, not
  a build log — nothing in it is implemented yet.

## Working conventions

- **UI work should start from a Claude Design template.** Design mockups for this project are
  pulled via the `claude-design` MCP. These templates are built
  against this project's own design system, so they already use Tailwind CSS, the same fonts, and
  frequently the same component shapes as the real app — use the `claude-design` MCP to fetch the
  relevant template before implementing a new screen or significant UI change, and treat it as the
  source of truth for layout/spacing/copy rather than improvising from scratch.
- **Never use the Playwright MCP (or any browser automation) to test the app.** The user tests
  manually. After a change, run `npm run typecheck` to confirm it compiles — that's the expected
  verification step. Don't spin up the dev server to drive the UI yourself unless explicitly asked.
- **Never commit changes without the user's explicit approval**, even if a task appears complete.
