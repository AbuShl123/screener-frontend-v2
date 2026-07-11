# Plan: Classification rule settings (Settings modal → Per-ticker thresholds)

> Status: proposed (2026-07-11). Builds on the already-shipped **Notifications** settings
> (see [`notifications-settings.md`](notifications-settings.md), which documents the Settings
> modal shell, the ticker-list data layer, and the module conventions this plan extends).
>
> Adds the **Classification rules** section to the existing Settings overlay. Today that nav item
> is present but inert (dimmed + `SOON`); this plan makes it live. The section lets a user override
> the backend's default per-tier classification thresholds for a specific `(symbol, market)` book —
> search a ticker → edit its four tier thresholds (min notional + max distance) → save or revert.
> Unlike Notifications (frontend-only localStorage filters), these rules are **backend-persisted**
> conventional CRUD against `/api/rules`.
>
> Sources of truth used while writing this plan:
> - Design template **"Dashboard Page Template - Final"** (`claude-design` project `7a30348a-…`),
>   `DashboardPage.dc.html` — the Classification-rules pane (intro + `?` info toggle, ticker search,
>   inline tier editor, "Your custom rules" list) and its visual-state JS (`customRules`, `selectRule`,
>   `editorTiersFor`, `saveRule`, `revertSelected`, `defaultTiersFor`).
> - [`.claude/docs/classification-rule-api.md`](../docs/classification-rule-api.md) — the full
>   `/api/rules` contract: default rule, custom-rule list, get-one, bulk PUT upsert, DELETE, and the
>   validation/error shapes.
> - The shipped settings module as the structural template:
>   [`schemas.ts`](../../src/features/settings/schemas.ts), [`api.ts`](../../src/features/settings/api.ts),
>   [`queries.ts`](../../src/features/settings/queries.ts),
>   [`components/`](../../src/features/settings/components/) (`SettingsModal`, `MutedTickers`).
> - The auth module's two-file Zod split (server-response schemas vs form-input validation) and
>   `withAuth` refresh-on-403-then-retry: [`schemas.ts`](../../src/features/auth/schemas.ts),
>   [`validation.ts`](../../src/features/auth/validation.ts), [`session.ts`](../../src/features/auth/session.ts),
>   [`client.ts`](../../src/lib/api/client.ts), [`queries.ts`](../../src/features/auth/queries.ts).
> - Shared display helpers: [`format.ts`](../../src/features/orderbook/format.ts) (`fmtSymbol`,
>   `marketBadge`, `fmtMoney`), [`tiers.ts`](../../src/features/orderbook/tiers.ts) (`TIER_COLORS`),
>   [`types.ts`](../../src/features/orderbook/types.ts) (`bookKey`, `Market`).
> - CLAUDE.md — "classification rules and billing are conventional CRUD screens; use ordinary React
>   state and TanStack Query there without over-engineering."

## 1. Goal

Make the **Classification rules** nav item live. Its pane lets the user:

1. **Search** the active ticker universe (`GET /api/tickers`, already wired for Muted tickers) and
   open any `(symbol, market)` book for editing.
2. **Edit** that book's four tier thresholds — for each tier 1–4, a **min notional** (USD) and a
   **max distance** from mid-price (shown as a %). The editor prefills from the user's existing
   custom rule if one exists, otherwise from the server default (normal or high-liquidity table).
3. **Save** the rule (`PUT /api/rules`) — creates or replaces the custom rule for that one book.
4. **Revert** a custom rule back to the default (`DELETE /api/rules`).
5. See a **"Your custom rules"** list (`GET /api/rules`) of every book they've overridden, each with
   Edit / Revert actions.

Rule edits take effect **live** on the running feed — the backend retargets the user's open
WebSocket session and pushes a fresh snapshot within ~100ms; no reconnect, no client action beyond
refetching the custom-rule list (§8).

Out of scope (unchanged): Notifications section (shipped), **Appearance** (still inert). No changes
to the order-book grid or the socket protocol.

