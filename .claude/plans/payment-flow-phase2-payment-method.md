# Plan: Payment flow — Phase 2 (Payment Method + create order)

> Status: proposed (not yet implemented). Written 2026-07-10.
>
> Second slice of the Monetization feature (CLAUDE.md §Features 4). Builds the **Payment Method**
> page — the screen between plan selection and Multicard's hosted checkout. This is the phase that
> **creates a real order** (`POST /api/billing/orders`) and **redirects the browser to Multicard**.
> The two funnel-front pages ([`ChoosePlanPage`](../../src/features/billing/pages/ChoosePlanPage.tsx),
> [`PayByDaysPage`](../../src/features/billing/pages/PayByDaysPage.tsx)) already exist from Phase 1 but
> currently dead-end at `/`; this phase rewires them into the Payment Method page.
>
> The **payment-status / polling page** (`Payment Status.dc.html`, the `return_url` target that polls
> `GET /orders/current`) is the **next** phase and is out of scope here. This phase terminates by
> handing the browser to `checkoutUrl`.
>
> Design source of truth (Claude Design project "Payment Flow Pages",
> `3421e9af-577b-424f-a7f7-e73ea0c941ef`):
> - `Payment Method.dc.html` — method list (Multicard only) + sticky order summary + sticky pay bar.
> - `uploads/multicard.svg` — the Multicard brand logo asset (must be copied into the repo, §9).
>
> API contract: [`monetization-api.md`](../docs/monetization-api.md) §4.3 (Orders) and
> [`payment-flow-frontend.md`](../docs/payment-flow-frontend.md) §3.1 / §3.4.
>
> Existing code reused:
> - [`billing/catalog.ts`](../../src/features/billing/catalog.ts) — `buildPlanViews()` for the fixed-plan
>   summary (name, amount, duration, per-day rate). Reused verbatim.
> - [`billing/queries.ts`](../../src/features/billing/queries.ts) — `usePlans()`, `usePayAsYouGoDays()`
>   (the latter re-derives the day count for the pay-as-you-go summary).
> - [`billing/components/BillingHeader.tsx`](../../src/features/billing/components/BillingHeader.tsx) — shared header.
> - [`auth`](../../src/features/auth/index.ts) — `useMe` (access-until base), and a newly-exported
>   `withAuth` (§5) for the authenticated order POST.

## 1. Goal

One new authenticated page:

**Payment Method** (`/billing/payment?plan=CODE[&amount=N]`) — shows the available payment methods
(only **Multicard** is live; the rest are disabled "coming soon" placeholders per the design),
plus an **order summary** on the right reflecting the plan the user chose. Clicking
**"Pay with Multicard →"**:

1. `POST /api/billing/orders` with `{ planCode }` (fixed) or `{ planCode, amount }` (pay-as-you-go).
2. On `200`, read `checkoutUrl` from the response and **redirect the same tab**:
   `window.location.assign(checkoutUrl)`.

