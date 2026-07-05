import type { ReactNode } from 'react';

/**
 * The 60×60 accent circle badge used on the centered auth screens (check-inbox's
 * `@`, verify-success's `✓`). Extracted from check-inbox's original inline copy the
 * moment a second caller appeared — glyph and glyph size are passed by the caller
 * (`className="text-[23px]"` for `@`, `text-[25px]"` for `✓`).
 */
export function AuthBadge({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex h-[60px] w-[60px] items-center justify-center rounded-full font-mono text-accent ${className}`}
      style={{
        border: '1px solid color-mix(in oklab, var(--color-accent) 45%, transparent)',
        background: 'color-mix(in oklab, var(--color-accent) 10%, transparent)',
      }}
    >
      {children}
    </div>
  );
}
