# Plan: Payment flow — Phase 1 (Choose Plan + Pay by Days)

> Status: proposed (not yet implemented). Written 2026-07-10.
>
> First slice of the Monetization feature (CLAUDE.md §Features 4). Builds the two front pages of the
> payment funnel — plan selection and the pay-as-you-go top-up amount editor. The **real payment
> redirect, the payment-method page, and the payment-status/polling screen are out of scope** and
> deliberately terminate at `/` (a placeholder) for now.
>
> Design source of truth (Claude Design project "Payment Flow Pages",
> `3421e9af-577b-424f-a7f7-e73ea0c941ef`):
> - `Choose Plan.dc.html` — plan grid + two-step selection + sticky "Continue to payment" bar.
> - `Pay by Days.dc.html` — amount editor + days result + sticky continue bar.
> - (`Payment Method.dc.html` and `Payment Status.dc.html` exist in that project but are **not** part
>   of this phase.)
>
> Existing code reused (already built):
> - [`billing/catalog.ts`](../../src/features/billing/catalog.ts) — `buildPlanViews()` merges the API
>   response with fallback copy into ordered `PlanView[]`. Reused verbatim for Choose Plan.
> - [`billing/queries.ts`](../../src/features/billing/queries.ts) — `usePlans()` (public, no JWT).
> - [`billing/api.ts`](../../src/features/billing/api.ts) / [`schemas.ts`](../../src/features/billing/schemas.ts) — the `request()` + Zod pattern to extend.
> - [`components/Button.tsx`](../../src/components/Button.tsx), [`TextField.tsx`](../../src/components/TextField.tsx), [`BrandMark.tsx`](../../src/components/BrandMark.tsx).
> - [`auth`](../../src/features/auth/index.ts) — `useMe`, `logout` for the header.

## 1. Goal

Two new authenticated pages:

1. **Choose Plan** (`/billing/plans`) — a 4-card plan grid (from the live catalog, fallback-first).
   Clicking a card **selects** it (highlight + sticky bottom bar); "Continue to payment" then routes:
   - `pay_as_you_go` → **`/billing/pay-by-days`**
   - every other plan → **`/`** (placeholder for the not-yet-built payment-method page).

2. **Pay by Days** (`/billing/pay-by-days`) — the pay-as-you-go top-up editor. User types an amount;
   we call the backend to convert it to days; we show the day count; "Continue to payment" → **`/`**.

## 2. Locked decisions (from the design Q&A)

| Decision | Choice |
|---|---|
| **Choose Plan interaction** | **Two-step, per the template.** Click a card → it highlights as *Selected* and a sticky bottom bar appears with `Cancel` + `Continue to payment →`. Navigation happens on **Continue**, not on card click. |
| **Pay by Days breakdown depth** | **Minimal.** The API returns only `{ days }`, so we render the big day count + an **"Access until = today + days"** line and nothing else. We drop the template's daily-rate / you-pay / leftover rows (the `{ days }` response can't populate them). |
| **"Access until" semantics** | **`today + days` (hardcoded derivation).** Acknowledged-inaccurate: a user topping up *on top of existing access* would really extend from their current expiry, not today. Accepted as a simplification for this phase — noted in §9. |
| **Routes** | New paths **`/billing/plans`** and **`/billing/pay-by-days`**, both behind `ProtectedRoute`. The existing `CheckoutStubPage` at `/billing/checkout` is **left untouched**. |
| **Currency** | Hardcoded **`UZS`** on the days call, matching the catalog's `CURRENCY_FALLBACK`. |

Additional defaults chosen here (low-stakes, stated for the record):

- **Amount input model** (ported from the template): store the raw digit string in state, strip
  non-digits on input, cap at 12 digits, and display it grouped (`Intl.NumberFormat('en-US')`).
  `inputmode="numeric"`, spinners hidden. This is how the design guards against non-numeric/negative
  input structurally — you *cannot type* a minus sign or decimal, so "zero or negative" collapses to
  just "empty / zero", handled below.