And two rewires so the page is actually reachable:
- `ChoosePlanPage` fixed-plan selection → `/billing/payment?plan=CODE` (was `/`).
- `PayByDaysPage` "Continue to payment" → `/billing/payment?plan=pay_as_you_go&amount=<amount>` (was `/`).

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| **How the selected plan reaches this page** | **URL query params** — `?plan=CODE` and, for pay-as-you-go, `&amount=<digits>`. | Survives reload/direct-hit, shareable, and matches the existing `CheckoutStubPage?plan=CODE` convention. React Router `state` was rejected: it evaporates on reload and can't be recovered after the Multicard round-trip. |
| **Method selection UX** | **Multicard pre-selected and fixed.** Render the "coming soon" grid (Visa/Mastercard, Apple Pay, Kaspi, PayPal, МИР, Crypto) as static disabled placeholders exactly as the design does. No real "pick a method" state machine — there is only one method. | Only Multicard is supported; the design already pre-selects it. A selection state for a single option is dead weight. |
| **Pay-as-you-go summary derivation** | Re-derive days from `amount` via `usePayAsYouGoDays(amount)` (already built). Total = the entered `amount`. | Single source of truth for the day count (same authoritative endpoint the Pay by Days page used); avoids threading a `days` param that could drift from `amount`. |
| **"Access until" semantics** | Reuse `PayByDaysPage`'s exact derivation: extend from the user's current `accessExpiresAt` (via `useMe`) if it hasn't lapsed, else from today. | Consistency with Phase 1; correct stacking behaviour. |
| **Redirect** | `window.location.assign(checkoutUrl)` — **same tab**, per the task. Never a new tab/window. | Requirement. The backend never sends a 302 (`monetization-api.md` §4.3) — the SPA owns the redirect. |
| **409 on create** | **Auto-retry the POST once** (covers the lost one-open-order race, `monetization-api.md` §4.3 / N8). If it still fails, surface the backend `message` inline (safe 4xx copy). | The race retry is explicitly wanted. Full renewal-gate (N1) UX needs entitlement state that isn't wired client-side yet — deferred (§10). |
| **Route** | New `/billing/payment` behind `ProtectedRoute`. `CheckoutStubPage` at `/billing/checkout` is **left untouched**. | Keeps the stub as-is; the new page is the real seam. |
| **Currency** | Hardcoded **`UZS`** in display (`totalFmt … UZS`), consistent with the catalog fallback and Phase 1. The POST sends **no** currency (server-resolved). | Single live currency; server owns resolution. |

## 3. Backend contract (new consumption)

### `POST /api/billing/orders` — Bearer JWT (`monetization-api.md` §4.3)

Request body (`CreateOrderRequest`):
```jsonc
{ "planCode": "monthly" }                              // FIXED plan
{ "planCode": "pay_as_you_go", "amount": "790000" }    // amount is a STRING, major units
```
- Send **only** `planCode` (+ `amount` for pay-as-you-go). Never price/currency.
- `amount` is a **string** (avoids double precision loss); positive, ≤ 2 decimals for UZS. The Pay by
  Days input only produces integer digit strings, so passing that string through is already in-scope.

Response `200` = `OrderDetailsEntry` with `status: "PENDING"` and a usable `checkoutUrl`.

