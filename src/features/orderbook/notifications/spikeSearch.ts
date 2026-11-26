import { fmtMoney, fmtSymbol } from '@/features/orderbook/format';
import { exchangeMeta } from '@/features/orderbook/exchanges';
import type { SpikeAlert } from '@/features/orderbook/types';

/** All the text a query may match for a spike, lowercased — the spikes-tab `tradeSearch.ts`. */
function haystack(s: SpikeAlert): string {
  const parts = [exchangeMeta(s.exchange).label, s.symbol, fmtSymbol(s.symbol), s.market, s.kind];
  if (s.kind === 'PRICE') {
    parts.push(s.direction, s.pct.toFixed(2) + '%', String(s.fromPrice), String(s.toPrice));
  } else {
    parts.push(fmtMoney(s.prevVolume), fmtMoney(s.volume));
    if (s.pct !== null) parts.push(s.pct.toFixed(0) + '%');
  }
  return parts.join(' ').toLowerCase();
}

/** Substring match across exchange + ticker + market + kind + values. */
export function matchesSpike(s: SpikeAlert, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack(s).includes(q);
}
