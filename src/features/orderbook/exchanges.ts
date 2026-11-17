import { create } from 'zustand';
import { z } from 'zod';
import binanceLogo from '@/assets/exchanges/binance.png';
import mexcLogo from '@/assets/exchanges/mexc.png';
import bybitLogo from '@/assets/exchanges/bybit.png';
import { MARKETS, type Market } from '@/features/orderbook/types';

/**
 * The runtime exchange registry. `GET /api/exchanges` is the AUTHORITY for which exchanges
 * exist, their labels, markets and display order (contract:
 * `.claude/docs/changes/exchange-metadata-api.md`); this module holds the current answer.
 *
 * Resolution, highest first:
 *   1. the last valid server response (applied by `exchangeMetadata.ts`);
 *   2. the cached copy of it (localStorage), so a reload renders the right list at once;
 *   3. the bundled SEED (Binance, MEXC, Bybit — today's order and labels) when neither exists;
 *   4. exchanges first seen in the WebSocket feed, appended as PROVISIONAL until metadata
 *      lists them — a temporary fallback, never the primary source.
 *
 * Bundled logos always win for the exchanges that have one; other exchanges use the
 * server's `logoUrl` (relative `/api/` paths only) or `ExchangeLogo`'s letter fallback.
 * Registry ORDER is the tie-break for equal prices across exchanges (plan D5).
 *
 * Framework-agnostic Zustand store (no React), like the other stores: the feed client reads
 * it synchronously on the hot path. Imports nothing from the filter store or the metadata
 * query, so there is no import cycle and no reactive loop through it.
 */

/** An exchange id: the backend's `Exchange` enum name (`BINANCE`). An open set. */
export type Exchange = string;

/** Instrument-discovery outcome per venue (NOT connection health). Stored, never displayed. */
export type Discovery = 'PENDING' | 'OK' | 'RETAINED' | (string & {});

export interface ExchangeMeta {
  label: string;
  /** Sanitized server logo path (relative `/api/…`), or null. */
  logoUrl: string | null;
  markets: readonly Market[];
  discovery: Readonly<Partial<Record<Market, Discovery>>>;
  /** Seen in the feed but not (yet) in the metadata. */
  provisional: boolean;
}

/** One validated metadata entry (server response or cache). */
export interface ExchangeEntry {
  id: Exchange;
  label: string;
  logoUrl: string | null;
  markets: readonly Market[];
  discovery: Readonly<Partial<Record<Market, Discovery>>>;
}

/** Hard cap on distinct exchanges (registry + feed): a guard against a runaway id stream. */
export const MAX_EXCHANGES = 32;

const EXCHANGE_ID = /^[A-Z0-9]{1,32}$/;
/** Strict id format: upper-case letters and digits, no underscores (keeps `EXCHANGE_MARKET` splittable). */
export const isValidExchangeId = (id: string): boolean => EXCHANGE_ID.test(id);

const isMarket = (v: string): v is Market => (MARKETS as readonly string[]).includes(v);

/** Bundled logos — always used for these ids, whatever the server sends. */
const BUNDLED_LOGOS: Readonly<Record<string, string>> = {
  BINANCE: binanceLogo,
  MEXC: mexcLogo,
  BYBIT: bybitLogo,
};

/** Used only when there is neither a cached nor a fresh server response. */
const SEED: readonly ExchangeEntry[] = [
  { id: 'BINANCE', label: 'Binance', logoUrl: null, markets: MARKETS, discovery: {} },
  { id: 'MEXC', label: 'MEXC', logoUrl: null, markets: MARKETS, discovery: {} },
  { id: 'BYBIT', label: 'Bybit', logoUrl: null, markets: MARKETS, discovery: {} },
];

// ── Validation (shared by the server response and the cache) ──

