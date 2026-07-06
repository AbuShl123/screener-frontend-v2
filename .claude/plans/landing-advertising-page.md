# Plan: Landing / advertising page + public routing + billing plans

> Status: proposed (not yet implemented). Written 2026-07-07.
>
> Sources of truth used while writing this plan:
> - **Claude Design project "Screener Advertising Page"** — id `37f4943b-38da-4f8e-a06b-2d86ba85de8d`,
>   URL <https://claude.ai/design/p/37f4943b-38da-4f8e-a06b-2d86ba85de8d>, template file
>   `Screener Landing.dc.html`. Re-fetch the authoritative markup via the `claude-design` MCP
>   (`read_file`) — it is **not** committed to `.claude/design/` (see §15). Every measurement, color,
>   and string in this plan is extracted from that template.
> - The template composes the shared design-system components `BrandMark`, `Button`, and
>   `TickerStrip` — all of which already exist in [`src/components/`](../../src/components/).
> - CLAUDE.md — the routing model, the one-way feature-module dependency flow, the "dark theme,
>   semantic tokens, no raw hex" styling rule, the data-flow split (TanStack Query for REST).
> - The backend billing catalog contract (`GET /api/billing/plans`), supplied by the product owner
>   and reproduced in §6.

## 1. Scope

Build the public marketing / advertising home page and make it the app's front door.

- A new **public `LandingPage`** at `/` (reachable in any auth state), with six sections ported
  from the template: Header, Hero (with an animated decorative order-book preview + a 4-stat row),
  Pricing, Features, CTA, Footer.
- **Routing rework**: the landing takes `/` (public); the existing **`DashboardPage` moves to a
  protected `/dashboard`**; the login/guard redirect targets that pointed at `/` are repointed at
  `/dashboard`.
- **Real, auth-aware button wiring** — every CTA navigates: Sign in → `/login`,
  Create account / Start free trial → `/register`, "Start now" on a plan → checkout (authed) or
  `/register` (anon).
- A **billing data layer** (`src/features/billing/`): a typed, public `usePlans()` query over
  `GET /api/billing/plans`, plus a plan-presentation catalog that merges live prices with copy
  hardcoded by plan `code`.
- A **stub checkout route** `/billing/checkout?plan=CODE` so the authed "Start now" path is really
  wired even though the payment flow itself is out of scope.

**Out of scope (explicitly):** the real payment flow / access-state gating / "choose plan on
expired trial" landing (a separate future story — the stub is a placeholder for it), classification
rules, notifications/TTS, mobile-specific layouts (desktop-first like the rest of the app), and any
change to the order-book feed itself.

## 2. Decisions locked (product owner, 2026-07-07)

