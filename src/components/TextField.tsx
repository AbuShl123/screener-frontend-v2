import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /**
   * Border-only danger tint, with no inline message — for the 3d treatment where
   * the copy lives in a top banner instead (email on 409, password on short-password).
   * Distinct from `error`, which tints the border AND renders its inline `<p>`.
   */
  invalid?: boolean;
  /** Rendered inside the input's right edge (e.g. the password show/hide toggle). */
  endAdornment?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  error,
  invalid,
  id,
  className = '',
  endAdornment,
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
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          className={`w-full rounded-[8px] border bg-input py-[13px] pl-[14px] text-[15px] text-text-strong placeholder:text-text-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            endAdornment ? 'pr-11' : 'pr-[14px]'
          } ${error || invalid ? 'border-danger' : 'border-border-input'} ${className}`}
          {...props}
        />
        {endAdornment ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">{endAdornment}</div>
        ) : null}
      </div>
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
