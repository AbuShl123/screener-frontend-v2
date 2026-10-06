import { create } from 'zustand';
import { selectNotifications } from '@/features/orderbook/notifications/selectNotifications';
import {
  bookKey,
  type BookKey,
  type DepthMessage,
  type FeedMessage,
  type FeedStatus,
  type Notification,
  type PairBook,
} from '@/features/orderbook/types';

/**
 * Live order book state that lives OUTSIDE React (CLAUDE.md's core rule). The feed
 * client is the ONLY writer; React reads via fine-grained selectors so a single
 * ticker's update re-renders only that one card.
 *
 * Shape (plan §3.1): one entry per `(symbol, market)` PAIR — one card — with each
 * exchange's book nested under `venues`. An exchange joining or leaving a pair that
 * still has other venues changes that pair's identity but NOT `keys`.
 *
 * Created with `create` like `useSession` — the store is framework-agnostic (the
 * feed client touches it through `.getState()`), and the `create` return doubles as
 * the `useOrderbookStore(selector)` hook for components.
 */

interface OrderbookState {
  /** Pair key → pair. A changed pair gets a fresh object identity; untouched pairs keep theirs. */
  books: Record<BookKey, PairBook>;
  /** Sorted key list — new array identity ONLY when the set of pairs changes. */
  keys: BookKey[];
  status: FeedStatus;

  /**
   * Apply one coalesced batch of feed messages (in arrival order) in a SINGLE
   * `set()` — one subscriber-notification pass per flush regardless of how many
   * tickers changed in the window. The feed client is the only caller.
   *
   * Returns the notifications raised by this batch (each live `DEPTH` is diffed against
   * that exchange's PRE-overwrite levels); the caller forwards them to `notificationStore`
   * so this store stays free of any store→store coupling (plan §3, §6a).
   */
  applyMessages(batch: FeedMessage[]): Notification[];
  setStatus(s: FeedStatus): void;
  clear(): void;
}

/** Deterministic card placement: alphabetical by the `SYMBOL:MARKET` key. */
const compareKeys = (a: BookKey, b: BookKey): number => (a < b ? -1 : a > b ? 1 : 0);

export const useOrderbookStore = create<OrderbookState>((set) => ({
  books: {},
  keys: [],
  status: 'connecting',

  applyMessages(batch) {
    const candidates: Notification[] = [];
    set((state) => {
      let books = state.books;
      // `books` starts as the live reference; the first mutating message clones it
      // once so we never touch the object React is currently rendering from.
      let cloned = false;
      let keysChanged = false;

      const own = () => {
        if (!cloned) {
          books = { ...books };
          cloned = true;
        }
      };

      /**
       * The one per-envelope handler, for live messages and snapshot entries alike
       * (doc §4.1). `notify` is false inside a snapshot: a (re)connect or rules-change
       * snapshot must never announce the whole board.
       */
      const applyDepth = (msg: DepthMessage, notify: boolean) => {
        const k = bookKey(msg.symbol, msg.market);
        const pair = books[k];

        if (msg.data === null) {
          // This exchange's book left the feed. Redundant removals are normal (doc §3.7).
          if (!pair?.venues[msg.exchange]) return;
          own();
          const venues = { ...pair.venues };
          delete venues[msg.exchange];
          if (Object.keys(venues).length === 0) {
            delete books[k]; // last venue gone → the card goes
            keysChanged = true;
          } else {
            books[k] = { ...pair, venues };
          }
          return;
        }

        own();
        if (notify) {
          // Diff against THIS exchange's previous levels (undefined = it's new to the pair),
          // never the merged pair — a MEXC update must not look like Binance's levels vanishing.
          const raised = selectNotifications(pair?.venues[msg.exchange], msg, msg.data);
          if (raised.length) candidates.push(...raised);
        }
        if (!pair) keysChanged = true; // a new pair → keys must be recomputed
        books[k] = {
          symbol: msg.symbol,
          market: msg.market,
          venues: { ...pair?.venues, [msg.exchange]: msg.data },
        };
      };

      for (const msg of batch) {
        if (msg.type === 'SNAPSHOT') {
          // Authoritative + complete: wipe and rebuild. Anything absent disappears.
          books = {};
          cloned = true;
          keysChanged = true;
          for (const entry of msg.data) applyDepth(entry, false);
        } else {
          applyDepth(msg, true);
        }
      }

      // If nothing mutated, return the same `books` ref so selector subscribers bail.
      // Only touch `keys` when the ticker set actually changed — routine level
      // updates must never change the `keys` array identity.
      return keysChanged
        ? { books, keys: Object.keys(books).sort(compareKeys) }
        : { books };
    });
    // `set` ran synchronously, so `candidates` is fully populated (plan §9).
    return candidates;
  },

  setStatus(s) {
    set({ status: s });
  },

  clear() {
    set({ books: {}, keys: [] });
  },
}));
