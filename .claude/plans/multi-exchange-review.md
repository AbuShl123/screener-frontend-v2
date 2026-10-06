# Multi-exchange support: impact review & phased plan

> **Status:** implemented (Phases 0–6). Branch: `feature/multi-exchange`.
> **Trigger:** the backend added a second exchange (MEXC Futures; MEXC Spot soon, Bybit later),
> which changed the WebSocket feed and `GET /api/tickers` contracts.
> **Contracts:** [`../docs/changes/websocket-feed-api.md`](../docs/changes/websocket-feed-api.md),
> [`../docs/changes/ticker-list-api.md`](../docs/changes/ticker-list-api.md),
> [`../docs/changes/classification-rule-api.md`](../docs/changes/classification-rule-api.md).
> **Design:** Claude Design project "Dashboard Page Template - Final" → `DashboardPage.dc.html`.

---

## 1. What changed and why it matters

### 1.1 The WebSocket feed is a rewrite, not a field addition

| Today (code) | New contract |
|---|---|
| `ADD` / `UPDATE` / `DROP` message types | One `DEPTH` type; `data: null` means "remove this book" |
| `symbol`, `market`, `bids`, `asks` at the top level | Envelope `{ type, exchange, market, symbol, data }`, levels under `data: { bids, asks }` |
| `SNAPSHOT.data` = array of books | Array of **envelopes**, byte-identical to live messages; may contain unknown future `type`s |
| Levels are objects `{ price, quantity, tier, firstSeenMillis, distance }` | Levels are **positional tuples** `[price, quantity, tier, firstSeenMillis, distance]` |
| `seq` on every message | Gone |
| Tier 0–4, always top-5 per side | **Tier 1–4 only**; **0–5 levels per side**, either side may be empty |
| Binance only | `exchange` is an **open set** (`"BINANCE"`, `"MEXC"` today) |

The tuple change is the silent killer: the socket is deliberately not Zod-validated, so old code
against the new backend would not crash — `level.price` becomes `undefined` and every bar, price
and notification turns into `NaN`. **The protocol migration must therefore land atomically
(Phase 1).**

### 1.2 Ticker list

`GET /api/tickers` changed from `{ total, spotCount, futuresCount, tickers: [{ symbol, hasFutures,
hasSpot }] }` to `{ total, byVenue, instruments: [{ id, venue, symbol }] }`. The current Zod schema
(`settings/schemas.ts`) throws on the new shape, which breaks both Settings pickers. `venue` is
`EXCHANGE_MARKET` (split on the **last** underscore); `id` is debug-only and must never be stored
or keyed on.

**Confirmed:** `symbol` is normalized `BASEQUOTE` (`BTCUSDT`) on every exchange, in the feed, the
ticker list and the rules API alike. No normalization is needed on the frontend.

### 1.3 Classification rules

No API change. Rules stay exchange-independent, targeting `(symbol, market)`. The only frontend
consequence is that the rule picker must de-duplicate the ticker pool by `(symbol, market)`.

### 1.4 Design changes (from the template)

1. **Variable-height cards.** A book can have 1 ask and 0 bids, or 5 + 5 per exchange.
2. **Masonry layout** instead of a strict grid, so short cards don't leave gaps.
3. **One card per `(symbol, market)`, rows from all exchanges merged into it**, still sorted by
   price (not grouped by exchange).
4. **A new first column with an exchange logo** in every row, kept outside the histogram bars for
   readability.
