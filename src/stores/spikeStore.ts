import { create } from 'zustand';
import type { FeedMessage, SpikeAlert, SpikeMessage } from '@/features/orderbook/types';

/**
 * Price and volume spike alerts (doc §3.10), OUTSIDE React like `tradeStore`: the feed flush is
 * the ONLY writer, the notification panel/handle read via selectors.
 *
 * The same model as `tradeStore`: spikes are history, so a `SNAPSHOT` never clears this store —
 * its replayed alerts are MERGED by `id`. The list is sorted by exchange `time` (then `id`),
 * newest first. Live alerts get an increasing `seq`; an alert is unread while `seq > readSeq`.
 * Snapshot replays get `seq: 0`, so a reconnect never counts as new alerts.
 */

/** Keep at most this many alerts (the server never removes one). */
const CAP = 300;
/** How many cleared ids to remember; a snapshot replays only the latest 50 spikes. */
const DISMISSED_CAP = 500;

function compareSpikes(a: SpikeAlert, b: SpikeAlert): number {
  if (a.time !== b.time) return b.time - a.time;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Ids the user cleared, kept out of later snapshot replays. Module-level: nothing renders from it. */
const dismissed = new Set<string>();

/** Whether the panel is open on the spikes tab (arrivals are then read at once). */
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

/** Flatten an envelope into a stored alert. */
function toAlert(m: SpikeMessage, seq: number): SpikeAlert {
  const identity = { exchange: m.exchange, market: m.market, symbol: m.symbol, seq };
  return m.type === 'PRICE_SPIKE'
    ? { ...m.data, ...identity, kind: 'PRICE' }
    : { ...m.data, ...identity, kind: 'VOLUME' };
}

interface SpikeState {
  /** Newest first (by exchange `time`, then `id`). */
  spikes: SpikeAlert[];
  lastSeq: number;
  /** Alerts with `seq > readSeq` are unread. */
  readSeq: number;
  /** Merge one flush's live spikes and snapshot `spikes` (one `set()`, only if anything is new). */
  ingest(batch: readonly FeedMessage[]): void;
  markRead(): void;
  /** The panel opened on / left the spikes tab. Entering marks everything read. */
  setViewing(v: boolean): void;
  /** "Clear all": empty the list and keep the cleared ids out of later snapshots. */
  clear(): void;
  /** Session end (feed stop / logout): forget everything, including the cleared ids. */
  reset(): void;
}

export const useSpikeStore = create<SpikeState>((set, get) => ({
  spikes: [],
  lastSeq: 0,
  readSeq: 0,

  ingest(batch) {
    let incoming: SpikeAlert[] | null = null;
    let seen: Set<string> | null = null;
    let lastSeq = get().lastSeq;

    const add = (m: SpikeMessage, live: boolean) => {
      seen ??= new Set(get().spikes.map((s) => s.id));
      const id = m.data.id;
      if (seen.has(id) || dismissed.has(id)) return;
      seen.add(id);
      (incoming ??= []).push(toAlert(m, live ? ++lastSeq : 0));
    };

    for (const msg of batch) {
      if (msg.type === 'PRICE_SPIKE' || msg.type === 'VOLUME_SPIKE') add(msg, true);
      else if (msg.type === 'SNAPSHOT') for (const s of msg.spikes) add(s, false);
    }
    if (!incoming) return;

    const spikes = get().spikes.concat(incoming).sort(compareSpikes).slice(0, CAP);
    set(viewing ? { spikes, lastSeq, readSeq: lastSeq } : { spikes, lastSeq });
  },

  markRead() {
    set((s) => (s.readSeq === s.lastSeq ? s : { readSeq: s.lastSeq }));
  },

  setViewing(v) {
    viewing = v;
    if (v) get().markRead();
  },

  clear() {
    const { spikes } = get();
    if (spikes.length === 0) return;
    dismiss(spikes.map((s) => s.id));
    set((s) => ({ spikes: [], readSeq: s.lastSeq }));
  },

  reset() {
    dismissed.clear();
    set({ spikes: [], lastSeq: 0, readSeq: 0 });
  },
}));
