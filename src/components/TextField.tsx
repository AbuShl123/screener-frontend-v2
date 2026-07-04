import type { InputHTMLAttributes, Ref } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /**
   * Border-only danger tint, with no inline message — for the 3d treatment where
   * the copy lives in a top banner instead (email on 409, password on short-password).
   * Distinct from `error`, which tints the border AND renders its inline `<p>`.
   */
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  error,
  invalid,
  id,
  className = '',
  ref,
  ...props
}: TextFieldProps) {
  const inputId = id ?? props.name;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary"
      >
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={`rounded-[8px] border bg-input px-[14px] py-[13px] text-[15px] text-text-strong placeholder:text-text-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          error || invalid ? 'border-danger' : 'border-border-input'
        } ${className}`}
        {...props}
      />
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