5. **Exchange logo on every notification card**, before the ticker name.
6. **No exchange indicator in the card header** (decided: keep the design as is).

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Card identity stays `(symbol, market)`; exchanges are nested inside it** (§3.1). | Matches the template (merged rows), keeps `keys` stable and per-card selectors unchanged, and preserves the `SYMBOL:MARKET` key. |
| D2 | **No frontend row cap.** A side shows every level from every exchange (≤ 5 per exchange per side, so ≤ 10 with two exchanges, ≤ 15 with Bybit). | The backend already caps per exchange. Revisit only if it becomes a problem. |
| D3 | **Mutes apply across all exchanges.** Keyed `SYMBOL:MARKET`, exactly as today. | Mirrors how rules work. **No localStorage migration needed**: existing mutes stay valid. |
| D4 | **An exchange registry is the allowlist.** Envelopes for an exchange not in the registry are dropped in the feed client's guard. | "Frontend not yet updated for a new exchange" degrades to "that exchange is invisible", never to a broken row with no logo. |
| D5 | **Equal prices across exchanges order by registry order** (Binance, then MEXC, then …). | Deterministic, no flicker between two rows with the same price. |
| D6 | **Masonry assignment is recomputed only on reorder/resize, not on height change** (§3.4). | Cards don't hop between columns on every tick; the page keeps its "subscribe to `keys` only" property. Columns may drift slightly out of balance between reorders, which is acceptable. |
| D7 | **Logos are static PNG assets imported through Vite, rendered with `<img>`.** Assumed already sized/normalized (§3.3). | Format is not the bottleneck; dimensions and rendering method are. |
| D8 | **Decode tuples into `Level` objects at the edge** (feed client guard), attaching `exchange`. | ≤ 10 tiny objects per message is negligible; the rest of the code keeps named fields. |

---

## 3. Design

### 3.1 Store shape (`src/stores/orderbookStore.ts`)

```ts
type Exchange = string; // open set; only registry members ever reach the store (D4)

interface VenueBook { bids: Level[]; asks: Level[] }

interface PairBook {
  symbol: string;
  market: Market;
  venues: Record<Exchange, VenueBook>; // never empty — a pair with no venues is deleted
}

books: Record<BookKey /* SYMBOL:MARKET */, PairBook>;
keys: BookKey[]; // unchanged semantics: new identity ONLY when the set of pairs changes
```

`applyMessages` per message:

- **`SNAPSHOT`**: wipe `books`, then run every entry through the same per-envelope handler as live
  messages (contract §3.2). Snapshot entries raise no notifications, as today.
- **`DEPTH` with data**: `own()` the books map, copy the pair (fresh identity), replace
  `venues[exchange]`. Creates the pair if absent (→ `keysChanged`). Run the notification diff
  against the **previous `venues[exchange]`** before overwriting.
- **`DEPTH` with `null`**: delete `venues[exchange]` (fresh pair identity). If `venues` becomes
  empty, delete the pair (→ `keysChanged`). No-op if absent (contract §3.7: redundant removals are
  normal).
- **Unknown `type`**: ignored, both live and inside a snapshot (contract §4.2).

Invariants kept from today: a changed pair gets a fresh object identity, untouched pairs keep
theirs; `keys` changes identity only when a *pair* appears or disappears (an exchange joining an
existing pair does **not** change `keys`).

`bookKey(symbol, market)` stays the canonical pair key. The three-part
`EXCHANGE:MARKET:SYMBOL` string from the contract is not needed as a store key, because the
nesting already keys state on all three fields. It *is* needed in the cooldown key (§3.5).

### 3.2 Types and feed client

`src/features/orderbook/types.ts`:

- `Level.tier` narrows to `1 | 2 | 3 | 4`. `Level` gains `exchange: Exchange` (set at decode time,
  so the card can merge rows without re-threading the venue key).
- Wire types follow the contract's TS shapes (`LevelTuple`, `DepthMessage`, `SnapshotMessage`);
  the internal `FeedMessage` the store consumes is the decoded form.
- `Notification` gains `exchange`.
- `PairBook` / `VenueBook` replace `OrderBook`.

`src/lib/ws/feedClient.ts` (`coerceMessage`):

- `SNAPSHOT`: map `data` through the envelope guard, dropping `null` results (unknown types,
  unknown exchanges, malformed entries).
- Envelope guard: `type === 'DEPTH'`, `symbol` string, `isMarket(market)`, `exchange` **in the
  registry** (D4), `data` either `null` or an object with array `bids`/`asks`. Anything else →
  `null` (dropped). Unknown types are dropped silently: no dev warning, since the contract says new
  types will arrive without a coordinated release. An unknown exchange may warn **once per exchange**
  in dev.
- Tuples decoded via `([price, quantity, tier, firstSeenMillis, distance]) => ({ …, exchange })`;
  extra trailing tuple elements are ignored (contract §3.5).
- `SNAPSHOT_REQUEST` (client → server) is out of scope; not needed for this work.

### 3.3 Exchange registry and logos

