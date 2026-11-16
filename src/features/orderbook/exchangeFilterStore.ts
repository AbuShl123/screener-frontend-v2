import { create } from 'zustand';
import {
  isValidExchangeId,
  useExchangeRegistry,
  type Exchange,
} from '@/features/orderbook/exchanges';

/**
 * The dashboard's per-exchange filter: which exchanges are HIDDEN from the grid and the
 * notifications panel. A display-only preference — the feed client never reads it, so every
 * exchange's data keeps flowing into the stores and re-showing an exchange is instant (no
 * reconnect, no waiting for a snapshot).
 *
 * Two lists:
 * - `saved` — what the user chose, persisted as-is. NEVER pruned against the registry, so the
 *   choice survives an exchange that is temporarily disabled or not yet in the metadata.
 * - `hidden` — the EFFECTIVE filter every consumer reads: `saved` ∩ the registry's current
 *   ids, or nothing at all if that would hide every current exchange. It only gets a new
 *   array identity when its contents change (memo / masonry / `useShallow` depend on that).
 *
 * Stores the hidden set rather than the selected one so a newly listed exchange shows up by
 * default. Invariant: at least one current exchange stays visible.
 *
 * Reads the exchange registry (never writes it), so there is no cycle between the two stores.
 * Device-level like the other dashboard settings (persists across logout/login).
 */

const STORAGE_KEY = 'screener.dashboard.hiddenExchanges'; // JSON Exchange[]

/** Guarded read: keeps every well-formed id (known or not), drops duplicates/garbage. */
function load(): Exchange[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((v): v is Exchange => typeof v === 'string' && isValidExchangeId(v)))];
  } catch {
    return [];
  }
}

/** Best-effort write; a storage failure just means the filter is in-memory this session. */
function save(saved: Exchange[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage unavailable — keep the in-memory value only.
  }
}

/** `saved` restricted to current ids; hiding all of them means showing all. */
function effective(saved: readonly Exchange[], ids: readonly Exchange[]): Exchange[] {
  const hidden = saved.filter((e) => ids.includes(e));
  return hidden.length >= ids.length ? [] : hidden;
}

const sameList = (a: readonly Exchange[], b: readonly Exchange[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

interface ExchangeFilterState {
  /** The user's persisted choice, including exchanges not currently listed. */
  saved: Exchange[];
  /** The effective hidden exchanges (subset of the registry's current ids). */
  hidden: Exchange[];
  /** Show a hidden exchange, or hide a visible one unless it's the last visible. */
  toggle(exchange: Exchange): void;
  /** Show every currently listed exchange (choices for unlisted ones are kept). */
  showAll(): void;
}

const currentIds = () => useExchangeRegistry.getState().ids;
const initialSaved = load();

export const useExchangeFilterStore = create<ExchangeFilterState>((set, get) => {
  const commit = (saved: Exchange[]) => {
    const next = effective(saved, currentIds());
    const { hidden } = get();
    set({ saved, hidden: sameList(next, hidden) ? hidden : next });
    save(saved);
  };

  return {
    saved: initialSaved,
    hidden: effective(initialSaved, currentIds()),

    toggle(exchange) {
      const ids = currentIds();
      if (!ids.includes(exchange)) return;
      const { saved, hidden } = get();
      // Choices for exchanges that aren't listed right now are carried over untouched; the
      // listed part of `saved` is rewritten to match what the user sees.
      const unlisted = saved.filter((e) => !ids.includes(e));
      if (hidden.includes(exchange)) {
        commit([...unlisted, ...hidden.filter((e) => e !== exchange)]);
      } else {
        if (ids.length - hidden.length <= 1) return; // keep at least one visible
        commit([...unlisted, ...hidden, exchange]);
      }
    },

    showAll() {
      if (get().hidden.length === 0) return;
      const ids = currentIds();
      commit(get().saved.filter((e) => !ids.includes(e)));
    },
  };
});

// The registry's id list changed (metadata arrived, an exchange appeared/disappeared):
// re-derive the effective filter from `saved`. Never persists and never touches the registry.
useExchangeRegistry.subscribe((s, prev) => {
  if (s.ids === prev.ids) return;
  const { saved, hidden } = useExchangeFilterStore.getState();
  const next = effective(saved, s.ids);
  if (!sameList(next, hidden)) useExchangeFilterStore.setState({ hidden: next });
});

/** True when `exchange` is the only visible one — the menu disables its checkbox. */
export const isLastVisible = (
  hidden: readonly Exchange[],
  ids: readonly Exchange[],
  exchange: Exchange,
): boolean => ids.includes(exchange) && !hidden.includes(exchange) && ids.length - hidden.length === 1;
