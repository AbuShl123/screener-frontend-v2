# Plan: Notifications settings (Settings modal → Minimum tier + Muted tickers)

> Status: implemented (2026-07-11). Amended 2026-07-11: tier 0 removed entirely from the
> minimum-tier control — see §11.
>
> Adds the **Settings** surface to the dashboard: a full-screen overlay modal opened from the header
> gear icon, with a left nav rail (Notifications · Classification rules · Appearance). Only the
> **Notifications** section is built here; the other two are shown but inert. The Notifications
> section exposes two controls — **Minimum tier** and **Muted tickers** — that filter the existing
> notification pipeline.
>
> Sources of truth used while writing this plan:
> - Design template **"Dashboard Page Template - Final"** (`claude-design` project
>   `7a30348a-…`), `DashboardPage.dc.html` — the Settings modal shell (nav rail, Minimum tier
>   segments, Muted tickers search/list) and its visual-state JS.
> - The already-built notification pipeline: [`feedClient.ts`](../../src/lib/ws/feedClient.ts) `flush()`,
>   [`cooldown.ts`](../../src/features/orderbook/notifications/cooldown.ts),
>   [`selectNotifications.ts`](../../src/features/orderbook/notifications/selectNotifications.ts),
>   [`notificationStore.ts`](../../src/stores/notificationStore.ts),
>   [`tiers.ts`](../../src/features/orderbook/tiers.ts), [`types.ts`](../../src/features/orderbook/types.ts).
> - [`.claude/docs/classification-rule-api.md`](../docs/classification-rule-api.md) — "Fetching the
>   Active Ticker List" (`GET /api/tickers`).
> - The auth module as the structural template for a framework-agnostic store + guarded localStorage +
>   `withAuth`-wrapped REST + React Query hook:
>   [`storage.ts`](../../src/features/auth/storage.ts), [`session.ts`](../../src/features/auth/session.ts),
>   [`client.ts`](../../src/lib/api/client.ts), [`queries.ts`](../../src/features/auth/queries.ts).
> - CLAUDE.md — "keep the real-time firehose out of React"; conventional CRUD screens use ordinary
>   React state + TanStack Query.

## 1. Goal

When the user clicks the header **⚙** icon, expand a Settings overlay covering the dashboard. Its
Notifications section lets the user:

1. **Minimum tier** — pick a tier `1–4`; only order-book levels **at or above** it are surfaced as
   notifications. Tier is a bid/ask "importance" label (see the classification doc). `minTier = 3`
   ⇒ only tier-3 and tier-4 levels notify. Tier 0 is not offered as a choice — see §11.
2. **Muted tickers** — mute specific `(symbol, market)` books so they **never** produce
   notifications. The mute picker is driven by the live active-ticker list from `GET /api/tickers`.

Both are **frontend-only filters layered on top of the existing pipeline** — the backend keeps
streaming every book over `/ws`; we decide client-side what reaches the notifications panel.

Out of scope (shown but inert): **Classification rules** and **Appearance** nav items. No changes to
the order-book grid, cards, or the socket protocol.

## 2. Locked decisions (from design Q&A)

| Decision | Choice | Rationale |
|---|---|---|
| **Persistence** | **localStorage**, per-device | No backend endpoint exists for these — they're pure client filters. Same guarded-storage pattern as auth tokens ([`storage.ts`](../../src/features/auth/storage.ts)). Survives reloads; no cross-device sync (acceptable). |
| **Where the filter runs** | **Push boundary** — in `feedClient.flush()`, before `notificationStore.push()` | Muted / below-tier candidates **never enter the store**, so the `N NEW` unread counter stays honest. `flush()` already reads Zustand stores via `getState()` (it reads `useSession`), so reading a settings store there is the established seam. |

Additional low-stakes defaults chosen here (stated for the record):

- **Non-retroactive.** Changing a setting affects only **future** flushes. Notifications already in
  the store when you raise `minTier` or mute a ticker stay visible until cleared/evicted. This
  matches the existing cooldown model (dedup is also forward-only) and avoids re-scanning the store
  on every settings change. Noted again in §8.
- **Muted key format = `bookKey(symbol, market)`** (`SYMBOL:MARKET`, e.g. `BTCUSDT:FUTURES`) — reuse
  the app's one canonical book key ([`types.ts`](../../src/features/orderbook/types.ts)) rather than
  the template's `SYMBOL|MARKET` string, so the same key is used everywhere.
