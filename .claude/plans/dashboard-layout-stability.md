# Dashboard layout stability: less card movement, better readability

> **Status:** proposal (not implemented). No code changes yet.
> **Problem:** order book cards change position far too often, many times per second rather than
> once every few seconds. A card you were just reading jumps elsewhere, which makes the dashboard
> hard to read.
> **Scope:** view layer only (`pages/DashboardPage.tsx`, `masonry.ts`, possibly
> `components/OrderbookCard.tsx`). The store, feed client and notification pipeline stay as they
> are. Sort rules (importance / alphabetical / market-first) are set aside here; this plan is
> about placement stability.
> **Related:** [`multi-exchange-review.md`](multi-exchange-review.md) (D6, §3.4 masonry),
> [`../docs/changes/websocket-feed-api.md`](../docs/changes/websocket-feed-api.md) (§3.4 removal
> semantics).

---

## 1. Where the movement comes from

Four separate causes, which make each other worse.

### 1.1 Importance sort re-sorts on every flush

`importance` is the default `SortMode`. In that mode `DashboardPage` subscribes to the whole
`books` map, so `sortKeys()` runs on every flush (up to ~60 Hz). Any change in any pair's tier
counts can reorder the list, and any reorder re-deals the whole masonry. The `sameOrder()` guard
only helps when the order is element-wise identical. This is probably the largest source of the
*frequency*.

### 1.2 Pairs flicker in and out of the feed

A pair is removed (`DEPTH` with `data: null`) when its last notable level fills, gets cancelled or
drifts out of range. The feed doc §3.4 says this removal "is often temporary": the pair often
comes right back. Each add or remove produces a new `keys` array, the card is inserted at its
alphabetical position, and the whole board is re-dealt.

### 1.3 Greedy masonry turns one change into many

`assignColumns()` places each card in whichever column is shortest *at that moment*, so every
card's column depends on the heights of all the cards before it. Adding one ticker near the top
can move almost every card below it to a different column. Each re-deal also uses the heights at
that instant (a `getState()` snapshot), so the same set of tickers dealt twice can come out
differently. One ticker changing means the whole board moves, not one card.

### 1.4 Card heights change continuously

Each side holds 0–5 levels per exchange, so a card's row count, and therefore its height, changes
all the time. Per D6 this never causes a column change, but a card that grows or shrinks pushes
every card below it in the same column. Everything underneath keeps sliding up and down.

---

## 2. Options, by impact

### 2.1 Update card contents live, but change the layout rarely

Split two kinds of change:

- **Card contents** (levels, bars, numbers): stay live, every frame, exactly as today.
- **Layout** (which cards exist and where they sit): changes only on a slow schedule, e.g. every
  10–15 s, applied in one batch.

Additions:

- **Freeze while the pointer is over the grid.** While the user is reading, nothing moves; queued
  layout changes apply when the pointer leaves (and the next scheduled update comes round). This
  alone fixes "the thing I was reading moved away".
- **Optional "+3 new / −2 gone" pill**, as in social feeds, that the user can click to apply
  pending layout changes now.

Trade-off: a brand-new pair can take a few seconds to appear in the grid. That is acceptable
because the notifications panel already alerts in real time; the grid doesn't need to be the
alerting channel.

Implementation sketch: `DashboardPage` keeps a *layout snapshot* (the committed key list and
column assignment) in state or a ref, separate from the live `keys`. A timer and the hover state
decide when the live keys get committed to the snapshot.

### 2.2 Keep removed cards around for a while

When a pair disappears from the store, keep its card in place for about 30–60 s, dimmed with a
label like "no notable levels". If the pair returns within that window, nothing moved.

- The store still removes the pair **immediately**, as the feed contract requires; only the view
  holds on to it.
- `OrderbookCard` currently renders `null` when its book is missing. It would need a "lingering"
  presentation instead (dimmed, empty body or last-known header only).
- Only removals get a delay. Additions are not held back beyond the schedule in §2.1, because a
  new pair is the signal the user wants to see.

This removes flicker from pairs dropping in and out (§1.2).

### 2.3 Keep cards in their columns instead of re-dealing

Columns become persistent:

- A **new card** goes to the bottom of the currently shortest column, or takes a slot freed by a
  removed card (see below).
- When a card is **removed**, only the cards below it in the same column shift up.
- **Existing cards never change column**, except when the column count changes (resize,
  notification panel toggle) or the user presses a **"tidy up"** button that re-deals on demand.

This removes the cascade in §1.3. The catch: the board is no longer strictly alphabetical; cards
end up roughly in the order they arrived. "Tidy up" restores the sorted order whenever the user
wants it.

**Slot variant:** combined with §2.2, a removed card's slot can stay reserved after the delay
expires, and the next new card takes that slot. Then cards almost never move: only empty slots
get filled and new cards land at column ends.

`assignColumns()` stays as the full-re-deal function (used on column-count change and "tidy up");
a new incremental function places additions and removals into the existing columns.

### 2.4 Stop heights from bouncing

- **Grow freely, shrink slowly (recommended).** A card's `min-height` follows the largest row
  count seen recently: it grows immediately, but shrinks only after it has stayed smaller for a
  while (e.g. 15–30 s). Vertical drift within a column mostly stops.
- **Fixed-height grid (strongest option, held in reserve).** Every card has the same fixed height
  and there's no masonry, so nothing ever shifts. The cost is a lot of wasted space: with 2
  exchanges a card can need 20 rows, and 30 once Bybit is added. Only worth it if the options
  above aren't enough.

### 2.5 Animate the moves that remain (optional)

Once moves are rare, a 200–300 ms slide (FLIP: measure before/after positions, animate the
difference) lets the eye follow a card instead of losing it when it jumps. This doesn't reduce
movement, it only makes it easier to follow, so it comes last. Cross-column moves need
`getBoundingClientRect` measurement; a library such as Motion's layout animations is an option.

---

## 3. Recommendation

1. **First, measure.** Add a temporary dev counter of `keys` changes per minute and compare
   importance vs alphabetical mode. That shows how much movement comes from sorting (§1.1) versus
   pairs coming and going (§1.2).
2. **Core:** §2.1 (freeze on hover + slow layout schedule), §2.2 (keep removed cards for a while)
   and §2.3 (persistent columns). All three are cheap and view-layer only.
3. **If columns still drift vertically:** the slow-shrink part of §2.4.
4. **Polish:** §2.5 animations.

Architectural constraints this keeps:

- The feed client is still the only writer to `useOrderbookStore`; the store still removes books
  immediately per the contract.
- The page still subscribes only to `keys` (plus `books` in importance mode, as today). Layout
  timing, hover state, delayed removals and column assignment live in `DashboardPage` state/refs,
  not in the store.
- Each card still subscribes only to its own `books[key]` slice.

---

## 4. Open decisions

- **Placement of new cards:** take freed slots of removed cards, or always go to the bottom of the
  shortest column?
- **Removal delay:** how long should a removed card stay on screen (30 s? 60 s?)?
- **Layout trigger:** schedule only, freeze-on-hover only, or both (recommended: both)? And what
  interval: 10 s, 15 s, other?
- **"+N new / −N gone" pill:** wanted, or is the schedule enough?
- **Sort interaction:** how importance mode should behave under persistent columns (e.g. sort
  only on "tidy up", or on the slow schedule) is left for a later pass, since sorting is set aside
  here.
