import { useEffect } from 'react';
import { startFeed, stopFeed } from '@/lib/ws/feedClient';

/**
 * Starts the live order book feed for the lifetime of the calling component and
 * stops it on unmount. Called once by `DashboardPage`, which only renders inside
 * `ProtectedRoute` — so a token exists when the effect fires, and logout unmounts
 * the page (→ `stopFeed`) before the route guard redirects.
 *
 * `startFeed`/`stopFeed` are idempotent, which is what makes StrictMode's
 * mount → cleanup → mount cycle safe (the second start is a no-op; the paired
 * stop/start just redials once).
 */
export function useOrderbookFeed(): void {
  useEffect(() => {
    startFeed();
    return stopFeed;
  }, []);
}
