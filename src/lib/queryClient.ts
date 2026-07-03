import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client — owns all REST server-state (caching, retries,
 * polling). Feature hooks build on top of this; the raw client rarely needs to
 * be touched directly.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