| Status | Meaning | Handling this phase |
|--------|---------|---------------------|
| `200` | Order created (or existing open order reused) | Redirect to `checkoutUrl`. If `checkoutUrl` is null (shouldn't happen on create), show a generic error. |
| `400` | Missing `planCode` / malformed / non-positive / over-scale `amount` | Inline error using the backend `message`. |
| `409` | One-open-order race **or** active-subscription renewal gate | Auto-retry once; if still 409, show `message` inline. Full N1 handling deferred (§10). |
| `401` / empty-body `403` | Not authenticated | Handled transparently by `withAuth` (refresh + retry once); if refresh fails the session clears and the route guard bounces to `/login`. |

We consume only `checkoutUrl` (redirect) and, defensively, `status` / `orderId`. The full
`OrderDetailsEntry` is validated (REST-must-be-Zod) but permissively (server-authored fields).

## 4. Files

### New
```
src/features/billing/
  pages/
    PaymentMethodPage.tsx     # /billing/payment — method list + order summary + create-order POST
  components/
    MethodOptionCard.tsx      # (optional) one "coming soon" placeholder tile; or inline the grid
  assets/
    multicard.svg             # copied from the design project's uploads/multicard.svg (§9)
```

### Edited
```
src/features/billing/schemas.ts   # + orderStatusSchema, orderDetailsSchema, CreateOrderRequest type
src/features/billing/api.ts       # + createOrder(body, signal) via withAuth; update the "NO store access" doc note
src/features/billing/queries.ts   # + useCreateOrder() mutation (retry-once-on-409)
src/features/billing/index.ts     # export PaymentMethodPage (+ new types if needed)
src/features/auth/session.ts      # export withAuth (was private)
src/features/auth/index.ts        # re-export withAuth from the barrel
src/features/billing/pages/ChoosePlanPage.tsx   # fixed plans → /billing/payment?plan=CODE
src/features/billing/pages/PayByDaysPage.tsx    # Continue → /billing/payment?plan=pay_as_you_go&amount=N
src/App.tsx                        # + one ProtectedRoute for /billing/payment
```

## 5. Data + auth layer changes

### 5.1 Expose `withAuth` (auth module)

The order POST needs a Bearer token with the standard refresh-on-401/403-then-retry-once behaviour.
That wrapper already exists as `withAuth` in [`session.ts`](../../src/features/auth/session.ts) but is
**private** (only `fetchMe`/`logout` use it). Make it public:

- `session.ts`: change `async function withAuth` → `export async function withAuth`.
- `auth/index.ts`: add `withAuth` to the session re-export block.

This keeps token orchestration in the auth layer: billing's `api.ts` delegates to `withAuth` and still
never touches the session store directly (it just hands `withAuth` a `(token) => request(...)` fn).
Update the `api.ts` header comment — it currently says "NO store access … all endpoints public"; the
new `createOrder` is the first authed billing call and routes its token through `withAuth`.

### 5.2 `schemas.ts` — order response + request types

```ts
// OrderStatus lifecycle (monetization-api.md §3). Permissive: server-authored enum.
export const orderStatusSchema = z.enum([
  'CREATED', 'PENDING', 'PAID', 'EXPIRED', 'FAILED', 'CANCELED', 'REVERTED',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

// OrderDetailsEntry (monetization-api.md §4.3). Only checkoutUrl/status/orderId are used
// this phase; the rest are validated loosely so contract drift on unused fields can't 500 the UI.
export const orderDetailsSchema = z.object({
  orderId: z.string(),
  status: orderStatusSchema,
  planCode: z.string(),
  amount: z.number(),
  accessDurationSeconds: z.number(),
  currency: z.string(),
  provider: z.string(),
  reason: z.string().nullable(),
  reasonDetail: z.string().nullable(),
  checkoutUrl: z.string().nullable(),
  providerUuid: z.string().nullable(),
  expiresAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});
export type OrderDetails = z.infer<typeof orderDetailsSchema>;

// Request body — amount only for pay-as-you-go, and only ever a string.
export interface CreateOrderRequest {
  planCode: string;
  amount?: string;
}
```

### 5.3 `api.ts` — authed create

```ts
import { withAuth } from '@/features/auth';
import { orderDetailsSchema, type OrderDetails, type CreateOrderRequest } from './schemas';

const ORDERS = '/api/billing/orders';

export const createOrder = (body: CreateOrderRequest, signal?: AbortSignal): Promise<OrderDetails> =>
  withAuth((token) =>
    request(ORDERS, { method: 'POST', body, token, schema: orderDetailsSchema, signal }),
  );
```
`withAuth` handles the 401/empty-403 refresh+retry; the 409 race retry lives at the mutation layer
(§5.4) so `createOrder` stays a single pure call.

### 5.4 `queries.ts` — the create-order mutation

```ts
import { useMutation } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { createOrder } from './api';
import type { CreateOrderRequest } from './schemas';

export function useCreateOrder() {
  return useMutation({
    mutationFn: (body: CreateOrderRequest) => createOrder(body),
    // Transparent retry for the lost one-open-order race (monetization-api.md §4.3 / N8).
    // A genuine renewal-gate 409 will simply 409 again and surface its message — acceptable
    // (one wasted call) until entitlement state lands to distinguish the two (§10).
    retry: (count, err) => count < 1 && err instanceof ApiError && err.status === 409,
  });
}
```
Add to `billingKeys` only if a query key is needed elsewhere; a mutation needs none.

## 6. `PaymentMethodPage.tsx`

Layout mirrors `Payment Method.dc.html` (inline styles → Tailwind semantic tokens):

**Read the selection from the URL**
```ts
const [params] = useSearchParams();
const planCode = params.get('plan') ?? 'monthly';
const amountStr = params.get('amount');                 // present only for pay-as-you-go
const amount = amountStr ? parseInt(amountStr, 10) : 0;
```

**Guard:** if `planCode === 'pay_as_you_go'` and `amount <= 0` → the summary can't be built; redirect
back to `/billing/pay-by-days` (or render a "choose an amount" empty state). If `planCode` is unknown,
degrade like `CheckoutStubPage` (neutral state + link back to `/billing/plans`).

**Summary view model**
- Fixed plan: `const plan = buildPlanViews(usePlans().data).find(p => p.code === planCode)`. Total =
  `plan.amount`; duration = `${durationDays} days`; per-day rate row hidden.
- Pay-as-you-go: `const { data } = usePayAsYouGoDays(amount)`. Total = `amount`; duration =
  `${data?.days} days`; **show** the per-day rate row (`paygPlan.price ${currency} / day`) as on the
  design (`showRate`).
- **Access until** — reuse `PayByDaysPage`'s derivation verbatim (base = `max(now, me.accessExpiresAt)`,
  `+ accessDays`, format `en-GB`/`en-US` `{ day:'2-digit', month:'short', year:'numeric' }`), where
  `accessDays = data?.days` (payg) or `durationDays` (fixed).

