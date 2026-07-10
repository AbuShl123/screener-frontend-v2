# Landing page — public marketing home + billing data layer

> **Audience**: frontend engineers/agents working on the public landing page, its routing, or the
> billing catalog it consumes. This documents *how the feature is built in the framework* — module
> shape, routing, the data flow, and the design-token usage — not a backend contract. The original
> design/build plan is [`.claude/plans/landing-advertising-page.md`](../plans/landing-advertising-page.md);
> the section numbers it defines (`§4`, `§7`, …) are referenced from the source files and echoed here.

---

## 1. What this is

A public marketing / advertising home page mounted at `/`, reachable in **any** auth state, plus the
**billing data layer** it is the first consumer of. It is the app's front door: it presents the
product, shows the four pricing plans (live from the backend, fallback-first), and routes every CTA
to the right place depending on whether the visitor is signed in.

Two feature modules cooperate:

| Module | Path | Responsibility |
|---|---|---|
| `landing` | [`src/features/landing/`](../../src/features/landing/) | The page, its sections, and auth-aware navigation. Pure presentation + routing. |
| `billing` | [`src/features/billing/`](../../src/features/billing/) | The `GET /api/billing-catalog/plans` data layer + the plan-presentation catalog + the stub checkout page. |

`landing` may import `billing`'s public barrel; **`billing` never imports `landing`.** The dependency
flow is one-way, mirroring the auth module (per CLAUDE.md):

```
landing/pages,components (React) ─► useLandingNav ─► react-router + features/auth (session status)
                                └─► features/billing (usePlans, buildPlanViews)
billing/pages,components (React) ─► queries.ts ─► api.ts ─► lib/api/client.ts (request)
                                              └─► schemas.ts (Zod, server responses)
```

---

## 2. Routing

The landing page owns `/` unguarded; the dashboard moved to a protected `/dashboard`. Full table
([`src/App.tsx`](../../src/App.tsx)):

| Path | Guard | Element | Note |
|---|---|---|---|
| `/` | **none** (public) | `LandingPage` | reachable in any auth state; the page self-adapts (§5) |
| `/dashboard` | `ProtectedRoute` | `DashboardPage` | anonymous → `/login` |
| `/billing/checkout` | `ProtectedRoute` | `CheckoutStubPage` | authed-only by design; anon → `/login` |
| `/login`, `/register` | `PublicRoute` | Login/Register | authed visitors bounce to `/dashboard` |
| `/register/check-inbox`, `/verify-email` | none | — | reachable in any auth state |
| `*` | — | `Navigate to="/"` | unknown paths land on the public landing |

Behavioral couplings to keep in mind:

- **`LoginPage`** navigates to `/dashboard` post-login (not `/`).
- **`PublicRoute`** bounces an already-authenticated user to `/dashboard`.
- **`SessionGate`** only shows its bootstrap splash when `status === 'authenticated' && useMe().isLoading`.
  An **anonymous** visitor to `/` has `status === 'anonymous'`, so `useMe` is disabled and the landing
  renders instantly — correct for a marketing page. An authenticated visitor briefly sees the splash
  while `/me` revalidates, then the landing with its adapted header.

---

## 3. Page composition

[`LandingPage.tsx`](../../src/features/landing/pages/LandingPage.tsx) is a thin composition of six
sections on the dark page background:

```
LandingHeader     sticky, auth-aware CTAs
HeroSection       headline + OrderBookPreview + StatsRow + TickerStrip
PricingSection    #pricing — usePlans() + trial banner + 4 × PlanCard
FeaturesSection   #features — 6 static feature cards
CtaSection        bottom call-to-action, auth-aware
LandingFooter     brand + copyright
```

Only `LandingPage` is exported from the module barrel
([`src/features/landing/index.ts`](../../src/features/landing/index.ts)); everything else is internal.

### Section-by-section

- **`LandingHeader`** — sticky, translucent (`bg-[rgba(6,8,12,0.82)] backdrop-blur`). Nav anchors
  (`#pricing`, `#features`) show in both auth states; the right-hand CTAs are auth-aware (§5).
- **`HeroSection`** — two-column grid (`1.05fr 0.95fr`). Left: mono eyebrow, 44px headline, lead copy,
  the auth-aware primary CTA + a "See pricing" button that `scrollIntoView`s `#pricing`. Right: the
  `OrderBookPreview`. Below the grid: a 4-stat row (`STATS`) and the reused
  [`TickerStrip`](../../src/components/TickerStrip.tsx).
