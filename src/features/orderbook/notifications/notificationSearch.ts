import {
  fmtDistance,
  fmtMoney,
  fmtQty,
  fmtSymbol,
  priceDecimals,
} from '@/features/orderbook/format';
import type { Notification } from '@/features/orderbook/types';

/**
 * All the text a query may match against, lowercased once per notification. Both raw
 * (`274300`, `0.26`) and formatted (`$274.3K`, `0.26%`) forms are included so a match
 * doesn't depend on how a value renders or on the QTY/$ toggle.
 */
function haystack(n: Notification): string {
  const qty = n.notional / n.price;
  return [
    n.symbol, //                                 'XRPUSDT'  → matches "xrp", "usdt"
    fmtSymbol(n.symbol), //                       'XRP/USDT'
    n.side, //                                    'ask' / 'bid'
    n.market, //                                  'FUTURES' / 'SPOT'
    n.price.toFixed(priceDecimals(n.price)), //   '1.1509' → matches "1.15"
    String(Math.round(n.notional)), //            '274300' → matches "274"
    fmtMoney(n.notional), //                      '$274.3K'
    fmtQty(qty), //                               '238K' (size-mode value)
    fmtDistance(n.distance), //                   '0.26%' → matches "0.26"
  ]
    .join(' ')
    .toLowerCase();
}

/** Substring match across ticker + price + notional + distance (+ side/market). */
export function matches(n: Notification, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack(n).includes(q);
}
