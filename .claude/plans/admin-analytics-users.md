# Admin Analytics & Users — Implementation Plan

Adds the two **ADMIN-only** screens from the "User Profile Account Page Design" template
(`Account Page.dc.html`, `view: analytics | users`) on top of the existing account area:

1. **Analytics** — usage analytics: a live "online now" counter + a distinct-users-per-slice
   bar chart with a date-range / slice-duration control.
2. **Users** — a paginated user directory with role/status filters, multi-select, and a
   "Gift access" flow that bulk-grants free days.

Backend contract: [`.claude/docs/admin-users-usage-api.md`](../docs/admin-users-usage-api.md)
(four ADMIN-only endpoints). Design source of truth: the `showAnalytics` / `showUsers` blocks
and the `renderVals()` logic in `Account Page.dc.html`.

## Locked decisions (from clarifying questions)

1. **Routing** — new route-per-screen, matching the app convention (not the template's in-page
   view switch). Add `/account/analytics` and `/account/users` as `ProtectedRoute` + `AdminRoute`.
   **No redirect on `/account`** — it always renders the profile page, honoring an explicit URL.
   "Default to Analytics for admins" is a property of the **entry links** into the account area
   (the dashboard profile icon etc.), not a route guard: those links send admins to
   `/account/analytics` while everyone else goes to `/account` (see §4a). A non-admin who types an
   admin URL is bounced to `/account` by `AdminRoute`.
2. **Module** — a new `src/features/admin/` feature module owns the data layer + pages, following
   the barrel-export convention. The shared `AccountLayout` (lives in `billing`) is extended to
   render the admin nav block, gated on `role === 'ADMIN'`.
3. **User filters** — server-paginate (`page`/`size`); the Role/Status checkboxes filter the
   **currently-loaded page** client-side, exactly as the template does. Documented as a known
   limitation (the API has no server-side search/filter — see api doc §"No search/filter").

## Access-control model (important)

Gating these screens client-side is **UX only, not a security boundary** — consistent with the
app's advisory-only stance (CLAUDE.md §Monetization). The real enforcement is server-side: all
four endpoints are `hasRole("ADMIN")`-gated and return an **empty-body `403`** for a non-admin or
anonymous caller, indistinguishable from "not logged in." So:

- Nav links + routes are hidden/redirected when `useMe().data.role !== 'ADMIN'`.
- `AdminRoute` (below) redirects a non-admin away rather than rendering a screen that would only
  ever 403.
- The empty-body 403 is treated as "not an admin" and must **not** trigger the auth layer's
  refresh-then-retry loop in a way that logs the user out — see §6 (error handling). `withAuth`
  already retries an empty-403 once after refresh; for these admin calls a *persistent* 403 is
  an authorization result, not a session failure, so the query surfaces it as a terminal
  "forbidden" state (no logout, `retry: false`).

---

## 1. New feature module: `src/features/admin/`

```
src/features/admin/
  schemas.ts        # Zod schemas for the 4 responses + inferred types
  api.ts            # 4 endpoint functions over request() + withAuth()
  queries.ts        # TanStack Query hooks (adminKeys, use* hooks, gift mutation)
  usageChart.ts     # pure chart view-model builder (range/slice → bars, zero-fill, tooFine)
  pages/
    AnalyticsPage.tsx
    UsersPage.tsx
  components/
    GiftAccessModal.tsx
    UserRow.tsx          # (optional split; a row is heavy enough to isolate)
  index.ts          # barrel: pages + hooks + types
```

Conventional CRUD/read screens — **TanStack Query, ordinary React state**, no real-time /
outside-React machinery (that principle is order-book-only per CLAUDE.md). REST responses **are**
Zod-validated (the norm for REST in this codebase; only the WS feed skips Zod).

### 1a. `schemas.ts`

Mirror the api doc payloads. All server-response schemas (source of both validator + TS type),
same split philosophy as auth's `schemas.ts`.

