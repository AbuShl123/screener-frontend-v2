# Plan: Notification selection mechanism (live order-book → real notifications)

> Status: proposed (not yet implemented). Written 2026-07-07.
>
> Supersedes the "only data source" note in
> [`dashboard-notifications-slider.md`](./dashboard-notifications-slider.md): this plan replaces the
> static `dummyNotifications` array with a live source derived from the `/ws` feed. The visual layer
> (panel, handle, card, search) stays exactly as built — only the **data source** and a small
> **type/timestamp** change are new.
>
> Sources of truth used while writing this plan:
> - The already-built feed pipeline: [`feedClient.ts`](../../src/lib/ws/feedClient.ts),
>   [`orderbookStore.ts`](../../src/stores/orderbookStore.ts),
>   [`types.ts`](../../src/features/orderbook/types.ts).
> - The already-built visual layer: [`NotificationPanel.tsx`](../../src/features/orderbook/components/NotificationPanel.tsx),
>   [`NotificationHandle.tsx`](../../src/features/orderbook/components/NotificationHandle.tsx),
>   [`NotificationCard.tsx`](../../src/features/orderbook/components/NotificationCard.tsx),
>   [`notificationSearch.ts`](../../src/features/orderbook/notifications/notificationSearch.ts).
> - [`.claude/docs/websocket-feed-api.md`](../docs/websocket-feed-api.md) — the socket contract.
> - CLAUDE.md — "keep the real-time firehose out of React"; notifications/TTS subscribe to store
>   diffs independently of rendering.

## 1. Goal

Make the notifications panel **real**: when a live `ADD`/`UPDATE` message arrives over `/ws`, decide
which of its bid/ask levels represent a *newly significant* order and push those (and only those)
into the panel as notifications — replacing the 10 hard-coded `dummyNotifications`.

This is **detection only**: no TTS, no browser notifications, no persistence, no click-through, no
dismiss/clear. Those remain out of scope (as in the visual plan).

## 2. Locked decisions (from the design Q&A)

| Decision | Choice |
|---|---|
| **`N NEW` badge / handle badge meaning** | **Unread since the panel was last opened.** Adds lightweight read-tracking: an `unread` counter that increments on each push and resets to 0 when the panel opens. |
| **Brand-new book (an `ADD`/`UPDATE` for a `(symbol,market)` not yet in the store)** | **Notify every non-zero-tier level** of it (algorithm step (b): "no existing book" ⇒ qualified). A new ticker entering the feed can therefore raise up to ~10 notifications at once — intended. |
| **Repeated events for the same `(symbol,market,side,price)`** | **One card per event.** Append-only; the same price may appear multiple times as it evolves. No keyed collapse. |

Additional defaults chosen here (low-stakes, stated for the record):

- **Retention cap: 500** notifications (newest-first ring buffer; oldest evicted past 500). The
  binding constraint is *not* memory — a `Notification` is ~200–300 B, so even 10k is ~2–3 MB — it's
  the **un-virtualized panel**: every retained notification is a live DOM card, and each search
  keystroke re-runs `matches`'s ~9-string haystack over the whole list. 500 keeps both static DOM
  (~7–8k nodes) and per-keystroke filtering (~1–2 ms) comfortable on modern browsers; 1000 is a safe
  upper bound. Going beyond that isn't a bigger number — it's list virtualization + a memoized search
  index (deferred, out of scope). One named constant `CAP` in the store (§5).
- **Notification timestamp = detection time (`Date.now()`)**, not the level's `firstSeenMillis`. A
  notification is "this became significant now," and the `time` field's own comment already
  anticipated an epoch-ms value formatted at render.
- **Same-side price comparison** (algorithm step (c)/(d)): an incoming *bid* level is compared only
  against the previous book's *bids* (asks vs asks). Bids and asks occupy disjoint price ranges, so
  this is equivalent to "any order at the same price" but simpler and unambiguous.
