/**
 * Pure display formatters for the order book surface (plan §7.4). Ported from the
 * design template's helpers so the rendered card matches the mockup exactly. Kept
 * dependency-free and side-effect-free — cheap to call on the hot render path and
 * unit-testable later; future surfaces (notifications/TTS) can reuse them.
 */

/**
 * Decimal places for a price. We have no per-symbol tick size, so we derive it from
 * the price magnitude itself (template's rule): pricier assets need fewer decimals.
 */
export function priceDecimals(price: number): number {
  if (price >= 1000) return 2;
  if (price >= 100) return 3;
  if (price >= 1) return 4;
  return 5;
}

/**
 * Known quote assets, longest-first for greedy suffix matching. A symbol arrives
 * concatenated (`BTCUSDT`); we split off the quote for a readable `BASE/QUOTE`.
 */
const QUOTE_ASSETS = ['FDUSD', 'USDT', 'USDC', 'TUSD', 'BUSD', 'DAI', 'USD', 'BTC', 'ETH', 'BNB'];

/** Display a raw exchange symbol as `BASE/QUOTE` (`BTCUSDT` → `BTC/USDT`). */
export function fmtSymbol(symbol: string): string {
  for (const quote of QUOTE_ASSETS) {
    if (symbol.length > quote.length && symbol.endsWith(quote)) {
      return symbol.slice(0, -quote.length) + '/' + quote;
    }
  }
  return symbol; // unrecognized quote — show as-is rather than guess
}

/** Compact dollar notional: `$1.23M` / `$45.6K` / `$789` (matches the template). */
export function fmtMoney(v: number): string {
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}

/** Compact base-asset quantity: same compaction as `fmtMoney` without the `$`. */
export function fmtQty(q: number): string {
  if (q >= 1e6) return (q / 1e6).toFixed(2) + 'M';
  if (q >= 1e3) return (q / 1e3).toFixed(1) + 'K';
  return q.toFixed(0);
}

/** Distance from mid, formatted from the raw fraction (doc-mandated): `1.23%`. */
export function fmtDistance(distance: number): string {
  return (distance * 100).toFixed(2) + '%';
}

/**
 * Order age from a duration in ms — largest two units, e.g. `3d 4h` / `22h 15m` /
 * `9m` / `42s` (template's rule). Used for the native `title` tooltip; a negative or
 * sub-second delta clamps to `1s`.
 */
export function fmtAge(ms: number): string {
  const s = Math.max(1, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return d + 'd ' + h + 'h';
  if (h) return h + 'h ' + m + 'm';
  if (m) return m + 'm';
  return s + 's';
}