- **Settings are device-level, not per-user.** They persist across logout/login on the same device
  (like a theme). Revisit only if shared-device multi-user muting becomes a real concern.
- **Tier segments show only T1–T4** — tier 0 is not offered as a choice, since notifications are
  never tier 0 (see `selectNotifications`) and a T0 option would be a dead control. Default
  `minTier = 1`, caption reads "All tiers notify." (Originally implemented with T0 shown to match
  the template 1:1; removed per §11.)

## 3. Where the filter runs — and why it's the right seam

The pipeline today ([`feedClient.ts`](../../src/lib/ws/feedClient.ts) `flush()`):

```
applyMessages(batch) → candidates
    → filterAnnounced(candidates)   // cooldown dedup
    → notificationStore.push(fresh)
```

New pipeline — insert the settings filter **before** cooldown:

```
applyMessages(batch) → candidates
    → filterBySettings(candidates, minTier, mutedSet)   // NEW (tier + mute)
    → filterAnnounced(...)                              // cooldown dedup
    → notificationStore.push(fresh)
```

**Order matters — settings first, cooldown second.** A muted/below-tier candidate is dropped before
it can write a cooldown entry, so later **un**-muting or lowering the tier lets that order announce
fresh instead of being silenced by a stale cooldown record.

`flush()` reads the settings synchronously from the Zustand store via `getState()` — the same
framework-agnostic access pattern the feed client already uses for `useSession` and
`useOrderbookStore`. No React involvement on the hot path.

## 4. New feature module: `src/features/settings/`

A dedicated module (it will later also host Classification rules + Appearance), structured after the
auth module's separation of concerns. Barrel-exported per the project convention.

```
src/features/settings/
  storage.ts                         guarded localStorage load/save (minTier + muted)
  notificationSettingsStore.ts       Zustand store (framework-agnostic; hydrates from storage,
                                     persists on change) — read by feedClient via getState()
  schemas.ts                         Zod schema for GET /api/tickers response + inferred types
  api.ts                             tickers(token) over request()
  queries.ts                         useTickers() (withAuth + useQuery) + settingsKeys
  components/
    SettingsModal.tsx                overlay + dialog shell + nav rail + tab switch
    NotificationsSettings.tsx        composes the two sections below
    MinimumTierControl.tsx           T0–T4 segmented control (reuses TIER_COLORS)
    MutedTickers.tsx                 search → results → muted chips
  index.ts                           barrel (SettingsModal, useNotificationSettingsStore)
```

Plus one pure helper co-located with the existing notification pipeline (not in `settings`, so
`orderbook` stays free of a settings-store dependency):

```
src/features/orderbook/notifications/settingsFilter.ts   pure filterBySettings(...)
```

## 5. File-by-file

### 5.1 `settings/storage.ts` (new)

Mirror [`auth/storage.ts`](../../src/features/auth/storage.ts): thin, fully try/catch-guarded so
disabled/private-mode storage can't crash boot.

- Keys: `screener.settings.minTier`, `screener.settings.mutedTickers`.
- `loadSettings(): { minTier: number; muted: string[] }` — returns defaults `{ minTier: 1, muted: [] }`
  on any missing/malformed value. `minTier` clamped to `1–4` (see §11 — tier 0 removed); `muted`
  parsed from JSON, coerced to a `string[]` (drop non-strings), deduped.
- `saveSettings(s: { minTier: number; muted: string[] }): void` — best-effort write (JSON-stringify
  `muted`).

### 5.2 `settings/notificationSettingsStore.ts` (new)

Framework-agnostic Zustand store (created with `create`, like `useSession` / `useOrderbookStore`),
hydrated at module load from `loadSettings()` so `getState()` is correct before React mounts.

```ts
interface NotificationSettingsState {
  minTier: number;        // 1–4 (tier 0 removed from the choice set — see §11)
  muted: string[];        // bookKey(symbol, market) values
  setMinTier(t: number): void;
  mute(key: string): void;
  unmute(key: string): void;
}
```