## 2. Locked decisions (from design Q&A)

| Decision | Choice | Rationale |
|---|---|---|
| **Persistence** | **Backend** via `/api/rules` (TanStack Query), not localStorage | These are real server-side rules that change classification for the account, not device-local view filters. Opposite of the Notifications section — call that out so the two aren't conflated. |
| **Access gating (EXPIRED user)** | **Full UI, 403 on save** | Render the full interactive pane for everyone. `GET /api/rules/default` and `/api/tickers` are ungated, so search + editor prefill always work. When an EXPIRED user hits Save/Revert, the gated endpoint's JSON `403 "Active subscription required"` surfaces as an **inline error + Upgrade CTA** (not a crash). The gated `GET /api/rules` list degrades to the same inline note instead of a hard error. |
| **Editor scope** | **Single ticker per edit** (match template) | One `(symbol, market)` at a time → one `PUT` with a single `assignment`/`target`. The API's bulk-apply (one rule → many targets, ≤200 pairs) is left as noted future work. |
| **Editor state ownership** | **Local React state + TanStack Query** (not Zustand) | Conventional CRUD screen per CLAUDE.md. The real-time-firehose store pattern does not apply here — nothing on this surface touches the flush hot path. |

## 3. What the design template provides (pane anatomy)

The `tabRules` branch of `DashboardPage.dc.html` is a faithful mock of exactly this feature. Three
stacked blocks inside the content pane:

1. **Intro + search** (`<section>`):
   - Heading **"Per-ticker thresholds"** + a `?` toggle that reveals a one-paragraph explanation
     (each tier pairs a min notional with a max distance; a custom rule replaces the default
     entirely, all four tiers). Right-aligned **`{n} CUSTOM`** count badge (accent).
   - Search input ("Search … tickers to edit rules…") → dropdown of up to 8 matches. Each row:
     symbol + PERP/SPOT badge + a **`CUSTOM`** chip if already overridden + an "Edit rules ›" affordance.
     Clicking a row selects it for editing.
2. **Inline rule editor** (shown when a ticker is selected):
   - Header: symbol + market badge + a **source badge** (`CUSTOM RULE` / `HIGH-LIQ DEFAULT` / `DEFAULT`)
     + a close ×.
   - A 3-column grid — **TIER | MIN NOTIONAL (USD) | MAX DISTANCE FROM MID** — with four rows
     ordered **T4 → T1**, each a colored tier dot + a `$`-prefixed notional text input + a
     `%`-suffixed distance text input.
   - Footer: **"Revert to default"** (only when the selected book is custom) + **"Save custom rule"**.
3. **"Your custom rules"** list: one row per override — symbol + badge + a compact summary
   (`$200K–$5.00M · 0.5–4%`) + **Edit** + **Revert** buttons. Dashed empty state when none.

The template's `renderVals()` computes all of this from a local `customRules` map and a hardcoded
`defaultTiersFor()`. **Our job is to replace those two local sources with the real endpoints** and
wire Save/Revert to `PUT`/`DELETE`; the markup, spacing, copy, and interaction model port 1:1.

## 4. Template visual-state → real API mapping

| Template (visual state) | Real source |
|---|---|
| `defaultTiersFor(symbol)` (hardcoded normal/high-liq tables) | `GET /api/rules/default` → `{ normalTiers, highLiquiditySymbols, highLiquidityTiers }` |
| `state.customRules` (local map keyed `SYMBOL\|MARKET`) | `GET /api/rules` → `[{ symbol, market, tiers }]` |
| `selectRule(key)` prefill from custom-or-default | Look up the book in the `GET /api/rules` list; fall back to the default table (high-liq vs normal by `highLiquiditySymbols`) |
| `saveRule()` (writes local map) | `PUT /api/rules` with one `assignment` (`rule.tiers`) + one `target` |
| `revertSelected()` / row `onRevert` (deletes from local map) | `DELETE /api/rules` with one `target` |
| `tickerPool()` (hardcoded universe) | `useTickers()` (already built) → FUTURES row always + SPOT row iff `hasSpot` |
| Source badge `CUSTOM RULE / HIGH-LIQ DEFAULT / DEFAULT` | Derived: in custom list? → CUSTOM; else `highLiquiditySymbols.includes(symbol)` ? HIGH-LIQ DEFAULT : DEFAULT |