New module `src/features/orderbook/exchanges.ts`:

```ts
import binanceLogo from '@/assets/exchanges/binance.png';
import mexcLogo from '@/assets/exchanges/mexc.png';

export interface ExchangeMeta { label: string; logo: string }

/** Registry ORDER is the tie-break for equal prices across exchanges (D5). */
export const EXCHANGES = {
  BINANCE: { label: 'Binance', logo: binanceLogo },
  MEXC:    { label: 'MEXC',    logo: mexcLogo },
} satisfies Record<string, ExchangeMeta>;

export const isKnownExchange = (e: string): e is keyof typeof EXCHANGES => e in EXCHANGES;
export const exchangeRank = (e: string): number => /* index in EXCHANGES */;
```

- Keyed by **exchange** (`MEXC`), not venue (`MEXC_FUTURES`), so MEXC Spot reuses the same entry.
  Adding Bybit = one asset + one registry line.
- Labels are proper nouns, not i18n strings.
- Assets live in `src/assets/exchanges/` (new directory) and are imported, so Vite emits
  content-hashed, immutably cacheable URLs.

**Logo performance notes** (why PNG is fine):

- A decoded image is cached per URL. With 2–3 exchanges there are 2–3 decodes per session no matter
  how many rows render them.
- Rows are keyed by index, so a row whose exchange changes just swaps `src` between two
  already-decoded images, which is about as cheap as a text change. Nothing is re-fetched or
  re-decoded as orders "move".
- What actually costs: **oversized intrinsic dimensions** (memory + downscale on paint) and
  **inline `<svg>` per row** (extra DOM nodes on the hot path). So: `<img>` with explicit
  `width`/`height` (12 px in cards, 14 px in notifications), source art at ~2–2.5× display size
  (24–32 px square). SVG via `<img>` would be equally good if it ever becomes convenient.
- The template's `scale(1.2)` for MEXC compensates for padding in the uploaded artwork. Per the
  decision to assume normalized assets, the registry carries **no** per-exchange scale. If the
  artwork still needs it, fix the asset rather than add a transform.
- Template uploads for reference: `uploads/binance_logo_small.webp`, `uploads/mexc_logo_trans.png`
  (24 KB, likely oversized for a 12 px icon; to be resized by the user).

### 3.4 Masonry layout (`DashboardPage.tsx` + new `masonry.ts`)

Template behavior: a `ResizeObserver` sets the column count `max(1, floor((width + 20) / 285))`
(min card width 265 + gap 20). Cards are dealt in sort order to the **shortest** column using an
**estimated** height `64 + (asks + bids) × 26`. Each column is a vertical flex stack (`gap: 20px`).

Performance-safe adaptation (D6):

- `assignColumns(sortedKeys, colCount, estimateHeight)` is a pure function in a new
  `src/features/orderbook/masonry.ts`.
- `DashboardPage` memoizes it on `[sortedKeys, colCount]` **only**. Heights are read
  non-reactively via `useOrderbookStore.getState()` inside the memo. A card growing or shrinking
  between reorders just pushes its own column's stack; nothing is reassigned and the page doesn't
  re-render.
- Recomputation triggers: ticker set changes (`keys`), sort mode change, an importance re-sort
  (already a page re-render today), column count change.
- `colCount` lives in page state, updated from a `ResizeObserver` on the grid container, and set
  only when the computed count actually changes.
- Moving a card to another column remounts it (different parent). That's acceptable because it
  happens only on the triggers above.
- `contain-intrinsic-size: auto 380px` on the card becomes an estimate closer to a typical card
  (the `auto` keyword still remembers the last real size); 380 px is wrong for a 2-row card.
- The notification panel's `paddingRight` on `<main>` already shrinks the container, so the
  `ResizeObserver` naturally drops a column when the panel opens.

**As implemented (deviation):** memoizing on `[sortedKeys, colCount]` alone was not enough.
In `importance` mode the page already re-renders on every flush, and `sortKeys` returns a fresh
array each time even when the order is unchanged, so the memo would have re-dealt the columns
per tick (breaking D6). `DashboardPage` therefore keeps the previous `sortedKeys` identity (via a
ref) while the order is element-wise identical, so a re-deal happens only on an actual reorder.
In importance mode real reorders can still be fairly frequent (tier counts shift), and a card
moved to another column remounts; that is accepted. Two smaller details: the card-height
estimate uses the card's actual chrome (`80 + rows × 26`, shared between `masonry.ts` and the
card's `contain-intrinsic-size`) rather than the template's `64 + rows × 26`, and the
`ResizeObserver` watches an always-mounted wrapper inside `<main>` so the column count is
measured before the first card arrives.