- Each action updates state **and** calls `saveSettings(...)` with the next values (same "action
  persists" shape as `saveTokens` in the auth store).
- `mute` is a no-op if the key is already present; `unmute` filters it out.
- No `isMuted` selector needed in the store — the hot-path lookup builds a `Set` in `filterBySettings`
  (§5.7), and the UI derives membership locally.

### 5.3 `settings/schemas.ts` (new)

Zod (REST response → validated, per CLAUDE.md), following the doc's shape:

```ts
export const tickerSchema = z.object({
  symbol: z.string(),
  hasFutures: z.boolean(),
  hasSpot: z.boolean(),
});
export const tickersResponseSchema = z.object({
  total: z.number(),
  spotCount: z.number(),
  futuresCount: z.number(),
  tickers: z.array(tickerSchema),
});
export type TickersResponse = z.infer<typeof tickersResponseSchema>;
export type Ticker = z.infer<typeof tickerSchema>;
```

### 5.4 `settings/api.ts` (new)

```ts
export function tickers(token: string): Promise<TickersResponse> {
  return request('/api/tickers', { token, schema: tickersResponseSchema });
}
```

`/api/tickers` needs a JWT but **not** an active subscription, so only the empty-body 403 (auth) is
possible — `withAuth` (§5.5) handles refresh-and-retry.

### 5.5 `settings/queries.ts` (new)

```ts
export const settingsKeys = { tickers: ['settings', 'tickers'] as const };

export function useTickers(enabled: boolean) {
  const status = useSession((s) => s.status);
  return useQuery({
    queryKey: settingsKeys.tickers,
    queryFn: () => withAuth((token) => api.tickers(token)),
    enabled: enabled && status === 'authenticated',
    staleTime: 30 * 60_000,   // backend refreshes the list every 3–4h; re-fetch is cheap
  });
}
```

`enabled` is driven by the modal being open (don't fetch the ticker list until the user actually
opens settings). `withAuth` gives refresh-on-403-then-retry for free.

### 5.6 `settings/components/*` (new)

**`SettingsModal.tsx`** — props `{ open: boolean; onClose: () => void }`. Ports the template's modal:

- Fixed full-screen backdrop (`bg` at ~72% + `backdrop-blur`), centered dialog
  (`max-width: 1040px`, `height: min(88vh, 660px)`), `role="dialog" aria-label="Settings"`. Animate
  opacity/visibility + a subtle `scale` on `open` (template values).
- **Always mounted**, toggled via opacity/visibility/`pointer-events` like the template (keeps the
  entrance/exit transition and avoids remount). `onClose` fires on backdrop click, the header ×, and
  **Escape** (add a keydown listener while open). Stop propagation on the dialog so inner clicks don't
  close it.
- Owns local `tab` state, default `'notifications'`. Nav rail items:
  `Notifications` (clickable) · `Classification rules` (disabled) · `Appearance` (disabled). Disabled
  items are dimmed, `cursor: default`, no onClick, and carry a `SOON` chip (template styling). Active
  item gets the accent diamond marker + tinted background.
- Content pane renders `<NotificationsSettings />` when `tab === 'notifications'`; the other tabs
  aren't reachable (rail entries inert), so no other pane is needed yet.
- Use semantic design tokens throughout (`bg-surface`, `border-border`, `text-text-secondary`, …) —
  the template's `var(--color-*)` map 1:1 to the existing Tailwind token classes.

**`NotificationsSettings.tsx`** — vertical stack: `<MinimumTierControl />`, a hairline divider,
`<MutedTickers />`. Reads/writes `useNotificationSettingsStore` and passes down what each child needs
(or each child subscribes directly — either is fine; these are conventional React reads).

**`MinimumTierControl.tsx`** — the 4-segment T1–T4 control adapted from the template (which showed
T0–T4; tier 0 is dropped per §11):

- Reuse **`TIER_COLORS`** from [`orderbook/tiers.ts`](../../src/features/orderbook/tiers.ts) for the
  per-tier dot color, skipping index 0. This is the same shared tier scale the cards and
  notification stripes use — good cross-surface reuse, exactly what `tiers.ts`'s comment anticipated.
- `active = i >= minTier`; the segment where `i === minTier` gets the accent border (pivot). Click →
  `setMinTier(i)`.
- Caption below (mono, dim), derived: `minTier === 1` → "All tiers notify — nothing filtered by
  rank"; else "Notifying tier {minTier}–4 · tier 1–{minTier-1} filtered out".

**`MutedTickers.tsx`** — the search + results + chips block:

- Local `query` state. Derive the **ticker pool** from `useTickers(...)`: for each returned ticker,
  emit a `FUTURES` row (always) and a `SPOT` row iff `hasSpot`, as `{ symbol, market }`. Reuse
  `bookKey(symbol, market)` for the mute key.
- Results: when `query` is non-empty, `pool.filter(symbol includes query, uppercased) && not already
  muted`, `slice(0, 8)`. Each row shows `symbol` + a `PERP`/`SPOT` badge and a **Mute** button →
  `mute(key)`.
- Muted list: chips of `useNotificationSettingsStore().muted`, each with symbol + badge + `×` →
  `unmute(key)`. Empty state: "No muted tickers — every book can notify". Header shows `{n} MUTED`.
- Loading/error of `useTickers`: while loading, show a muted "Loading tickers…" hint under the search
  and leave the input usable (results appear when data lands); on error, a small "Couldn't load
  tickers" note. Muting is opt-in, so a failed fetch degrades gracefully (existing mutes still show
  and can be removed).
