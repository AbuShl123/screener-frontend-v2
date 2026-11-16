# Exchange metadata API (v1)

> **Status:** agreed v1 contract; implemented by the backend in `marketdata/ExchangeController.java`
> (`dto/ExchangesResponse.java`, `DiscoveryStatus.java`, `VenueDiscovery.java`).
> **Frontend consumer:** `src/features/orderbook/exchangeMetadata.ts` → `exchanges.ts` (runtime registry).
> **Purpose:** the backend is the authority for which exchanges and markets exist, their labels and
> display order, so a new backend adapter appears in the frontend without a frontend release.

## 1. Endpoint

```http
GET /api/exchanges
Authorization: Bearer <access token>
```

- Authenticated, **no subscription required** (falls under `anyRequest().authenticated()`).
- No per-user data; no query parameters; served from memory (no DB, no exchange calls).

## 2. Response (200)

```json
{
  "exchanges": [
    {
      "id": "BINANCE",
      "label": "Binance",
      "logoUrl": null,
      "markets": [
        { "market": "SPOT",    "instrumentCount": 412, "status": { "discovery": "OK" } },
        { "market": "FUTURES", "instrumentCount": 388, "status": { "discovery": "OK" } }
      ]
    }
  ]
}
```

| Field | Rule |
|---|---|
| `exchanges` | One entry per `Exchange` with **≥ 1 enabled venue** (`ExchangesProperties.isEnabled(venue)`); exchanges with none are **omitted**. **Order = `Exchange` declaration order** — the display order and the equal-price tie-break. |
| `id` | `Exchange.name()`, `^[A-Z0-9]{1,32}$`, no underscores. Same string as the WebSocket `exchange` and the prefix of `/api/tickers` `venue`. |
| `label` | Display name, 1–40 chars, non-blank, proper noun (not localized). |
| `logoUrl` | Always present; **`null` in v1**. If ever set: a relative path starting with `/api/`. |
| `markets` | ≥ 1 entry, **enabled venues only**, `Market` declaration order (SPOT, FUTURES), no duplicates. |
| `market` | `SPOT` \| `FUTURES` in v1. |
| `instrumentCount` | Active instruments for the venue (informational). |
| `status.discovery` | Instrument-discovery outcome — see §3. |

## 3. `status.discovery` is discovery state, NOT connection health

| Value | Meaning |
|---|---|
| `PENDING` | Enabled, but no universe refresh has completed since startup. |
| `OK` | The last refresh fetched this venue successfully. |
| `RETAINED` | The last refresh failed for this venue's source; its previous universe is kept. |

It says nothing about WebSocket connections, frames or order book sync. `status.connection` is
**reserved** for a later additive change and is not sent in v1.

## 4. Compatibility rules

- **Additive only**: fields may be added, never removed/renamed/retyped. Breaking change → new endpoint.
- New `market` and `discovery` values are allowed (clients skip unknown markets; unknown discovery
  values are informational).
- **Never reorder or rename `Exchange` constants**; append new exchanges at the end (ids are stored
  in users' saved preferences, and order is the tie-break).
- Every enabled `(exchange, market)` that can appear in the WebSocket feed must be listed here.

## 5. Frontend handling (summary)

- **Validation** (`parseExchangesPayload` in `exchanges.ts`): a payload with any malformed entry
  (bad shape, id, label, duplicate id or market, more than 32 exchanges) is **rejected as a whole**
  and the registry is left unchanged. A valid `{"exchanges": []}` is applied. Unknown markets are
  skipped; an exchange left with no supported market is skipped (not malformed). A `logoUrl` is
  honored only as a relative `/api/` path.
- **Resolution**: last valid response → its localStorage cache → bundled seed (Binance, MEXC, Bybit)
  → feed-seen *provisional* ids (temporary fallback).
- **Refetch**: `staleTime` 60 min, plus on a socket reconnect or a feed-revealed unknown exchange,
  throttled to one request per 60 s by the last attempt time.
- **`status.discovery`**: stored in the registry, not displayed. It never hides data or changes
  saved filters/mutes.