```ts
// GET /api/admin/users
adminUserSchema         = { id, firstName, lastName, email,
                            role: z.enum(['USER','ADMIN']),
                            emailVerified: boolean, enabled: boolean,
                            createdAt: string,
                            accessState: z.enum(['TRIAL','ACTIVE','EXPIRED','ADMIN']),
                            accessExpiresAt: string.nullable(),
                            hasPaid: boolean,
                            lastSeenAt: string.nullable() }
adminUsersPageSchema    = { users: adminUserSchema[], page, size, totalElements, totalPages }

// POST /api/admin/entitlement/gift  (response)
giftResultSchema        = { updatedCount, grantedDurationSeconds,
                            results: { userId, newExpiresAt }[] }

// GET /api/monitoring/presence
presenceSchema          = { onlineUsers, totalSessions,
                            users: { userId, sessions, custom: boolean }[] }

// GET /api/monitoring/usage
usageSliceSchema        = { start, end, uniqueConnections }
usageReportSchema       = { start, end, zone, slice, sliceCount, totalConnections,
                            mostActive: usageSliceSchema.nullable(),
                            slices: usageSliceSchema[] }
```

Reuse the `accessState` enum vocabulary already in auth (`AccessState`) — the api doc explicitly
says it's the same enum, so the Users state badge reuses the billing state-color logic rather than
inventing a second map.

Request body type (not a response, so a plain TS type is fine):
`GiftRequest = { userIds: string[]; addPeriodDays: number; reason?: string }`.

### 1b. `api.ts`

Four pure functions over `request()`. All four are ADMIN-authed, so all go through the auth
layer's `withAuth((token) => request(...))` — same shape as billing's `createOrder`. Never read
tokens directly here.

```ts
fetchAdminUsers(page, size, signal)      GET  /api/admin/users?page&size      → adminUsersPageSchema
giftEntitlement(body, signal)            POST /api/admin/entitlement/gift     → giftResultSchema
fetchPresence(signal)                    GET  /api/monitoring/presence        → presenceSchema
fetchUsage(params, signal)               GET  /api/monitoring/usage?…         → usageReportSchema
```

- `fetchAdminUsers`: clamp `size` into `[1,100]` client-side before sending (the server clamps
  silently, but echo `size` from the response — don't assume the requested size, per api doc).
- `fetchUsage` params: `{ start?, end?, slice?, zone? }` → `URLSearchParams`, omitting undefined.
  Default `zone` is `Asia/Tashkent` (server default); we pass it explicitly so the labels are
  deterministic regardless of server default drift.
- `giftEntitlement`: on `404` the backend body lists unknown ids (`"Unknown user id(s): […]"`) —
  let the `ApiError` propagate; the mutation surfaces `err.message`.

### 1c. `queries.ts`

```ts
adminKeys = {
  all: ['admin'],
  users: (page, size) => ['admin','users', page, size],
  usersTotal:           ['admin','users','total'],   // lightweight totalElements probe
  presence:             ['admin','presence'],
  usage: (params)    => ['admin','usage', params],
}
```

Hooks:

| Hook | Endpoint | Notes |
|---|---|---|
| `useAdminUsers(page, size)` | `/api/admin/users` | `keepPreviousData` so page/size changes don't flash empty; `staleTime` ~30s; `retry: false` (a 403 is authorization, not transient). |
| `usePresence(enabled)` | `/api/monitoring/presence` | `refetchInterval: 20_000` while the Analytics screen is mounted (`enabled` off elsewhere); cheap in-memory endpoint, safe to poll. `staleTime: 0`. |
| `useUsage(params)` | `/api/monitoring/usage` | `staleTime` ~60s; `retry: false`. Guarded by a client-side `tooFine` check so we don't request an enormous slice count (see §2b). |
| `useGiftEntitlement()` | `POST …/gift` | mutation; on success invalidate `adminKeys.users(*)` + `adminKeys.usersTotal` + each gifted user's `authKeys` is N/A (they're other users). Also invalidate presence? No — gift doesn't change presence. |

- **Users total for the nav badge + the Analytics "/ N users" denominator**: the nav count and the
  "online now / **N** total" denominator both need `totalElements`. Add a tiny `useUsersTotal()`
  that calls `fetchAdminUsers(0, 1)` and selects `totalElements` (React Query `select`), cached
  long. Avoids coupling the nav to a full page fetch. (Alternatively derive it from whatever
  `useAdminUsers` page is loaded — but the nav renders even when Users isn't open, so the
  standalone probe is cleaner.)