/** A server logo is honored only as a same-origin `/api/` path (no `//`, no `..`). */
const LOGO_URL = /^\/api\/[A-Za-z0-9/_.-]+$/;
const safeLogoUrl = (v: string | null | undefined): string | null =>
  v && LOGO_URL.test(v) && !v.includes('//') && !v.includes('..') ? v : null;

const payloadSchema = z.object({
  exchanges: z
    .array(
      z.object({
        id: z.string().regex(EXCHANGE_ID),
        label: z.string().trim().min(1).max(40),
        logoUrl: z.string().nullable().optional(),
        markets: z
          .array(
            z.object({
              market: z.string().min(1),
              instrumentCount: z.number().int().nonnegative().optional(),
              status: z.object({ discovery: z.string().optional() }).optional(),
            }),
          )
          .min(1),
      }),
    )
    .max(MAX_EXCHANGES),
});

/**
 * Validates an `/api/exchanges` payload (or the cached copy of one).
 *
 * Returns the entries — possibly an EMPTY array, which is a valid, authoritative answer — or
 * `null` when the payload is malformed: wrong shape, an invalid id or label, a duplicate id,
 * a duplicate market within an exchange, or more than `MAX_EXCHANGES`. A malformed payload is
 * rejected as a whole so it can never replace a valid registry. Markets other than
 * SPOT/FUTURES are skipped (forward-compatible), and an exchange left with none is skipped,
 * not treated as malformed.
 */
export function parseExchangesPayload(raw: unknown): ExchangeEntry[] | null {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return null;

  const entries: ExchangeEntry[] = [];
  const ids = new Set<string>();
  for (const e of parsed.data.exchanges) {
    if (ids.has(e.id)) return null;
    ids.add(e.id);

    const markets: Market[] = [];
    const discovery: Partial<Record<Market, Discovery>> = {};
    const seen = new Set<string>();
    for (const m of e.markets) {
      if (seen.has(m.market)) return null;
      seen.add(m.market);
      if (!isMarket(m.market)) continue;
      markets.push(m.market);
      if (m.status?.discovery) discovery[m.market] = m.status.discovery;
    }
    if (markets.length === 0) continue; // only markets this client doesn't support
    // Display order of markets follows MARKETS (SPOT, FUTURES) regardless of payload order.
    markets.sort((a, b) => MARKETS.indexOf(a) - MARKETS.indexOf(b));
    entries.push({ id: e.id, label: e.label, logoUrl: safeLogoUrl(e.logoUrl), markets, discovery });
  }
  return entries;
}

// ── Cache ──

const CACHE_KEY = 'screener.exchanges.registry'; // JSON in the /api/exchanges payload shape

