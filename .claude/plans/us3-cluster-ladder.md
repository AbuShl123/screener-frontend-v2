# US3 — Cluster ladder and alerts (frontend)

**Ticket**: `[FE] Handle cluster messages, show cluster alerts and the active-cluster list, render
the cluster ladder` — ticket 4 of the order-cluster story.
**Status**: nothing of it is implemented here. The backend side is done and merged locally.
**Companion**: the backend brief lives in the backend repo at
`.claude/plans/team-plans/US3-implementation-brief.md`.

Read `CLAUDE.md` first, then `.claude/docs/websocket-feed-api.md` §3.9, then this file. Where this
file and the code disagree, the code wins; say so rather than following this file silently.

---

## 1. What a cluster is

One large order is often split across many consecutive price levels. Each level on its own is
small, so the classifier rates it tier 0 and it never reaches the dashboard, even though together
the levels form one wall.

```
0.0700 - $120K
0.0701 - $113K
...
0.0740 - $102K      ~41 levels, ~$4.1M combined
```

The backend detects these runs and sends them as a new message type. The user should see that a
wall appeared, be able to scan the currently active ones, and open one to look at the ladder level
by level.

---

## 2. The contract

`.claude/docs/websocket-feed-api.md` §3.9 is the authority; this is the shape in brief.

```json
{ "type": "CLUSTER", "exchange": "BINANCE", "market": "SPOT", "symbol": "ARBUSDT",
  "data": {
    "bidClusters": [
      { "priceFrom": 0.0700, "priceTo": 0.0740, "levelCount": 41,
        "totalNotional": 4120000, "totalQuantity": 57200000,
        "distance": 0.0269, "firstSeenMillis": 1759667423000,
        "levels": [[0.0700, 1714285], [0.0701, 1611983]] }
    ],
    "askClusters": []
  } }
```

- A message carries the instrument's **complete current set** of clusters, not a delta.
- `"data": null` means the instrument has no clusters any more.
- `levels` are `[price, quantity]` pairs ordered from `priceFrom` to `priceTo`.
- `distance` is the fractional distance of the edge nearest the mid, as of the cluster's last
  update, with the same meaning it has for depth levels. It is not re-sent as the price moves.
- `SNAPSHOT` carries one `CLUSTER` entry per instrument that currently has clusters.
- Cluster messages are rare. Receiving none for a while is normal, not a bug.

**The backend currently runs with `delivery-enabled: false`**, a deliberate shadow-tuning period,
so no real `CLUSTER` message will arrive over `/ws` yet. Build against mocks (§6).

---

## 3. The one distinction that matters

The existing feed carries two kinds of thing, and clusters belong to the first:

| | Depth (`DEPTH`) | Clusters (`CLUSTER`) | Trades (`TRADE`) |
|---|---|---|---|
| Nature | state | **state** | history |
| A message | replaces that book | **replaces that instrument's clusters** | adds one alert |
| `data: null` | book left the feed | **clusters are gone** | n/a |
| On `SNAPSHOT` | clear, then apply | **clear, then apply** | merge by `id`, never clear |
| Cap | none | none | 500 |

So the cluster store follows `orderbookStore`'s semantics, not `tradeStore`'s. Copy `tradeStore`
for its *structure* (a Zustand store outside React, written only by the flush, read through
selectors) and `orderbookStore` for its *semantics* (snapshot replaces).

The one rule borrowed from trades: **a `SNAPSHOT` entry must never raise an alert.** `tradeStore`
solves this with `seq: 0` on replayed alerts; clusters need the same guarantee, because a reconnect
or a rules edit would otherwise announce every wall on the market as new.

---

## 4. Where this lands in this codebase

