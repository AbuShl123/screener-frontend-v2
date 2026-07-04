import type { ReactNode } from 'react';
import { BrandMark } from '../BrandMark';
import { TickerStrip } from '../TickerStrip';

interface CenteredAuthLayoutProps {
  children: ReactNode;
  showTicker?: boolean;
}

export function CenteredAuthLayout({
  children,
  showTicker = false,
}: CenteredAuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-border-subtle px-10 py-[22px]">
        <BrandMark />
      </header>
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="w-[440px]">{children}</div>
      </div>
      <TickerStrip show={showTicker} centered />
    </div>
  );
}
