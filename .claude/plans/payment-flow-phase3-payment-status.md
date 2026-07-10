# Payment Flow — Phase 3: Payment Status (return_url) page

> The `return_url` landing page reached after the Multicard hosted checkout redirects the browser
> back. It reconstructs payment state **purely by polling `GET /api/billing/orders/current`** — never
> trusting the browser return as proof of payment — and renders the design's three states
> (`confirming` / `success` / `failed`) with real order data.
>
> Design source: Claude Design project "Payment Flow Pages"
> (`3421e9af-577b-424f-a7f7-e73ea0c941ef`) → `Payment Status.dc.html` (`status` enum prop =
> confirming | success | failed).
> API contract: [`.claude/docs/monetization-api.md`](../docs/monetization-api.md).

## Locked decisions (from the user)

1. **Route path:** `/billing/status` (behind `ProtectedRoute`). The backend's Multicard `return_url`
   must be configured to `https://<host>/billing/status` — otherwise the page is never reached.
   (Backend config, out of frontend scope, but a hard dependency.)
2. **"Retry payment" behavior — smart per-state:** the 90s-timeout case (order still `PENDING`,
   resumable) reuses the order's `checkoutUrl`; terminal failures start fresh at `/billing/plans`.
3. **REVERTED framing — "refunded, access kept":** per monetization-api.md §3, `REVERTED` records a
   refund but does **NOT** revoke access. The page reflects that (access stays active) rather than
   the "plan wasn't activated" wording from the original draft.

---

## 0. Goal & route

A polling page at `/billing/status` that resolves an in-flight payment into success / failure UI.
Never treat the browser landing here as proof of payment — the backend grants access only via
Multicard's server-to-server callback (or the ~1-min reconciliation sweep). We learn the outcome by
polling `orders/current`.

---

## 1. Data plumbing (small, additive)

### 1a. `src/features/billing/api.ts` — add `fetchCurrentOrder`

```ts
export const fetchCurrentOrder = (signal?: AbortSignal): Promise<OrderDetails | null> =>
  withAuth((token) =>
    request(`${ORDERS}/current`, { method: 'GET', token, schema: orderDetailsSchema, signal }),
  ).catch((e) => {
    if (e instanceof ApiError && e.status === 404) return null; // no current order
    throw e;
  });
```

- Reuses the existing `orderDetailsSchema` — already models every field we need (`status`,
  `planCode`, `amount`, `currency`, `accessDurationSeconds`, `reasonDetail`, `checkoutUrl`,
  `orderId`).
- `withAuth` gives the same refresh-on-401/empty-403-then-retry-once as `createOrder`.
- **404 → `null`** distinguishes "no order exists" (→ *Order not found* variant) from a live order.
- Needs `ApiError` imported from `@/lib/api`.

### 1b. `src/features/billing/queries.ts` — add `useCurrentOrder`

```ts
// billingKeys gains:
currentOrder: ['billing', 'orders', 'current'] as const,

export function useCurrentOrder(enabled: boolean) {
  return useQuery({
    queryKey: billingKeys.currentOrder,
    queryFn: ({ signal }) => fetchCurrentOrder(signal),
    enabled,                              // gate off once the page settles
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'PENDING' || s === 'CREATED' ? 2000 : false; // stop on terminal / null
    },
    staleTime: 0,
    retry: false,
  });
}
```

- **2s poll** while the order is open (`PENDING` or transient `CREATED`); auto-stops on any terminal
  status or `null`.
- The page also passes `enabled=false` once it decides an outcome, so nothing polls after resolution
  or the 90s timeout.

---

## 2. State machine — `src/features/billing/usePaymentStatus.ts` (new hook)

The heart of the feature. Keeps timing/polling out of the JSX and returns a discriminated view model.
This is a **conventional screen** (per CLAUDE.md) → ordinary React state + `useEffect`, NOT the
orderbook's outside-React pattern.

**State owned:**