- Gift mutation `onSuccess`: prefer invalidation over optimistic patching, but the api doc gives
  `results[].newExpiresAt` already-stacked — we *may* optimistically write those into the cached
  users page for instant feedback, then invalidate to reconcile. Start with plain invalidation;
  optimistic is a nice-to-have.

---

## 2. Analytics page (`AnalyticsPage.tsx`)

Wrapped in `AccountLayout`. Header: "Usage analytics" + "Distinct users per time slice · zone
Asia/Tashkent". Three regions, top to bottom:

### 2a. Controls bar (`--color-input` panel)

> **Superseded — see the [2026-07-28 enhancement](#appendix-a-controls-enhancement-2026-07-28).**
> The date-range control is now a single dropdown (adds a `year` preset), each preset locks its own
> slice, and the slice dropdown + From/To pickers show only for `custom`. The paragraphs below
> describe the original build.

- **Date range**: 4 segmented buttons — Today / Week / Month / Custom. Local state
  `range: 'today'|'week'|'month'|'custom'`. Selecting Custom reveals two `<input type=date>`
  (From / To). Default `week`.
- **Slice duration**: `<select>` — Year `P1Y`, Month `P1M`, 24h `PT24H`, 1h `PT1H`, 30min `PT30M`.
  Default `PT24H`.
- These map to `useUsage({ start, end, slice, zone })`. `start`/`end` computed from the range
  preset (today = today; week = last 7 days; month = last 30 days; custom = the two inputs) as
  `YYYY-MM-DD` local dates.

### 2b. Stat tiles (flex row)

- **Online now** (`--color-surface` card, pulsing bid dot): `presence.onlineUsers` big, `/ N`
  total (from `useUsersTotal`), a meter `onlineUsers/total`, and "`totalSessions` open sessions".
  Live via `usePresence`.
- **Total connections**: `usage.totalConnections` (sum of `uniqueConnections` across returned
  slices — the api doc's exact definition; **not** distinct users over the whole range).
- **Most active slice**: `usage.mostActive.uniqueConnections` (accent) + a formatted label of the
  peak slice's start (`mostActive.start`). `null` when the range is empty → render "—" / "no data".

### 2c. Chart (`usageChart.ts` builds the view-model; page just renders bars)

A pure `buildUsageChart(report, range, slice, zone)` → `{ bars, tooFine, requestedSliceCount,
yTicks, peakIndex }`, ported from the template's `buildChart`/chart-vals but driven by **real API
data** instead of the template's `noise()` seed:

- **Zero-fill missing buckets** — the api doc is explicit: `slices` omits empty slices, so the
  chart must synthesize the full contiguous bucket set over `[start, end)` at the chosen slice and
  fill absent buckets with `0`. This is the single most important correctness detail. Implement a
  bucket generator:
  - Fixed-duration slices (`PT30M`/`PT1H`/`PT24H`): step `start + n*durationMs` until `end`.
  - Calendar slices (`P1M`/`P1Y`): step by real calendar month/year boundaries in `zone` (not a
    fixed ms step — 31-day months / leap years). Match each API slice to a bucket by its `start`.
  - Match API `slices[]` into buckets by timestamp; unmatched buckets = 0.
- **`tooFine` guard**: if the generated bucket count `> 96`, don't request/render the chart — show
  the design's warning `Banner` ("This range at {slice} would return N slices… pick a coarser
  slice") and a dashed "no chart — coarsen the slice" placeholder. Also **gate `useUsage`'s
  `enabled` off** when `tooFine` so we never fire the expensive request the backend would choke on
  (the api doc warns a wide range × fine slice is "a lot of rows"). Compute `tooFine` from the
  range+slice *before* fetching.
- Bars: height `= v/max` (min 3px for non-zero), peak bar in accent, others accent-30%. Show the
  numeric value above the bar only when `bars.length <= 16`. X-axis labels thinned via
  `labelEvery = ceil(bars.length/10)` when > 16 bars. Y-axis: 5 ticks `[max, ¾, ½, ¼, 0]`.
  `barGap` tightens as bar count grows (8px → 4px → 2px), same thresholds as the template.
- Slice/date formatting for tick + tooltip labels goes through `zone`-aware `Intl.DateTimeFormat`
  (numbers stay fixed-format per i18n §10.1; only prose is translated).

**Note on presence vs. usage**: the "Online now" tile reads `/presence` (live, in-memory), the
chart + other tiles read `/usage` (persisted history). Keep them as two independent queries —
they answer different questions and refresh on different cadences.

---

## 3. Users page (`UsersPage.tsx`)

Wrapped in `AccountLayout`. Header "Users" + caption "`totalElements` registered · showing N on
this page".

### 3a. Data + filtering

- `useAdminUsers(page, size)` — server pagination. Local state `page` (1-based in UI, **0-based to
  the API**), `size` (10/20/50/100, default 20).
- **Client-side filters over the loaded page** (locked decision 3): `roles: {USER, ADMIN}` and
  `statuses: {active, inactive}` where `active = emailVerified && enabled`. Filter counts shown next
  to each checkbox are **page-scoped** — add a small caption "active = verified & enabled" and keep
  the "showing N on this page" wording so the scoping is honest.
- Changing a filter resets the current selection (template does `selected: {}` on `filterToggle`).
- Empty result → "no users match these filters".

### 3b. Table

Grid columns: `[checkbox] Name · Email · Role · Access expires · Last seen` (template's
`44px 1.25fr 1.5fr 84px 168px 128px`).

- **Name** cell: status dot (bid if active, dim otherwise; `title` = active / inactive-disabled /
  inactive-unverified) + full name.
- **Role**: accent for ADMIN, muted for USER.
- **Access expires**: a state pill (color from the shared `accessState` → color map; reuse
  billing's, don't build a new one) + the formatted `accessExpiresAt` (or "—" when null).
- **Last seen**: relative time from `lastSeenAt` ("N min/h/d ago"), or "never" when null. Add a
  small `fmtRelative(iso)` helper (dim color for "never").
- Row is a clickable checkbox toggle; selected rows get an accent left-border + faint accent bg.

### 3c. Selection + pagination footer

- Header checkbox = select-all-on-page (toggles all currently-filtered rows). "Select all" /
  "Clear selection" button + "N selected" label.
- Footer: "page X / Y" (Y = `totalPages` from the API), size `<select>`, "N total", Prev/Next
  (disabled at bounds; changing size resets to page 1).
- **Selection is keyed by user id** and can span pages, but only current-page rows are visible to
  toggle. Simplest correct behavior: **clear selection on page change** (avoid the confusing
  "invisible selected rows on other pages" state). The gift modal shows exactly the selected rows'
  names as chips, so keeping selection page-local is the least surprising.

### 3d. Gift access flow (`GiftAccessModal.tsx`)

- **"Gift access"** button (accent, gift icon) — disabled/50%-opacity when nothing selected.
  Opens the modal.
- Modal fields (matches `POST /api/admin/entitlement/gift`):
  - **Recipients** — chips of the selected users' names + "N users" count. `userIds` = selected ids.
  - **Add period days** — numeric input, digits-only. Client-validate `> 0` (api doc: omitted /
    `<=0` → 400). Invalid → danger border + hint "addPeriodDays must be greater than 0", confirm
    disabled.
  - **Reason** — optional free-text (`reason`), placeholder "Beta tester compensation".
  - Info note: "Days stack on top of each user's remaining access — this never sets an absolute
    expiry." (The gift *adds*, and a gifted user reports as `TRIAL`, never `ACTIVE`; `hasPaid`
    stays false — reflect this in copy, don't imply it's a paid grant.)
- **Confirm** → `useGiftEntitlement().mutate({ userIds, addPeriodDays, reason })`. Button shows a
  pending label while `isPending`.
  - **Success**: close modal, clear selection, show a success `Banner` on the Users page —
    "Gifted D days to N users — grantedDurationSeconds S. New expiry dates are reflected below." —
    dismissible. Invalidate the users query so rows show the new `accessExpiresAt` (or optimistically
    write `results[].newExpiresAt`).
  - **404 (unknown id)**: the whole request is rejected all-or-nothing (transactional) — surface
    the backend `message` (lists the unknown ids) in the modal as an error; nobody was gifted.
    Can happen if the list went stale; a users-query invalidation + retry recovers.
  - **400**: shouldn't occur given client validation, but surface `message` defensively.

---

## 4. Shared shell: extend `AccountLayout` (in `billing`)

`AccountLayout` currently renders `NAV` (Account, Billing history) + `DISABLED_NAV` (Security,
Settings, greyed). Add an **admin nav block** below the main nav, rendered only when
`useMe().data?.role === 'ADMIN'`:

- A small "ADMIN" section label (mono, dim), then two links:
  - **Analytics** → `/account/analytics`
  - **Users** → `/account/users` with a right-aligned count meta (`totalElements` from
    `useUsersTotal()`), matching the template's `navAdmin` meta.
- Active-route highlight uses the same `pathname === path` logic already in the component.

**Coupling note**: `AccountLayout` lives in `billing` but now needs `useUsersTotal` from `admin`.
To avoid a `billing → admin` import cycle risk, either (a) have the admin nav count be optional and
passed down, or (b) import `useUsersTotal` from `@/features/admin` (one-way `billing → admin` is
acceptable since `admin` doesn't import `billing`). Option (b) is simplest; the layout already
imports from `@/features/auth`, so a second cross-feature hook import is in keeping. Keep the admin
role check inside `AccountLayout` so both admin pages and the profile page share one shell.

The sidebar **"Account"** item stays pointed at `/account` (the profile) for everyone — so an
admin's profile is always one click away from within the account area, even though their *external*
entry defaults to Analytics (§4a). This matches the template, where "Account" and the admin
"Analytics"/"Users" links are distinct nav items.

### 4a. Account entry links — the "default to Analytics" mechanism

The admin default lands via the **links that point into the account area**, not a route redirect
(so typing `/account` directly always yields the profile — intent respected). Centralize with a
tiny helper so there's one source of truth:

```ts
// e.g. src/features/auth or a small shared util
export const accountHome = (role?: string) =>
  role === 'ADMIN' ? '/account/analytics' : '/account';
```

Apply it at the **external** entry points (change `navigate('/account')` → `navigate(accountHome(me.data?.role))`):

- **DashboardHeader profile avatar** — [DashboardHeader.tsx:141](../../src/features/orderbook/components/DashboardHeader.tsx#L141).
- **BillingHeader account button** — [BillingHeader.tsx:35](../../src/features/billing/components/BillingHeader.tsx#L35).

Leave the in-account sidebar "Account" item at `/account` (§4). Net behavior:
- Type `/account`, or click the sidebar "Account" item → **profile** (any role).
- Admin clicks the dashboard profile icon (or the billing account button) → **`/account/analytics`**.
- Admin clicks sidebar "Analytics"/"Users" → those screens.

**Maintainability note**: because the default now lives in entry links, any *future* "go to
account" link must use `accountHome()` rather than a bare `/account`, or an admin would land on the
profile instead of Analytics. The helper keeps that a one-liner.

---

## 5. Routing (`App.tsx`) + `AdminRoute` guard

**No redirect on `/account`** — it stays the profile page (`AccountPage`) for everyone, honoring an
explicit URL. The admin default lands via the entry links (§4a), not the route. This removes the
`AccountIndexRedirect` + `/account/profile` alias the earlier draft needed.

New guard `src/app/AdminRoute.tsx` — composes on top of `ProtectedRoute`'s token check and adds a
role check via `useMe`:

```tsx
export function AdminRoute({ children }) {
  const me = useMe();
  if (me.isLoading) return null;            // SessionGate already blocked on bootstrap; covers a cache-evicted /me
  if (me.data?.role !== 'ADMIN') return <Navigate to="/account" replace />;
  return <>{children}</>;
}
```

Routes (all inside `<ProtectedRoute>` for token-presence; the two admin screens add `AdminRoute`):

```tsx
<Route path="/account"           element={<ProtectedRoute><AccountPage/></ProtectedRoute>} />   {/* unchanged */}
<Route path="/account/analytics" element={<ProtectedRoute><AdminRoute><AnalyticsPage/></AdminRoute></ProtectedRoute>} />
<Route path="/account/users"     element={<ProtectedRoute><AdminRoute><UsersPage/></AdminRoute></ProtectedRoute>} />
```

- A non-admin (anonymous is already caught by `ProtectedRoute`) who types `/account/analytics` is
  bounced to `/account` (the profile) by `AdminRoute` — clean now that `/account` is unconditionally
  the profile.
- Net route mapping:
  - **USER**: `/account` → profile; `/account/analytics|users` → bounced to `/account`.
  - **ADMIN**: `/account` → profile; `/account/analytics` → Analytics; `/account/users` → Users;
    external entry links (dashboard icon, billing header) default to `/account/analytics` (§4a).
- `me.isLoading` guard: `SessionGate` already holds a splash until `/me` resolves on reload, so in
  practice `me.data` is present when `AdminRoute` renders; the `isLoading` branch is just belt-and-
  suspenders for a cache-evicted refetch.

---

## 6. Error handling & the empty-body 403

- **Non-admin reaching an admin query** (shouldn't happen behind `AdminRoute`, but a race or direct
  URL could): the empty-body `403` must resolve to a terminal "forbidden" UI, **not** a logout.
  `withAuth` will attempt one refresh-then-retry on a `403`; a *second* `403` is authorization, so
  the query sets `retry: false` and the page renders a small "You don't have access to this area"
  state (or, since `AdminRoute` already redirected, this is mostly moot). Do **not** call
  `clearSession()` on these 403s.
- **`/usage` 400** (bad range/slice/zone): our client-side `tooFine` + valid-range construction
  should prevent it; if it still 400s, show the warning banner with the backend `message`.
- **`/presence`** never errors on empty (`{onlineUsers:0,…}`), so no empty-state error path — just
  render 0.
- **Loading**: follow the conventional-screen pattern — skeleton/placeholder tiles and a
  "Loading users…" row, no over-engineering. Presence/usage tiles can render "—" until first data.

---

## 7. i18n (namespace: new `admin`)

i18n is fully implemented (pinned to `ru`, `en` is the typed source of truth). These screens are
static chrome, so they get real translations, not hardcoded English:

- Add a new **`admin`** namespace: `src/lib/i18n/locales/{en,ru}/admin.json`.
  - Register it in `config.ts` `NAMESPACES`, and in `index.ts` `resources` (both `en` + `ru`).
    The `i18next.d.ts` typing derives keys from `en`, so `en/admin.json` is the canonical key set;
    any `ru` drift surfaces as a typecheck error.
- Components call `useTranslation('admin')`. Keys cover: nav ("Analytics", "Users", "ADMIN"),
  analytics headers/labels/range+slice options/tile labels/too-fine banner, users
  headers/columns/filter labels/pagination/empty state, and the gift modal (title, field labels,
  hints, stacking note, success banner with `{days}`/`{count}`/`{seconds}` interpolation, error).
- Follow the established **labelKey pattern** (§6.2): keep any code→label maps (e.g. a local
  `accessState` badge label map, if needed beyond color) free of `t()` — emit keys, resolve in the
  component. Reuse the existing billing `accessState` color logic.
- **Dates**: use the shared `formatDate` / a new `fmtRelative` (zone-aware for the chart);
  **numbers stay fixed-format** (`Intl.NumberFormat('en-US')`), matching `groupFmt` elsewhere
  (§10.1). Provider/opaque values (user emails, ids) are shown verbatim, never translated.
- Since the app is pinned to `ru`, write real Russian copy in `ru/admin.json` (don't leave English
  placeholders) — mirror how the other `ru/*.json` namespaces are fully translated.

---

## 8. Barrel + wiring checklist

- `src/features/admin/index.ts` exports `AnalyticsPage`, `UsersPage`, the query hooks, `adminKeys`,
  and the response types.
- `App.tsx`: import the two pages + `AdminRoute`, add the three routes above.
- `AccountLayout`: add the admin nav block (role-gated) + the Users count.
- `config.ts` + i18n `index.ts`: register the `admin` namespace (en + ru).
- Verify with **`npm run typecheck`** (the only automated gate) — the i18n key typing and Zod
  inference will catch most drift.

---

## 9. Build order (suggested phases)

1. **Module scaffold + data layer**: `schemas.ts`, `api.ts`, `queries.ts`, `admin` i18n namespace
   registered (empty-ish). Typecheck green.
2. **Shell wiring**: `AdminRoute`, the two admin routes, the `accountHome()` helper applied to the
   dashboard/billing entry links (§4a), and the `AccountLayout` admin nav block. Verify an admin's
   profile icon lands on `/account/analytics`, typing `/account` still shows the profile, and a
   non-admin typing an admin URL is bounced to `/account`.
3. **Users page**: table + filters + pagination + selection (no gift yet). Real `useAdminUsers`.
4. **Gift flow**: `GiftAccessModal` + `useGiftEntitlement` + success/error banners + invalidation.
5. **Analytics page**: controls + presence tile + `usageChart.ts` (zero-fill + tooFine) + chart.
6. **i18n pass**: fill `en/admin.json` + `ru/admin.json`, replace any inline strings, typecheck.

Each phase ends with `npm run typecheck`. No dev-server driving (manual testing by the user, per
CLAUDE.md).

## 10. Open risks / notes

- **Page-scoped filters** (locked): filter counts and results reflect only the loaded page. If this
  proves confusing in review, the fallback is the "fetch all, then filter" approach — deferred.
- **`totalPages` vs. filtered rows**: pagination is over unfiltered server totals, but the visible
  rows are the client-filtered subset — a page can render fewer rows than `size`. The "showing N on
  this page" caption keeps this honest; don't recompute `totalPages` from filtered counts.
- **Presence userIds aren't joined to names**: `/presence` returns `userId`s only. The Analytics
  "Online now" tile uses just the count (as the template does); we don't cross-reference the users
  directory to name them (would need the id present on the loaded page anyway). Out of scope.
- **Gift `newExpiresAt` is authoritative** — use it directly for any optimistic update; never
  re-derive as `now + addPeriodDays` (stacking on remaining time makes that wrong).

---

## Appendix A: Controls enhancement (2026-07-28)

Post-build UX change to the Analytics controls bar (§2a). The date range now drives slice
granularity, so the controls collapse to a single dropdown for every preset and only expand for
`custom`.

### What changed

1. **Date range is a dropdown, not segmented buttons.** Options: Today / Week / Month / **Year** /
   Custom (Custom last — reads as increasing span). Replaces the 4 pill buttons.
2. **New `year` preset.** `RangePreset` gains `'year'`; `rangeToDates` maps it to the last 365 days
   (`shiftYmd(today, -364)` → today), consistent with the existing week (`-6`) / month (`-29`)
   "last N days inclusive" convention.
3. **Each preset locks its own slice** via a new `PRESET_SLICE` map in `usageChart.ts` — the range
   implies its granularity, so no slice control is needed for presets:

   | Preset | Slice | Window |
   |---|---|---|
   | today | `PT1H` | current day |
   | week | `PT24H` | last 7 days |
   | month | `PT24H` | last 30 days |
   | year | `P1M` | last 365 days |

4. **Slice dropdown + From/To pickers are `custom`-only.** They render solely when
   `range === 'custom'`; presets show just the single range dropdown. The custom range keeps its own
   slice state (`customSlice`, default `PT24H`).
5. **Effective slice is derived, not stored for presets:**
   `slice = range === 'custom' ? customSlice : PRESET_SLICE[range]`. The existing `tooFine` guard,
   `rangeToDates`, and `useUsage({ start, end, slice, zone })` all read this derived `slice`
   unchanged — no data-layer changes.

### Touched files

- `src/features/admin/usageChart.ts` — `'year'` added to `RangePreset`; `PRESET_SLICE` map added;
  `rangeToDates` handles `year`.
- `src/features/admin/pages/AnalyticsPage.tsx` — range dropdown, derived slice, `custom`-gated
  slice/date controls, extracted shared `SelectControl` (styled `<select>` + chevron, reused by both
  the range and slice dropdowns).
- `src/lib/i18n/locales/{en,ru}/admin.json` — added `analytics.range.year` ("Year" / "Год").

Verified with `npm run typecheck` (the only automated gate).