Note the key format: the template uses `SYMBOL|MARKET`, but everywhere in our app we key books with
[`bookKey(symbol, market)`](../../src/features/orderbook/types.ts) (`SYMBOL:MARKET`) — reuse that, as
Muted tickers already does. `GET /api/rules/{symbol}/{market}` (get-one) is **not needed**: the
`GET /api/rules` list already contains every custom rule, so prefill reads from the cached list
rather than a per-ticker round trip.

## 5. Prerequisite: extend the API client to `PUT`/`DELETE`

[`lib/api/client.ts`](../../src/lib/api/client.ts) currently types `method?: 'GET' | 'POST'`. The
rules feature is the first to need `PUT` and `DELETE`. Widen the union:

```ts
method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
```

No other change — `request()` already attaches a JSON body when `body !== undefined` (works for the
`PUT` and body-carrying `DELETE`), handles the empty-2xx success (`PUT`/`DELETE` return an empty
body), and throws the JSON-envelope `ApiError` for `400`/`403`. This is additive and touches no
existing call site.

## 6. New / changed files

Extend the existing `src/features/settings/` module (it already owns the modal shell + ticker data
layer). Server-response schemas go in the existing `schemas.ts`; form-input parsing/validation gets
its own `rulesValidation.ts` — the same two-Zod-concern split the auth module keeps
(`schemas.ts` = server responses; `validation.ts` = form inputs).

```
src/features/settings/
  schemas.ts            (edit)  + rule schemas: tierThreshold, defaultRule, customRule(list)
  api.ts                (edit)  + defaultRule / customRules / putRules / deleteRules
  queries.ts            (edit)  + rulesKeys, useDefaultRule, useCustomRules, useSaveRule, useDeleteRule
  rulesValidation.ts    (new)   form parse/format + validateTiers() mirroring the backend checks
  components/
    ClassificationRules.tsx  (new)  the pane: intro + info toggle + search + selection state
    RuleEditor.tsx           (new)  inline 4-tier editor; Save/Revert; inline error
    CustomRulesList.tsx      (new)  "Your custom rules" list with Edit/Revert
    SettingsModal.tsx        (edit) enable the `rules` nav item + render the pane
  index.ts              (unchanged — nothing new is imported from outside the feature)
lib/api/client.ts       (edit)  widen `method` union (§5)
```

### 6.1 `schemas.ts` (edit) — rule server-response schemas

```ts
export const tierThresholdSchema = z.object({
  tier: z.number(),          // 1–4
  minNotional: z.number(),   // USD
  maxDistance: z.number(),   // fraction, 0.05 = 5%
});

export const defaultRuleSchema = z.object({
  normalTiers: z.array(tierThresholdSchema),
  highLiquiditySymbols: z.array(z.string()),
  highLiquidityTiers: z.array(tierThresholdSchema),
});
export type DefaultRule = z.infer<typeof defaultRuleSchema>;

export const customRuleSchema = z.object({
  symbol: z.string(),
  market: z.enum(['SPOT', 'FUTURES']),
  tiers: z.array(tierThresholdSchema),
});
export const customRulesResponseSchema = z.array(customRuleSchema);
export type CustomRule = z.infer<typeof customRuleSchema>;
export type TierThreshold = z.infer<typeof tierThresholdSchema>;
```

Plain request-body types (no runtime validation — same treatment as auth request types, since we
author them):

```ts
export interface RuleTarget { symbol: string; market: Market }
export interface PutRulesRequest {
  assignments: { rule: { tiers: TierThreshold[] }; targets: RuleTarget[] }[];
}
export interface DeleteRulesRequest { targets: RuleTarget[] }
```

