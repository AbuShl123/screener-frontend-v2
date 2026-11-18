import {
  fmtBaseQty,
  fmtMoney,
  fmtSymbol,
  tradePriceDecimals,
} from '@/features/orderbook/format';
import { exchangeMeta } from '@/features/orderbook/exchanges';
import type { TradeAlert } from '@/features/orderbook/types';

/**
 * All the text a query may match against for a trade alert, lowercased once per alert —
 * the trades-tab counterpart of `notificationSearch.ts`. Raw and formatted values are both
 * included so a match doesn't depend on how a value renders or on the QTY/$ toggle.
 */
function haystack(t: TradeAlert): string {
  const dec = tradePriceDecimals(t.firstPrice, t.lastPrice);
  return [
    exchangeMeta(t.exchange).label, //      'Binance'
    t.symbol, //                            'SOLUSDT'
    fmtSymbol(t.symbol), //                 'SOL/USDT'
    t.side, //                              'BUY' / 'SELL'
    t.market, //                            'FUTURES' / 'SPOT'
    String(Math.round(t.notional)), //      '612455'
    fmtMoney(t.notional), //                '$612.5K'
    fmtBaseQty(t.qty), //                   '4.38K'
    t.avgPrice.toFixed(dec),
    t.firstPrice.toFixed(dec),
    t.lastPrice.toFixed(dec),
  ]
    .join(' ')
    .toLowerCase();
}

/** Substring match across exchange + ticker + side + market + size + prices. */
export function matchesTrade(t: TradeAlert, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack(t).includes(q);
}