1. **Light marketing sections stay light** (template's dark→light→light→dark rhythm is preserved),
   but their colors are added as **`--color-mkt-*` semantic tokens** in `index.css` rather than raw
   hex at call sites — a documented, intentional exception to CLAUDE.md's dark-only rule (§5).
2. **The landing is reachable by everyone**, including authenticated users; when authenticated, the
   header/CTA swap their acquisition buttons (Sign in / Create account) for a single **"Go to
   dashboard"** action (§10). No redirect away from `/`.
3. **"Start now" while authenticated** navigates to a **stub checkout route**
   `/billing/checkout?plan=CODE` (§11), which the future payment flow will replace.

Minor defaults chosen while writing (call out if you disagree):

4. **Plans render fallback-first.** The presentation catalog carries the known UZS prices as
   built-in fallbacks, so the pricing section renders correct and layout-stable **immediately** with
   no skeleton/spinner; when `usePlans()` resolves, live amounts override the fallbacks; on query
   error the fallbacks simply remain. A marketing page must never look broken because the API blinked.
   (If you'd rather treat the API as the strict source of truth with skeleton cards while loading,
   that's a one-component swap — noted in §14.)
5. **Fixed display order** pay-as-you-go → weekly → monthly → yearly, **highlight = pay-as-you-go**
   (template's `highlightPlan` default). Known codes missing from the API response are dropped;
   codes the API returns that we have no copy for are ignored. This is the deliberate "design depends
   on an expected set of plan codes" the product owner accepted.
6. **`TRIAL_DAYS = 7`** is a landing-feature constant (template's `trialDays` default). If the
   backend ever exposes trial length, swap the constant for that value.

## 3. New / changed files

```
src/
  index.css                                 CHANGED — add the --color-mkt-* marketing token group (§5)
  App.tsx                                   CHANGED — routing rework (§4)
  app/
    PublicRoute.tsx                         CHANGED — authed bounce target '/' → '/dashboard' (§4)
  features/
    auth/pages/LoginPage.tsx                CHANGED — post-login navigate('/') → navigate('/dashboard') (§4)
    billing/                                NEW feature module (§6, §11)
      schemas.ts                            NEW — Zod for the plans response (server-response schemas)
      api.ts                                NEW — fetchPlans() over request() (public, no token)
      queries.ts                            NEW — billingKeys + usePlans()
      catalog.ts                            NEW — plan copy map (by code) + merge → PlanView[] (§7)
      pages/
        CheckoutStubPage.tsx                NEW — "payment coming soon" stub (§11)
      index.ts                              NEW — barrel (usePlans, catalog, CheckoutStubPage, types)
    landing/                                NEW feature module (§8, §9, §10)
      constants.ts                          NEW — TRIAL_DAYS, STATS, FEATURES copy
      useLandingNav.ts                      NEW — auth-aware navigation handlers (§9)
      components/
        LandingHeader.tsx                   NEW — sticky header, nav, auth-aware CTAs (§10)
        HeroSection.tsx                     NEW — headline + copy + CTAs + StatsRow + preview
        OrderBookPreview.tsx                NEW — decorative animated fake book (§8.2)
        PricingSection.tsx                  NEW — usePlans + trial banner + PlanCard grid (light)
        PlanCard.tsx                        NEW — one plan card (§7)
        FeaturesSection.tsx                 NEW — 6 static feature cards (light)
        CtaSection.tsx                      NEW — bottom CTA (auth-aware)
        LandingFooter.tsx                   NEW — brand + copyright
      pages/
        LandingPage.tsx                     NEW — composes the sections
      index.ts                              NEW — barrel (LandingPage)
```

No files are deleted; `DashboardPage` stays put in `features/orderbook/` and only its route changes.

Dependency flow stays one-way, mirroring the auth module (CLAUDE.md):

```
landing/pages,components (React) ─► useLandingNav ─► react-router + features/auth (session status)
                                └─► features/billing (usePlans, catalog)
billing/pages,components (React) ─► queries.ts ─► api.ts ─► lib/api/client.ts (request)
                                              └─► schemas.ts (Zod, server responses)
```

`billing` never imports `landing`; `landing` may import `billing`'s public barrel.

## 4. Routing rework (`App.tsx`, guards, redirects)

Current route table (from [`App.tsx`](../../src/App.tsx)): `/` = `ProtectedRoute → DashboardPage`,
`/login` `/register` behind `PublicRoute`, `/register/check-inbox` + `/verify-email` unguarded,
`*` → `/`.

New table:

| Path | Guard | Element | Note |
|---|---|---|---|
| `/` | **none** (unguarded, public) | `LandingPage` | reachable in any auth state; the page self-adapts (§10) |
| `/dashboard` | `ProtectedRoute` | `DashboardPage` | moved here from `/` |
| `/billing/checkout` | `ProtectedRoute` | `CheckoutStubPage` | authed-only by design; anon → `/login` via the guard |
| `/login` | `PublicRoute` | `LoginPage` | unchanged |
| `/register` | `PublicRoute` | `RegisterPage` | unchanged |
| `/register/check-inbox` | none | `CheckInboxPage` | unchanged |
| `/verify-email` | none | `VerifyEmailPage` | unchanged |
| `*` | — | `Navigate to="/"` | now lands on the public landing — fine |

Fallout fixes (these are the only behavioral edits to existing auth/app code):

- [`LoginPage.tsx:53`](../../src/features/auth/pages/LoginPage.tsx) — `navigate('/', { replace: true })`
  → `navigate('/dashboard', { replace: true })`. (No `from`-preservation exists today; a plain
  default to `/dashboard` keeps parity. Redirect-intent preservation stays out of scope.)
- [`PublicRoute.tsx:12`](../../src/app/PublicRoute.tsx) — the already-authenticated bounce
  `Navigate to="/"` → `Navigate to="/dashboard"`, so a logged-in user hitting `/login` or `/register`
  goes into the app, not to the marketing page.
- `ProtectedRoute` is **unchanged** (anon → `/login`).
- `DashboardHeader`'s logout (in `features/orderbook`) currently navigates to `/login`; leave it.
  Optionally it could send users to the public `/` now — flagged, not required.

**`SessionGate` interaction (no change needed):** `SessionGate` only shows its bootstrap splash when
`status === 'authenticated' && useMe().isLoading`. An **anonymous** visitor to `/` has
`status === 'anonymous'`, so `useMe` is disabled and the landing renders instantly with no splash —
correct for a marketing page. An authenticated visitor briefly sees the existing splash while `/me`
revalidates, then the landing with its adapted header — acceptable.

## 5. Marketing color tokens (`index.css`)

Add a `--color-mkt-*` group inside the existing `@theme` block. Tailwind v4 auto-generates
`bg-mkt-*` / `text-mkt-*` / `border-mkt-*` utilities from these, so the light sections use semantic
classes exactly like the dark ones — satisfying the locked decision (§2.1). Values extracted verbatim
from the template's light sections:

```css
/* Marketing (light) surfaces — intentional exception to the dark-only theme.
   Used ONLY by the public landing page's Pricing + Features sections. */
--color-mkt-surface: #ffffff;            /* Features section bg */
--color-mkt-surface-alt: #f2f5fa;        /* Pricing section bg */
--color-mkt-card: #f5f7fb;               /* feature card bg */
--color-mkt-border: rgba(10, 14, 20, 0.08);
--color-mkt-border-strong: rgba(10, 14, 20, 0.10);
--color-mkt-heading: #0d1219;            /* h2 */
--color-mkt-text: #3e4859;               /* body */
--color-mkt-text-secondary: #5a6577;     /* muted body */
--color-mkt-text-muted: #8a94a6;         /* labels, per-day line */
--color-mkt-accent: #4187d4;             /* eyebrow/accent on white (darker than dark-theme accent) */
--color-mkt-positive: #22a06b;           /* OI-alert ▲ glyph */
--color-mkt-badge: #1a5fb8;              /* "FLEXIBLE" plan badge bg */
```

A handful of one-off `color-mix(...)` values in the template (the highlighted plan card's tinted
background/border, the trial banner's tint, the badges) are **not** tokenized — they're used once and
read clearest as Tailwind arbitrary values or an inline `style` at the single call site, e.g.
`border-2 border-accent` + `bg-[color-mix(in_oklab,#4ea8ff_6%,white)]` on the highlighted card. Note
`--color-accent` (`#4ea8ff`) is reused as-is for the highlight ring; only the light *text/surface*
palette is new.

## 6. Billing data layer (`src/features/billing/`)

The landing page is the first consumer of billing, so this module is created now. It follows the auth
module's exact shape: `schemas.ts` (server-response Zod) → `api.ts` (pure functions over `request()`)
→ `queries.ts` (React Query).

**Contract** (`GET /api/billing/plans`, **public — no JWT**):

```jsonc
{
  "currency": "UZS",
  "plans": [
    { "code": "monthly",       "displayName": "Monthly",    "type": "FIXED",   "durationDays": 30,   "amount": 150000.00 },
    { "code": "pay_as_you_go", "displayName": "Pay by days","type": "PER_DAY", "durationDays": null, "amount": 10000.00 },
    { "code": "weekly",        "displayName": "Weekly",     "type": "FIXED",   "durationDays": 7,    "amount": 50000.00 },
    { "code": "yearly",        "displayName": "Yearly",     "type": "FIXED",   "durationDays": 365,  "amount": 1500000.00 }
  ]
}
```

**`schemas.ts`** (validates the server response — the CLAUDE.md rule for REST):

```ts
export const planSchema = z.object({
  code: z.string(),
  displayName: z.string(),
  type: z.enum(['FIXED', 'PER_DAY']),
  durationDays: z.number().int().positive().nullable(),
  amount: z.number(),
});
export const plansResponseSchema = z.object({
  currency: z.string(),
  plans: z.array(planSchema),
});
export type Plan = z.infer<typeof planSchema>;
export type PlansResponse = z.infer<typeof plansResponseSchema>;
```

**`api.ts`** — `fetchPlans(signal?) => request('/api/billing/plans', { schema: plansResponseSchema, signal })`.
No `token` argument: this endpoint is public, so it stays outside the `withAuth` machinery entirely.

**`queries.ts`**:

```ts
export const billingKeys = { all: ['billing'] as const, plans: ['billing', 'plans'] as const };

export function usePlans() {
  return useQuery({
    queryKey: billingKeys.plans,
    queryFn: ({ signal }) => fetchPlans(signal),
    staleTime: 5 * 60_000,   // catalog changes rarely
  });
}
```

No `enabled` gate — it's public, safe to run for anonymous visitors.

## 7. Plan presentation catalog (`catalog.ts`)

The template hardcodes each card's badge, description, and per-day line; the API supplies only
`code / displayName / type / durationDays / amount`. `catalog.ts` bridges them: a copy map keyed by
`code`, plus a merge that produces the view models the cards render. It's placed in `billing` (not
`landing`) so the future "choose plan" page reuses the same catalog.

```ts
export interface PlanCopy {
  order: number;                 // fixed display order
  name: string;                  // card title (may differ from API displayName, per template)
  badge?: string;                // 'FLEXIBLE' | 'SAVE 17%' | undefined
  badgeStyle?: 'accent' | 'muted';
  desc: string;
  fallbackAmount: number;        // used until/unless the API responds (§2.4)
}

// Design deliberately depends on this known set of codes (locked §2.5).
const PLAN_COPY: Record<string, PlanCopy> = {
  pay_as_you_go: { order: 0, name: 'Pay by days', badge: 'FLEXIBLE', badgeStyle: 'accent',
    desc: 'Pay only for the days you trade. Top up any number of days — access ends when they run out. No auto-renewal.',
    fallbackAmount: 10000 },
  weekly:  { order: 1, name: 'Weekly',
    desc: 'Seven days of full access. Good for trying a strategy or trading an event week.',
    fallbackAmount: 50000 },
  monthly: { order: 2, name: 'Monthly',
    desc: 'The standard plan. One payment, thirty days of everything.',
    fallbackAmount: 150000 },
  yearly:  { order: 3, name: 'Yearly', badge: 'SAVE 17%', badgeStyle: 'muted',
    desc: 'A full year at the lowest per-day rate. Set it once, forget billing.',
    fallbackAmount: 1500000 },
};
```

**`buildPlanViews(data?: PlansResponse): PlanView[]`**:

- Start from `PLAN_COPY` entries sorted by `order`. For each, find the matching API plan by `code`.
- **Amount**: API `amount` when present, else `fallbackAmount` (fallback-first, §2.4).
- **Highlight**: `code === 'pay_as_you_go'`.
- Emit a `PlanView` per known code. A known code **absent** from a *successful* API response is
  dropped (defensive: don't advertise a plan the backend no longer sells). Unknown API codes are
  ignored (no copy → can't render meaningfully). With no data yet (loading/error) all four render
  from fallbacks.

**`PlanView`** carries everything the card needs, all derived here so `PlanCard` stays presentational:

```ts
interface PlanView {
  code: string; name: string; highlight: boolean;
  badge?: string; badgeStyle?: 'accent' | 'muted';
  price: string;      // e.g. "150,000"   (Intl.NumberFormat('en-US'), grouping only)
  unit: string;       // FIXED → `${currency} / ${durationDays} days`; PER_DAY → `${currency} / day`
  desc: string;
  perDay: string;     // PER_DAY → 'from 1 day, any amount';
                      // FIXED → `≈ ${round(amount/durationDays)} ${currency} / day`
                      //         ('=' instead of '≈' when it divides evenly, matching the template)
}
```

Currency comes from the API response (`UZS`), defaulting to `'UZS'` for the fallback render. Per-day
is **computed from amount/duration**, not hardcoded, so it stays correct if prices change. The
`SAVE 17%` badge is left as static copy (accepted hardcoding); computing it from
`1 − yearlyPerDay/monthlyPerDay` is a possible future refinement, noted only.

## 8. Landing UI

`LandingPage.tsx` is a thin composition:

```tsx
<div className="min-h-screen bg-bg font-sans text-text-secondary">
  <LandingHeader />
  <HeroSection />       {/* dark, border-b */}
  <PricingSection />    {/* light — id="pricing", scroll-mt for the sticky header */}
  <FeaturesSection />   {/* light — id="features" */}
  <CtaSection />        {/* dark */}
  <LandingFooter />
</div>
```

Global niceties from the template: `html { scroll-behavior: smooth }` (add to `index.css` base, or a
`scroll-smooth` class on `<html>`), and `scroll-mt-[72px]` on the `#pricing` / `#features` sections so
anchor jumps clear the sticky header (cleaner than the template's JS scroll-offset math).

### 8.1 Section specs (all measurements from the template)

- **Header** — see §10 (auth-aware).
- **Hero** (`border-b border-border-subtle`, inner `max-w-[1140px] mx-auto px-8`, top pad 88px):
  two-column grid `1.05fr 0.95fr`, 64px gap.
  - Left: mono eyebrow "Real-time market intelligence" (`text-accent`, 11px, uppercase,
    tracking 0.08em); `h1` 44px/1.15, weight 600, `text-text`, "Every level that matters, in real
    time."; a 16px lead paragraph (`text-text-secondary`, `max-w-[52ch]`, mono-highlighted `500+` /
    `20+`); the CTA row (§9 — primary "Start {TRIAL_DAYS}-day free trial" + outline "See pricing"
    that scroll-jumps to `#pricing`); a mono microcopy line "free on first registration · no card
    needed" (`text-text-dim`).
  - Right: the **OrderBookPreview** card (§8.2).
  - **StatsRow** below the grid (`max-w-[1140px]`, `grid-cols-4`, 24px gap): four
    `border-top` stat blocks — `500+` / `20+` / `<1s` / `100K+/s` (mono 24px `text-text-strong`) with
    uppercase mono captions. These are **marketing copy constants** (`STATS` in `constants.ts`), not
    live numbers.
  - Optional `TickerStrip` (reuse [`src/components/TickerStrip.tsx`](../../src/components/TickerStrip.tsx)
    with `show centered`) — the template gates it behind a `showTicker` prop defaulting true; include
    it.
- **Pricing** (`id="pricing"`, `bg-mkt-surface-alt text-mkt-text`, `border-b`): mono eyebrow
  "Pricing" (`text-mkt-accent`); an `h2` "One product. Four ways to pay." (`text-mkt-heading`) with a
  supporting paragraph; a **trial banner** (rounded, accent-tinted:
  `bg-[color-mix(in_oklab,#4ea8ff_10%,white)] border border-[color-mix(in_oklab,#4ea8ff_38%,transparent)]`)
  with a `{TRIAL_DAYS} DAYS FREE` pill (bg `#298bea`, white text) and the "first registration comes
  with a {TRIAL_DAYS}-day free trial" copy; then the **`grid-cols-4` gap-4** of `PlanCard`s from
  `buildPlanViews(usePlans().data)`; a mono footnote "all plans · 500+ tickers · custom rules ·
  charts · oi alerts · voice notifications".
- **Features** (`id="features"`, `bg-mkt-surface text-mkt-text`): mono eyebrow "What you get"; `h2`
  "Your thresholds. Your tickers. Sub-second."; a `grid-cols-3 gap-4` of **6 static feature cards**
  (`bg-mkt-card border border-mkt-border rounded-[10px] p-6`), each an icon/glyph + mono uppercase
  label + body paragraph. The six (label → glyph, from the template) live as a `FEATURES` constant:
  Live order books (rotated accent square), Rules you define (rotated square), Charts (`▁▃▂▅▇`
  sparkline, `text-mkt-accent`), Open interest alerts (`▲`, `text-mkt-positive`), Voice notifications
  (`◉`), Built for volume (`<1s`).
- **CTA** (dark, `border-t border-border-subtle`, centered, 80px pad): mono eyebrow "Get started";
  `h2` "Start with {TRIAL_DAYS} days free." (`text-text`); subcopy; the auth-aware CTA pair (§9/§10).
- **Footer** (`border-t`, `flex justify-between`, 24px pad): `BrandMark` +
  "© 2026 screener · real-time market data · 20+ exchanges" (mono 10px `text-text-dim`).

### 8.2 `OrderBookPreview.tsx` — decorative animated book

A self-contained visual flourish that **mimics** an order book; it is **not** wired to the real WS
feed or the `orderbookStore`. It holds ~5 asks + 5 bids + a mid price in **local React state** and, on
a `setInterval` (~1400ms, exactly as the template), jitters sizes/mid to look alive. This is the one
place continuous React state updates are fine — 10 rows every 1.4s is trivial, and CLAUDE.md's
"keep the firehose out of React" rule is explicitly about the *real* order-book surface, which this is
not. Details to preserve from the template:

- Card chrome: `bg-surface border border-border rounded-[14px]`, soft shadow, header row with
  `BTCUSDT` + `PERP · BINANCE` (mono) and a `LIVE` pill (accent-tinted).
- Column header (`Price / Size / Depth`), then the rows block on `bg-input` with a dashed mid-price
  divider between asks (`text-danger`) and bids (`text-bid`); each row shows price, size, and a depth
  bar (`width: <pct>%`, tier-tinted via `color-mix`), with an occasional `SIG` badge on a
  "significant" level.
- Footer microcopy "classified by your rules · streamed in &lt;1s".
- **Respect `prefers-reduced-motion`**: when set, skip the interval and render a static snapshot
  (accessibility; cheap `matchMedia` check in the effect). Clean up the interval on unmount.

### 8.3 `PlanCard.tsx`

Props: `{ plan: PlanView; onStart: (code: string) => void }`. Presentational — all formatting already
done in the catalog. Layout (light tokens): `flex flex-col rounded-[14px] p-[22px]`; highlighted card
gets `border-2 border-accent` + the tinted bg, others `border border-mkt-border bg-mkt-surface`. Top
row: name (mono uppercase `text-mkt-text-secondary`) + optional badge (accent style → `bg-mkt-badge
text-white`, muted style → `bg-[rgba(10,14,20,.07)] text-mkt-text-secondary`). Then price (mono 26px
`text-mkt-heading`), unit (mono uppercase `text-mkt-text-muted`), the description (`flex-1` so buttons
align across cards), the per-day line, and the **`Button`** ("Start now", `variant` = `primary` for
the highlighted plan else `outline`, `fullWidth`) whose `onClick` calls `onStart(plan.code)`.

Reuse the existing [`Button`](../../src/components/Button.tsx) everywhere. Note its `primary`/`outline`
variants use the *dark-theme* accent tokens; on the white pricing background the outline variant
(accent border + accent text) still reads fine — verify visually, and if the outline's hover
(`bg-accent/10`) looks off on white, that's a small variant tweak, not a redesign.

## 9. Auth-aware navigation (`useLandingNav.ts`)

One hook centralizes every CTA's destination, reading auth state from the session store
(`useSession((s) => s.status === 'authenticated')`) and returning stable handlers:

```ts
export function useLandingNav() {
  const navigate = useNavigate();
  const isAuthed = useSession((s) => s.status === 'authenticated');
  return {
    isAuthed,
    signIn:        () => navigate('/login'),
    createAccount: () => navigate('/register'),
    startTrial:    () => navigate('/register'),
    goDashboard:   () => navigate('/dashboard'),
    startPlan: (code: string) =>
      isAuthed
        ? navigate(`/billing/checkout?plan=${encodeURIComponent(code)}`)
        : navigate(`/register?plan=${encodeURIComponent(code)}`),   // ?plan preserved for a future resume-after-signup; RegisterPage ignores it today
  };
}
```

The `?plan=` on the anonymous branch is a cheap forward-looking breadcrumb — `RegisterPage` doesn't
read it yet, and wiring "resume checkout after signup" is out of scope.

## 10. Auth-adaptive header & CTAs (`LandingHeader.tsx`, `CtaSection.tsx`)

`LandingHeader` — sticky, `bg-[rgba(6,8,12,.82)] backdrop-blur border-b border-border-subtle`,
`flex items-center justify-between px-8 py-[14px]`:

- Left: `BrandMark`.
- Center: nav — "Pricing" → `#pricing`, "Features" → `#features` (mono, uppercase, `text-text-muted`
  hover `text-text`), shown in **both** auth states.
- Right, **auth-aware** (locked §2.2):
  - **anonymous**: `Button variant="outline"` "Sign in" → `signIn`; `Button variant="primary"`
    "Create account" → `createAccount`.
  - **authenticated**: a single `Button variant="primary"` "Go to dashboard" → `goDashboard`.

`CtaSection` mirrors the same rule: anonymous → "Create account" (primary) + "Sign in" (outline);
authenticated → "Go to dashboard" (primary). The Hero's primary CTA follows suit — anonymous shows
"Start {TRIAL_DAYS}-day free trial" (→ `startTrial`), authenticated shows "Go to dashboard"; the
"See pricing" scroll button is shown in both.

## 11. Stub checkout route (`CheckoutStubPage.tsx`)

Lives in `features/billing/pages/`, mounted at `/billing/checkout` behind `ProtectedRoute` (so a
direct anonymous hit is bounced to `/login`). It reads `?plan=CODE` via `useSearchParams`, looks the
code up in the catalog (`buildPlanViews`) to show the chosen plan's name + price, and renders a
simple centered card: "Payment coming soon" + the selected plan summary + a "Back to pricing" link
(`/#pricing`) and a "Go to dashboard" link. No network calls. This is the seam the real payment flow
drops into later. If `plan` is missing/unknown, show a neutral "choose a plan" message linking back
to `/#pricing`.

## 12. Edge cases

- **Plans API down / slow** → fallback-first render shows all four cards with known prices; no spinner,
  no layout shift (§2.4).
- **Successful response omits a known code** → that card is dropped (don't sell a discontinued plan).
- **Response includes an unknown code** → ignored (no copy to render).
- **Authenticated user on `/`** → landing renders with the "Go to dashboard" header after the normal
  SessionGate bootstrap; acquisition CTAs never shown to them.
- **Anonymous deep-link to `/billing/checkout`** → `ProtectedRoute` → `/login`.
- **`?plan` missing/garbage on the stub** → neutral fallback, link back to pricing.
- **`prefers-reduced-motion`** → the hero preview animation is disabled, static snapshot shown.
- **Anchor nav under the sticky header** → `scroll-mt` on the section ids prevents the header from
  covering the heading.

## 13. Implementation phases

Three phases, continuing the repo's "Phase N" multi-session convention. **Each phase is one AI
session** and must end green: `npm run typecheck` passes, the app still runs, and a single commit is
made (continuing the `Phase N` message style). The ordering is deliberate — every phase leaves the
app compiling **and usable**, so there is never a half-broken intermediate state.

> **If you are an AI session implementing this:** read the whole plan for context, but implement
> ONLY your assigned phase. Do not start work belonging to a later phase.

### Phase 1 — Foundations (no landing UI, `/` stays working)

Low-risk plumbing with no visual surface of its own.

- Add the `--color-mkt-*` marketing token group to `index.css` (§5). (Unused until Phase 3 — that's
  fine; it compiles and ships nothing visible.)
- Build the **billing data layer** (§6): `schemas.ts`, `api.ts`, `queries.ts`, plus the presentation
  `catalog.ts` (§7) and the module `index.ts` barrel.
- Build + route the **checkout stub** (§11): `CheckoutStubPage.tsx` at `/billing/checkout` behind
  `ProtectedRoute`.
- **Routing, partial (§4):** add the `/dashboard` route (`ProtectedRoute → DashboardPage`); repoint
  the two existing redirects to it (`LoginPage`'s post-login `navigate('/dashboard')` and
  `PublicRoute`'s authed bounce to `/dashboard`). **Leave `/` pointing at the protected
  `DashboardPage` for now** — do NOT swap it to a `LandingPage` that doesn't exist yet. So after
  Phase 1, `DashboardPage` is reachable at both `/` and `/dashboard`; that harmless duplication is
  removed in Phase 2.

End state: app behaves as before (login → dashboard), plus a public `usePlans()` and a working
`/billing/checkout` stub. Nothing marketing-facing yet.

### Phase 2 — Landing shell, dark sections (`/` goes public)

The page becomes real and takes over `/`.

- `useLandingNav` (§9); `LandingHeader` (auth-aware, §10); `HeroSection` + `OrderBookPreview`
  (§8.1–8.2) + `StatsRow` + the reused `TickerStrip`; `CtaSection` (auth-aware); `LandingFooter`;
  `LandingPage.tsx` composing them (with the Pricing/Features sections either omitted or stubbed as
  empty `<section id>` placeholders so anchor links resolve); the `landing/index.ts` barrel.
- **Finish routing (§4):** swap `/` to the **public, unguarded** `LandingPage`, removing the
  temporary protected `/` from Phase 1. `/dashboard` remains the only dashboard route.

End state: the marketing page is live at `/` for everyone, header/CTAs adapt to auth, everything
navigates — only Pricing and Features are still placeholders.

### Phase 3 — Light sections + polish

- `PricingSection` (light) + `PlanCard` wired to `usePlans()` + `buildPlanViews` (§7, §8.1, §8.3),
  including the trial banner.
- `FeaturesSection` (light, 6 static cards, §8.1).
- Polish: `scroll-mt` anchor offsets, `prefers-reduced-motion` on the hero preview, and a visual pass
  of `Button` on the white pricing background (§8.3).

End state: the full page per the template.

Verification per CLAUDE.md, every phase: `npm run typecheck` (or `npm run build`) after the work;
**no** Playwright/browser automation — the product owner tests manually against the real backend.

Ready-to-paste session prompts for each phase are kept out of this file; see the handoff message.

## 14. Deliberately deferred

- Real payment flow + access-state gating + "choose plan on expired trial" landing (the stub is the
  placeholder).
- Consuming `?plan=` after signup to resume checkout (breadcrumb is planted, not read).
- Strict-source-of-truth pricing (skeleton-while-loading instead of fallback-first) — a one-component
  swap in `PricingSection` if the product owner prefers it over §2.4.
- Computing the yearly "SAVE %" badge from live amounts (static copy for now).
- Trial length from the backend (constant for now).
- Mobile / responsive breakpoints (desktop-first, consistent with the rest of the app).

## 15. Note on the template artifact

Unlike the dashboard plan (which references committed `.claude/design/*.dc.html` files), the raw
`Screener Landing.dc.html` is **not** copied into the repo. The template body is HTML-entity-escaped
when read through the MCP, and hand-decoding 26 KB risks introducing a subtly corrupted "source of
truth." Every value needed to build the page is captured in this plan; the authoritative markup is
one `claude-design` `read_file` away (project id in the header). If a committed copy is later wanted,
fetch it fresh and decode entities in a single pass (`&lt;`/`&gt;`/`&quot;` first, then `&amp;`) to
avoid double-unescaping the template's own `&lt;1s` literals.
```