function loadCache(): ExchangeEntry[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? parseExchangesPayload(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function saveCache(entries: readonly ExchangeEntry[]): void {
  try {
    const payload = {
      exchanges: entries.map((e) => ({
        id: e.id,
        label: e.label,
        logoUrl: e.logoUrl,
        markets: e.markets.map((market) => ({ market, status: { discovery: e.discovery[market] } })),
      })),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable — the registry still works in memory.
  }
}

// ── Store ──

interface RegistryState {
  /** Exchange ids in display order (metadata order, then provisional ones). */
  ids: readonly Exchange[];
  meta: Readonly<Record<Exchange, ExchangeMeta>>;
  /** Bumped on every registry change — components that render labels/logos subscribe to it. */
  version: number;
  /** Bumped only when the FEED reveals a new exchange (triggers a throttled metadata refetch). */
  provisionalSeq: number;
  /** Replace the registry with a validated server response (provisional extras are kept). */
  setFromServer(entries: readonly ExchangeEntry[]): void;
  /** Feed fallback: record an unknown exchange, or a new market of a provisional one. */
  ensureFromFeed(id: Exchange, market: Market): void;
}

const toMeta = (e: ExchangeEntry): ExchangeMeta => ({
  label: e.label,
  logoUrl: e.logoUrl,
  markets: e.markets,
  discovery: e.discovery,
  provisional: false,
});

function fromEntries(entries: readonly ExchangeEntry[]) {
  const meta: Record<Exchange, ExchangeMeta> = {};
  for (const e of entries) meta[e.id] = toMeta(e);
  return { ids: entries.map((e) => e.id), meta };
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const sameMeta = (a: ExchangeMeta, b: ExchangeMeta): boolean =>
  a.label === b.label &&
  a.logoUrl === b.logoUrl &&
  a.provisional === b.provisional &&
  sameIds(a.markets, b.markets) &&
  MARKETS.every((m) => a.discovery[m] === b.discovery[m]);

const initial = fromEntries(loadCache() ?? SEED);

export const useExchangeRegistry = create<RegistryState>((set, get) => ({
  ids: initial.ids,
  meta: initial.meta,
  version: 0,
  provisionalSeq: 0,

  setFromServer(entries) {
    saveCache(entries);
    const cur = get();
    const next = fromEntries(entries);
    // Keep provisional exchanges the server doesn't list yet (still visible in the feed).
    for (const id of cur.ids) {
      const m = cur.meta[id];
      if (m.provisional && !Object.hasOwn(next.meta, id)) {
        next.ids.push(id);
        next.meta[id] = m;
      }
    }
    const idsChanged = !sameIds(cur.ids, next.ids);
    const metaChanged = idsChanged || next.ids.some((id) => !sameMeta(cur.meta[id], next.meta[id]));
    if (!metaChanged) return; // identical answer → no re-render anywhere
    set({
      ids: idsChanged ? next.ids : cur.ids, // keep identity when only metadata changed
      meta: next.meta,
      version: cur.version + 1,
    });
  },

  ensureFromFeed(id, market) {
    const cur = get();
    const existing = Object.hasOwn(cur.meta, id) ? cur.meta[id] : undefined;
    if (existing) {
      // Only a provisional exchange learns markets from the feed; metadata is authoritative.
      if (!existing.provisional || existing.markets.includes(market)) return;
      const markets = MARKETS.filter((m) => m === market || existing.markets.includes(m));
      set({
        meta: { ...cur.meta, [id]: { ...existing, markets } },
        version: cur.version + 1,
      });
      return;
    }
    if (cur.ids.length >= MAX_EXCHANGES) return;
    set({
      ids: [...cur.ids, id],
      meta: {
        ...cur.meta,
        [id]: { label: id, logoUrl: null, markets: [market], discovery: {}, provisional: true },
      },
      version: cur.version + 1,
      provisionalSeq: cur.provisionalSeq + 1,
    });
  },
}));

// ── Plain (non-reactive) accessors — safe on the hot path ──

let rank = new Map<Exchange, number>();
const rebuildRank = (ids: readonly Exchange[]) => {
  rank = new Map(ids.map((id, i) => [id, i]));
};
rebuildRank(useExchangeRegistry.getState().ids);
useExchangeRegistry.subscribe((s, prev) => {
  if (s.ids !== prev.ids) rebuildRank(s.ids);
});

/** Position in the registry; unregistered ids sort last. */
export const exchangeRank = (id: Exchange): number => rank.get(id) ?? Number.MAX_SAFE_INTEGER;

/** Metadata for an id — never undefined (unknown → its id as the label, no logo). */
export function exchangeMeta(id: Exchange): ExchangeMeta {
  const { meta } = useExchangeRegistry.getState();
  return Object.hasOwn(meta, id)
    ? meta[id]
    : { label: id, logoUrl: null, markets: [], discovery: {}, provisional: true };
}

/** Logo source: bundled asset, else the sanitized server path, else null (letter fallback). */
export function exchangeLogoSrc(id: Exchange): string | null {
  return Object.hasOwn(BUNDLED_LOGOS, id) ? BUNDLED_LOGOS[id] : exchangeMeta(id).logoUrl;
}
