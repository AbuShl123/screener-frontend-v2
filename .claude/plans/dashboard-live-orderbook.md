# Plan: Dashboard page + live order book feed

> Status: proposed (not yet implemented). Written 2026-07-06.
>
> Sources of truth used while writing this plan:
> - [`.claude/docs/websocket-feed-api.md`](../docs/websocket-feed-api.md) — the `/ws` protocol.
> - [`.claude/design/Dashboard.dc.html`](../design/Dashboard.dc.html) and
>   [`.claude/design/Orderbook.dc.html`](../design/Orderbook.dc.html) — extracted from the
>   Claude Design project "Screener Dashboard Page Templates". The Dashboard instantiates the
>   Orderbook component at **variant `1d`** with props: `tier0=hidden`, `fillOpacity=26%`,
>   `showMidPrice=false`, `showColumnHeaders=false`, tier colors `#57ff92 / #f7bb18 / #ff8080 / #a12eff`.
> - CLAUDE.md real-time architecture rules (store outside React, selective subscriptions).

## 1. Scope

Replace the placeholder `HomePage` with a **Dashboard** page at `/`:

- **Header** (full viewport width, sticky): brand mark, "Watchlist N TICKERS" count,
  QTY / $ USD toggle, settings icon, Log out, profile avatar. Only the **toggle** and
  **Log out** are functional; the rest are presentational placeholders.
- **Order book grid**: one card per `(symbol, market)` book streamed over `/ws`, laid out in a
  responsive `auto-fill` grid (column count derives from viewport width — never a fixed count).
- **WebSocket feed client** + **Zustand store outside React** holding the live books.
- **`OrderbookCard.tsx` is its own file** so future card variants are an additive change.

Out of scope (explicitly): sending anything to the socket (no `SNAPSHOT_REQUEST` — feature
ignored per product decision), settings & profile behavior, notifications/TTS, canvas rendering,
classification rules, paid-access gating, mobile layouts.

## 2. New / changed files

```
src/
  lib/ws/
    feedClient.ts                      NEW — connection state machine (auth, backoff, reconnect)
  stores/
    orderbookStore.ts                  NEW — vanilla Zustand store: (symbol,market) → book
  features/orderbook/
    types.ts                           NEW — Level, OrderBook, FeedMessage, Market, bookKey()
    format.ts                          NEW — price/notional/distance/age formatters
    useOrderbookFeed.ts                NEW — React lifecycle hook that starts/stops the client
    components/
      DashboardHeader.tsx              NEW — header per template
      OrderbookCard.tsx                NEW — one card, template variant 1d
    pages/
      DashboardPage.tsx                NEW — header + grid + empty state
    index.ts                           NEW — barrel (DashboardPage, plus anything shared later)
  app/
    HomePage.tsx                       DELETED (replaced by DashboardPage)
  App.tsx                              CHANGED — route `/` renders DashboardPage
```

`stores/` and `lib/ws/` locations are mandated by CLAUDE.md's directory layout. The dependency
flow mirrors the auth module and must stay one-way:

```
pages/components (React)
   └─► useOrderbookFeed ─► lib/ws/feedClient ─► stores/orderbookStore   (writes)
                                │                       ▲
                                └─► features/auth (session tokens, refreshTokens)
       components read the store via fine-grained useStore selectors ──┘
```

`feedClient` and `orderbookStore` are framework-agnostic (no React imports) — the same rule
session.ts follows. Notifications/TTS later subscribe to the store without touching React.

## 3. Data model (`features/orderbook/types.ts`)

Plain TS types — **no Zod on the hot path**. CLAUDE.md's "Zod for server responses" applies to
REST; parsing every ~100ms socket batch through Zod buys little (the payload is server-generated,
not user input) and costs CPU exactly where we're perf-sensitive. The message handler does a
cheap structural guard (`type` field switch + array fallback to `[]`) and otherwise trusts the
documented contract.

