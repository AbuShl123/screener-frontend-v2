import type { HTMLAttributes } from 'react';

interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  variant: 'error' | 'warning' | 'success';
}

const variantConfig: Record<BannerProps['variant'], { color: string; text: string; bgPct: number; borderPct: number }> = {
  error: { color: 'var(--color-danger)', text: '#F0A2A2', bgPct: 10, borderPct: 38 },
  warning: { color: 'var(--color-warning)', text: '#F2D49B', bgPct: 8, borderPct: 35 },
  success: { color: 'var(--color-accent)', text: 'var(--color-accent)', bgPct: 10, borderPct: 38 },
};

export function Banner({ variant, className = '', style, ...props }: BannerProps) {
  const { color, text, bgPct, borderPct } = variantConfig[variant];

  return (
    <div
      className={`rounded-[8px] border px-[14px] py-[13px] text-[14px] ${className}`}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} ${bgPct}%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} ${borderPct}%, transparent)`,
        color: text,
        ...style,
      }}
      {...props}
    />
  );
}