### 3.5 Notifications

- `selectNotifications(prevVenue, msg)` diffs **one exchange's** previous levels against the
  incoming ones. Diffing against the merged card would make a MEXC update look like "Binance's
  levels vanished". The rule itself is unchanged: new book → every level; new price → notify; same
  price with a different tier → notify. The `tier === 0` skip becomes dead code and is removed.
- Each raised `Notification` carries `exchange`.
- `cooldown.ts` key becomes `exchange:symbol:market:side:price:tier`, so the same price on two
  exchanges doesn't dedupe across them.
- `settingsFilter.ts` is unchanged in shape: it keeps matching `bookKey(symbol, market)`, so a
  mute silences every exchange (D3).
- `notificationSearch.ts`: add the exchange label to the haystack so "mexc" filters the panel.
- **Behavioral note:** with tier 0 gone, a book leaves the feed whenever its last notable level
  goes and re-enters later as "new", announcing all its levels. The 5-minute cooldown already
  absorbs identical repeats; expect slightly more first-time announcements than before. No action.

### 3.6 Order book card (`OrderbookCard.tsx`)

- Selector unchanged: `s.books[bookKey]` (the pair).
- Merge: concatenate `venues[*].asks` and `venues[*].bids` (each level already carries
  `exchange`), sort by price high → low, tie-broken by `exchangeRank` (D5). The ≤ 15-element sort
  per render is negligible.
- `maxNotional` is computed across the **merged** rows of both sides (template behavior: one bar
  scale per card regardless of exchange).
- Row grid becomes `12px 1fr 72px 56px` with the logo first. The bar layer starts after the logo
  column (`left: 36px`, taken as-is from the template) and stays capped before the price column
  (`right: 156px`). The size text gets the template's `padding-left: 6px` so it doesn't sit flush
  against the bar's start.
- `<img src={EXCHANGES[ex].logo} alt={label} width={12} height={12} decoding="async">`. The row's
  existing hover tooltip (written imperatively in `onMouseEnter`) can prepend the exchange label;
  keep the "no i18n in the render body" rule.
- A side with zero levels renders nothing; the dashed spread divider stays (template does the
  same with `LINKUSDT` asks-only / `AVAXUSDT` bids-only).

### 3.7 Sorting (`sortOrderbooks.ts`)

- `alphabetical` / `spot-first` / `futures-first`: unchanged (key string still `SYMBOL:MARKET`).
- `importance`: `tierCounts` sums across all venues of the pair.

### 3.8 Ticker list and Settings

- `settings/schemas.ts`: replace with `instrumentSchema` / `tickersResponseSchema` from the
  contract (§5 of the ticker doc). `id` is validated but never read.
- `parseVenue(venue)`: split on the last underscore → `{ exchange, market }`. Rows whose market
  isn't `SPOT`/`FUTURES` are skipped.
- `tickerPool.ts`: map `instruments` directly (no more `hasSpot` expansion) and **de-duplicate by
  `(symbol, market)`**. The pool's entries stay `{ key: bookKey(symbol, market), symbol, market }`,
  so `MutedTickers` and `ClassificationRules` need only their `.tickers` → `.instruments` access
  updated.
- The pool is **not** filtered by the exchange registry: rules and mutes are exchange-independent,
  so a pair tracked only on a not-yet-supported exchange is still a valid rule/mute target.
- Copy: `settings.json` "classified 0–4" → "1–4" (en + ru), since tier 0 no longer exists on the
  wire.

---

## 4. Impact inventory