### 6.2 `api.ts` (edit) — the four rule endpoints

```ts
export function defaultRule(token: string): Promise<DefaultRule> {
  return request('/api/rules/default', { method: 'GET', token, schema: defaultRuleSchema });
}
export function customRules(token: string): Promise<CustomRule[]> {
  return request('/api/rules', { method: 'GET', token, schema: customRulesResponseSchema });
}
export function putRules(token: string, body: PutRulesRequest): Promise<void> {
  return request('/api/rules', { method: 'PUT', token, body });   // empty-body 200
}
export function deleteRules(token: string, body: DeleteRulesRequest): Promise<void> {
  return request('/api/rules', { method: 'DELETE', token, body }); // empty-body 200
}
```

All four take a token and route through `withAuth` in `queries.ts` (refresh-on-403-then-retry).

### 6.3 `queries.ts` (edit) — queries, mutations, keys

```ts
export const rulesKeys = {
  default: ['settings', 'rules', 'default'] as const,
  custom:  ['settings', 'rules', 'custom']  as const,
};

// Ungated endpoint — safe for any authenticated user (incl. EXPIRED). Defaults change rarely.
export function useDefaultRule(enabled: boolean) {
  const status = useSession((s) => s.status);
  return useQuery({
    queryKey: rulesKeys.default,
    queryFn: () => withAuth((t) => api.defaultRule(t)),
    enabled: enabled && status === 'authenticated',
    staleTime: 60 * 60_000,
  });
}

// Gated (active-subscription). For EXPIRED users this errors with the JSON 403 — handled in the UI.
export function useCustomRules(enabled: boolean) {
  const status = useSession((s) => s.status);
  return useQuery({
    queryKey: rulesKeys.custom,
    queryFn: () => withAuth((t) => api.customRules(t)),
    enabled: enabled && status === 'authenticated',
    staleTime: 5 * 60_000,
    retry: false, // don't hammer a subscription-403; it won't self-resolve
  });
}

export function useSaveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { target: RuleTarget; tiers: TierThreshold[] }) =>
      withAuth((t) => api.putRules(t, { assignments: [{ rule: { tiers: v.tiers }, targets: [v.target] }] })),
    onSuccess: () => qc.invalidateQueries({ queryKey: rulesKeys.custom }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (target: RuleTarget) => withAuth((t) => api.deleteRules(t, { targets: [target] })),
    onSuccess: () => qc.invalidateQueries({ queryKey: rulesKeys.custom }),
  });
}
```

`enabled` for both queries is driven by *(modal open **and** `tab === 'rules'`)* so we don't fetch
until the user actually visits the section (same lazy pattern as `useTickers`).

### 6.4 `rulesValidation.ts` (new) — form parse/format + backend-mirroring validation

The editor holds display strings (`"5,000,000"`, `"0.5"`); this module converts to/from the wire
model and validates **client-side with the backend's exact rules** so the user gets instant feedback
instead of a round-tripped `400`.

- `formatNotional(n: number): string` → `n.toLocaleString('en-US')` (`"5,000,000"`).
- `formatPercent(fraction: number): string` → trims trailing zeros (template's `fmtPct`:
  `parseFloat((f * 100).toFixed(4)).toString()`), e.g. `0.005` → `"0.5"`.
- `parseNotional(s: string): number` → strip non `[0-9.]`, `Number(...)`.
- `parsePercent(s: string): number` → strip → `Number(...) / 100` (fraction).
- `toEditorRows(tiers: TierThreshold[])` → sorted **T4→T1**, each `{ tier, minNotional: string, maxDistancePct: string }`.
- `validateTiers(rows): { ok: true; tiers: TierThreshold[] } | { ok: false; error: string }` —
  builds tiers 1–4 and enforces, with messages matching the doc's:
  - `minNotional` finite and `≥ 0` → else `"minNotional must be ≥ 0"`.
  - `maxDistance` in `(0, 0.1]` (percent in `(0, 10]`) → else `"maxDistance must be in (0, 0.1]"`.

  The other backend checks are structurally guaranteed by the UI and need no runtime guard: exactly
  four distinct tiers 1–4 (fixed four rows), `tier` in range, symbol tracked + market valid (the
  search pool only offers `(symbol, market)` pairs from `/api/tickers`, SPOT only when `hasSpot`),
  and ≤200 targets (we send one).