```ts
export type Market = 'SPOT' | 'FUTURES';

export interface Level {
  price: number;
  quantity: number;        // base-asset units
  tier: 0 | 1 | 2 | 3 | 4; // typed as number at parse time, clamped in the card
  firstSeenMillis: number; // epoch ms
  distance: number;        // FRACTION (0.0123 = 1.23%) — format at render time
}

export interface OrderBook {
  symbol: string;
  market: Market;
  bids: Level[];           // up to 5, best-first (highest price first)
  asks: Level[];           // up to 5, best-first (lowest price first)
}

export type BookKey = string; // `${symbol}:${market}`
export const bookKey = (symbol: string, market: Market): BookKey => `${symbol}:${market}`;

export type FeedMessage =
  | { seq: number; type: 'SNAPSHOT'; data: OrderBook[] }
  | { seq: number; type: 'ADD' | 'UPDATE'; symbol: string; market: Market; bids: Level[]; asks: Level[] }
  | { seq: number; type: 'DROP'; symbol: string; market: Market };
```

`seq` is ignored per doc §5.

## 4. The store (`stores/orderbookStore.ts`)

Zustand store created at module level (like `useSession`), written **only** by the feed client.
Shape chosen so React subscriptions stay fine-grained:

```ts
interface OrderbookState {
  /** key → book. A new object identity ONLY for the entries that changed. */
  books: Record<BookKey, OrderBook>;
  /** Sorted key list — changes identity ONLY when the set of tickers changes. */
  keys: BookKey[];
  status: 'connecting' | 'connected' | 'reconnecting' | 'auth-failed';
  /**
   * Apply one coalesced batch of feed messages (in arrival order) in a SINGLE
   * Zustand set() — one subscriber-notification pass per flush, no matter how
   * many tickers changed in that window. The feed client is the only caller.
   */
  applyMessages(batch: FeedMessage[]): void;
  setStatus(s: Status): void;
  clear(): void;
}
```

The batch API is a performance decision, not a convenience: the server drains per ~100ms tick and
can emit one message per changed ticker back-to-back. One `set()` per flush means one selector
sweep over subscribers, and React (`useSyncExternalStore`) schedules one render pass for all
affected cards together instead of N independent ones.

Per-message semantics inside a batch (straight from the doc):

- **SNAPSHOT** → rebuild `books` from scratch (anything absent from the payload disappears),
  recompute `keys`.
- **ADD / UPDATE** → one shared upsert: replace/create that key's entry (new spread object for
  `books`); recompute `keys` **only if the key is new**, so a routine level update never changes
  the `keys` array identity.
- **DROP** → delete the entry immediately, recompute `keys`.

`keys` is kept **sorted alphabetically** (symbol, then market). Deterministic card placement —
a late `ADD` slots into its sorted spot instead of appending at the end, and cards don't shuffle
between snapshots.

Why this makes rendering cheap:

- The grid component subscribes to `keys` only → re-renders only when tickers appear/disappear.
- Each `OrderbookCard` subscribes to `(s) => s.books[myKey]` → re-renders only when *its* book
  is replaced. A BTC update never re-renders the ETH card. Within one card, re-rendering all
  ~10 rows is trivial; per-row memoization is not needed at 5+5 rows per replacement message.
- The header's ticker count subscribes to `keys.length`.

This satisfies the CLAUDE.md rule (socket writes a store outside React; React reads selectively).
Virtualization/canvas remain a future optimization if profiling ever demands it — no API here
blocks that path, since the store is already React-free.

## 5. Feed client (`lib/ws/feedClient.ts`)

A small singleton state machine, not a class hierarchy. Public API:

```ts
export function startFeed(): void;  // idempotent — no-op if already running
export function stopFeed(): void;   // closes socket, cancels pending reconnect timer
```

Behavior (doc §2, §4, §7):

1. **URL**: `` `${config.wsBaseUrl}/ws?token=${encodeURIComponent(accessToken)}` `` — token read
   synchronously from `useSession.getState()` (this is exactly why tokens live in Zustand).
   `config.wsBaseUrl` already derives ws(s) origin, and the dev proxy already forwards `/ws`.
2. **Pre-connect token check**: if `expiresAt` has passed (or is within a few seconds), `await
   refreshTokens()` before dialing — avoids a guaranteed 1008.
3. **On open**: reset backoff to 1s, `setStatus('connected')`. Send **nothing** — the snapshot is
   pushed automatically (§2.3), and we deliberately never send `SNAPSHOT_REQUEST`.
