# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A real-time trading terminal frontend for a crypto market screener. It displays live order book
data pushed from a Java/Spring backend over WebSocket, lets users configure how that data is
classified, and handles subscription access/payments. React 19 + TypeScript SPA built with Vite —
no SSR meta-framework.

**Current state:** auth (register → verify-email → login → session bootstrap → route guards →
logout), the live multi-exchange order book dashboard (WS feed → Zustand store → masonry of cards
merging every exchange's rows + sort menu + per-exchange filter + a two-tab notifications panel:
cooldown-deduped depth alerts and large-trade alerts), the backend-driven exchange registry (`GET /api/exchanges`),
classification rules CRUD, client-side notification preferences (minimum tier + muted tickers +
muted exchange/market venues), the public landing page, the full payment/monetization flow
(plan catalog → checkout redirect → polling-based payment status → account page + billing history),
and admin-only account screens (analytics, users) are all built, as is the English/Russian i18n
layer (`react-i18next`, `src/lib/i18n/`; currently pinned to Russian via `FORCED_LOCALE`). Not yet
started: charts.

## Multi-exchange support

The backend streams more than one exchange (Binance, MEXC and Bybit, each Spot + Futures where
enabled), and the frontend handles that end to end. **Which exchanges and markets exist is decided by
the backend at runtime** (`GET /api/exchanges`), so a new backend adapter appears without frontend
code changes. Don't reintroduce Binance-only or fixed-exchange-list assumptions.
**The plan behind it (decisions D1–D8, store shape, the masonry deviation) is
[`.claude/plans/multi-exchange-review.md`](.claude/plans/multi-exchange-review.md); read it before
touching the order book, notifications or the Settings pickers.**

The backend's revised (breaking) contracts live in [`.claude/docs/changes/`](.claude/docs/changes/).
Each file there **supersedes** the same-named doc in `.claude/docs/`, **except the WebSocket feed**:

- [`websocket-feed-api.md`](.claude/docs/websocket-feed-api.md) (the top-level one, **not**
  `changes/`, which is now a superseded copy): one `DEPTH` type in an envelope
  `{ type, exchange, market, symbol, data }`, where `data: null` removes the book.
  `SNAPSHOT.data` is an array of those same envelopes. Levels are **positional tuples**
  `[price, quantity, tier, firstSeenMillis, distance]`, tiers are **1–4 only**, a side holds
  **0–5** levels, `seq` is gone, and unknown `type`s must be ignored. `exchange` is an **open set**.
  It also carries **`TRADE`** (large-trade alerts, §3.8): events, not state — merged by `id`,
  sorted by exchange `time`, never cleared by a `SNAPSHOT` (which replays the latest 100).
- [`changes/ticker-list-api.md`](.claude/docs/changes/ticker-list-api.md): `GET /api/tickers`
  returns `{ total, byVenue, instruments: [{ id, venue, symbol }] }`. `venue` is `EXCHANGE_MARKET`
  (split on the **last** underscore); `id` is debug-only and must never be keyed on or stored.
- [`changes/classification-rule-api.md`](.claude/docs/changes/classification-rule-api.md): no API
  change. Rules stay **exchange-independent** (`(symbol, market)`), so the rule picker
  de-duplicates the ticker pool by `(symbol, market)`.
- [`changes/exchange-metadata-api.md`](.claude/docs/changes/exchange-metadata-api.md) (new
  endpoint): `GET /api/exchanges` returns `{ exchanges: [{ id, label, logoUrl, markets: [{ market,
  instrumentCount, status: { discovery } }] }] }`, enabled venues only, in display order.
  `status.discovery` (`PENDING`/`OK`/`RETAINED`) is instrument-discovery state, **not** connection
  health; it's stored but not displayed.