### 6.5 `components/ClassificationRules.tsx` (new) — the pane

Props `{ open: boolean }` (threads the lazy-fetch gate down, like `NotificationsSettings`).

- Local state: `query` (search box) and `selected: RuleTarget | null` (open editor).
- Data: `useDefaultRule(open)`, `useCustomRules(open)`, `useTickers(open)`.
- **Ticker pool + search**: reuse the exact pool-building from
  [`MutedTickers`](../../src/features/settings/components/MutedTickers.tsx) (FUTURES row always +
  SPOT iff `hasSpot`) — extract that into a shared `buildTickerPool(tickers)` (or a tiny
  `useTickerPool()` hook) so both blocks share one definition instead of duplicating. Results:
  `pool.filter(symbol includes query.toUpperCase()).slice(0, 8)`, each annotated `isCustom` from the
  `useCustomRules` data; clicking sets `selected`.
- Renders: intro heading + `?` info toggle (local boolean) + `{customRules.length} CUSTOM` badge;
  the search input + results dropdown; `<RuleEditor key={bookKey(selected)} … />` when `selected`
  (the `key` forces a fresh editor buffer per ticker); a hairline divider; `<CustomRulesList />`.
- **Prefill source** passed to `RuleEditor`: the matching entry from `useCustomRules` if present
  (source `CUSTOM RULE`); else the default table — `highLiquiditySymbols.includes(symbol)` ?
  `highLiquidityTiers` (source `HIGH-LIQ DEFAULT`) : `normalTiers` (source `DEFAULT`).
- **Degraded/loading**: while `useDefaultRule` loads, the editor prefill isn't ready — disable row
  inputs or show a one-line "Loading defaults…". If `useCustomRules` errored with a subscription
  `403` (EXPIRED user), the `CUSTOM` count + custom list render a small inline
  "Active subscription required — [Upgrade]" note instead of the list (see §7); search + editor
  still work off the ungated default.

### 6.6 `components/RuleEditor.tsx` (new) — inline tier editor

Props: `{ target: RuleTarget; source: 'CUSTOM' | 'HIGH_LIQ' | 'DEFAULT'; initialTiers: TierThreshold[]; isCustom: boolean; onClose: () => void }`.

- Seeds local `rows` state from `toEditorRows(initialTiers)` on mount (fresh per `key` remount).
- Header: `fmtSymbol` + `marketBadge` + source badge (CUSTOM RULE / HIGH-LIQ DEFAULT / DEFAULT,
  accent-tinted only when custom) + close ×.
- Four rows T4→T1: tier dot from `TIER_COLORS[tier]`, `$`-adorned notional input, `%`-adorned
  distance input. Controlled text inputs updating `rows`.
- Footer: **Save custom rule** → `validateTiers(rows)`; on failure show the message inline; on
  success call `useSaveRule().mutate({ target, tiers })`. **Revert to default** (only when
  `isCustom`) → `useDeleteRule().mutate(target)`.
