/**
 * The two alert-stream glyphs from the design template, shared by the collapsed handles and
 * the panel tabs: a mini depth ladder (asks / dashed spread / bids) for order book alerts, a
 * lightning bolt (an executed hit) for large trades. Decorative — callers label the control.
 */

export function DepthIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className="flex-none"
    >
      <path d="M11 4h9" />
      <path d="M6 8h14" />
      <path d="M4 12h16" strokeDasharray="0.5 3.5" opacity="0.7" />
      <path d="M8 16h12" />
      <path d="M13 20h7" />
    </svg>
  );
}

export function TradeIcon({ size, strokeWidth = 2 }: { size: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none"
    >
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}