4. **On message**: `JSON.parse`, cheap structural guard, then **buffer — do not write the store
   directly**. Messages are pushed into a module-level array and flushed once per animation frame
   (`requestAnimationFrame`) via a single `applyMessages(buffer)` call. Rationale: the server
   emits a burst of per-ticker messages every ~100ms drain tick; painting can't happen more often
   than the display refresh anyway, so applying mid-frame bursts message-by-message is pure
   wasted work. Coalescing adds ≤1 frame (~16ms) of latency — imperceptible against a 100ms feed
   cadence — and puts a hard ceiling on store/render work per second regardless of burst size.
   Fallbacks: when `document.hidden` (rAF is throttled/suspended in background tabs) flush via a
   ~100ms `setTimeout` instead so the buffer can't grow unboundedly; flush synchronously if the
   buffer exceeds a sanity cap (e.g. 1000 messages). `ADD` and `UPDATE` share a case; unknown
   `type` → ignore silently.
5. **On close**:
   - **1008** → auth failure: `refreshTokens()` then reconnect immediately. If refresh throws,
     `refreshTokens()` has already hard-logged-out (session store flips to `'anonymous'`, route
     guards bounce to `/login`) — the client just `stopFeed()`s and sets `'auth-failed'`.
   - **any other code** (1001 eviction, 1006 network, …) → `setStatus('reconnecting')`, retry
     after `backoff + jitter`; backoff doubles 1s → 30s cap.
6. **On reconnect**: nothing special to resync — the fresh pushed SNAPSHOT rebuilds the store
   (stale cards stay visible during the gap rather than flashing empty; the snapshot then
   reconciles them, including removing books that disappeared meanwhile).
7. **stopFeed()** closes with an "intentional" flag so the `onclose` handler skips reconnecting,
   and clears any pending timer.

StrictMode note: `main.tsx` mounts in dev StrictMode → effects run mount/cleanup/mount. The
start/stop idempotency above is what makes that safe (second `startFeed()` is a no-op; the
paired `stopFeed()`/`startFeed()` cycle just redials once).

## 6. Lifecycle hook (`features/orderbook/useOrderbookFeed.ts`)

```ts
useEffect(() => { startFeed(); return stopFeed; }, []);
```

Called once by `DashboardPage`. The page only renders inside `ProtectedRoute`, so a token exists
when the effect fires. Logout order is already correct without extra wiring: `DashboardPage`
unmounts on the redirect → `stopFeed()` runs → no reconnect attempt with cleared tokens. (Belt
and braces: the client also refuses to dial when `status === 'anonymous'`.)

## 7. UI

### 7.1 `DashboardPage.tsx`

