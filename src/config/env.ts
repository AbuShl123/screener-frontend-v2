import { z } from 'zod';

/**
 * Single source of truth for runtime configuration.
 *
 * Nothing else in the app should read `import.meta.env` directly — always import
 * `config` from here. Values are build-time (baked by Vite from the .env files),
 * but if we ever switch to runtime config only this module changes; every call
 * site stays the same.
 */

const schema = z.object({
  VITE_API_BASE_URL: z.string().default(''),
  VITE_WS_BASE_URL: z.string().default(''),
});

const parsed = schema.safeParse(import.meta.env);

if (!parsed.success) {
  // Fail loudly and early — a misconfigured environment must never boot silently.
  console.error(
    '❌ Invalid environment configuration:\n' + z.prettifyError(parsed.error),
  );
  throw new Error('Invalid environment configuration. Check your .env files.');
}

const raw = parsed.data;

/** Derive the WebSocket base from the API base when not set explicitly. */
function deriveWsBaseUrl(apiBaseUrl: string, explicit: string): string {
  if (explicit) return explicit.replace(/\/$/, '');

  // Absolute API URL -> swap http(s) for ws(s).
  if (/^https?:\/\//.test(apiBaseUrl)) {
    return apiBaseUrl.replace(/^http/, 'ws').replace(/\/$/, '');
  }

  // Same-origin (empty/relative API URL) -> derive from the current location.
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}`;
}

export const config = {
  /** REST base URL. Empty string means same-origin (relative) requests. */
  apiBaseUrl: raw.VITE_API_BASE_URL.replace(/\/$/, ''),
  /** WebSocket base URL, e.g. wss://tc-screener.com or ws://localhost:5173. */
  wsBaseUrl: deriveWsBaseUrl(raw.VITE_API_BASE_URL, raw.VITE_WS_BASE_URL),
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;
