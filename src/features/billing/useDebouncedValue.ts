import { useEffect, useState } from 'react';

/**
 * Returns `value` delayed by `delayMs` — the debounced tail of a rapidly-changing
 * input. Used by `PayByDaysPage` so a fast typist doesn't spray one days-conversion
 * request per keystroke (plan §2): React Query keys on the debounced amount, not the
 * live one. Each new `value` resets the timer; the last write within a quiet window wins.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