`symbol` is normalized `BASEQUOTE` on every exchange, in the feed, the ticker list and the rules
API alike (confirmed with the backend; the ticker doc's "native spelling" note is outdated).

Key decisions from the plan, in short:

- **Card identity stays `(symbol, market)`** and `bookKey()` keeps its `SYMBOL:MARKET` format.
  Exchanges nest inside a pair: `books[SYMBOL:MARKET].venues[EXCHANGE] = { bids, asks }`, and a
  card merges the rows of all its venues, sorted by price, with an exchange logo per row (and on
  every notification card).
- **Mutes apply across all exchanges** and keep their `SYMBOL:MARKET` localStorage format, so no
  migration is needed.
- **The exchange registry is backend-driven** (supersedes plan D4's "registry = allowlist";
  [`src/features/orderbook/exchanges.ts`](src/features/orderbook/exchanges.ts)). It's a Zustand
  store resolved from, highest first: the last valid `/api/exchanges` response
  (`exchangeMetadata.ts`), its localStorage cache, a bundled seed (Binance, MEXC, Bybit), and —
  only as a temporary fallback — exchanges first seen in the feed (`provisional`). A malformed
  payload is rejected whole and never replaces a valid registry; a valid empty list is applied.
  Its order is the tie-break for equal prices. Bundled logos (`src/assets/exchanges/*.png`) always
  win for those three; others use a relative `/api/` `logoUrl` or `ExchangeLogo`'s letter fallback.
  The feed accepts an unregistered exchange only if its id matches `^[A-Z0-9]{1,32}$` and the
  registry holds fewer than 32. Adding an exchange needs **no frontend change** (a bundled logo is
  optional polish). The Settings ticker pool is deliberately *not* filtered by it.
- **Notifications are per exchange**: the diff runs against that exchange's previous levels, and
  `Notification` plus the cooldown key carry `exchange`. The panel search matches the exchange label.
- **Masonry is reassigned only on reorder / column-count change**, never on a card's height change,
  so cards don't hop columns per tick. Re-deals are
  **stable** (US4): cards keep their column and only re-order within it; only a sort-mode change,
  a column-count increase or excessive imbalance re-deals from scratch.

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
at a different backend. Vite logs every proxied socket that closes mid-stream as an error, so
`ws proxy socket error: EPIPE` / `ECONNRESET` around a backend restart, a page reload or a closed
tab is normal teardown, not a proxy misconfiguration. Run only one dev server: a second one
silently takes port 5174, and every dashboard tab on either opens its own feed socket.

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
    │  applyMessages() diffs each live DEPTH       (each card subscribes only to its own
    │  against that exchange's PRE-overwrite        `books[key]` slice; see the DashboardPage
    │  levels and returns raised notifications      note below)
    ▼
cooldown.ts (dedup by exchange:symbol:market:side:price:tier, 5 min window)
    ▼
useNotificationStore (Zustand, OUTSIDE React) ──► NotificationPanel / NotificationHandle

  (same flush, independently) TRADE + SNAPSHOT.trades ──► useTradeStore.ingest() ──► the panel's trades tab
```

- Live order book state lives in `useOrderbookStore` (`src/stores/orderbookStore.ts`); the feed
  client (`src/lib/ws/feedClient.ts`) is the **only** writer. It's framework-agnostic — no React
  imports, same pattern as `session.ts` — and driven by a single `useOrderbookFeed()` effect hook
  called once from `DashboardPage`.
- A changed book gets a fresh object identity; untouched books keep theirs, and `keys` (the sorted
  ticker list) only gets a new array identity when the *set* of tickers changes — never on a
  routine level update. This is what makes fine-grained selector subscriptions actually pay off.
- `DashboardPage` subscribes to `keys`, to the exchange-filtered visible keys (`useShallow`, so
  only a change of the visible *set* re-renders it) and — in the default `importance` sort only —
  to the whole `books` map, because importance re-sorts on every flush. Its children
  (`OrderbookCard`, `DashboardHeader`, `NotificationPanel`, `NotificationHandle`, `SettingsModal`)
  are therefore `React.memo`'d and receive stable `useCallback` handlers, so a page re-render
  doesn't re-render them; each card still re-renders on its own store subscriptions. Keep both
  in place when adding props or children.
- The socket payload is **not** run through Zod (unlike REST) — see the comment in
  `src/features/orderbook/types.ts` for why: it's a high-frequency, server-generated, perf-critical
  path, and a cheap structural guard in `feedClient.ts` (switch on `type`, `[]`-fallback arrays) is
  the deliberate tradeoff instead.
- Notifications are a downstream consumer of the same batch, not a separate subscription: each
  flush's `applyMessages()` return value (raised notifications) is deduped by `cooldown.ts` (top-5
  churn would otherwise re-announce a resting order every time it re-enters/exits the window) and
  pushed into `useNotificationStore`, entirely decoupled from React rendering.
- **Large-trade alerts** (`TRADE`, doc §3.8) skip the order book entirely: the guard splits a
  `SNAPSHOT`'s mixed entries into `data` (depth) and `trades`, and each flush hands the batch to
  `useTradeStore.ingest()` (`src/stores/tradeStore.ts`). Trades are history, not state: merged by
  `id`, sorted by exchange `time` (then `id`; arrival order is detection order), capped at 500,
  **never cleared by a snapshot**. Unread is a `seq > readSeq` watermark rather than
  `notificationStore`'s newest-N prefix (a late alert can sort below newer ones); snapshot
  replays get `seq: 0`, so they never count as new. "Clear all" remembers the cleared ids so the
  next snapshot doesn't bring them back. **Only the Settings trade venue mutes apply to trades**
  (`mutedTradeVenues`: dropped before `ingest`, hidden at display time) — muted tickers, the
  minimum tier and the header exchange filter do not. No toasts/sounds yet.
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
| Notifications + trade alerts (real-time) | Stores outside React, written by the flush pipeline (not the socket directly) | Zustand |
| Exchange registry | Store outside React, filled from `GET /api/exchanges` (TanStack Query), its localStorage cache and a bundled seed | Zustand |
| Client preferences (exchange filter, notification settings) | Stores outside React, hydrated from and persisted to localStorage; no backend | Zustand |
| REST / server state (rules, billing, auth profile) | TanStack Query cache | `@tanstack/react-query` |
| Forms | Local + schema-validated | React Hook Form + Zod (Zod schemas double as the runtime validator and the TS type source) |

### Directory layout

```
src/
  config/      env.ts — the single validated config source, read by nothing else via import.meta.env
  lib/         shared infra: queryClient.ts, api/ (auth-agnostic REST client), ws/feedClient.ts (socket singleton)
  app/         app shell: routed guards + bootstrap gate (SessionGate, ProtectedRoute, PublicRoute, AdminRoute)
  stores/      real-time state that lives OUTSIDE React — orderbookStore, notificationStore, tradeStore
  features/    feature modules: auth, orderbook (dashboard), billing (plans/checkout/account), settings
               (classification rules + notification prefs), admin (analytics + users), landing
  components/  shared UI primitives (Button, TextField, PasswordField, Card, Banner, BrandMark, …) + layouts/
```

### App shell & routing

[`src/App.tsx`](src/App.tsx) is the route table, wrapped in [`SessionGate`](src/app/SessionGate.tsx):

- **`SessionGate`** — on a page reload with rehydrated tokens, it holds a full-screen splash while
  `GET /me` re-validates the session, then renders routes. The "bootstrapping?" signal is React
  Query's `useMe` loading state (`status === 'authenticated' && me.isLoading`), *not* a third Zustand
  status — the token store stays tokens-only.
- **`ProtectedRoute`** — redirects anonymous visitors to `/login`. Gating is **token-presence only**,
  it does NOT read `accessState` — wraps `/dashboard`, `/account`, `/account/billing-history`,
  `/account/settings`, the admin routes and every `/billing/*` route, but none of them
  individually re-check subscription access beyond that (see the Monetization note on
  advisory-only gating below).
- **`AdminRoute`** — nested inside `ProtectedRoute` on `/account/analytics` and `/account/users`
  only; adds the role check. `/account/settings` is for every user.
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
public surface). Known exception: the orderbook's shared domain modules (`types`, `format`,
`tiers`, `exchanges`, `exchangeMetadata`, `components/ExchangeLogo`, the notification helpers)
are imported directly by `settings` and `lib/ws/feedClient.ts`; don't widen that to its
components or pages.

### Order book feature module (`src/features/orderbook/`)

- **`types.ts`** — the data model (`PairBook` → `VenueBook` → `Level`, the decoded `FeedMessage`,
  `Notification`) as plain TS types, deliberately not Zod-validated (see above).
  `bookKey(symbol, market)` is the single canonical way to key a book — always use it rather than
  hand-rolling the string. It keys a `(symbol, market)` *pair*; exchanges nest inside it (see
  "Multi-exchange support" above). `Tier` is `1 | 2 | 3 | 4`; tier 0 no longer exists on the wire.
- **`useOrderbookFeed.ts`** — the effect hook that starts/stops the module-level feed singleton for
  the component's lifetime; `startFeed`/`stopFeed` are idempotent so React StrictMode's
  mount→unmount→mount is safe.
- **`exchanges.ts`** — the runtime exchange registry store (`useExchangeRegistry`: `ids` in
  display order, `meta` per id, a `version` counter), the shared payload validator
  (`parseExchangesPayload`, used for the server response and the cache) and the non-reactive
  hot-path accessors `exchangeMeta()` / `exchangeRank()` / `exchangeLogoSrc()`. Components that
  render labels/logos subscribe to `version` only (it changes on metadata arrival, never per
  tick). It imports nothing from the filter store or the metadata query (no cycles).
- **`exchangeMetadata.ts`** — `useExchangeMetadata()` (TanStack Query, called by `DashboardPage`
  and `MutedVenues`), which applies a validated `/api/exchanges` response to the registry inside
  the query function. Refetches are throttled by the last ATTEMPT time (60 s) and triggered by a
  feed-revealed exchange (`provisionalSeq`) or a socket reconnect; both triggers are module-level
  store subscriptions, not React effects.
- **`components/ExchangeLogo.tsx`** — bundled logo → server `logoUrl` → first-letter fallback;
  the caller's size class sets the box.
- **`exchangeFilterStore.ts`** + **`exchangeFilter.ts`** — the header's per-exchange filter
  (`ExchangeFilterMenu`). The store keeps the user's persisted **`saved`** hidden list (never
  pruned, so a temporarily unlisted exchange keeps its choice) and derives the effective
  **`hidden`** list every consumer reads: `saved` ∩ the registry's current ids, or none if that
  would hide them all. `hidden` only changes identity when its contents change. A newly listed
  exchange shows by default; the last visible exchange can't be hidden. It reads the registry and
  never writes it. It's **display-only**: the feed client doesn't read it, so all data keeps
  flowing and re-showing an exchange is instant. It's **order-book-only**: the pure helpers apply
  it to the card merge, the visible-keys selector (`useShallow`, so the page still re-renders only
  when the visible set changes), importance tier counts and masonry row estimates — never to the
  notification panel, its tab chips or the handle badges (alert mutes live in Settings).
- **`masonry.ts`** — pure column assignment for the dashboard grid: cards dealt in sort order to
  the shortest column by an *estimated* height (rows × row height + chrome). `DashboardPage` holds
  the column count (`ResizeObserver`) and keeps the sorted-keys identity stable across unchanged
  orders, so a re-deal happens only on an actual reorder. Re-deals go through
  `assignColumnsStable` (keep each card's column, re-order within it, fall back to a fresh deal
  past `REBALANCE_SLACK_PX` of extra imbalance). `OrderbookCard` keys rows by `exchange:price`
  and holds a delayed-shrink `minHeight` (`useReservedRows`, 10 s) to damp top-5 churn — not
  fixed-height placeholder rows. Below `lg` the notification panel overlays the grid.
- **`sortOrderbooks.ts`** — the sort-menu modes; `importance` ranks by tier counts summed across
  the pair's **visible** exchanges (the header filter applies), computed once per pair per sort
  pass; ties keep the store's alphabetical order (`Array.sort` is stable).
- **`notifications/selectNotifications.ts`** — pure diff function: given one exchange's previous
  levels for a pair and an incoming `DEPTH`, decides which levels are notification-worthy (a new
  price or a tier change does).
- **`notifications/cooldown.ts`** — module-level (outside Zustand) dedup map keyed by
  `exchange:symbol:market:side:price:tier`, 5-minute window, so top-5-window churn doesn't spam repeat
  alerts for the same resting order.
- **`notifications/notificationSearch.ts`** — the panel's substring search over exchange label,
  ticker, side, market and both raw and formatted numbers. `notifications/tradeSearch.ts` is the
  trades-tab counterpart.
- **`notifications/useUnreadCounts.ts`** — `useDepthUnread()` / `useTradeUnread()`, the visible
  unread counts shared by the handle badges and the tab chips.
- **Notification panel tabs:** `NotificationPanel` has two tabs, order book (depth) and large
  trades; `DashboardPage` owns the active tab next to `notifOpen`, because each of the two
  collapsed handles (`NotificationHandle`: depth ladder + lightning) opens the panel on its own
  tab. While the panel is open on a tab, that stream's store is told it's being viewed
  (`setViewing`) and counts nothing as unread, so only an inactive tab shows a chip (hidden at
  0); the shared search and "Clear all" act on the active tab. `TradeCard` (memoized — alerts never change) renders a
  trade: headline size following the QTY/$ toggle, a 4-pip `notional / threshold` meter, the
  taker-side badge and, for sweeps (`levels > 1`), the first → last price path with its impact.
- **`tiers.ts`** — the tier→color scale (indexed by tier, index 0 an unused placeholder) shared by
  order book bars, notification stripes and the Settings minimum-tier control; these are data-viz
  values for this surface, not design-system theme tokens.
- Components (`DashboardHeader`, `SortMenu`, `ExchangeFilterMenu`, `OrderbookCard`,
  `NotificationPanel`, `NotificationHandle`, `NotificationCard`, `TradeCard`, `ExchangeLogo`) are conventional
  React reading from the stores via selectors — see `DashboardPage.tsx` for how the page composes
  them.
- **Header layout:** `--header-h` on `DashboardPage`'s root is the single source of the header's
  height (60px, one row, from `lg` = 1024px up; 104px below `lg`, where Sort + Exchanges wrap to a
  second row). The notifications panel, its handle and the reconnect notice are positioned from it
  — use the variable, never a hardcoded `60px`. The header never scrolls horizontally; below `sm`
  secondary info (ticker count) is hidden. `lg` matches `WIDE_QUERY`, where the panel switches
  from pushing the grid to overlaying it.
- **Header dropdowns** (`SortMenu`, `ExchangeFilterMenu`) render their menu + outside-click
  catcher in a **portal on `<body>`** at `z-[60]` (above the panel `z-50` and handle `z-40`, below
  the Settings modal `z-[100]`), positioned by `components/useAnchoredMenu.ts` (fixed, under the
  trigger, clamped to the viewport). Kept outside the header because the in-header version went
  invisible in Safari at narrow widths (suspected WebKit clipping of fixed descendants of the then
  scrolling header; not browser-verified) — the portal sidesteps that class of issue. Reuse the
  hook for any new header dropdown.

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

`AccountPage`, `BillingHistoryPage` (orders + entitlement-ledger tabs), settings' `SettingsPage`
and the admin `AnalyticsPage` / `UsersPage` share `AccountLayout`, a sidebar shell separate from
the dashboard chrome (below `md` its sidebar becomes a horizontal nav strip above the content). `historyView.ts` holds the code→label/color maps
(`STATUS`, `REASON`, `SOURCE`) for rendering backend enums — the same "map server codes to display
metadata in a small colocated module" pattern used by `catalog.ts`; extend those maps rather than
switching on the raw enum inline in JSX.

Full endpoint contract: [`.claude/docs/monetization-api.md`](.claude/docs/monetization-api.md).
Flow/UX rationale and the negative-path table (cancelled payment, lost tab, retried order, etc.):
[`.claude/docs/payment-flow-frontend.md`](.claude/docs/payment-flow-frontend.md).

### Settings feature module (`src/features/settings/`)

Two independent concerns share this module, surfaced in two places with the same components:
`SettingsModal` (opened from the dashboard header; below `md` its nav rail becomes a tab strip
above the content) and the routed `pages/SettingsPage.tsx` (`/account/settings`, inside
`AccountLayout`, which remaps two color tokens for its card depth). The mute lists switch
row layout per list width with a CSS container query (`@container` / `@xs`), so all rows of a
list change together:

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
  `MutedTickers.tsx`, `MutedVenues.tsx`, `notificationSettingsStore.ts`) — minimum tier + muted book
  keys + **per-alert-type** muted venues (`venueKey(exchange, market)` = the backend's
  `EXCHANGE_MARKET`). `MutedVenues` is a table: one row per registry exchange × **that exchange's
  own markets** via `venueOptions.ts` (a Spot-only or Futures-only exchange gets one row), one
  checkbox column per type — order book (`mutedVenues`, the pre-trades localStorage key, so old
  mutes carry over) and trades (`mutedTradeVenues`). Both persist the *muted* set and are never
  pruned, so new venues start unmuted and a temporarily unlisted venue keeps its mute. Minimum
  tier and muted tickers are depth-only. Venue mutes are notifications-only: dropped at the push
  boundary and hidden at display time (panel, tab chip, handle badge) by
  `orderbook/notifications/settingsFilter.ts`; the grid and the header exchange filter ignore them. **Client-side
  only** (persisted to localStorage via `storage.ts`, no backend endpoint). The store is
  framework-agnostic (plain Zustand `create`, no React coupling) and hydrated at module load
  specifically so `feedClient.ts` can read it synchronously via `getState()` on the flush hot path
  to filter which notifications get raised — same outside-React shape as `session.ts` and
  `orderbookStore.ts`.

Both pickers (muted tickers, rule search) draw from one pool, `tickerPool.ts`, built from
`GET /api/tickers` (`schemas.ts`): `parseVenue()` splits each instrument's `EXCHANGE_MARKET` venue,
and the pool is de-duplicated by `(symbol, market)` since rules and mutes are exchange-independent.

## Features (high-level landscape)

1. **Auth** — ✅ built. Register/verify/login/session/logout.
2. **Order book** — ✅ built (flagship, performance-critical). Live, continuously-updated order
   books merged across every backend-listed exchange (Binance, MEXC, Bybit today); detects
   meaningful changes (new/removed significant orders) and surfaces them as notifications, with a
   sort menu, a per-exchange display filter and per-user mute/tier filtering (see Settings below),
   plus a large-trade alerts tab (`TRADE`). Spoken/TTS alerts and toasts are not yet implemented.
   Governed by the real-time architecture above. Socket protocol:
   [`.claude/docs/websocket-feed-api.md`](.claude/docs/websocket-feed-api.md).
3. **Classification rules** — ✅ built. Per-user CRUD for the tier thresholds that drive how order
   book levels are ranked/highlighted. Conventional forms-and-data work validated against backend
   rules (client-side mirror in `rulesValidation.ts`).
4. **Monetization & access** — ✅ built. Plan catalog, pay-as-you-go, hosted-checkout redirect,
   polling-based payment status resolution, account page, and billing/entitlement history. Note the
   access **gate itself is advisory-only client-side** — the backend doesn't yet enforce entitlement
   on REST/WS, per `monetization-api.md` §4.2.
5. **Charts** — future work, most likely built on TradingView Lightweight Charts. Not yet scoped.
6. **i18n (English/Russian)** — ✅ built. `react-i18next` in `src/lib/i18n/`, feature-mirrored
   namespaces (`locales/{en,ru}/<namespace>.json`). Browser-language detection exists but is
   currently disabled: `FORCED_LOCALE` in `config.ts` pins the app to Russian. Design rationale in
   [`.claude/plans/i18n-localization.md`](.claude/plans/i18n-localization.md).

## Reference docs

- [`.claude/docs/auth-api.md`](.claude/docs/auth-api.md) — full auth API contract.
- [`.claude/docs/websocket-feed-api.md`](.claude/docs/websocket-feed-api.md) — the `/ws` socket
  protocol: connection, token-as-query-param, every message type (`DEPTH`, `TRADE`, `SNAPSHOT`)
  and payload shape. **Authoritative**; it supersedes the older
  [`changes/websocket-feed-api.md`](.claude/docs/changes/websocket-feed-api.md).
- [`.claude/docs/classification-rule-api.md`](.claude/docs/classification-rule-api.md) — the tier
  model (notional × distance thresholds) and the per-user custom-rule CRUD contract.
- [`.claude/docs/monetization-api.md`](.claude/docs/monetization-api.md) — endpoint-level contract
  for plans, entitlement, and orders (enums, request/response shapes, status codes).
- [`.claude/docs/payment-flow-frontend.md`](.claude/docs/payment-flow-frontend.md) — the narrative
  UX flow built on top of that contract: page transitions, polling/timeout behavior, and the full
  negative-path table (cancelled/lost/retried payments).
- [`.claude/docs/billing-history-api.md`](.claude/docs/billing-history-api.md) — order history and
  entitlement-ledger endpoints backing `BillingHistoryPage`.
- [`.claude/docs/changes/`](.claude/docs/changes/) — the backend's revised multi-exchange contracts
  (WebSocket feed, ticker list, classification rules) plus the new exchange-metadata endpoint
  (`exchange-metadata-api.md`). Each file supersedes the same-named doc above, where one exists.
  See "Multi-exchange support".
- [`.claude/docs/frontend-architecture.md`](.claude/docs/frontend-architecture.md) — the high-level
  "what and why" of the frontend direction (a proposed default, not a locked mandate).
- [`.claude/docs/landing-page.md`](.claude/docs/landing-page.md) — how the public landing page +
  billing data layer are built: module shape, routing, the plans data flow, and design-token usage.
- [`.claude/plans/`](.claude/plans/) — phase-by-phase implementation plans for each feature as it
  was built; useful for the *why* behind a design decision that isn't obvious from the code alone.
  [`.claude/plans/multi-exchange-review.md`](.claude/plans/multi-exchange-review.md) is the
  plan the multi-exchange support was built from.

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