| File | Change |
|---|---|
| `src/features/orderbook/types.ts` | Add `Cluster`, `ClusterData`, `ClusterMessage`, and `ClusterMessage` to the `FeedMessage` union. No Zod on this path, by the existing deliberate tradeoff |
| `src/lib/ws/feedClient.ts` | Accept `CLUSTER` in the structural guard next to `DEPTH` and `TRADE`; coerce `data` by copying only known fields, with `[]` fallbacks for the two arrays; `data: null` must survive as an explicit removal rather than being dropped as malformed. Extend the `SNAPSHOT` unwrap, which today returns `{ type: 'SNAPSHOT', data, trades }`, with a third bucket for clusters. Hand the batch to the cluster store in the same per-frame flush |
| `src/stores/clusterStore.ts` *(new)* | Clusters outside React, keyed per instrument like books are. The flush is the only writer. Expose selectors for the active list and for one instrument |
| `src/features/orderbook/notifications/` | Derive "a cluster appeared" in the flush, where notifications are already derived from `applyMessages`, and dedup through `cooldown.ts`. A sensible key is `exchange:symbol:market:side:priceFrom:priceTo`, so the same wall re-announced after a small update does not toast twice |
| `src/features/orderbook/components/` | `ClusterCard.tsx` for the list entry and `ClusterLadder.tsx` for the detail view. `alertIcons.tsx` gains a cluster icon |
| `src/features/orderbook/components/NotificationPanel.tsx` | A clusters tab beside the trades tab, with its own unread handling in `useUnreadCounts.ts` |
| `src/lib/i18n` | Every user-facing string goes through i18n in both English and Russian, none hardcoded |

Nothing in auth, billing, settings or the rules screens is touched.

---

## 5. Tasks

### FE-1 — Receive and store

Types, the `feedClient` guard, the snapshot split and `clusterStore`.

Done when:

- An upsert replaces that instrument's clusters; a second upsert for the same instrument does not
  accumulate.
- `"data": null` removes the instrument's clusters.
- A `SNAPSHOT` replaces the whole cluster map: instruments absent from it end up with none.
- A malformed `data` is ignored without throwing, in the same spirit as the existing guard, while
  an explicit `null` is honoured as a removal.
- The store is never written from a component, only by the flush.

### FE-2 — Alert and active list

Done when:

- An instrument gaining a cluster it did not have raises one notification.
- A `SNAPSHOT` raises none, even on the very first connection.
- An update to an already-announced cluster does not re-announce it, through `cooldown.ts`.
- A cluster disappearing removes it from the list quietly, without a notification. Whether a
  removal deserves one is an open product question (§8).
- The list shows instrument, side, price range, level count, total notional and distance from mid,
  and is readable at a glance when several instruments have clusters at once.

### FE-3 — Ladder detail view

Done when:

- Opening a cluster shows one row per level in price order, each rendered as a horizontal depth bar
  scaled to the largest level in that cluster.
- The header shows instrument, side, price range, level count, total notional, total quantity,
  distance from mid, and how long the cluster has existed, derived from `firstSeenMillis`.
- Bid and ask clusters are visually distinct and consistent with the colours the order book already
  uses for bids and asks.
- The view updates in place as upserts arrive, and shows a clear "this cluster is gone" state
  rather than freezing or closing abruptly when it is removed.
- A ladder of 200 levels, the backend's cap, renders without jank.

---

## 6. Mock harness

Delivery is off on the backend, so the only way to build and demonstrate this is with mocks. Add a
dev-only injector that pushes synthetic `CLUSTER` messages into the same flush the socket feeds, so
the whole path is exercised rather than the components alone.

Cover at least: first appearance, an update that moves the total, a second cluster on the other
side, removal through `"data": null`, and a reconnect whose `SNAPSHOT` contains two clusters, which
must restore them without raising alerts.

Keep it out of production builds.

---

## 7. Conventions that apply here

- The real-time firehose stays out of React: the store lives outside it, the feed client is the only
  writer, components subscribe through selectors. Clusters are low-frequency, but they ride the same
  flush, so follow the same shape rather than inventing a second mechanism.
- Keep `React.memo` and stable `useCallback` handlers on the panel and its children when adding
  props or children, as `CLAUDE.md` requires.
- No Zod on the socket payload. A cheap structural guard in `feedClient.ts` is the deliberate
  choice; REST stays on Zod.
- No main-thread task longer than 50 ms, which is the project's usability requirement. Memoise
  ladder rows and avoid re-rendering the whole ladder on every update.

---

## 8. Open decisions

Ask before guessing; these are product calls, not implementation details.

1. Which existing filters apply to clusters? Trades obey only the Settings venue mutes. Clusters are
   tied to instruments like depth is, so the header exchange filter and muted tickers probably
   should apply and the minimum tier should not. Confirm.
2. Should a cluster being pulled or filled produce its own notification, or just vanish from the
   list? The backend sends the removal either way.
3. Where does the active list belong: a tab in the notification panel, or its own surface on the
   dashboard? The panel is the cheaper and more consistent option.
4. Is a cluster openable from the order book card of the same instrument, or only from the list?
