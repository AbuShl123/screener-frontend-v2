import { Link } from 'react-router-dom';
import { ApiError } from '@/lib/api';

/**
 * The "Active subscription required" gate handling shared by the rule editor (on Save/Revert)
 * and the custom-rules list (when `GET /api/rules` 403s). Per plan §7, the gated endpoints
 * throw a JSON-body `403` for a valid-JWT-but-lapsed user; the empty-body auth `403` is
 * consumed upstream by `withAuth`, so a `403` reaching here with a non-empty message is
 * always the subscription gate.
 */
export function isSubscriptionError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && !!err.message;
}

/** Inline upgrade CTA — stands in for the custom list / sits under the editor on a subscription 403. */
export function UpgradeNote({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-[10px] border
                  border-border-subtle bg-input px-[13px] py-3 ${className}`}
    >
      <span className="font-mono text-[12px] tracking-[0.03em] text-text-secondary">
        Active subscription required
      </span>
      <Link
        to="/billing/plans"
        className="shrink-0 rounded-lg border border-accent/45 px-3.5 py-1.5 text-[12px] text-accent
                   transition-colors hover:bg-accent/10"
      >
        Upgrade →
      </Link>
    </div>
  );
}
