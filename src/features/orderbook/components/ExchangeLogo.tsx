import { useState } from 'react';
import { exchangeLogoSrc, exchangeMeta, type Exchange } from '@/features/orderbook/exchanges';

interface ExchangeLogoProps {
  id: Exchange;
  /** Size (+ flex) classes only, e.g. `size-4` or `size-3.5 flex-none` — same box as before. */
  className: string;
  /** Pass `''` for a decorative logo next to a visible label (default: the exchange label). */
  alt?: string;
  title?: string;
}

/**
 * An exchange's logo: the bundled asset (Binance, MEXC, Bybit), else the server's `logoUrl`,
 * else — for an exchange the frontend has no image for — the first letter of its label in a
 * box of the same size. A server logo that fails to load falls back to the letter.
 *
 * No subscriptions: parents that render labels/logos re-render on registry changes.
 */
export function ExchangeLogo({ id, className, alt, title }: ExchangeLogoProps) {
  const src = exchangeLogoSrc(id);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const label = exchangeMeta(id).label;

  if (src && src !== failedSrc) {
    return (
      <img
        src={src}
        alt={alt ?? label}
        title={title}
        width={16}
        height={16}
        decoding="async"
        className={`block object-contain ${className}`}
        onError={() => setFailedSrc(src)}
      />
    );
  }

  return (
    <span
      role={alt === '' ? undefined : 'img'}
      aria-label={alt === '' ? undefined : (alt ?? label)}
      aria-hidden={alt === '' ? true : undefined}
      title={title}
      className={`flex items-center justify-center rounded-[3px] bg-border font-mono text-[9px]
                  leading-none text-text-secondary ${className}`}
    >
      {label.charAt(0)}
    </span>
  );
}
