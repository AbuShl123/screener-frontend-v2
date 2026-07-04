import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-[14px] border border-border bg-surface shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${className}`}
      {...props}
    />
  );
}