- Root: `min-h-screen bg-bg` (note: page background is `--color-bg`, not `--color-surface` —
  the template's cards sit on the deeper `bg`).
- Calls `useOrderbookFeed()`, renders `<DashboardHeader/>` + `<main className="px-8 pt-7 pb-12">`.
- Owns the **display-mode state**: `const [sizeMode, setSizeMode] = useState<'usd' | 'qty'>('usd')`
  (template default is `$ USD`). Passed down to header (toggle) and to each card (formatting).
  Plain React state is right here: it changes only on click, and re-rendering every card once on
  toggle is fine. If we later want persistence, this becomes a one-file swap to a tiny persisted
  store — noted, not built.
- **Grid**: `grid gap-5 items-start [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]`.
  `auto-fill + minmax` is the whole "dynamic columns" requirement: a 4K monitor gets 6–7 columns,
  a 1366px laptop gets 3, with no fixed breakpoints and no column cap. The template's
  `repeat({{gridCols}}, 1fr)` was design-tool scaffolding for previewing — do not port the
  fixed-count prop. 340px min ≈ the template's 372px preview width with a little flexibility.
- Subscribes to `keys` from the store and renders `<OrderbookCard key={k} bookKey={k} sizeMode={sizeMode}/>`.
- **Empty state**: when `keys.length === 0`, a centered muted panel — "Connecting…" /
  "Waiting for order books…" depending on connection status. Also a small inline notice when
  `status === 'reconnecting'` (thin banner under the header) so a dead backend isn't silent.

### 7.2 `DashboardHeader.tsx` (template → Tailwind, tokens map 1:1)

Layout: `sticky top-0 z-10 flex h-[60px] items-center gap-6 border-b border-border
bg-surface-marketing px-8`. Full width by nature — no max-width container anywhere on this page.

| Element | Spec | Functional? |
|---|---|---|
| Brand | reuse `BrandMark` if it matches (accent 14px rotated square + `SCREENER` mono, tracking 0.24em); otherwise inline per template | no |
| Divider | `w-px h-[22px] bg-border` (between groups, per template) | — |
| Watchlist count | "Watchlist" (13px sans muted) + `{n} TICKERS` (11px mono dim). `n` = live `keys.length` from the store (free to make real; still non-interactive) | display only |
| Spacer | `flex-1` | — |
| Size toggle | `SIZE AS` label (9px mono dim) + pill group (`bg-input border border-border rounded-lg p-[3px]`) with two buttons `QTY` / `$ USD` (11px mono, `px-3 py-[5px] rounded-md`); active = `bg-accent text-bg`, idle = transparent + `text-text-muted` | **yes** — sets `sizeMode` |
| Settings | 36×36 icon button, `border-border-input rounded-lg text-text-muted`, hover `bg-white/5`; ⚙ placeholder glyph (or a small inline SVG) | no (dead button) |
| Log out | ports the existing `HomePage` logout verbatim: `logout()` then `navigate('/login', {replace:true})`, with the `loggingOut` disabled state | **yes** |
| Profile | 36×36 round button, `bg-accent/18`-style tint, accent ring, user initials — derive from `useMe()` data when available (e.g. `firstName[0]+lastName[0]`), fall back to "·" | no |

Note the dashboard does **not** depend on `/me` succeeding: the WS feed only needs the token, so
unlike old `HomePage` there is no profile-retry blocking state. If `useMe` failed transiently,
the initials fall back — everything else works.

### 7.3 `OrderbookCard.tsx` — template variant 1d, one card per file

Props: `{ bookKey: BookKey; sizeMode: 'usd' | 'qty' }`. Reads its book via
`useOrderbookStore((s) => s.books[bookKey])`; renders `null` if the book vanished (parent will
drop it on the same store update).

Structure (all class specs from the template, tokens already exist in `index.css`):

- **Container**: `overflow-hidden rounded-[10px] border border-border bg-surface`, plus
  `[content-visibility:auto] [contain-intrinsic-size:auto_380px]` so off-screen cards skip
  layout/paint entirely (§8 item 4).
- **Card header** (`flex items-center gap-2.5 border-b border-border-subtle px-4 py-[11px]`):
  - Market badge: mono 9px, tracking 0.08em, `rounded px-[5px] py-px border`. Label `FUT` for
    `FUTURES`, `SPOT` for `SPOT`. Colors: FUTURES → accent text/50%-accent border; SPOT →
    warning text/50%-warning border.
  - Symbol: mono 13px `text-text`, tracking 0.04em.
  - Right side: 6px live dot — `bg-bid` when store status is `connected`, `bg-text-dim`
    otherwise. (Mid price and column headers are OFF in the chosen dashboard configuration.)
- **Rows block** (`pt-2 pb-3`): asks section, dashed divider (`border-t border-dashed
  border-border-subtle mx-4 my-[7px]`), bids section.
- **Ordering — proximity to spread** (server sends best-first):
  - asks: server order is lowest-price-first → **reverse** for display so the ask nearest the
    spread sits immediately above the divider.
  - bids: server order is highest-price-first → render **as-is**; nearest bid sits immediately
    below the divider.
- **Row** (grid `[grid-template-columns:1fr_72px_56px] gap-3 items-center px-4 py-1 relative`,
  hover `bg-white/[0.04]`, native `title` tooltip):
  1. Bar layer: `absolute inset-y-0 left-0 right-[156px]` wrapper (this is what caps the bar at
     the price column) containing the bar div `absolute inset-y-0 left-0` with
     `width: <pct>%`, `background: <tierColor at 26% via color-mix>`, and
     `transition: width 120ms linear, background-color 120ms linear`.
  2. Notional (relative, mono 12px `text-text-strong`, left-aligned):
     `sizeMode === 'usd'` → `fmtMoney(price * quantity)`, else `fmtQty(quantity)`.
  3. Price (mono 12px, right-aligned): `text-danger` for asks, `text-bid` for bids.
  4. Distance (mono 11px `text-text-muted`, right-aligned): `(distance * 100).toFixed(2) + '%'`
     — the doc-mandated formatting of the raw fraction.
- **Bar width**: `pct = clamp(3, round(notional / maxNotional * 100), 100)` where
  `notional = price × quantity` and `maxNotional` is the max across **both sides of this card's
  book**. Always computed from the dollar notional regardless of the display toggle (relative
  size shouldn't change meaning when the label unit changes). The 3% floor keeps tiny orders
  visible as a sliver.
- **Tier → bar color** (constants in the card, from the dashboard's chosen props):
  `TIER_COLORS = [null, '#57ff92', '#f7bb18', '#ff8080', '#a12eff']`, painted as
  `color-mix(in oklab, <hex> 26%, transparent)`. Tier 0 (and any out-of-range tier, defensively)
  → `transparent` — an invisible bar, per the `tier0=hidden` setting. These hexes are
  deliberately *not* theme tokens: they're tier-scale data-viz colors specific to this card, and
  they're the exact values the future "settings" feature would make user-configurable.
- **Tooltip (order age)**: native `title` = `` `First seen ${fmtAge(Date.now() - firstSeenMillis)} ago` ``
  (e.g. "First seen 22h 15m ago"). Recomputed on every book replacement, which under a live feed
  is frequent enough; no timer needed. Native `title` keeps the hot path free of tooltip
  libraries/portals.
- Handle short sides gracefully: iterate whatever arrays arrive (0–5 entries, doc §3.5); a card
  with an empty side just renders the divider with rows on one side. `maxNotional` guard: if the
  whole book is empty or all-zero, skip bar rendering (avoid divide-by-zero).

### 7.4 `format.ts`

Pure functions, unit-testable later, shared with future surfaces:

- `priceDecimals(price)`: ≥1000 → 2, ≥100 → 3, ≥1 → 4, else 5 (template's rule; based on the
  level's own price since we have no per-symbol tick size).
- `fmtMoney(v)`: `$1.23M` / `$45.6K` / `$789` (compact, matches template).
- `fmtQty(q)`: same compaction without `$`.
- `fmtDistance(d)`: `(d * 100).toFixed(2) + '%'`.
- `fmtAge(ms)`: `3d 4h` / `22h 15m` / `9m` / `42s` (largest two units, per template).

## 8. Performance: keeping the ~100ms firehose off React's back

The feed is the product; the framework must never be the bottleneck. The budget: a full drain
tick (potentially every on-screen ticker changing at once) must be absorbed well inside one
100ms window, every 100ms, indefinitely. How each layer holds that budget:

1. **Socket → store: one write per frame.** All messages from a burst are coalesced and applied
   in a single `set()` (§4, §5). Store-write cost per flush is O(changed tickers) small object
   spreads — microseconds. Nothing on the message path allocates per-level or runs Zod.
2. **Store → React: reference-equality fan-out.** Every subscription is a narrow selector
   (`s.books[key]`, `s.keys`, `s.keys.length`, `s.status`). A flush that changed K books
   re-renders exactly K cards; the grid, header, and the other cards see unchanged references
   and bail in the selector comparison. `keys` identity changes only on add/drop, so routine
   updates never touch grid layout.
3. **Per-card render is intentionally tiny.** ≤10 rows × 3 text spans + 1 bar div, no
   memo-busting inline objects passed downward, formatters are pure functions. Even a
   worst-case "everything changed" tick re-rendering ~50 visible cards is ~500 rows of trivial
   DOM diffing per 100ms — well within budget for React on desktop hardware.
4. **Off-screen cards are free: `content-visibility: auto`.** Each card gets
   `content-visibility: auto` + `contain-intrinsic-size` (≈ the card's natural ~380px height).
   With many tickers, most cards are below the fold; the browser then skips layout/paint for
   them entirely even though React updated their DOM. This is the single cheapest lever against
   "many symbols at once" and costs one CSS class.
5. **Bar animation stays cheap.** The 120ms width/background transitions run on tiny
   absolutely-positioned divs inside `contain`-ed cards, so layout invalidation is scoped. If
   profiling ever shows paint pressure from hundreds of simultaneous bar transitions, the
   documented fallback is `transform: scaleX()` (compositor-only) — a card-internal swap.
6. **React 19 niceties for the hot path**: the card component keeps stable element shape
   between renders (no conditional wrappers per row), so reconciliation is a flat walk.

**Escalation ladder** — only if profiling (React Profiler + Performance panel against the real
backend) shows frame drops, in this order, each strictly additive thanks to the React-free
store: (a) memoize the row as a component keyed on level identity; (b) virtualize the grid
(render only viewport cards — the store already knows all books, cards mount/unmount freely);
(c) imperative/canvas rendering for card internals, subscribing to the store directly and
bypassing reconciliation — the path CLAUDE.md reserves for "if profiling demands it". None of
these require touching the socket, store, or page structure.

What we deliberately do **not** do up front: virtualization, canvas, web workers for parsing,
or per-row `memo`. At 5+5 rows × realistic ticker counts they're premature; the architecture
above leaves every one of them open.

## 9. Routing change

In `App.tsx`: `/` renders `<DashboardPage/>` inside the existing `ProtectedRoute`; delete
`src/app/HomePage.tsx` and import from `@/features/orderbook`. `SessionGate` behavior is
untouched — its bootstrap splash still keys off `useMe` loading; the dashboard itself no longer
needs a `/me`-failure retry screen (see §7.2).

## 10. Edge cases checklist

- **UPDATE before ADD** → handled structurally: one upsert path (doc §4).
- **DROP mid-session** → card disappears immediately; grid reflows (keys identity changes).
- **Snapshot shrinks the set** → rebuild-from-scratch semantics handle it.
- **Token expired at (re)connect** → pre-dial refresh; 1008 → refresh-then-retry; refresh
  failure → hard logout via existing session machinery, feed stops.
- **Slow-client eviction (1001)** → plain reconnect + snapshot rebuild.
- **Logout while connected** → unmount cleanup stops the feed before guards redirect.
- **Duplicate connects (StrictMode / fast remounts)** → idempotent `startFeed`.
- **Empty feed** (backend up, no qualifying books) → "waiting" empty state, not a blank page.
- **Malformed message** → try/catch around parse+dispatch; log in dev, drop the message, keep
  the socket alive.
- **Backgrounded tab** → rAF stops firing; the buffer flushes on the ~100ms timeout fallback
  instead (§5 item 4), so memory stays bounded and the tab is current the instant it's focused.

## 11. Implementation order (each step compiles: `npm run typecheck`)

> **Session split (agreed with the user):** implementation happens across three separate
> AI sessions, each ending in `npm run typecheck` + its own commit (continuing the repo's
> "Phase N" commit convention). A session implements ONLY its assigned steps:
> - **Session 1 → steps 1–2** (data layer: types, store, feed client, hook — no UI).
> - **Session 2 → step 3** (shell swap: header, page, routing, delete HomePage).
> - **Session 3 → steps 4–5** (OrderbookCard + polish).
>
> If you are an AI session reading this: read the whole plan for context, but do not start
> work belonging to a later session.

1. **Types + store** — `types.ts`, `orderbookStore.ts` with the single-`set()` batch apply.
   Pure logic, no UI.
2. **Feed client + hook** — `feedClient.ts` (including the rAF/hidden-tab flush scheduler),
   `useOrderbookFeed.ts`.
3. **Page shell swap** — `DashboardHeader.tsx` (toggle + logout live), `DashboardPage.tsx` with
   empty grid + empty state, `App.tsx` rewire, delete `HomePage.tsx`.
4. **`OrderbookCard.tsx`** — variant 1d rendering, formatters, tier bars, tooltip; wire cards
   into the grid.
5. **Polish** — reconnecting banner, live-dot ↔ status wiring, defensive guards sweep.

Verification per project rules: `npm run typecheck` after each step; **no** Playwright/browser
automation — the user tests against the real backend manually.

## 12. Open items deliberately deferred

- Settings and profile menus (header buttons are inert).
- Persisting the QTY/$ toggle across reloads.
- Tier colors as user settings (constants for now).
- Notifications/TTS diff subscriptions (the store's React-free design already supports them).
- Virtualization/canvas for the book grid — only if profiling shows React rendering can't keep
  up with the ~100ms batch cadence at real ticker counts.