| File | Change | Phase |
|---|---|---|
| `CLAUDE.md` | Fix the stale "In flight" summary (it describes ADD/UPDATE/DROP + `exchange`); note i18n is implemented | 0 |
| `src/assets/exchanges/*.png` (new) | Logo assets | 0 |
| `src/features/orderbook/exchanges.ts` (new) | Registry / allowlist / rank | 0 |
| `src/features/orderbook/types.ts` | Wire tuple types, `Level.exchange`, tier 1–4, `PairBook`, `Notification.exchange` | 1 |
| `src/lib/ws/feedClient.ts` | Envelope guard, tuple decode, registry filter, snapshot envelopes | 1 |
| `src/stores/orderbookStore.ts` | Nested `venues`, `DEPTH`/null handling | 1 |
| `src/features/orderbook/notifications/selectNotifications.ts` | Per-venue diff, `exchange` on output | 1 |
| `src/features/orderbook/notifications/cooldown.ts` | `exchange` in key | 1 |
| `src/features/orderbook/sortOrderbooks.ts` | Tier counts across venues | 1 |
| `src/features/orderbook/components/OrderbookCard.tsx` | Merge (minimal in P1), then logo column + layout (P3) | 1, 3 |
| `src/features/settings/schemas.ts`, `tickerPool.ts`, `MutedTickers.tsx`, `ClassificationRules.tsx` | New schema, venue parsing, dedupe | 2 |
| `src/features/orderbook/masonry.ts` (new), `pages/DashboardPage.tsx` | Masonry | 4 |
| `src/features/orderbook/components/NotificationCard.tsx`, `notifications/notificationSearch.ts` | Logo + searchable exchange | 5 |
| `src/lib/i18n/locales/{en,ru}/settings.json` | "0–4" → "1–4" | 6 |

Untouched: `settingsFilter.ts`, `notificationSettingsStore.ts`, `settings/storage.ts` (D3: mute
keys keep their format), the rules API layer, `tiers.ts` (index 0 simply goes unused).

---

## 5. Phases

Each phase ends with `npm run typecheck` passing; the user tests manually.

### Phase 0: Groundwork
- Update the CLAUDE.md "In flight" section to match the real contract and this plan.
- Add `src/assets/exchanges/` with the two PNGs (supplied by the user) and the registry module.

### Phase 1: Feed protocol + store (atomic)
- Types, feed client guard/decoding/allowlist, nested store, per-venue notification diff,
  cooldown key, importance sort across venues.
- Minimal card change so it compiles and renders: merge venue rows and sort by price, with no logo
  column yet.
- **Exit:** the dashboard works against the new backend: Binance + MEXC rows merged per card,
  notifications flowing, unknown exchanges/types ignored.

### Phase 2: Ticker list
- Schema, `parseVenue`, pool de-duplication, picker call sites.
- Independent of Phase 1; can run before or alongside it.
- **Exit:** the Settings modal's muted-tickers and rules pickers load and offer each pair once.

### Phase 3: Card UI
- Logo column, bar offset, cross-exchange `maxNotional`, registry tie-break, tooltip label,
  intrinsic-size estimate. Follow `DashboardPage.dc.html` for spacing.

### Phase 4: Masonry
- `masonry.ts`, `ResizeObserver` column count, reorder-only assignment (D6).

### Phase 5: Notification card
- Logo before the ticker (14 px, template row 1), exchange label searchable.

### Phase 6: Cleanup
- Tier copy (en + ru), remove dead tier-0 branches, final CLAUDE.md pass (orderbook module
  description, real-time diagram's cooldown key).

---

## 6. Risks and edge cases

- **Silent NaN on partial migration.** Mitigated by making Phase 1 atomic (§1.1).
- **Pair flicker across exchanges.** A pair whose Binance book drops while its MEXC book stays must
  keep its card; only an empty `venues` removes it. Covered by §3.1.
- **Redundant messages after a snapshot** (a `DEPTH` repeating snapshot state, or `null` for an
  absent book) are normal per contract §3.7: upsert and remove-if-present already handle them.
- **Masonry imbalance** grows slowly between reorders under the alphabetical/market sorts, which
  have fewer reorder triggers. Accepted (D6). If it becomes visible, add a low-frequency rebalance
  (e.g. on an interval or on scroll-idle), never per tick.
- **Unknown exchanges** are invisible on the dashboard but still present in Settings pickers. This
  is intended (§3.8).
- **Row count per side** can reach 15 once Bybit lands. No cap for now (D2); the masonry height
  estimate already scales with row count.
