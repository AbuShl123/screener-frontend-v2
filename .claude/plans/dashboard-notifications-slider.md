# Plan: Dashboard notifications slider (visual layer)

> Status: proposed (not yet implemented). Written 2026-07-07.
>
> Sources of truth used while writing this plan:
> - Claude Design project **"Dashboard Page Template - Final"**
>   (`7a30348a-28ac-44c2-be38-54481efcebf7`) — `DashboardPage.dc.html`. This is the
>   authoritative visual for the collapsed handle + slide-out notification panel.
> - The already-built dashboard: [`DashboardPage.tsx`](../../src/features/orderbook/pages/DashboardPage.tsx),
>   [`OrderbookCard.tsx`](../../src/features/orderbook/components/OrderbookCard.tsx),
>   [`DashboardHeader.tsx`](../../src/features/orderbook/components/DashboardHeader.tsx),
>   [`format.ts`](../../src/features/orderbook/format.ts), [`types.ts`](../../src/features/orderbook/types.ts).
> - CLAUDE.md — semantic design-token rule, and the split "real-time firehose stays out of React;
>   conventional CRUD/UI uses ordinary React state." **The notifications panel is conventional UI**,
>   so plain React state is correct here (the *source* of notifications will later be the store, but
>   the panel's open/search state is not hot-path).

## 1. Scope

Add the notifications feature from the "Final" template to the existing dashboard: a **slide-out
panel anchored to the right edge** with a **collapsed handle** that toggles it.

**In scope (this pass — visuals only):**

- A collapsed **handle** (fixed, right edge, bell icon + count badge) shown when the panel is closed.
- A **notification panel** (`<aside>`) that slides in from the right: header (title + "N NEW" +
  collapse button), a **search field**, and a scrollable **list of notification cards** (newest at
  top) with an empty state.
- The main order-book grid **reflows** (gains right padding) when the panel opens, matching the
  template's push behaviour.
- Panel respects the existing **QTY / $ USD** toggle (NOTIONAL vs SIZE), like the order-book cards.
- **10 dummy notifications** hard-coded so the panel is fully populated for visual work.
- **Enhanced search** (see §6): filter by ticker **and** price, notional, distance — not ticker only.

**Explicitly out of scope:**

- Wiring notifications to live order-book updates (how a level crossing a tier *emits* a
  notification). The dummy array is the only data source for now.
- Persistence, read/unread tracking, dismiss/clear actions, per-notification click-through.
- TTS / browser notifications.
- Mobile / narrow-viewport layout for the panel.

## 2. New / changed files

```
src/features/orderbook/
  types.ts                                CHANGED — add `Notification` type
  format.ts                               CHANGED — add `fmtClock` (optional) + export TIER_COLORS
  tiers.ts                                NEW (optional) — shared TIER_COLORS/barBackground (see §7)
  notifications/
    dummyNotifications.ts                 NEW — 10 static notifications (newest first)
    notificationSearch.ts                 NEW — multi-field match function (§6)
  components/
    NotificationHandle.tsx                NEW — collapsed fixed button + count badge
    NotificationPanel.tsx                 NEW — the <aside>: header, search, list, empty state
    NotificationCard.tsx                  NEW — one notification row (stripe + 2-row layout)
    OrderbookCard.tsx                      CHANGED — import TIER_COLORS from shared module (§7)
  pages/
    DashboardPage.tsx                      CHANGED — owns `notifOpen`, renders handle+panel, pads main
```

No new store and no new dependency. The panel data source is a static import today; the component
is written so that swapping `dummyNotifications` for a store selector later is a one-line change.

### Dependency / ownership flow

```
DashboardPage (owns notifOpen + sizeMode)
   ├─► NotificationHandle   (notifOpen === false)  — onClick → open
   └─► NotificationPanel     (always mounted; slides via transform)
          ├─ owns `query` (local useState)
          ├─ reads dummyNotifications  ← later: store/query selector
          ├─► notificationSearch.matches(n, query)
          └─► NotificationCard × N   (sizeMode-aware)
```

`notifOpen` lives in `DashboardPage` because **two** things depend on it: the handle's visibility
and `<main>`'s right padding. `query` lives inside `NotificationPanel` because nothing outside the
panel needs it.

## 3. Where the panel lives in `DashboardPage`

The panel and handle are **fixed-position overlays** — they render as siblings of `<main>`, not
inside the grid. `DashboardPage` gains one piece of state and shifts `<main>`'s padding:

```tsx
export function DashboardPage() {
  useOrderbookFeed();

  const [sizeMode, setSizeMode] = useState<SizeMode>('usd');
  const [notifOpen, setNotifOpen] = useState(true); // template default: open (see note)
  const keys = useOrderbookStore((s) => s.keys);
  const status = useOrderbookStore((s) => s.status);

  return (
    <div className="min-h-screen bg-bg text-text">
      <DashboardHeader ... />
      {status === 'reconnecting' && (/* unchanged reconnect banner */)}

      {/* Right padding opens up for the panel; animates in step with the slide. */}
      <main
        className="px-8 pt-7 pb-12 [transition:padding-right_260ms_cubic-bezier(0.22,0.61,0.36,1)]"
        style={{ paddingRight: notifOpen ? `${PANEL_WIDTH + 32}px` : undefined }}
      >
        {/* unchanged grid / empty state */}
      </main>

      <NotificationHandle open={notifOpen} count={dummyNotifications.length}
                          onOpen={() => setNotifOpen(true)} />
      <NotificationPanel open={notifOpen} sizeMode={sizeMode}
                         onClose={() => setNotifOpen(false)} />
    </div>
  );
}
```

- **Default open?** The template ships `notifOpen: true`. Recommend keeping it open to match the
  template exactly; flipping the initial value to `false` is a one-line change if the product wants
  the dashboard to start with an unobstructed grid.
- `PANEL_WIDTH` is a module constant (**340px**, the template's default; template exposed a
  280–460 range knob, but the app doesn't need a runtime knob — a constant keeps `<main>`'s padding
  and the panel's width in sync from one source).
- `px-8` on `<main>` already gives 32px right padding; when open we override to `PANEL_WIDTH + 32`
  so there's the same 32px gutter *between* the last card column and the panel edge.

## 4. `NotificationHandle` (collapsed state)

Fixed pill on the right edge, visible only when the panel is closed. Faithful to the template
(48×48, accent background, bell glyph, white count badge notched into the corner).

- Positioning: `fixed right-0 top-24 z-40` (`top: 96px`), rounded on the left only
  (`rounded-l-[10px]`), `border border-border border-r-0`, `bg-accent text-bg`.
- Visibility is driven by `open`: when open, `opacity-0 pointer-events-none`; when closed,
  `opacity-100 pointer-events-auto`. Transition `opacity 200ms`. (Keeping it mounted-but-faded, as
  the template does, lets the fade cross-dissolve with the panel slide.)
- Inline **bell SVG** (stroke `currentColor`) — copy the two `<path>`s from the template verbatim.
- **Count badge**: absolutely positioned top-right, `min-w-[19px] h-[19px] rounded-full`, white bg,
  near-black text, `border-2 border-accent` so it reads as notched into the accent pill. Shows
  `count`.
- `title="Notifications"`, `aria-label="Open notifications"`.

## 5. `NotificationPanel` (the `<aside>`)

Always mounted; slides via `transform` so it animates both directions and the list isn't rebuilt on
every toggle.

**Shell** — `fixed top-[60px] right-0 bottom-0 z-50 flex flex-col bg-surface border-l border-border`,
width `PANEL_WIDTH`. `top-[60px]` sits it flush under the 60px sticky header. Slide:

```tsx
style={{
  width: PANEL_WIDTH,
  transform: open ? 'translateX(0)' : 'translateX(calc(100% + 40px))',
}}
className="... [transition:transform_260ms_cubic-bezier(0.22,0.61,0.36,1)]"
```

The `+ 40px` overshoot fully hides the box shadow when closed. **Shadow caveat:** the template uses
`var(--shadow-card)`, which is **not defined** in this project's [`index.css`](../../src/index.css)
(`grep shadow` → none). Either (a) add a `--shadow-card` token to the `@theme` block and reference
`shadow-card`, or (b) use an arbitrary class, e.g. `shadow-[-16px_0_40px_-24px_rgba(0,0,0,0.7)]`.
Recommend (a) — a reusable token — since the handle wants the same shadow.

**Header** (`flex-none`, `px-[18px] py-4 border-b border-border`):
- Left: `Notifications` (`text-[15px] font-semibold text-text`) + `{count} NEW`
  (`font-mono text-[10px] tracking-[0.08em] text-accent`).
- Right: collapse button `×` — `h-[30px] w-[30px] rounded-lg border border-border-input
  text-text-secondary hover:bg-white/5 hover:text-text-strong`, `onClick={onClose}`,
  `aria-label="Collapse notifications"`.

**Search** (`flex-none px-[14px] py-3 border-b border-border-subtle`):
- Relative wrapper; inline search **SVG** (circle + handle) absolutely positioned left, `text-text-dim`.
- `<input>`: controlled by `query`, `pl-8 pr-3 py-[9px] rounded-lg border border-border-input
  bg-input font-mono text-[12px] text-text focus:border-accent outline-none w-full`.
- Placeholder: change the template's `"Search ticker…"` to **`"Search ticker, price, size…"`** to
  advertise the widened match (§6).

**List** (`flex-1 overflow-y-auto px-[14px] py-[14px] flex flex-col gap-2.5`):
- Filter `dummyNotifications` through `notificationSearch.matches(n, query)`.
- If the filtered result is empty → empty state: `No matching notifications`
  (`py-7 text-center font-mono text-[12px] tracking-[0.04em] text-text-dim`).
- Otherwise map to `<NotificationCard key={n.id} notification={n} sizeMode={sizeMode} />`.
- Newest-first ordering comes from the array itself (already ordered); no sort needed.

## 6. Search behaviour (the one deviation from the template)

The template filters `n.symbol.toLowerCase().includes(q)` — **ticker only**. Requirement: a single
free-text query should also match **price, notional, and distance**. Implementation approach: build
a lowercase **haystack** of several string representations per notification and test `includes`.
Multiple representations are included so a user's natural input matches whether they think in raw or
formatted terms.

`src/features/orderbook/notifications/notificationSearch.ts`:

```ts
import { fmtSymbol, fmtMoney, fmtQty, fmtDistance, priceDecimals } from '@/features/orderbook/format';
import type { Notification } from '@/features/orderbook/types';

/** All the text a query may match against, lowercased once per notification. */
function haystack(n: Notification): string {
  const qty = n.notional / n.price;
  return [
    n.symbol,                    // 'XRPUSDT'  → matches "xrp", "usdt"
    fmtSymbol(n.symbol),         // 'XRP/USDT'
    n.side,                      // 'ask' / 'bid'
    n.market,                    // 'FUTURES' / 'SPOT'
    n.price.toFixed(priceDecimals(n.price)), // '1.1509' → matches "1.15"
    String(Math.round(n.notional)),          // '274300' → matches "274"
    fmtMoney(n.notional),        // '$274.3K'
    fmtQty(qty),                 // '238K' (size-mode value)
    fmtDistance(n.distance),     // '0.26%' → matches "0.26"
  ].join(' ').toLowerCase();
}

/** Substring match across ticker + price + notional + distance (+ side/market). */
export function matches(n: Notification, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack(n).includes(q);
}
```

Why substring-over-a-haystack rather than parsing the query as a number and comparing ranges:

- It's dead simple, allocation-cheap for a ≤ dozens-of-items list, and matches user intuition —
  typing `274` surfaces the `$274.3K` order; `1.15` surfaces price `1.1509`; `0.26` surfaces the
  `0.26%` distance; `xrp` surfaces the ticker; `bid` filters to bids.
- Including **both** the raw (`274300`, `0.26`) and formatted (`$274.3K`, `0.26%`) forms means the
  match doesn't depend on how the value is rendered or on the QTY/$ toggle.
- (Optional later polish: also fold out separators so `$274.3K` matches a typed `274.3` — not
  needed for the first pass.)

## 7. Shared tier colors (small refactor)

The notification card's left **stripe** uses the same tier scale as the order-book bars:
`[null, '#57ff92', '#f7bb18', '#ff8080', '#a12eff']`. That array (`TIER_COLORS`) and
`barBackground()` currently live **private** inside [`OrderbookCard.tsx`](../../src/features/orderbook/components/OrderbookCard.tsx#L29).
Extract them to a shared module so both surfaces reference one definition:

- New `src/features/orderbook/tiers.ts` exporting `TIER_COLORS` and `barBackground(tier)`.
- `OrderbookCard.tsx` imports from there instead of declaring them locally.
- `NotificationCard.tsx` uses `TIER_COLORS[n.tier]` directly for the stripe (full color, **no**
  opacity mix — the template stripe is solid, unlike the row bars which are `fillOpacity`-mixed).

If we'd rather not touch `OrderbookCard` in this pass, the fallback is to duplicate the 1-line array
in `NotificationCard`, but the shared module is cleaner and keeps the "settings will expose these
someday" single-source intent from the card's existing comment.

## 8. `NotificationCard`

One notification, mirroring the template's item exactly. Props: `{ notification, sizeMode }`.

- Outer: `relative overflow-hidden rounded-[10px] border border-border bg-input`.
- **Tier stripe**: `absolute left-0 inset-y-0 w-[3px]`, `style={{ background: TIER_COLORS[n.tier] }}`.
- Body: `px-[14px] py-3 pl-[17px] flex flex-col gap-[11px]` (extra left pad clears the stripe).
- **Row 1** (`flex items-center justify-between`):
  - Left cluster (`flex items-center gap-[9px]`): symbol `fmtSymbol(n.symbol)`
    (`font-mono text-[14px] text-text-strong`); market badge (**reuse the card's PERP/SPOT badge**:
    `text-bid border-bid/50` for FUTURES, `text-warning border-warning/50` for SPOT — consider a
    small `marketBadge()` helper shared with `OrderbookCard`); side `BID`/`ASK`
    (`font-mono text-[11px] tracking-[0.12em] font-semibold text-text-strong`).
  - Right: `n.time` (`font-mono text-[11px] text-text-dim`).
- **Row 2** — 3-col metrics grid (`grid grid-cols-3 gap-2.5 pt-2.5 border-t border-border-subtle`),
  each cell a stacked label/value (`font-mono`, label `text-[9px] tracking-[0.1em] text-text-muted`,
  value `text-[13px] text-text-strong`):
  - `PRICE` → `n.price.toFixed(priceDecimals(n.price))`
  - `NOTIONAL` / `SIZE` (label & value switch on `sizeMode`, exactly like the card):
    `sizeMode === 'usd' ? fmtMoney(n.notional) : fmtQty(n.notional / n.price)`
  - `DIST` (right-aligned) → `fmtDistance(n.distance)`

## 9. Data model + dummy data

Add to [`types.ts`](../../src/features/orderbook/types.ts):

```ts
/** A surfaced order-book event shown in the notifications panel. Tier 0 is never emitted. */
export interface Notification {
  id: string;              // stable React key
  symbol: string;          // raw exchange symbol, e.g. 'XRPUSDT'
  market: Market;
  side: 'bid' | 'ask';
  price: number;
  notional: number;        // dollar notional (base for both $ and QTY display)
  tier: 1 | 2 | 3 | 4;     // 0 excluded by construction
  distance: number;        // FRACTION (0.0026 = 0.26%) — format at render
  time: string;            // 'HH:MM:SS' — static for the dummy set; live feed will carry
                           // an epoch ms and format via a fmtClock() helper at render time
}
```

`src/features/orderbook/notifications/dummyNotifications.ts` — **10** entries, newest first, mixed
tiers/sides/markets, values drawn from the real book fixtures so it looks plausible:

```ts
export const dummyNotifications: Notification[] = [
  { id: 'n1',  symbol: 'XRPUSDT',  market: 'FUTURES', side: 'ask', price: 1.1509,  notional: 274300,  tier: 4, distance: 0.0026, time: '14:32:41' },
  { id: 'n2',  symbol: 'ZECUSDT',  market: 'FUTURES', side: 'bid', price: 452.320, notional: 276500,  tier: 3, distance: 0.0033, time: '14:31:58' },
  { id: 'n3',  symbol: 'JUPUSDT',  market: 'SPOT',    side: 'ask', price: 0.24200, notional: 1070000, tier: 3, distance: 0.0179, time: '14:30:12' },
  { id: 'n4',  symbol: 'HYPEUSDT', market: 'FUTURES', side: 'bid', price: 70.9160, notional: 233800,  tier: 2, distance: 0.0040, time: '14:29:33' },
  { id: 'n5',  symbol: 'BNBUSDT',  market: 'FUTURES', side: 'bid', price: 587.000, notional: 232800,  tier: 2, distance: 0.0022, time: '14:28:47' },
  { id: 'n6',  symbol: 'NEARUSDT', market: 'FUTURES', side: 'bid', price: 2.0670,  notional: 444800,  tier: 1, distance: 0.0031, time: '14:28:05' },
  { id: 'n7',  symbol: 'DOGEUSDT', market: 'FUTURES', side: 'ask', price: 0.07735, notional: 200100,  tier: 1, distance: 0.0045, time: '14:27:41' },
  { id: 'n8',  symbol: 'SUIUSDT',  market: 'FUTURES', side: 'bid', price: 0.75240, notional: 233800,  tier: 1, distance: 0.0043, time: '14:27:03' },
  { id: 'n9',  symbol: 'BANUSDT',  market: 'FUTURES', side: 'bid', price: 0.07300, notional: 294300,  tier: 1, distance: 0.0019, time: '14:26:20' },
  { id: 'n10', symbol: 'ZECUSDT',  market: 'SPOT',    side: 'ask', price: 459.000, notional: 142900,  tier: 1, distance: 0.0040, time: '14:25:12' },
];
```

The `{count} NEW` label and handle badge both read `dummyNotifications.length` → **10**.

## 10. Design-token mapping (template inline CSS → codebase Tailwind)

Per CLAUDE.md, use **semantic token classes**, not raw hex. Structural/animation values (fixed
positioning, transforms, cubic-bezier transitions, dynamic width/padding) stay as arbitrary-value
classes or inline `style`.

| Template `var(--…)` / value | Codebase class |
|---|---|
| `--color-surface` | `bg-surface` |
| `--color-input` | `bg-input` |
| `--color-border` | `border-border` |
| `--color-border-subtle` | `border-border-subtle` |
| `--color-border-input` | `border-border-input` |
| `--color-text` / `-strong` / `-secondary` / `-muted` / `-dim` | `text-text` / `-strong` / `-secondary` / `-muted` / `-dim` |
| `--color-accent`, on-accent text `--color-bg` | `bg-accent` / `text-accent`, `text-bg` |
| PERP badge `--color-bid`, SPOT badge `--color-warning` | `text-bid border-bid/50`, `text-warning border-warning/50` |
| tier stripe hex (`#57ff92`…`#a12eff`) | inline `style` from `TIER_COLORS` (data-viz, not theme — see §7) |
| `--shadow-card` | **missing** — add token or arbitrary `shadow-[…]` (§5) |
| `transform` slide / `translateX` / `transition` cubic-bezier | inline `style` + `[transition:…]` arbitrary class |
| fixed positions `top:60px/96px`, `z-index 40/50`, `width` | `fixed top-[60px]/top-24 z-40/z-50`, `w-[340px]` / constant |

## 11. Interaction / animation summary

- Open: handle click → `notifOpen=true`. Panel `translateX(0)` (260ms), handle fades out (200ms),
  `<main>` right padding grows to `372px` (260ms) so the grid reflows to fewer columns.
- Close: `×` click → reverse. All three animate together (shared easing/duration where they overlap).
- **Optional polish** (not in template; recommend as a fast follow, not blocking): `Esc` closes the
  panel; `aria-expanded` on the handle; focus the search input on open. Keep the panel non-modal
  (no backdrop / focus trap) — it's a persistent side rail, not a dialog.

## 12. Verification

Per CLAUDE.md: **no browser automation.** After implementing, run `npm run typecheck` — the only
automated gate — and confirm the new `Notification` type, formatter reuse, and component props all
compile. Manual visual QA is the user's. Checklist for the manual pass:

1. Panel starts open; grid has right gutter; 10 cards render newest-first with correct tier stripes.
2. Collapse `×` → panel slides out, handle fades in showing badge `10`, grid reflows to full width.
3. Handle click → panel slides back.
4. Search: `xrp` → 1 card; `274` → the `$274.3K` order; `1.15` → the XRP price; `0.26` → the 0.26%
   distance; `bid` → only bids; gibberish → "No matching notifications".
5. Toggle `QTY` / `$ USD` in the header → notification middle metric switches NOTIONAL↔SIZE and value.
```