> Consider extracting the shared access-until math into a tiny helper (e.g. `computeAccessUntil(days, me)`)
> so `PayByDaysPage` and `PaymentMethodPage` don't drift. Optional — inline duplication is acceptable
> to match the existing style; flag it if the helper is preferred.

**Left column — methods**
- Eyebrow `Available now`.
- The **Multicard** card: `multicard.svg` logo tile (`#531EDC` bg), name + `Supported` badge (bid/green
  tint), sub-copy "Uzbek bank cards — UZCARD & HUMO. Charged in UZS. Instant activation.", and a filled
  radio (accent) since it's the selected/only method. Styled selected by default per the design.
- `Coming soon` label + `{n} more on the way`, then a 2-col grid of disabled dashed placeholder tiles
  from a local `SOON_METHODS` copy array (glyph + name + `Soon`). Static, `cursor-not-allowed`,
  `opacity-~0.6`. Optionally factor one tile into `MethodOptionCard`.

**Right column — order summary** (`sticky top-6`)
- Header `Order summary` + a `Change` link → `/billing/plans`.
- Plan name + optional badge (FLEXIBLE / SAVE 17% from the catalog), period label
  (`N days of full terminal access`, or the pay-by-days variant).
- Rows: `Duration`, `Access until` (bid/green), conditional `Rate`, `Method = Multicard`.
- Divider, then `You pay` → big mono `totalFmt` + `UZS`.
- Fine print: "You will be redirected to Multicard to complete payment securely. No auto-renewal —
  access ends when your subscription runs out."

**Sticky action bar** (fixed bottom, blurred — same chrome as `PayByDaysPage`)
- Left: `Multicard · {totalFmt} UZS · {planName}`.
- Right: `Cancel` (link → `/billing/plans`) + the pay button.

