import { create } from 'zustand';
import type { FeedMessage, TradeAlert, TradeMessage } from '@/features/orderbook/types';

/**
 * Large-trade alerts (doc §3.8), OUTSIDE React like `notificationStore`: the feed flush is the
 * ONLY writer, the notification panel/handle read via selectors.
 *
 * Trades are history, not state, so unlike the order book a `SNAPSHOT` never clears this
 * store: its replayed alerts are MERGED by `id` (doc §3.8.5). The list is kept sorted by
 * exchange `time` (then `id`), newest first — arrival order is detection order, so a late
 * futures alert can land below a newer spot one (doc §3.8.4).
 *
 * Unread tracking can't use `notificationStore`'s "newest N are unread" prefix rule for that
 * same reason. Each live alert instead gets an increasing arrival number (`seq`) and the store
 * keeps a `readSeq` watermark: an alert is unread while `seq > readSeq`. Snapshot replays get
 * `seq: 0`, so a reconnect / rules edit / `SNAPSHOT_REQUEST` never counts as new alerts.
 *
 * Settings mutes (tickers, venues, minimum tier) do NOT apply to trades; only the header's
 * exchange filter hides them, at display time (`exchangeFilter.ts`).
 */

/** Keep at most this many alerts (doc §3.8.5: cap the list yourself; the server never removes). */
const CAP = 500;
/**
 * How many cleared ids to remember. A snapshot replays only the latest 100 alerts, so this
 * comfortably covers every id a later snapshot could bring back after "Clear all".
 */
const DISMISSED_CAP = 1_000;

/** Newest first by exchange time, then by `id` descending to break ties deterministically. */
function compareTrades(a: TradeAlert, b: TradeAlert): number {
  if (a.time !== b.time) return b.time - a.time;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Ids the user cleared. Module-level (not state: nothing renders from it). A cleared alert
 * must not reappear when the next snapshot replays it. Insertion-ordered, so the oldest
 * entries are the ones trimmed.
 */
const dismissed = new Set<string>();

/**
 * Whether the panel is open on the trades tab. While it is, live arrivals are already on
 * screen, so `ingest` moves `readSeq` along with them. Module-level (not state): nothing
 * renders from it.
 */
let viewing = false;

function dismiss(ids: Iterable<string>): void {
  for (const id of ids) dismissed.add(id);
  if (dismissed.size <= DISMISSED_CAP) return;
  let excess = dismissed.size - DISMISSED_CAP;
  for (const id of dismissed) {
    if (excess-- <= 0) break;
    dismissed.delete(id);
  }
}

interface TradeState {
  /** Newest first (by exchange `time`, then `id`). */
  trades: TradeAlert[];
  /** The last `seq` handed out to a live alert. */
  lastSeq: number;
  /** Alerts with `seq > readSeq` are unread. */
  readSeq: number;
  /** Merge one flush's live `TRADE`s and snapshot `trades` (one `set()`, only if anything is new). */
  ingest(batch: readonly FeedMessage[]): void;
  /** Mark every alert read (the panel is open on the trades tab). */
  markRead(): void;
  /** The panel opened on / left the trades tab. Entering marks everything read. */
  setViewing(v: boolean): void;
  /** "Clear all": empty the list and keep the cleared ids out of later snapshots. */
  clear(): void;
  /** Session end (feed stop / logout): forget everything, including the cleared ids. */
  reset(): void;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  trades: [],
  lastSeq: 0,
  readSeq: 0,

  ingest(batch) {
    let incoming: TradeAlert[] | null = null;
    let seen: Set<string> | null = null;
    let lastSeq = get().lastSeq;

    const add = (m: TradeMessage, live: boolean) => {
      // Built lazily: most flushes carry no trades at all.
      seen ??= new Set(get().trades.map((t) => t.id));
      const id = m.data.id;
      if (seen.has(id) || dismissed.has(id)) return; // replay / repeat / cleared → skip
      seen.add(id);
      (incoming ??= []).push({
        ...m.data,
        exchange: m.exchange,
        market: m.market,
        symbol: m.symbol,
        seq: live ? ++lastSeq : 0,
      });
    };

    for (const msg of batch) {
      if (msg.type === 'TRADE') add(msg, true);
      else if (msg.type === 'SNAPSHOT') for (const t of msg.trades) add(t, false);
    }
    if (!incoming) return; // nothing new — don't wake subscribers

    const trades = get().trades.concat(incoming).sort(compareTrades).slice(0, CAP);
    set(viewing ? { trades, lastSeq, readSeq: lastSeq } : { trades, lastSeq });
  },

  markRead() {
    set((s) => (s.readSeq === s.lastSeq ? s : { readSeq: s.lastSeq }));
  },

  setViewing(v) {
    viewing = v;
    if (v) get().markRead();
  },

  clear() {
    const { trades } = get();
    if (trades.length === 0) return;
    dismiss(trades.map((t) => t.id));
    set((s) => ({ trades: [], readSeq: s.lastSeq }));
  },

  reset() {
    dismissed.clear();
    set({ trades: [], lastSeq: 0, readSeq: 0 });
  },
}));