- **Zero/empty guard**: amount `<= 0` never calls the API — the days panel shows a neutral `—` and
  the Continue button is disabled. No error banner for empty (only for a *failed* call on a real
  amount).
- **Debounced fetch**: the days call fires on a **350 ms debounce** of the typed amount, not per
  keystroke, so a fast typist doesn't spray requests. React Query keys on the debounced amount.
- **`days === 0` from a successful call** (a real amount too small for a full day) is treated as
  "can't continue": Continue stays disabled, days panel shows `0`. Not an error.
- **Quick-amount chips** (50k / 100k / 300k / 500k / 1M) are kept from the template — they only set
  the amount and need no per-day price, so they survive the "minimal" trim.
- **Trial banner** (`showTrialBanner` in the template) is **omitted** — we don't track trial state on
  the client yet. Can be added when access-state lands (feature 4, later phase).

## 3. Backend contract

### 3.1 Existing (already consumed)
`GET /api/billing-catalog/plans` → `{ currency, plans[] }`. Public. Owned by `usePlans()`.

### 3.2 New
```
GET /api/billing-catalog/pay-as-you-go/days?currency=UZS&amount=<amount>
→ 200 { "days": 5 }
```
- **Amount** = the user's entered integer. **Currency** = hardcoded `UZS`.
- **Assumed public** (no JWT), consistent with `/plans` living in the same `/billing-catalog`
  namespace and taking no token. If the backend actually returns 401/403, the fix is to route this
  through the session layer's `withAuth()` (as the auth module does) rather than `request()` directly
  — flagged in §9 so it's a one-line pivot, not a redesign.
- **Any failure** (non-2xx, network, schema mismatch) → the generic user message
  *"Invalid amount — try entering a different amount."* We do **not** surface the raw `ApiError`
  message here (unlike auth), because per the spec every failure reason collapses to the same hint.

## 4. Files

### New
```
src/features/billing/
  pages/
    ChoosePlanPage.tsx        # /billing/plans — grid + selection + sticky bar
    PayByDaysPage.tsx         # /billing/pay-by-days — amount editor + days result
  components/
    BillingHeader.tsx         # shared slim header (BrandMark + email + Sign out) for both pages
    PlanChoiceCard.tsx        # one selectable plan card (billing-local; NOT landing's PlanCard)
  useDebouncedValue.ts        # tiny generic debounce hook (350 ms) used by PayByDaysPage
```

### Edited
```
src/features/billing/schemas.ts   # + payAsYouGoDaysSchema
src/features/billing/api.ts       # + fetchPayAsYouGoDays(amount, signal)
src/features/billing/queries.ts   # + usePayAsYouGoDays(amount)
src/features/billing/index.ts     # export the two new pages (+ types if needed)
src/App.tsx                        # + two ProtectedRoutes
```