- **Session scope**: notifications are cleared when the feed stops (`stopFeed`) so a logout /
  different user doesn't inherit the previous session's list. (Tradeoff: navigating away from the
  dashboard and back also resets the list — acceptable for now; noted in §9.)

## 3. Where detection runs — and why it's already the right seam

The critical realization: [`orderbookStore.applyMessages()`](../../src/stores/orderbookStore.ts#L45)
**already** processes a batch of messages *in arrival order* while cloning the `books` map, and for
each `ADD`/`UPDATE` it looks up `books[k]` **before overwriting it** (lines 79–91). That pre-overwrite
`books[k]` is exactly the "previous / last state" the algorithm needs to diff against — including the
case of several updates for the same ticker inside one batch (message *i* diffs against the state
left by messages *0..i-1*, because the map is mutated in place as we go).

So detection slots in with **no new bookkeeping and no re-ordering of the pipeline**: compute
candidates from `(prevBook, msg)` at the top of the `ADD`/`UPDATE` case, *then* upsert (unchanged).

### Data-flow (unchanged pipeline, one new branch + one new sink)

```
/ws socket ─► feedClient buffer ─► flush() ─► orderbookStore.applyMessages(batch)
                                                   │  (per ADD/UPDATE, BEFORE the upsert:)
                                                   │      selectNotifications(prevBook, msg)
                                                   │      └─ collect candidates
                                                   ▼
                                    returns Notification[]  ──►  notificationStore.push(candidates)
                                                                        │
                                                        ┌───────────────┴───────────────┐
                                            NotificationHandle(unread)      NotificationPanel(notifications, unread)
```

`applyMessages` **returns** the batch's candidates and the **caller (`feedClient.flush`) forwards
them** to the notification store. This keeps `orderbookStore` free of any `notificationStore` import
(no store→store coupling); `feedClient` stays the single orchestrator, exactly as it already is for
`applyMessages` + `setStatus`.

**Why not compute in `feedClient` before `applyMessages`?** Because the correct "previous state" for
the 2nd+ update of a ticker within one batch only exists *inside* the in-progress clone — the store
is the only place that has it. Computing there is both correct and free.

**SNAPSHOT is inherently silent** (algorithm step 0): the `SNAPSHOT` case produces no candidates, so
the initial snapshot and every reconnect snapshot raise nothing. No special-casing needed.

## 4. The selection algorithm (precise)

New pure module `src/features/orderbook/notifications/selectNotifications.ts`:

```ts
import type { Level, Notification, OrderBook } from '@/features/orderbook/types';

let counter = 0; // module-local monotonic id source (stable React keys, one card per event)

/** The ADD/UPDATE shape applyMessages passes in (symbol/market + both level arrays). */
interface AddUpdate {
  symbol: string;
  market: OrderBook['market'];
  bids: Level[];
  asks: Level[];
}

/**
 * Candidates raised by ONE ADD/UPDATE message, diffed against the book's PREVIOUS levels.
 * `prev` is the stored book BEFORE this message overwrites it (undefined = brand-new book).
 */
export function selectNotifications(prev: OrderBook | undefined, msg: AddUpdate): Notification[] {
  const out: Notification[] = [];
  scanSide(out, prev?.bids, msg.bids, 'bid', msg);
  scanSide(out, prev?.asks, msg.asks, 'ask', msg);
  return out;
}

function scanSide(
  out: Notification[],
  prevLevels: Level[] | undefined,
  nextLevels: Level[],
  side: 'bid' | 'ask',
  msg: AddUpdate,
): void {
  for (const level of nextLevels) {
    if (level.tier === 0) continue;                 // (a) tier 0 → never notify

    // (b) no existing book for this ticker → every non-zero level qualifies.
    // (c) existing book but no level at this price → qualifies.
    // (d) existing level at this price → qualifies ONLY if the tier changed.
    if (prevLevels) {
      const existing = prevLevels.find((l) => l.price === level.price);
      if (existing && existing.tier === level.tier) continue; // unchanged → skip
    }

    out.push({
      id: `n${++counter}`,
      symbol: msg.symbol,
      market: msg.market,
      side,
      price: level.price,
      notional: level.price * level.quantity,       // $ notional (base for $ and QTY display)
      tier: level.tier as 1 | 2 | 3 | 4,            // tier 0 already excluded above
      distance: level.distance,
      timeMillis: Date.now(),                        // detection time (see §2)
    });
  }
}
```

Notes:

- **Float price equality** (`l.price === level.price`) is correct here: a *retained* level keeps its
  identical server-sent number across updates, so `===` matches it; a genuinely new price is a
  different number. We are matching order *identity by price*, not doing arithmetic — no epsilon
  needed.
- `find` over ≤5 levels per side is trivially cheap; runs only for `ADD`/`UPDATE`, not per frame.
- The `counter`-based id guarantees uniqueness for the "one card per event" model without pulling in
  `crypto.randomUUID`.

## 5. New notification store — `src/stores/notificationStore.ts`

A Zustand store OUTSIDE React (same pattern as `orderbookStore`): the feed pipeline is the only
writer; the panel/handle read via selectors. This is the "notifications subscribe to store diffs
independently of rendering" sink from CLAUDE.md's architecture diagram.

```ts
import { create } from 'zustand';
import type { Notification } from '@/features/orderbook/types';

const CAP = 500; // newest-first ring buffer; older than this are evicted (see §2 for the rationale)

interface NotificationState {
  notifications: Notification[]; // newest at index 0
  unread: number;                // count since the panel was last opened
  push(batch: Notification[]): void;
  markRead(): void;              // panel-open transition → 0
  clear(): void;                 // feed stop / session end
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unread: 0,

  push(batch) {
    if (batch.length === 0) return;
    set((s) => ({
      // batch is oldest→newest (arrival order); reverse so the newest lands at index 0.
      notifications: [...batch].reverse().concat(s.notifications).slice(0, CAP),
      unread: s.unread + batch.length,
    }));
  },

  markRead() {
    set((s) => (s.unread === 0 ? s : { unread: 0 }));
  },

  clear() {
    set({ notifications: [], unread: 0 });
  },
}));
```

- `push` no-ops on an empty batch (the common case — most flushes raise nothing) so subscribers
  don't wake.
- `markRead` returns the same state when already 0 to avoid a needless notification.

## 6. Wiring into the existing pipeline

### 6a. `orderbookStore.applyMessages` — return candidates

Change the signature from `void` to `Notification[]` and collect during the `ADD`/`UPDATE` case,
**before** the existing upsert:

```ts
// interface OrderbookState:
applyMessages(batch: FeedMessage[]): Notification[];   // was: void

// inside applyMessages:
applyMessages(batch) {
  const candidates: Notification[] = [];
  set((state) => {
    // …unchanged clone/keysChanged machinery…
    for (const msg of batch) {
      switch (msg.type) {
        // SNAPSHOT: unchanged — raises nothing.
        case 'ADD':
        case 'UPDATE': {
          const k = bookKey(msg.symbol, msg.market);
          own();
          // NEW: diff against the PREVIOUS book (books[k] is still the old value here).
          const raised = selectNotifications(books[k], msg);
          if (raised.length) candidates.push(...raised);
          if (!(k in books)) keysChanged = true;
          books[k] = { symbol: msg.symbol, market: msg.market, bids: msg.bids ?? [], asks: msg.asks ?? [] };
          break;
        }
        // DROP: unchanged — raises nothing.
      }
    }
    return keysChanged ? { books, keys: … } : { books };
  });
  return candidates;
}
```

`clear()` stays `void`. Only `applyMessages` gains the return.

### 6b. `feedClient.flush` — forward candidates to the notification store

```ts
function flush(): void {
  cancelFlush();
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  const candidates = useOrderbookStore.getState().applyMessages(batch);
  if (candidates.length) useNotificationStore.getState().push(candidates);
}
```

### 6c. `feedClient.stopFeed` — clear the session's notifications

Add `useNotificationStore.getState().clear()` to `stopFeed()` (alongside the existing buffer reset)
so logout / unmount doesn't leak one user's notifications into the next session. Harmless under
StrictMode's mount→unmount→mount (the list is empty at that point anyway).

## 7. Type + formatter changes

### 7a. `types.ts` — `Notification.time` → `timeMillis`

The dummy set stored a pre-formatted `time: '14:32:41'` string. Live detection has an epoch ms, and
the field's own comment already anticipated this. Change:

```ts
export interface Notification {
  id: string;
  symbol: string;
  market: Market;
  side: 'bid' | 'ask';
  price: number;
  notional: number;
  tier: 1 | 2 | 3 | 4;
  distance: number;
  timeMillis: number; // epoch ms of detection — format via fmtClock() at render (was: time: string)
}
```

### 7b. `format.ts` — add `fmtClock`

```ts
/** Wall-clock `HH:MM:SS` from epoch ms, for the notification timestamp. */
export function fmtClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
```

`notificationSearch.ts` needs **no change** — its `haystack` never referenced `time` (confirmed).

## 8. UI wiring (visual layer unchanged; only the data source moves)

The panel, handle, and card keep their markup verbatim. The only edits are *where the data comes
from* and one mark-read effect.

### 8a. Re-render isolation (important)

`DashboardPage` currently owns the grid. It must **not** subscribe to `unread` or `notifications`, or
every push would re-render `DashboardPage` and, with it, every `OrderbookCard` (they aren't memoized)
— defeating the "keep the firehose out of React" rule. Therefore the notification subscriptions live
in the **leaf** components:

- `NotificationHandle` self-subscribes to `unread` (drop its `count` prop).
- `NotificationPanel` self-subscribes to `notifications` + `unread` (drop the `dummyNotifications`
  import).
- `DashboardPage` keeps owning only `notifOpen` + `sizeMode`; it drops the `dummyNotifications`
  import and the `count={…}` prop.

Result: a push re-renders only the handle (one number) and the open panel (its job) — never the grid.

### 8b. `NotificationPanel.tsx`

```tsx
import { useEffect } from 'react';
import { useNotificationStore } from '@/stores/notificationStore';
// …
export function NotificationPanel({ open, sizeMode, onClose }: NotificationPanelProps) {
  const [query, setQuery] = useState('');
  const notifications = useNotificationStore((s) => s.notifications);
  const unread = useNotificationStore((s) => s.unread);
  const markRead = useNotificationStore((s) => s.markRead);

  // Reset unread on each open transition (and on initial mount when default-open).
  // NOTE: depends on `open` only — NOT on notifications — so while the panel is open the
  // header "N NEW" grows to show arrivals-since-open, matching "unread since last opened".
  useEffect(() => {
    if (open) markRead();
  }, [open, markRead]);

  const visible = notifications.filter((n) => matches(n, query));
  // header:  <span …>{unread} NEW</span>
  // list:    visible.map((n) => <NotificationCard key={n.id} notification={n} sizeMode={sizeMode} />)
}
```

Everything else in the panel (shell, search input, empty state) is unchanged. `{dummyNotifications.length} NEW`
becomes `{unread} NEW`.

### 8c. `NotificationHandle.tsx`

Drop the `count` prop; read `unread` from the store and format a large count:

```tsx
import { useNotificationStore } from '@/stores/notificationStore';
// …
export function NotificationHandle({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const unread = useNotificationStore((s) => s.unread);
  // badge hidden entirely when there's nothing unread; caps display at 99+
  // {unread > 0 && <span …>{unread > 99 ? '99+' : unread}</span>}
}
```

(Only showing the badge when `unread > 0` is a small nicety; keeping it always-on with `unread` is
also fine. Recommend hiding at 0.)

### 8d. `DashboardPage.tsx`

- Remove `import { dummyNotifications }`.
- `<NotificationHandle open={notifOpen} onOpen={() => setNotifOpen(true)} />` (no `count`).
- `<NotificationPanel open={notifOpen} sizeMode={sizeMode} onClose={() => setNotifOpen(false)} />`
  (unchanged call; panel now self-sources data).

### 8e. Delete `dummyNotifications.ts`

No longer imported anywhere after the above. Remove the file.

## 9. Edge cases & concerns (thought through)

- **Reconnect burst suppression.** After a drop, `feedClient` clears its buffer and the fresh
  `SNAPSHOT` rebuilds `books` silently (SNAPSHOT raises nothing). The first post-reconnect `UPDATE`s
  then diff against the snapshot baseline — no spurious flood. ✅
- **New-book burst is intended (§2).** A brand-new ticker's `ADD` can raise up to 10 cards at once.
  Accepted per the locked decision; the 500-cap and one-card-per-event model absorb it.
- **Tier oscillation noise.** A price flipping tier 3↔4 raises one card per flip (one-card-per-event,
  by decision). If this proves noisy in practice, the natural future lever is the "collapse per price
  level" option we deferred — no rework of the detection core needed.
- **Batch ordering.** Within one flush, candidates are collected oldest→newest; `push` reverses so
  the store stays strictly newest-first. ✅
- **`applyMessages` return + `set` timing.** `set` runs synchronously, so the local `candidates`
  array is fully populated before `applyMessages` returns it. ✅
- **Session reset tradeoff.** Clearing on `stopFeed` also wipes the list when navigating away from
  the dashboard and back (not just on logout). Acceptable for a first pass; if undesired later, gate
  the clear on an actual logout (`session` → `anonymous`) instead of every unmount.
- **`unread` while open.** The header shows `unread` which resets to 0 on open, then counts arrivals
  while you watch — coherent. The handle badge (only visible when closed) shows accumulation since
  the last open. ✅

## 10. Files touched

```
NEW  src/stores/notificationStore.ts                                   store (push/markRead/clear + cap)
NEW  src/features/orderbook/notifications/selectNotifications.ts       the algorithm (§4)
CHG  src/stores/orderbookStore.ts                                      applyMessages returns Notification[]
CHG  src/lib/ws/feedClient.ts                                          flush forwards candidates; stopFeed clears
CHG  src/features/orderbook/types.ts                                   Notification.time → timeMillis
CHG  src/features/orderbook/format.ts                                  add fmtClock()
CHG  src/features/orderbook/components/NotificationPanel.tsx           store source + mark-read effect
CHG  src/features/orderbook/components/NotificationHandle.tsx          unread from store (drop count prop)
CHG  src/features/orderbook/components/NotificationCard.tsx            fmtClock(n.timeMillis)
CHG  src/features/orderbook/pages/DashboardPage.tsx                    drop dummy import + count prop
DEL  src/features/orderbook/notifications/dummyNotifications.ts        replaced by the live source
```

No new dependencies. No change to the socket contract or the visual design.

## 11. Verification

Per CLAUDE.md — **no browser automation.** After implementing, run `npm run typecheck` (the only
automated gate) and confirm:

1. `applyMessages`'s new `Notification[]` return type flows cleanly to `feedClient.flush`.
2. `Notification.timeMillis` compiles everywhere (`NotificationCard` via `fmtClock`,
   `notificationSearch` unaffected, the deleted dummy file leaves no dangling import).
3. The panel/handle store selectors type-check and `DashboardPage` no longer references
   `dummyNotifications`.

Manual QA (user-driven) to sanity-check the mechanism against a live/dev feed:

1. On first load, the snapshot renders books but the panel stays empty (no snapshot notifications).
2. As updates flow, cards appear newest-first; only tier 1–4 levels that are new-price or
   tier-changed show up; tier-0 and unchanged levels never do.
3. A brand-new ticker entering the feed raises a small burst for its levels.
4. Collapsed handle badge counts arrivals while closed; opening the panel resets it to 0.
5. Search still filters the live cards by ticker/price/notional/distance/side.
6. QTY / $ USD toggle still switches the middle metric on notification cards.
```