- **`OrderBookPreview`** — a **decorative** animated order-book mock (§6).
- **`PricingSection`** — reads `usePlans()`, builds views with `buildPlanViews(data)`, renders the
  trial banner + a `grid-cols-4` of `PlanCard`s. Owns `id="pricing"` + `scroll-mt-[72px]`.
- **`PlanCard`** — one presentational pricing card (§4.2). All strings are pre-formatted by the
  catalog; the card only maps a `PlanView` to layout and forwards the click.
- **`FeaturesSection`** — six static cards from the `FEATURES` constant. Owns `id="features"` +
  `scroll-mt-[72px]`.
- **`CtaSection`** — bottom CTA, auth-aware pair.
- **`LandingFooter`** — `BrandMark` + copyright line.

Static marketing copy (trial length, hero stats, feature cards) lives in
[`constants.ts`](../../src/features/landing/constants.ts) as deliberate advertising constants — **not**
live figures. `TRIAL_DAYS = 7` is a landing constant; swap it for a backend value if trial length is
ever exposed.

---

## 4. Billing data layer

The landing page is billing's first consumer, so the module was created with it. It follows the auth
module's exact shape.

### 4.1 The pipeline

- **[`schemas.ts`](../../src/features/billing/schemas.ts)** — Zod for the `GET /api/billing-catalog/plans`
  response (the single source of both validator and TS type, per CLAUDE.md's REST rule). Server-authored
  fields (`code`, `displayName`, `currency`) are deliberately not over-constrained.
- **[`api.ts`](../../src/features/billing/api.ts)** — `fetchPlans(signal?)` over `request()`. The
  endpoint is **public (no JWT)**, so it takes no token and stays outside the session layer's
  `withAuth` machinery entirely.
- **[`queries.ts`](../../src/features/billing/queries.ts)** — `usePlans()` (React Query). No `enabled`
  gate (public → safe for anonymous visitors); generous `staleTime` (5 min — the catalog changes
  rarely). `billingKeys` for cache addressing.
- **[`catalog.ts`](../../src/features/billing/catalog.ts)** — the presentation bridge (§4.2).

Contract (`GET /api/billing-catalog/plans`, public):

```jsonc
{
  "currency": "UZS",
  "plans": [
    { "code": "monthly",       "displayName": "Monthly",     "type": "FIXED",   "durationDays": 30,   "amount": 150000.00 },
    { "code": "pay_as_you_go", "displayName": "Pay by days", "type": "PER_DAY", "durationDays": null, "amount": 10000.00 },
    { "code": "weekly",        "displayName": "Weekly",      "type": "FIXED",   "durationDays": 7,    "amount": 50000.00 },
    { "code": "yearly",        "displayName": "Yearly",      "type": "FIXED",   "durationDays": 365,  "amount": 1500000.00 }
  ]
}
```

### 4.2 The presentation catalog (`buildPlanViews`)

The API supplies only `code / displayName / type / durationDays / amount`; the card copy (title, badge,
description) is hardcoded per `code` in `PLAN_COPY`. `buildPlanViews(data?)` merges them into ordered
`PlanView`s — every string the card renders is derived here so `PlanCard` stays purely presentational.

- **Fallback-first** — each `PlanCopy` carries a built-in `fallbackAmount / fallbackType /
  fallbackDurationDays`, so the pricing grid renders **correct and layout-stable immediately** with no
  spinner or skeleton. When `usePlans()` resolves, live values override the fallbacks; on query error
  the fallbacks simply remain. A marketing page must never look broken because the API blinked.
- **Fixed display order** — pay-as-you-go → weekly → monthly → yearly (`PlanCopy.order`).
- **Highlight** — `code === 'pay_as_you_go'`.
- **Defensive merge** — a known code **absent** from a *successful* response is dropped (don't advertise
  a discontinued plan); an unknown API code is ignored (no copy to render). With no data yet
  (loading/error) all four render from fallbacks.
- **Per-day line** is *computed* from `amount / durationDays` (`=` when it divides evenly, else `≈`), so
  it stays correct if prices change. The `SAVE 17%` badge is accepted static copy.

`catalog.ts` lives in `billing` (not `landing`) so a future "choose plan" page reuses it. It is also
reused by the stub checkout page.

### 4.3 Stub checkout (`CheckoutStubPage`)

Mounted at `/billing/checkout` behind `ProtectedRoute`. Reads `?plan=CODE`, resolves it against
`buildPlanViews()` (fallback prices, no query) to show the chosen plan's name + price, and links back to
pricing / dashboard. Makes **no network calls** — it's the seam the real payment flow drops into later.
A missing/unknown `plan` degrades to a neutral "choose a plan" state.

---

## 5. Auth-aware navigation

[`useLandingNav`](../../src/features/landing/useLandingNav.ts) centralizes every CTA's destination and
the anonymous/authenticated split. It reads `isAuthed` from the session store
(`useSession((s) => s.status === 'authenticated')`) and returns stable-per-render handlers:

| Handler | Anonymous | Authenticated |
|---|---|---|
| header / CTA right side | Sign in + Create account | **Go to dashboard** |
| hero primary | Start {TRIAL_DAYS}-day free trial → `/register` | Go to dashboard → `/dashboard` |
| `startPlan(code)` | `/register?plan=CODE` | `/billing/checkout?plan=CODE` |

The `?plan=` on the anonymous branch is a forward-looking breadcrumb for a future
resume-after-signup; `RegisterPage` ignores it today.

---

## 6. The decorative order-book preview

[`OrderBookPreview`](../../src/features/landing/components/OrderBookPreview.tsx) is a self-contained
visual flourish that *mimics* an order book. **It is NOT wired to the real WebSocket feed or the
`orderbookStore`** — it holds ~5 asks + 5 bids + a mid price in **local React state** and jitters them
on a `setInterval` (~1400ms) to look alive.

This does not violate CLAUDE.md's "keep the firehose out of React" rule: that rule governs the *real*
order-book surface, and 10 rows updating every 1.4s is trivial. The component honors
`prefers-reduced-motion` (skips the interval, renders a static snapshot) and clears its interval on
unmount.

---

## 7. Styling & design tokens

The page is **all dark** (per the **v2 design template** — see §8). Semantic dark-theme tokens from
[`src/index.css`](../../src/index.css) are used throughout — no raw hex except a handful of one-off
`color-mix`/tint values at single call sites.

**Smooth section transitions** come from stepping the section background between near-black surfaces
rather than the earlier dark→light→light→dark rhythm:

| Section | Background token | Value |
|---|---|---|
| Hero, CTA | page `--color-bg` | `#06080c` |
| Pricing | `--color-surface` | `#0a0e14` |
| Features | `--color-surface-marketing` | `#070a0f` |

Section dividers are `border-border-subtle` hairlines. Notable one-off tints (not tokenized — used
once, read clearest inline):

- **Trial banner** — `bg-[color-mix(in_oklab,#4ea8ff_10%,transparent)]` + a `#1f6fd4` "DAYS FREE" pill.
- **Highlighted plan card** (pay-as-you-go) — an **amber** treatment keyed off `--color-warning`
  (`#f5b84d`): `border-2 border-warning`, `bg-[color-mix(in_oklab,#f5b84d_9%,#0d1219)]`, and a matching
  amber CTA button (brown `#1a1206` ink). Non-highlighted cards sit on `bg-input` with an `outline`
  `Button`.
- **Plan badges** — `FLEXIBLE` (accent style) tints amber; `SAVE 17%` (muted style) tints blue
  (`--color-accent`).
- **Feature glyphs** — the ▲ open-interest glyph uses `text-bid`; the rest use `text-accent`.

Feature cards reuse `bg-input` / `border-border`. Buttons reuse the shared
[`Button`](../../src/components/Button.tsx) (`primary`/`outline`); the one exception is the amber
highlighted-plan CTA, rendered as a raw button so it can match the amber ring.

> **History**: v1 of the template made Pricing + Features *light* sections, backed by a dedicated
> `--color-mkt-*` token group (an intentional exception to the dark-only theme). The **v2** template
> removed the light sections; that token group was deleted with them, and both sections now use the
> standard dark tokens above.

---

## 8. Source of truth & regenerating

The design lives in the **Claude Design project "Screener Advertising Page"** (id
`37f4943b-38da-4f8e-a06b-2d86ba85de8d`). It has two page templates:

- `Screener Landing.dc.html` — v1 (light Pricing + Features).
- `Screener Landing v2.dc.html` — **current**: refined, all-dark, smoother transitions. Only the
  Pricing and Features sections differ from v1.

Re-fetch the authoritative markup via the `claude-design` MCP (`read_file`); it is **not** committed to
the repo. When reading it, note the body is HTML-entity-escaped (`&lt;`/`&gt;`/`&amp;`). Every value
needed to build the page is captured in the plan and in the source files' inline comments.

---

## 9. Deliberately deferred

- Real payment flow + access-state gating (the stub is the placeholder).
- Consuming `?plan=` after signup to resume checkout (breadcrumb planted, not read).
- Computing the yearly "SAVE %" badge from live amounts (static copy for now).
- Trial length from the backend (constant for now).
- Mobile / responsive breakpoints (desktop-first, consistent with the rest of the app).
