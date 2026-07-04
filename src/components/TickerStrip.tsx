interface TickerItem {
  symbol: string;
  price: string;
  changePct: string;
  direction: 'up' | 'down';
}

const TICKER_ITEMS: TickerItem[] = [
  { symbol: 'BTCUSDT', price: '64,213.50', changePct: '0.8%', direction: 'up' },
  { symbol: 'ETHUSDT', price: '3,412.20', changePct: '0.3%', direction: 'down' },
  { symbol: 'SOLUSDT', price: '148.05', changePct: '2.1%', direction: 'up' },
  { symbol: 'BNBUSDT', price: '592.40', changePct: '0.4%', direction: 'up' },
  { symbol: 'XRPUSDT', price: '0.5182', changePct: '1.1%', direction: 'down' },
];

interface TickerStripProps {
  show?: boolean;
  centered?: boolean;
}

export function TickerStrip({ show = false, centered = false }: TickerStripProps) {
  if (!show) return null;

  return (
    <div
      className={`flex gap-[22px] overflow-hidden whitespace-nowrap border-t border-border-subtle px-6 py-4 font-mono text-[11px] ${
        centered ? 'justify-center' : ''
      }`}
    >
      {TICKER_ITEMS.map((item) => (
        <span key={item.symbol} className="text-text-dim">
          {item.symbol} {item.price}{' '}
          <span className={item.direction === 'up' ? 'text-bid' : 'text-danger'}>
            {item.direction === 'up' ? '▲' : '▼'}
            {item.changePct}
          </span>
        </span>
      ))}
    </div>
  );
}
