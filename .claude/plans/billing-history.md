# Billing History — Implementation Plan

## Goal

Add a **Billing history** page at `/account/billing-history`, matching `Billing History.dc.html`:
two tabs — **Payments** (the orders audit trail) and **Access grants** (the entitlement ledger) —
with expandable order rows that lazy-load a status-transition timeline. Extract the account shell
into a shared `AccountLayout` so `/account` and the new page share one sidebar with active-route
highlighting.

The design's `STATUS` / `REASON` / `SOURCE` / `PLAN` maps, `buildHistory`, and formatting helpers
are the source of truth for copy and colors — port them faithfully.

Locked decisions (from clarifying questions):

1. **Shared layout**, routed at `/account/billing-history`. Extract `AccountLayout` (header +
   sidebar + sign-out); Security/Settings stay disabled placeholders.
2. **Full fidelity** rows — expandable, lazy-fetch `GET /orders/{id}/history` on first expand,
   render the status timeline + order details + actions.
3. **Download receipt** button kept as a **disabled placeholder** (`title="Coming soon"`) — no
   receipt endpoint exists yet.

API reference: `.claude/docs/billing-history-api.md`.

---

## 1. Schemas — `src/features/billing/schemas.ts`

`orderDetailsSchema` already exists and is exactly the `OrderDetailsEntry` shape all three
endpoints return — reuse it. Add:

- `ordersListSchema = z.array(orderDetailsSchema)` — for `GET /orders`.
- `orderHistoryEntrySchema` — for `GET /orders/{id}/history`:
  ```
  fromStatus:   orderStatusSchema
  toStatus:     orderStatusSchema
  reason:       z.string().nullable()
  reasonDetail: z.string().nullable()
  source:       z.string()          // API|CALLBACK|RECONCILIATION|SYSTEM, permissive
  createdAt:    z.string()
  seq:          z.number()
  ```
  plus `orderHistorySchema = z.array(...)`. Type: `OrderHistoryEntry`.
- `entitlementLedgerEntrySchema` — for `GET /entitlement/history`:
  ```
  source:                 z.string()   // TRIAL|PURCHASE|ADMIN, permissive
  grantedDurationSeconds: z.number()
  previousExpiresAt:      z.string().nullable()
  newExpiresAt:           z.string()
  order:                  orderDetailsSchema.nullable()
  reason:                 z.string().nullable()
  createdAt:              z.string()
  ```
  plus `entitlementHistorySchema = z.array(...)`. Type: `EntitlementLedgerEntry`.

Keeping `source`/enum fields permissive (`z.string()`) follows the existing rule in this file —
server-authored vocab we mostly map through a lookup, so a strict client enum only manufactures
false contract drift.

## 2. API — `src/features/billing/api.ts`

Three authed reads, each via `withAuth` (same refresh-on-401/empty-403 shape as `fetchCurrentOrder`):

- `fetchOrders(signal)` → `GET /api/billing/orders`, `ordersListSchema`. Returns `[]` naturally when
  empty (no 404 case).
- `fetchOrderHistory(orderId, signal)` → `GET /api/billing/orders/{id}/history`, `orderHistorySchema`.
  Owner-only; a 404 shouldn't occur for a row we just listed, so let it throw (no null-coalescing
  like `fetchCurrentOrder`).
- `fetchEntitlementHistory(signal)` → `GET /api/billing/entitlement/history`,
  `entitlementHistorySchema`. Returns `[]` naturally.

## 3. Queries — `src/features/billing/queries.ts`