**Pay button**
```ts
const createOrder = useCreateOrder();

function onPay() {
  const body: CreateOrderRequest =
    planCode === 'pay_as_you_go' ? { planCode, amount: String(amount) } : { planCode };
  createOrder.mutate(body, {
    onSuccess: (order) => {
      if (order.checkoutUrl) window.location.assign(order.checkoutUrl);  // same tab
      else setError('Could not start checkout. Please try again.');
    },
  });
}
```
- Label `Pay with Multicard →`; while `createOrder.isPending` show `Redirecting…` and disable.
- On error, derive the message from the `ApiError` (`createOrder.error`) — the backend `message` is
  user-safe for 4xx (renewal-gate copy, bad amount, etc.); fall back to a generic line otherwise.
  Render it as an inline banner above the action bar (amber chrome like `PayByDaysPage`'s error row).
- The button stays disabled while pending; after a successful `assign` the page is navigating away so
  no success state is needed on this page (the `return_url` polling page is the next phase).

## 7. Rewire the two Phase-1 pages

**`ChoosePlanPage.tsx`** — `onChoose`:
```ts
function onChoose(code: string) {
  if (code === 'pay_as_you_go') navigate('/billing/pay-by-days');
  else navigate(`/billing/payment?plan=${code}`);   // was navigate('/')
}
```

**`PayByDaysPage.tsx`** — the "Continue to payment →" button (currently `onClick={() => navigate('/')}`):
```ts
onClick={() => navigate(`/billing/payment?plan=pay_as_you_go&amount=${amount}`)}
```
`amount` is the already-validated positive integer in state; `canContinue` still gates the button, so
we never navigate with a zero/invalid amount. Update the stale doc comments in both files that say
"navigates to /" / "payment-method page isn't built yet".

## 8. Routing (`App.tsx`)

Add one guarded route beside the existing billing routes:
```tsx
<Route
  path="/billing/payment"
  element={<ProtectedRoute><PaymentMethodPage /></ProtectedRoute>}
/>
```
Import `PaymentMethodPage` from `@/features/billing` (add to the barrel `index.ts`).

## 9. Multicard asset

The design references `uploads/multicard.svg` (a 3-path violet/orange "M" mark, `#531EDC` rounded
square). Copy that SVG into the repo — recommended `src/features/billing/assets/multicard.svg` and
import it as a URL (`import multicardLogo from '../assets/multicard.svg'`; Vite returns the asset URL),
used in an `<img>` inside the logo tile, matching the design's `<img src="uploads/multicard.svg">`.

There is no `public/` or `src/assets/` dir today, so this creates the first bundled image asset. An
inline `<MulticardLogo/>` React component (the same 3 `<path>`s) is an acceptable alternative that
avoids the asset pipeline entirely — pick one; the asset-import route is closer to the design.

## 10. Known simplifications / follow-ups (deferred)

- **Renewal gate (N1) not fully modelled.** We don't yet read `GET /api/billing/entitlement`, so fixed
  plans aren't proactively disabled for an active-beyond-window user, and a renewal-gate `409` is shown
  as a generic inline message rather than the "You're covered until *date*" informational state. Land
  this when entitlement state is wired (it also drives the app-shell paywall, `payment-flow-frontend.md`
  §5.9). The 409 auto-retry harmlessly costs one extra call in that case.
- **No in-flight recovery.** This phase doesn't check `GET /api/billing/orders/current` on load, so a
  user with an existing open order isn't offered "resume unfinished payment" (N3/N4). That belongs with
  the payment-status page.
- **Payment-status / polling page is the next phase.** After `window.location.assign(checkoutUrl)`, the
  user pays on Multicard's hosted page and returns to a `return_url` we haven't built yet. Building that
  page (`Payment Status.dc.html` → poll `orders/current`, resolve on `PAID`, refetch entitlement, time
  out on prolonged `PENDING`) is out of scope here.
- **`amount` scale.** The Pay by Days input only emits integer digit strings, so the ≤2-decimal UZS
  rule is satisfied structurally; no extra client-side decimal validation is added this phase.

## 11. Verification

- `npm run typecheck` must pass (the only automated gate — no lint/test runner).
- Manual (user-driven, per CLAUDE.md — no Playwright):
  - From `/billing/plans`, choosing a **fixed** plan → `/billing/payment?plan=CODE`; summary shows the
    right name, duration, access-until, total; Multicard shown as the sole live method.
  - From `/billing/pay-by-days`, "Continue to payment" → `/billing/payment?plan=pay_as_you_go&amount=N`;
    summary shows N-days duration + per-day rate row + total = entered amount.
  - "Pay with Multicard →" issues `POST /api/billing/orders` and the tab navigates to the returned
    `checkoutUrl`. A `4xx` shows the backend message inline without leaving the page.
  - Direct hit `/billing/payment` with a missing/invalid `plan`/`amount` degrades gracefully (redirect
    back or neutral state), and an anonymous hit is bounced to `/login` by `ProtectedRoute`.

## 12. Out of scope (restated)

Payment-status/polling page, `return_url` handling, entitlement/access-state reads, the renewal-gate
informational UX, in-flight order recovery (`orders/current`), receipts, order history, and any change
to `CheckoutStubPage`.
