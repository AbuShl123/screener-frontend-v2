import { create } from 'zustand';
import {
  bookKey,
  type BookKey,
  type FeedMessage,
  type FeedStatus,
  type OrderBook,
} from '@/features/orderbook/types';

/**
 * Live order book state that lives OUTSIDE React (CLAUDE.md's core rule). The feed
 * client is the ONLY writer; React reads via fine-grained selectors so a single
 * ticker's update re-renders only that one card.
 *
 * Created with `create` like `useSession` — the store is framework-agnostic (the
 * feed client touches it through `.getState()`), and the `create` return doubles as
 * the `useOrderbookStore(selector)` hook for components.
 */

interface OrderbookState {
  /** key → book. A changed book gets a fresh object identity; untouched books keep theirs. */
  books: Record<BookKey, OrderBook>;
  /** Sorted key list — new array identity ONLY when the set of tickers changes. */
  keys: BookKey[];
  status: FeedStatus;

  /**
   * Apply one coalesced batch of feed messages (in arrival order) in a SINGLE
   * `set()` — one subscriber-notification pass per flush regardless of how many
   * tickers changed in the window. The feed client is the only caller.
   */
  applyMessages(batch: FeedMessage[]): void;
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

      for (const msg of batch) {
        switch (msg.type) {
          case 'SNAPSHOT': {
            // Authoritative + complete: wipe and rebuild. Anything absent disappears.
            books = {};
            cloned = true;
            keysChanged = true;
            for (const book of msg.data) {
              books[bookKey(book.symbol, book.market)] = {
                symbol: book.symbol,
                market: book.market,
                bids: book.bids ?? [],
                asks: book.asks ?? [],
              };
            }
            break;
          }

          // ADD ≡ UPDATE (doc §4): one upsert path. An UPDATE with no prior ADD is normal.
          case 'ADD':
          case 'UPDATE': {
            const k = bookKey(msg.symbol, msg.market);
            own();
            if (!(k in books)) keysChanged = true; // a new ticker → keys must be recomputed
            books[k] = {
              symbol: msg.symbol,
              market: msg.market,
              bids: msg.bids ?? [],
              asks: msg.asks ?? [],
            };
            break;
          }

          case 'DROP': {
            const k = bookKey(msg.symbol, msg.market);
            if (k in books) {
              own();
              delete books[k];
              keysChanged = true;
            }
            break;
          }
        }
      }

      // If nothing mutated, return the same `books` ref so selector subscribers bail.
      // Only touch `keys` when the ticker set actually changed — routine level
      // updates must never change the `keys` array identity.
      return keysChanged
        ? { books, keys: Object.keys(books).sort(compareKeys) }
        : { books };
    });
  },

  setStatus(s) {
    set({ status: s });
  },

  clear() {
    set({ books: {}, keys: [] });
  },
}));