- Reuse the app's existing symbol display formatting (whatever `NotificationCard` uses) for the chip
  label so muted/notification symbols read identically.

**`index.ts`** — export `SettingsModal` and `useNotificationSettingsStore` (the latter is what
`feedClient` imports). Nothing outside the feature reaches internals.

### 5.7 `orderbook/notifications/settingsFilter.ts` (new, pure)

```ts
import { bookKey, type Notification } from '@/features/orderbook/types';

/** Keep only candidates at/above minTier and not in the muted set. Pure; no store access. */
export function filterBySettings(
  candidates: Notification[],
  minTier: number,
  muted: ReadonlySet<string>,
): Notification[] {
  if (candidates.length === 0) return candidates;
  if (minTier <= 1 && muted.size === 0) return candidates; // fast path: nothing to filter
  return candidates.filter(
    (n) => n.tier >= minTier && !muted.has(bookKey(n.symbol, n.market)),
  );
}
```

Pure and store-agnostic (takes a prepared `Set`), so `orderbook` gains no dependency on the settings
module — `feedClient` is the wiring point.

### 5.8 `lib/ws/feedClient.ts` (modified)

In `flush()` only, between `applyMessages` and `filterAnnounced`:

```ts
const candidates = useOrderbookStore.getState().applyMessages(batch);
const { minTier, muted } = useNotificationSettingsStore.getState();
const allowed = filterBySettings(candidates, minTier, new Set(muted));
const fresh = filterAnnounced(allowed);
if (fresh.length) useNotificationStore.getState().push(fresh);
```

(Building `new Set(muted)` per flush is negligible — `muted` is a handful of entries and most flushes
raise zero candidates anyway; `filterBySettings` early-returns before touching the set when nothing
is configured.) Import `useNotificationSettingsStore` from `@/features/settings` and `filterBySettings`
from the orderbook notifications folder. No other feedClient change.

### 5.9 `orderbook/components/DashboardHeader.tsx` (modified)

- Add prop `onOpenSettings: () => void` (and optionally `settingsOpen: boolean` for active styling).
- Wire the existing ⚙ button's `onClick` to `onOpenSettings`; drop the "inert placeholder" comment.
- Optional: when `settingsOpen`, apply the template's active button styling (accent border + tinted
  bg) so the gear reads as "open."

### 5.10 `orderbook/pages/DashboardPage.tsx` (modified)

- Add `const [settingsOpen, setSettingsOpen] = useState(false);` (parallels the existing `notifOpen`).
- Pass `onOpenSettings={() => setSettingsOpen(true)}` (and `settingsOpen`) to `<DashboardHeader />`.
- Render `<SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />` as a sibling
  overlay (alongside the notification panel/handle), imported from `@/features/settings`.

## 6. Data flow summary

```
DashboardHeader ⚙ ──► DashboardPage settingsOpen ──► SettingsModal
                                                       │
        ┌──────────────────────────────────────────────┼───────────────────────────┐
        ▼                                                ▼                           ▼
  MinimumTierControl                               MutedTickers                useTickers()
  setMinTier(t) ──►                                mute/unmute(key) ──►        (React Query,
        useNotificationSettingsStore (Zustand, OUTSIDE React) ◄───────────────  GET /api/tickers)
                    │  (persists to localStorage on every change)
                    ▼  read synchronously via getState()
  feedClient.flush(): applyMessages → filterBySettings(minTier, mutedSet) → filterAnnounced → push
```

REST (tickers) → TanStack Query. Settings state → framework-agnostic Zustand read outside React by
the feed client. Consistent with CLAUDE.md's data-flow split.

## 7. Design-token / template notes

