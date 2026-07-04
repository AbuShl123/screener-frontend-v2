import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline';
  fullWidth?: boolean;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  outline:
    'bg-transparent text-accent border border-accent hover:bg-accent/10',
};

export function Button({
  variant = 'primary',
  fullWidth = true,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded-[8px] px-[14px] py-[14px] text-[15px] font-medium font-sans transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${fullWidth ? 'w-full' : ''} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