Extend `billingKeys`:
```
orders:              ['billing', 'orders', 'list'],
orderHistory: (id)=> ['billing', 'orders', id, 'history'],
entitlementHistory:  ['billing', 'entitlement', 'history'],
```
- `useOrders()` — list; `staleTime: 30_000`, `retry: false`.
- `useEntitlementHistory()` — ledger; same options.
- `useOrderHistory(orderId, enabled)` — **lazy**, `enabled` flips true on first row expand;
  `staleTime: 5 * 60_000` (a terminal order's history is immutable), `retry: false`.

Extend **`useCancelOrder`** `onSuccess`/`onError` to also
`invalidateQueries({ queryKey: billingKeys.orders })` so a cancel from a history row updates the
list, not just `orders/current`.

## 4. Shared shell — new `src/features/billing/components/AccountLayout.tsx`

Extract the header + sidebar + sign-out currently inlined in `AccountPage` (lines 150–223) into a
reusable layout that renders `children` as main content:

- **Header**: `BrandMark` + "Go to dashboard" button, gated on `hasAccess`
  (`me.data.accessState !== 'EXPIRED'`) — same gate AccountPage uses today.
- **Sidebar**: nav items driven by `useLocation().pathname`:
  - `Account` → `/account`, `Billing history` → `/account/billing-history` (each active-highlighted
    via the accent border + `bg-accent/[0.08]` treatment when its path matches).
  - `Security`, `Settings` → disabled placeholders (muted, `cursor-not-allowed`, no handler) —
    carried forward from today's non-wired state.
  - `Sign out` — owns the `loggingOut` state + `logout()` → `navigate('/login')` (moved out of
    AccountPage).

Kept inside the `billing` feature (both consumers live here); not exported from the barrel.

## 5. Refactor — `src/features/billing/pages/AccountPage.tsx`

Remove the header/nav/sign-out JSX and the `onSignOut`/`loggingOut` logic; wrap the existing content
(the `max-w-[1100px]` flex block, lines 227–261) in `<AccountLayout>`. All four cards
(`UnpaidInvoiceCard`, `AccessCard`, `AccountInfoCard`, `PayByDaysCard`) stay unchanged. Net:
AccountPage gets shorter and identical in behavior.

## 6. New page — `src/features/billing/pages/BillingHistoryPage.tsx`

Wrapped in `<AccountLayout>`. Local state: `tab: 'payments' | 'grants'` (default `payments`),
`expanded: Record<orderId, boolean>`, `copied: string | null`.

- **Data**: `useOrders()`, `useEntitlementHistory()`.
- **Header block**: title "Billing history" + mono caption
  `{n} orders · {m} grants · access through {date}`, where date = newest ledger row's
  `newExpiresAt` (fallback `—`).
- **Tabs**: Payments `({orders.length})` / Access grants `({ledger.length})`, accent underline on
  active.
- **Payments tab**:
  - Grid header (`Status | Plan | Amount | Date | ⌄`).
  - One `OrderRow` per order. Collapsed row: status dot+label, plan label (`PLAN` map) + sub-line
    (reason for terminal-bad, "Awaiting payment" for open), amount `{amount} {currency}`, date,
    chevron. Open orders (`CREATED`/`PENDING`) get the accent left-border + tint, matching the
    design.
  - **Expanded** (`OrderRow` calls `useOrderHistory(orderId, expanded)`): left column = Order ID
    (copy), Provider, Provider ref (copy), Access bought (`round(sec/86400) days`) + action buttons;
    right column = **status-history timeline** from the fetched rows (newest first, dot color per
    `STATUS[toStatus]`, `fmtDateTime`, reason via `REASON` map + optional `reasonDetail`). While
    history loads, a muted "Loading…" line; on error, a muted failure line.
  - **Actions**: for the single open order (status `CREATED`/`PENDING`) → **Complete payment**
    (`checkoutUrl` ? `window.location.assign` : `navigate('/billing/plans')`) + **Cancel order**
    (`useCancelOrder`; shown only on the current open order since the endpoint is
    `/orders/current/cancel`). For `PAID` → **Download receipt** rendered **disabled**
    (`title="Coming soon"`).
  - **Empty state**: guarded as `!isLoading && orders.length === 0` (so it doesn't flash before data
    lands) → "No payments yet" + "Choose a plan" → `/billing/plans`.
- **Access grants tab**: grid header (`Date | Source | Grant | Added | Access through`); one row per
  ledger entry — source pill (`SOURCE` map colors), title/sub (Purchase → plan + amount;
  Trial/Admin → their copy), `+{days} days` in `text-bid`, `newExpiresAt`,
  `was {previousExpiresAt}`. `PURCHASE` rows get a **"View order →"** link that sets `tab='payments'`
  and `expanded[order.orderId]=true` — the design's cross-tab deep link.
- **Copy-to-clipboard**: small helper mirroring the template (`navigator.clipboard.writeText`, 1.4s
  "Copied" flip via `copied` state).

**Formatting/label maps** (`PLAN`, `STATUS`, `REASON`, `SOURCE`, `fmtDate`, `fmtDateTime`, `days`) —
port from the design into a small `src/features/billing/historyView.ts` so the page component stays
lean (parallels how `catalog.ts` holds AccountPage's copy). `fmtDate` can be shared with
AccountPage's existing one.

## 7. Wiring — `src/App.tsx` + `src/features/billing/index.ts`

- App.tsx: add `<Route path="/account/billing-history">` under `ProtectedRoute` →
  `BillingHistoryPage` (sibling route; each page renders its own `<AccountLayout>` wrapper — no
  react-router `<Outlet>` nesting, consistent with how the other pages own their shell).
- index.ts: export `BillingHistoryPage`, plus `useOrders`, `useEntitlementHistory`, `useOrderHistory`
  and the new schemas/types alongside the existing ones.

## 8. Verification

`npm run typecheck` (the project's only automated check). No dev-server/browser testing — the user
tests manually.

---

## Files touched

**New:** `components/AccountLayout.tsx`, `pages/BillingHistoryPage.tsx`, `historyView.ts`
**Modified:** `schemas.ts`, `api.ts`, `queries.ts`, `pages/AccountPage.tsx`, `index.ts`, `App.tsx`

## Decisions baked in

- **Cancel order** only surfaces on the current open order, because the backend cancels via
  `/orders/current/cancel` (no cancel-by-id). At most one order is open, so this is unambiguous.
- **"Access through"** caption uses the newest ledger row's `newExpiresAt` (matches the design)
  rather than `/me`'s `accessExpiresAt` — both should agree, but the ledger is what the design reads.
- Empty state is gated on `!isLoading` to avoid a flash; there's no fallback-first option here since
  this is genuinely per-user data (unlike the plan catalog).
