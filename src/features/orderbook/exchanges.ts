import binanceLogo from '@/assets/exchanges/binance.png';
import mexcLogo from '@/assets/exchanges/mexc.png';

/**
 * The exchange registry: display metadata per exchange AND the feed's allowlist (plan D4).
 * The wire's `exchange` is an open set; envelopes for an exchange missing here are dropped
 * in `feedClient.ts`, so "frontend not updated for a new exchange" degrades to "that
 * exchange is invisible" rather than a broken row with no logo.
 *
 * Keyed by EXCHANGE (`MEXC`), not venue (`MEXC_FUTURES`), so every market of an exchange
 * shares one entry. Adding an exchange = one asset in `src/assets/exchanges/` + one line here.
 * Labels are proper nouns, not i18n strings.
 */

export interface ExchangeMeta {
  label: string;
  logo: string; // Vite-emitted, content-hashed asset URL
}

/** Registry ORDER is the tie-break for equal prices across exchanges (plan D5). */
export const EXCHANGES = {
  BINANCE: { label: 'Binance', logo: binanceLogo },
  MEXC: { label: 'MEXC', logo: mexcLogo },
} satisfies Record<string, ExchangeMeta>;

export type Exchange = keyof typeof EXCHANGES;

export const isKnownExchange = (e: string): e is Exchange => Object.hasOwn(EXCHANGES, e);

const RANK: Record<string, number> = Object.fromEntries(
  Object.keys(EXCHANGES).map((e, i) => [e, i]),
);

/** Position in the registry; unknown exchanges (never in the store, per D4) sort last. */
export const exchangeRank = (e: string): number => RANK[e] ?? Number.MAX_SAFE_INTEGER;