- `mountRef` — `Date.now()` at mount, for the 3s floor and 90s deadline.
- `elapsedSec` — a 1s ticker (`setInterval`); drives the creep bar and the 90s timeout.
- `settled: Resolution | null` — the decided outcome, set exactly once.
- `revealed: boolean` — flips true when the loading floor elapses, allowing the result view to render.

**Timing rules (satisfies requirement 2):**

| Situation | Behavior |
|---|---|
| Steady `PENDING` | Loading screen; bar **creeps** `min(90, elapsedSec/90·100)%` (capped at 90% so there's always headroom to fast-forward). |
| Poll flips to terminal after the floor | Bar **fast-forwards** to 100% over ~600ms, then reveals the result. |
| **First** poll already terminal | Loading screen held for **exactly 3s**; bar fills 0→100% over that 3s (the "quickly moving bar"), then reveals — no flicker. |
| 90s elapse while still `PENDING` | Settle as the **timeout** failure (4.1); stop polling. |

Mechanics: reveal fires at `mountRef + 3000` at the earliest —
`setTimeout(reveal, max(0, 3000 − sinceMount))`. On settle, the bar is driven to 100% with a CSS
transition duration = `clamp(remainingFloor, 400, 3000)ms`, so the terminal-first case animates
across the full 3s and the normal case snaps quickly.

**Resolution mapping (settle logic, precedence top-down — terminal data wins over the 90s check):**

| Polled result | Settle as |
|---|---|
| `status === 'PAID'` | `success` |
| `status === 'FAILED'` or `'CANCELED'` | `failed: 'declined'` |
| `status === 'REVERTED'` | `failed: 'refunded'` (access-kept framing) |
| `status === 'EXPIRED'` | `failed: 'notfound'` |
| `data === null` (404 / no order) | `failed: 'notfound'` |
| none of the above **and** `elapsedSec >= 90` | `failed: 'timeout'` |

**On `success`:** `queryClient.invalidateQueries({ queryKey: authKeys.me })` so `useMe` refetches the
freshly-extended `accessExpiresAt` (already warm from bootstrap → resolves fast; show `—` until it
lands). Entitlement refetch is **optional future work** — there's no entitlement query yet and gating
isn't wired.

---

## 3. Page — `src/features/billing/pages/PaymentStatusPage.tsx` (new)

Presentational. Consumes `usePaymentStatus()` + `useMe()` + `usePlans()` (plan display name via
`buildPlanViews(plansData).find(p => p.code === order.planCode)?.name ?? order.planCode`). Reuses
`BillingHeader` and the design-system `Banner` primitive. Built with the app's Tailwind semantic
tokens (`text-bid`, `text-warning`, `text-danger`, `bg-input`, `border-border`, `animate-spin`, …),
matching `PaymentMethodPage`'s idiom — NOT the template's raw CSS vars.

Layout mirrors the template: centered ~468px column → status marker → eyebrow/title/subtitle →
(progress bar | warning banner) → order "well" with pill + rows → action buttons → footnote.

**Per-state content & actions:**

| State | Title | Marker / pill | Rows | Primary → | Secondary → |
|---|---|---|---|---|---|
| **confirming** | "Confirming your payment…" | blue spinner / "Awaiting confirmation" (warning) | Plan, Amount, Reference | — (none) | — |
| **success** (PAID) | "You're all in until {accessExpiresAt}" | green ✓ ring / "Paid" (bid) | Plan·{N days}, Paid, **Access until** (from `/me`), Reference | "Open terminal →" `/dashboard` | "View billing history" `/dashboard` |
| **timeout** (4.1) | "Payment not completed" | amber "!" / "Not confirmed" (danger) | Plan, Amount, Reference | "Retry payment" → resume `order.checkoutUrl` (else `/billing/plans`) | "Choose another plan" `/billing/plans` |
| **declined** (FAILED/CANCELED, 4.2) | "Payment failed" | amber "!" / "Failed" (danger) | Plan, Amount, Reference | "Retry payment" `/billing/plans` | "Back to dashboard" `/dashboard` |
| **refunded** (REVERTED, 4.3) | "Money refunded" | amber "!" / "Refunded" (warning) | Plan, Amount, Reference (+ Access until, access kept) | "Open terminal →" `/dashboard` | "Choose another plan" `/billing/plans` |
| **notfound** (EXPIRED / 404, 4.4) | "Order not found" | amber "!" / "Not found" (danger) | Plan/Amount/Reference if an order exists; well hidden on 404 | "Start payment" `/billing/plans` | "Back to dashboard" `/dashboard` |

**Subtitle / banner copy (polished from the user's drafts):**

- **confirming:** subtitle "Your bank and Multicard are settling the transaction. This can take up to
  a minute — keep this tab open." Footnote: "Do not refresh or navigate away. If confirmation takes
  longer than 90 seconds we'll stop and let you retry."
- **success:** subtitle (template) "Full terminal access is live on your account — real-time books,
  custom rules and alerts across every supported ticker." Footnote: receipt-emailed note (`me.email`).
- **timeout:** template copy verbatim. Banner (warning): "We couldn't confirm this payment within 90
  seconds. If your card was charged it will be reversed automatically — nothing was activated."
- **declined:** subtitle "Something went wrong. Please try again — no money was charged." Banner =
  `order.reasonDetail` (fallback: "The payment provider reported an error.").
- **refunded** (access kept): subtitle "This payment was refunded and the charge reversed. Your
  existing access stays active until it expires." Banner = `order.reasonDetail` (fallback generic).
- **notfound:** subtitle "We couldn't find an active order for your account. Did you already complete
  a payment?" Banner = "If you just paid, try refreshing this page — otherwise start the payment
  again."

**Row derivation:** `Amount` = `${format(order.amount)} ${order.currency}`; duration from
`order.accessDurationSeconds` (→ days); `Reference` = `order.orderId`; `Access until` from
`me.data.accessExpiresAt`.

**"Retry payment" smart behavior (locked decision 2):** only the *timeout* case does
`window.location.assign(order.checkoutUrl)`; terminal failures navigate to `/billing/plans`.

---

## 4. Wiring

- `src/features/billing/index.ts` — export `PaymentStatusPage` (hook/query stay internal).
- `src/App.tsx` — add:
  ```tsx
  <Route path="/billing/status" element={<ProtectedRoute><PaymentStatusPage /></ProtectedRoute>} />
  ```

---

## 5. Edge cases

- **First poll terminal** → 3s no-flicker floor.
- **Lost tab / stale visit** → `current` returns the most-recent order (may be an old `PAID` → shows
  a receipt; acceptable).
- **404 / never ordered** → *Order not found* variant, order well hidden.
- **CANCELED rarely surfaces as `current`** (a superseding order becomes current instead) — handled
  per the 4.2 grouping anyway.
- **Persistent auth failure** (empty-body 403 after `withAuth` retry) → bubbles as query error; page
  falls back to a neutral *Order not found* rather than a raw error (it's already behind
  `ProtectedRoute`).
- **StrictMode** double-mount → timers cleaned up in effect teardown; `settled` guards prevent double
  resolution.

---

## 6. Files touched

1. `src/features/billing/api.ts` — `fetchCurrentOrder` (+ import `ApiError`).
2. `src/features/billing/queries.ts` — `billingKeys.currentOrder`, `useCurrentOrder`.
3. `src/features/billing/usePaymentStatus.ts` — **new** (state machine + view model).
4. `src/features/billing/pages/PaymentStatusPage.tsx` — **new**.
5. `src/features/billing/index.ts` — export the page.
6. `src/App.tsx` — `/billing/status` route.

*(No change to `catalog.ts` — reuse `buildPlanViews` for the plan name, as `PaymentMethodPage` does.)*

---

## 7. Verification

`npm run typecheck` (the project's only automated check). No dev-server/browser driving — the user
tests manually per CLAUDE.md.

---

## Constants (tune here if needed)

- Loading floor: **3000ms**
- Confirming timeout: **90s**
- Poll interval: **2000ms**
- Fast-forward transition: `clamp(remainingFloor, 400, 3000)ms`
