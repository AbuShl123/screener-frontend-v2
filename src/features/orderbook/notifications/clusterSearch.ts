import { fmtBaseQty, fmtMoney, fmtSymbol, tradePriceDecimals } from '@/features/orderbook/format';
import { exchangeMeta } from '@/features/orderbook/exchanges';
import type { ActiveCluster } from '@/features/orderbook/types';

/** The clusters-tab counterpart of `tradeSearch.ts`: all the text a query may match. */
function haystack({ exchange, market, symbol, side, cluster: c }: ActiveCluster): string {
  const dec = tradePriceDecimals(c.priceFrom, c.priceTo);
  return [
    exchangeMeta(exchange).label,
    symbol,
    fmtSymbol(symbol),
    side,
    market,
    String(Math.round(c.totalNotional)),
    fmtMoney(c.totalNotional),
    fmtBaseQty(c.totalQuantity),
    c.priceFrom.toFixed(dec),
    c.priceTo.toFixed(dec),
  ]
    .join(' ')
    .toLowerCase();
}

/** Substring match across exchange + ticker + side + market + size + prices. */
export function matchesCluster(c: ActiveCluster, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || haystack(c).includes(q);
}