- Pending/error UI: disable buttons while `isPending`; on mutation error, distinguish
  `ApiError` `403` **with a message** (subscription — inline "Active subscription required" +
  Upgrade link to billing) from a `400` (show the backend `message` verbatim — it's user-safe) from
  anything else (generic "Couldn't save — try again"). See §7.
- On save success the `rules` cache is invalidated (§6.3) → the source badge flips to `CUSTOM RULE`
  and the book appears in the list on refetch; keep the editor open showing the saved values.

### 6.7 `components/CustomRulesList.tsx` (new) — "Your custom rules"

- Reads `useCustomRules(open)` (or receives the data from the parent to avoid a second subscription).
- Each row: `fmtSymbol` + `marketBadge` + summary
  (`${fmtMoney(t1.minNotional)}–${fmtMoney(t4.minNotional)} · ${formatPercent(t1.maxDistance)}–${formatPercent(t4.maxDistance)}%`)
  + **Edit** (→ parent `onSelect(target)`, reusing the same selection that search drives) + **Revert**
  (`useDeleteRule().mutate(target)`).
- Empty state: dashed "No custom rules — all tickers follow the defaults".
- Subscription-`403` state: the inline upgrade note from §6.5 stands in for the list.

### 6.8 `components/SettingsModal.tsx` (edit) — enable the section

- In `NAV`, flip `{ id: 'rules', … disabled: true }` → `disabled: false` and drop its `SOON` chip
  (Appearance keeps `disabled: true` + `SOON`).
- In the content pane, add the branch: `{tab === 'rules' && <ClassificationRules open={open} />}`
  (alongside the existing `notifications` branch).

No change to the modal shell, backdrop, Escape handling, or scroll lock.

## 7. Access & error handling (the "403 on save" decision)

Two distinct `403`s, per the API doc — handle them differently:

- **Empty-body `403`** (missing/expired JWT): synthesized into an `ApiError` by `client.ts` and
  consumed by `withAuth`, which refreshes and retries once. If it still fails, the session layer
  clears and the route guards bounce to `/login`. **No rules-specific handling needed** — this is
  the existing auth path.
- **JSON-body `403 "Active subscription required"`** (valid JWT, lapsed access): `withAuth` refreshes
  + retries (harmless), still gets the `403`, and throws the `ApiError` (status `403`, non-empty
  `message`). This is what the rules UI must catch:
  - **On save/revert** (the primary path per the locked decision): show an inline
    "Active subscription required" note under the editor with an **Upgrade →** link to the billing
    plans page, instead of a raw error.
  - **On the `GET /api/rules` list**: `useCustomRules` lands in `isError` with the same `ApiError`;
    render the inline upgrade note in place of the list. Search + editor prefill keep working because
    `GET /api/rules/default` and `/api/tickers` are ungated.

Detection: `err instanceof ApiError && err.status === 403 && !!err.message` ⇒ subscription (empty
message ⇒ auth, already handled upstream). `ADMIN` users bypass the gate server-side, so they never
hit this branch. A `400` from `PUT` (validation) surfaces its `message` verbatim — it's the
user-safe backend envelope — though client-side `validateTiers` should catch these first.

## 8. Live-effect note

Per the doc, a successful `PUT`/`DELETE` rebuilds the user's classification context server-side and
retargets every open WebSocket session, pushing a fresh snapshot on the next broadcaster tick
(≤100ms). So **the order-book grid updates itself** through the existing feed pipeline — this plan
adds no client-side refresh of orderbook state. The only client follow-up is invalidating
`rulesKeys.custom` (§6.3) so the "Your custom rules" list and source badges reflect the write.

## 9. Data-flow summary

```
SettingsModal (tab='rules') ──► ClassificationRules(open)
   │                                   │
   │   useDefaultRule (ungated) ───────┤  prefill + source label (normal vs high-liq)
   │   useTickers (ungated) ───────────┤  search pool (FUTURES + SPOT iff hasSpot)
   │   useCustomRules (gated) ─────────┤  CUSTOM badges + "Your custom rules" list
   ▼                                   ▼
 search / select (symbol, market) ─► RuleEditor(key=bookKey)
                                        │  validateTiers() [backend-mirroring]
                                        ├─ Save   → useSaveRule  → PUT /api/rules  ─┐
                                        └─ Revert → useDeleteRule → DELETE /api/rules ┤
                                                                                     ▼
                                                        invalidate rulesKeys.custom (list/badges refresh)
                                                        backend retargets WS session → grid updates ≤100ms
```

Consistent with CLAUDE.md's data-flow split: all rule state is REST → TanStack Query cache; nothing
touches the real-time store or the flush hot path.

## 10. Design-token / template notes

- The template uses raw `var(--color-*)`; every one maps to an existing semantic Tailwind token
  class already used across the modal (`bg-surface`, `bg-input`, `border-border`,
  `border-border-subtle`, `border-border-input`, `text-text`, `text-text-strong`,
  `text-text-secondary`, `text-text-muted`, `text-text-dim`, `text-accent`, `text-danger`). Use the
  token classes, not hex.
- Tier dots reuse `TIER_COLORS` (data-viz values, not theme tokens) — same as `MinimumTierControl`.
- Fonts: `font-mono` for symbols, tier labels, badges, threshold inputs, summaries; `font-sans` for
  headings/body and the Save/Revert/Edit buttons (matches the template).
- Market badges come from the shared `marketBadge()` helper so PERP/SPOT read identically to the
  order-book cards and Muted tickers.

## 11. Edge cases & tradeoffs

- **Numeric input hygiene.** Notional inputs accept commas for readability; `parseNotional` strips
  non-numerics before `PUT`. Distance is entered as a percent and divided by 100 on submit (doc:
  send the fraction). Empty/garbage inputs fail `validateTiers` with a clear message before any call.
- **Tier order.** `GET /api/rules` may return tiers in any order (doc); always sort T4→T1 for display
  and rebuild the full 1–4 set on submit. The `PUT` body order doesn't matter (backend sorts).
- **Prefill source freshness.** After a save, the invalidated `rulesKeys.custom` refetch flips the
  source badge to CUSTOM and adds the list row; the open editor keeps the just-saved values.
- **Revert of a non-custom book** is a no-op server-side (`DELETE` is idempotent, `200`), so a
  double-revert or reverting a default book is harmless — but the Revert button only renders for
  custom books anyway.
- **Default table staleness.** Defaults change rarely; `staleTime: 60min` + refetch on section open
  is plenty. Custom list `staleTime: 5min`, invalidated on every write.
- **Ticker delisting.** A custom rule for a symbol that later delists simply stops being applied;
  its list row is harmless and revertable. The search pool reflects the live `/api/tickers`.
- **`GET /api/rules` and access.** For ACTIVE/TRIAL/ADMIN it lists overrides; for EXPIRED it 403s and
  degrades to the inline upgrade note (§7) — the section never hard-crashes.

## 12. Verification

- `npm run typecheck` (or `npm run build`) — the only automated check; run before considering it done.
- Manual (user drives; no browser automation per CLAUDE.md):
  - Classification rules nav item is now clickable (Appearance still inert with `SOON`).
  - Search finds tickers; opening one with no override prefills the default table and labels the
    source `DEFAULT` / `HIGH-LIQ DEFAULT` correctly (BTC/ETH/SOL → high-liq).
  - Editing thresholds + Save creates a custom rule: source badge flips to `CUSTOM RULE`, the row
    appears in "Your custom rules", and the live feed reclassifies within ~100ms.
  - Invalid input (blank notional, distance `0` or `> 10`) is blocked inline with a clear message,
    no network call.
  - Revert removes the override and the book returns to the default rule.
  - As an EXPIRED user: search + editor still populate from defaults, but Save shows the inline
    "Active subscription required" + Upgrade link, and the custom list shows the same note.

## 13. Out of scope (future)

- **Bulk multi-ticker apply** (one rule → many targets in a single `PUT`, ≤200 pairs) — the API
  supports it; this plan ships single-ticker editing.
- **Appearance** section — still inert.
- A dedicated read-only "default thresholds" reference table separate from the editor prefill (the
  editor already surfaces the defaults per selected book).
- `GET /api/rules/{symbol}/{market}` (get-one) — unused; prefill reads the cached list.