- The template uses raw `var(--color-*)`; every one maps to an existing semantic Tailwind token
  class (`bg-surface`, `bg-surface-marketing`, `border-border`, `border-border-subtle`,
  `border-border-input`, `text-text`, `text-text-secondary`, `text-text-strong`, `text-text-muted`,
  `text-text-dim`, `text-accent`, `text-danger`, `bg-input`). Use the token classes, not hex.
- Tier dot colors come from `TIER_COLORS` (data-viz values), **not** theme tokens — reuse the module.
- Fonts: mono (`font-mono`) for tier labels, badges, ticker symbols, captions; sans for headings/body.

## 8. Edge cases & tradeoffs

- **Non-retroactive filtering (accepted).** Raising `minTier` / muting doesn't retro-remove
  already-shown notifications; unmuting / lowering doesn't resurrect past ones. Forward-only, like
  cooldown. If a "clear now-filtered notifications on change" behavior is ever wanted, it's an additive
  store method — out of scope here.
- **T0 removed, not just hidden.** Notifications are never tier 0, so a T0 choice would be dead
  weight — see §11 for the amendment that dropped it from the control (and from the valid
  `minTier` range) after the initial template-matching implementation.
- **Muted key uses `bookKey`** so `(BTCUSDT, SPOT)` and `(BTCUSDT, FUTURES)` mute independently — the
  granularity the doc and template both assume.
- **Ticker list staleness.** The list changes every 3–4h server-side; `staleTime` 30 min + re-fetch
  on modal open (via `enabled`) is enough. A muted ticker that later delists simply stops appearing in
  the feed; its chip is harmless and removable.
- **Storage unavailable.** `saveSettings`/`loadSettings` are guarded; settings then behave as
  in-memory for the session — no crash (same guarantee as auth tokens).
- **Persistence across users on a shared device (accepted).** Device-level, not per-account.

## 9. Verification

- `npm run typecheck` (or `npm run build`) — the only automated check; run before considering it done.
- Manual (user drives, per CLAUDE.md — do **not** use browser automation):
  - Gear opens the overlay; ×, backdrop click, and Escape close it. Classification rules / Appearance
    are visibly present but not clickable.
  - Minimum tier: set T3 → only tier-3/4 notifications arrive going forward; caption updates; the
    choice survives a page reload.
  - Muted tickers: search finds tickers from `/api/tickers`, Mute adds a chip and stops that
    `(symbol, market)` from notifying; unmute restores it; mutes survive reload.
  - `N NEW` unread counter does **not** increment for muted / below-tier events (push-boundary filter).

## 11. Amendment (2026-07-11): tier 0 removed from the minimum-tier control

The initial implementation matched the design template exactly: 5 segments, T0–T4, with `minTier`
ranging `0–4` and T0/T1 behaviorally identical (both meant "everything notifies," disambiguated only
by caption text — see the original §2 bullet and §8 note, both since updated above). On review this
was judged a dead option not worth keeping: since `selectNotifications` never emits a tier-0
candidate (§8's own edge case), letting a user "select tier 0" is a control that can never change
behavior differently from tier 1 — it exists only because the template happened to show 5 segments.

Change: **T0 removed entirely**, not just visually de-emphasized.

- **`MinimumTierControl.tsx`** — renders 4 segments (T1–T4); index 0 of `TIER_COLORS` is skipped
  rather than rendered dim/inert. Caption's special case is now `minTier === 1` (was `=== 0`).
- **`storage.ts`** — `clampTier` clamps to `[1, 4]` (was `[0, 4]`); `DEFAULTS.minTier` is `1` (was
  `0`). A previously-stored `0` value (from before this amendment) gets clamped up to `1` on next
  load — behaviorally identical to what `0` already did, so this is a silent, safe migration with no
  dedicated migration code needed.
- **`notificationSettingsStore.ts`** — `setMinTier` clamps to `[1, 4]` (was `[0, 4]`).
- **`settingsFilter.ts`** — the fast-path check is `minTier <= 1` (was `<= 0`), since `minTier` can no
  longer be 0; this is a defensive floor, not reachable via the UI now that the store itself clamps.
- No change to `selectNotifications.ts`, `tiers.ts`, or the feed-client wiring (§5.8) — the filter's
  semantics (`n.tier >= minTier`) were already correct for a 1–4 range.

## 12. Out of scope (future)

- **Classification rules** section (the full `/api/rules` CRUD from the classification doc) — nav item
  is present but inert.
- **Appearance** section — inert.
- Server-side sync of notification settings; per-user scoping; retroactive re-filtering of the existing
  store; TTS/browser-notification gating.