> **Why a billing-local `PlanChoiceCard` and not landing's `PlanCard`:** landing's card
> (`features/landing/components/PlanCard.tsx`) hard-codes a single-CTA "Start now" and has no
> selected/ring state. Reaching from `billing` into `landing` would also invert the dependency
> direction (landing already depends on billing's `buildPlanViews`). The catalog's `PlanView` is the
> shared surface; the card chrome is not.

## 5. Data layer changes (schemas → api → queries)

**`schemas.ts`** — add alongside the existing plan schemas:
```ts
export const payAsYouGoDaysSchema = z.object({
  days: z.number().int().nonnegative(),
});
export type PayAsYouGoDays = z.infer<typeof payAsYouGoDaysSchema>;
```

**`api.ts`** — add a pure function over `request()`, currency baked in:
```ts
export const fetchPayAsYouGoDays = (amount: number, signal?: AbortSignal): Promise<PayAsYouGoDays> => {
  const qs = new URLSearchParams({ currency: 'UZS', amount: String(amount) });
  return request(`${BASE}/pay-as-you-go/days?${qs}`, {
    method: 'GET',
    schema: payAsYouGoDaysSchema,
    signal,
  });
};
```

**`queries.ts`** — add a query hook, gated on a positive amount so `0`/empty never hits the network:
```ts
export const billingKeys = {
  all: ['billing'] as const,
  plans: ['billing', 'plans'] as const,
  paygDays: (amount: number) => ['billing', 'payg-days', amount] as const, // NEW
};

export function usePayAsYouGoDays(amount: number) {
  return useQuery({
    queryKey: billingKeys.paygDays(amount),
    queryFn: ({ signal }) => fetchPayAsYouGoDays(amount, signal),
    enabled: amount > 0,          // never fires for zero/empty (the guard)
    staleTime: 5 * 60_000,        // amount→days is a stable conversion; cache it
    retry: false,                 // a bad amount shouldn't retry-storm; fail straight to the hint
  });
}
```
> `enabled: amount > 0` is the load-bearing guard: React Query simply doesn't run the query for a
> non-positive amount, so `data`/`isError` stay clean and the page shows the neutral `—` state.

## 6. `ChoosePlanPage.tsx`

Structure mirrors `Choose Plan.dc.html` (translated to Tailwind semantic tokens):

- `BillingHeader` (§8) at the top.
- Eyebrow `Billing · Choose a plan`, title *"Pick how you want to pay."*, intro paragraph.
- `const { data } = usePlans(); const plans = buildPlanViews(data);` — **fallback-first**, exactly
  like `PricingSection`: cards render instantly from fallbacks and live amounts swap in on resolve.
- 4-column grid (`grid-cols-4`, `items-stretch`) of `PlanChoiceCard`, each given the `PlanView` plus:
  - `selected: boolean` (`plan.code === selectedCode`)
  - `onSelect: () => setSelectedCode(plan.code)`
  - CTA label from the template: highlighted card → **"Start now"**, others → **"Choose plan"**.
- Local state: `const [selectedCode, setSelectedCode] = useState<string | null>(null)`.
- Sticky bottom bar (rendered only when `selectedCode`): shows the selected plan's name + price +
  unit, a `Cancel` (→ `setSelectedCode(null)`), and `Continue to payment →`:
  ```ts
  function onContinue() {
    if (!selectedCode) return;
    if (selectedCode === 'pay_as_you_go') navigate('/billing/pay-by-days');
    else navigate('/');   // placeholder: payment-method page not built yet
  }
  ```
- `useNavigate()` from react-router-dom.

**Visual note (matches the template + landing):** the highlighted card (`plan.highlight`, always
`pay_as_you_go`) gets the amber `--color-warning` ring + tinted bg + amber CTA; the selected card
additionally gets a stronger ring/tint so "which one is picked" is unambiguous. Reuse the existing
`color-mix` values already proven in `landing/components/PlanCard.tsx`.

## 7. `PayByDaysPage.tsx`

Two-panel layout from `Pay by Days.dc.html`, trimmed to the minimal breakdown:

**State & derivation**
```ts
const [amountStr, setAmountStr] = useState('');           // raw digits only
const amount = amountStr ? parseInt(amountStr, 10) : 0;    // NaN-safe (digits-only guarantees int)
const debouncedAmount = useDebouncedValue(amount, 350);
const { data, isFetching, isError } = usePayAsYouGoDays(debouncedAmount);
const days = amount > 0 && !isError ? (data?.days ?? null) : null;
```

**Left panel — amount editor**
- `UZS` prefix + a right-aligned mono `<input>` bound to `amountStr`; `onInput` strips non-digits,
  caps 12 chars; displays grouped via `Intl.NumberFormat`. (Kept as a bespoke input, not `TextField`,
  because of the currency prefix + big right-aligned mono styling in the template.)
- Quick chips row (50k / 100k / 300k / 500k / 1M) → each sets `amountStr`.

**Right panel — result**
- Big mono day count: `days ?? '—'`, with `day`/`days` pluralization; amber when `days >= 1`, dim
  otherwise. While `isFetching` on a positive amount, show a subtle loading treatment (dim the number
  / `…`) rather than flashing stale data.
- `Access until` line = `today + days` (only when `days >= 1`):
  ```ts
  const end = new Date(); end.setDate(end.getDate() + days);
  const label = end.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  ```

**Error state**
- When `isError` (real amount, failed call): show the generic banner
  *"Invalid amount — try entering a different amount."* (amber, same chrome as the template's MIN-1-DAY
  banner). Days panel falls back to `—`.

**Sticky bottom bar**
- Left: `chargeFmt UZS → N days` summary (charge = the entered amount).
- Right: `Cancel` (link → `/billing/plans`) + `Continue to payment →`.
- `Continue` disabled unless `days != null && days >= 1`; on click → `navigate('/')`.

## 8. `BillingHeader.tsx`

Both templates share a slim header (brand left; `email` + divider + `Sign out` right). Build one
small component so the two pages don't duplicate it:
- `<BrandMark />` (existing component) on the left.
- `useMe()` for the email (`me.data?.email`, falls back to blank if not yet loaded — don't block).
- `Sign out` → the same `logout()` + `navigate('/login', { replace: true })` shape as
  `DashboardHeader.onLogout()`.

Keep it presentation-light; it's a chrome header, not the dashboard's functional one.

## 9. Known simplifications / follow-ups (explicitly deferred)

- **"Access until" is `today + days`**, which is wrong for a user topping up on top of remaining
  access — real expiry should extend from their current end date. Correct once access-state/`/me`
  billing fields exist (feature 4, later).
- **Non-pay-by-days plans dead-end at `/`.** The payment-method page (`Payment Method.dc.html`) and
  status/polling page (`Payment Status.dc.html`) are the next phases; `/` is a deliberate stub.
- **`pay-as-you-go/days` assumed public.** If it 401/403s, switch `fetchPayAsYouGoDays` to go through
  `withAuth()` (session layer) instead of raw `request()`.
- **No real charge.** "Continue to payment" navigates only; no order is created. The existing
  `CheckoutStubPage` is untouched and not part of this funnel yet.
- **Entry point:** these pages are reachable by direct URL after this phase. Rewiring the landing
  "Start now" CTA (`useLandingNav.startPlan`) and/or a dashboard "Upgrade" affordance to point at
  `/billing/plans` is a **small optional follow-up**, intentionally left out to keep this phase to the
  two pages + their routes. (If desired, it's a one-line change in `useLandingNav.ts`.)

## 10. Routing (`App.tsx`)

Add two guarded routes next to the existing `/billing/checkout`:
```tsx
<Route path="/billing/plans" element={<ProtectedRoute><ChoosePlanPage /></ProtectedRoute>} />
<Route path="/billing/pay-by-days" element={<ProtectedRoute><PayByDaysPage /></ProtectedRoute>} />
```
Import both from `@/features/billing` (add to the barrel `index.ts`).

## 11. Verification

- `npm run typecheck` must pass (the only automated gate — no lint/test runner).
- Manual (user-driven, per CLAUDE.md — no Playwright): from `/billing/plans`, select each plan →
  sticky bar shows correct name/price; `pay_as_you_go` → `/billing/pay-by-days`, others → `/`. On
  Pay by Days: typing a valid amount shows a day count + access-until; empty/zero → `—` + disabled
  Continue; a failing amount → generic banner; Continue → `/`.

## 12. Out of scope (restated)

Payment-method selection, real hosted-payment redirect, payment-status polling, access-state
reflection, trial-state banner, and any change to `CheckoutStubPage` or landing/dashboard entry CTAs.
