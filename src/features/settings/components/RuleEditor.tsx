import { useState } from 'react';
import { fmtSymbol, marketBadge } from '@/features/orderbook/format';
import { TIER_COLORS } from '@/features/orderbook/tiers';
import { ApiError } from '@/lib/api';
import { useDeleteRule, useSaveRule } from '../queries';
import type { RuleTarget, TierThreshold } from '../schemas';
import { toEditorRows, validateTiers, type EditorRow } from '../rulesValidation';
import { UpgradeNote, isSubscriptionError } from './UpgradeNote';

/**
 * Inline 4-tier threshold editor (design template "Dashboard Page — Final", Settings →
 * Classification rules). Ported 1:1 from the template's editor markup — a header
 * (symbol + market badge + source badge + close ×), a TIER | MIN NOTIONAL | MAX DISTANCE
 * grid of four rows ordered T4→T1, and a Save / Revert footer.
 *
 * Conventional local React state (`rows`) seeded once from `initialTiers` — the parent
 * remounts this via `key={bookKey(target)}` so switching tickers gets a fresh buffer.
 * Save runs `validateTiers` (the backend-mirroring client check) before the `PUT`, so
 * bad input never reaches the network. The two distinct `403`s are handled per plan §7:
 * the subscription gate shows an inline Upgrade CTA; a validation `400` shows its
 * (user-safe) backend message verbatim.
 */

type Source = 'CUSTOM' | 'HIGH_LIQ' | 'DEFAULT';

const SOURCE_LABEL: Record<Source, string> = {
  CUSTOM: 'CUSTOM RULE',
  HIGH_LIQ: 'HIGH-LIQ DEFAULT',
  DEFAULT: 'DEFAULT',
};

interface RuleEditorProps {
  target: RuleTarget;
  source: Source;
  initialTiers: TierThreshold[];
  isCustom: boolean;
  onClose: () => void;
}

export function RuleEditor({ target, source, initialTiers, isCustom, onClose }: RuleEditorProps) {
  const [rows, setRows] = useState<EditorRow[]>(() => toEditorRows(initialTiers));
  const [validationError, setValidationError] = useState<string | null>(null);

  const saveRule = useSaveRule();
  const deleteRule = useDeleteRule();
  const pending = saveRule.isPending || deleteRule.isPending;

  const badge = marketBadge(target.market);

  const setRow = (i: number, patch: Partial<EditorRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const onSave = () => {
    const result = validateTiers(rows);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }
    setValidationError(null);
    saveRule.mutate({ target, tiers: result.tiers });
  };

  const onRevert = () => {
    setValidationError(null);
    // On success the override is gone — collapse the editor (the book now follows the default).
    deleteRule.mutate(target, { onSuccess: onClose });
  };

  // Error precedence: a client-side validation message wins; otherwise surface the mutation error.
  const mutationError = saveRule.error ?? deleteRule.error;
  const showUpgrade = isSubscriptionError(mutationError);
  const errorText = validationError
    ? validationError
    : mutationError && !showUpgrade
      ? mutationError instanceof ApiError && mutationError.status === 400
        ? mutationError.message // user-safe backend validation envelope
        : "Couldn't save — try again"
      : null;

  return (
    <section className="overflow-hidden rounded-[10px] border border-border bg-input">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-[13px]">
        <span className="font-mono text-[14px] tracking-[0.02em] text-text-strong">
          {fmtSymbol(target.symbol)}
        </span>
        <span
          className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badge.className}`}
        >
          {badge.label}
        </span>
        <span
          className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${
            isCustom
              ? 'border-accent/45 bg-accent/[0.12] text-accent'
              : 'border-border-input text-text-muted'
          }`}
        >
          {SOURCE_LABEL[source]}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          title="Close editor"
          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-lg border
                     border-border-input text-[14px] leading-none text-text-secondary transition-colors
                     hover:bg-white/5 hover:text-text-strong"
        >
          ×
        </button>
      </div>

      {/* Threshold grid */}
      <div className="flex flex-col gap-2 px-4 pt-3.5 pb-2">
        <div className="grid grid-cols-[58px_1fr_1fr] gap-2.5 px-0.5 pb-0.5 font-mono text-[9px] tracking-[0.1em] text-text-muted">
          <span>TIER</span>
          <span>MIN NOTIONAL (USD)</span>
          <span>MAX DISTANCE FROM MID</span>
        </div>
        {rows.map((row, i) => (
          <div key={row.tier} className="grid grid-cols-[58px_1fr_1fr] items-center gap-2.5">
            <span className="flex items-center gap-2">
              <span
                className="h-[9px] w-[9px] flex-none rounded-full"
                style={{ background: TIER_COLORS[row.tier] ?? 'var(--color-text-dim)' }}
              />
              <span className="font-mono text-[13px] tracking-[0.04em] text-text-strong">
                T{row.tier}
              </span>
            </span>
            <span className="relative flex items-center">
              <span className="pointer-events-none absolute left-3 font-mono text-[12px] text-text-dim">
                $
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={row.minNotional}
                onChange={(e) => setRow(i, { minNotional: e.target.value })}
                className="box-border w-full rounded-lg border border-border-input bg-bg py-[9px]
                           pr-3 pl-[26px] font-mono text-[12px] tracking-[0.02em] text-text-strong
                           outline-none focus:border-accent"
              />
            </span>
            <span className="relative flex items-center">
              <input
                type="text"
                inputMode="decimal"
                value={row.maxDistancePct}
                onChange={(e) => setRow(i, { maxDistancePct: e.target.value })}
                className="box-border w-full rounded-lg border border-border-input bg-bg py-[9px]
                           pr-[30px] pl-3 font-mono text-[12px] tracking-[0.02em] text-text-strong
                           outline-none focus:border-accent"
              />
              <span className="pointer-events-none absolute right-3 font-mono text-[12px] text-text-dim">
                %
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* Error / subscription gate */}
      {showUpgrade ? (
        <div className="px-4 pb-2">
          <UpgradeNote />
        </div>
      ) : errorText ? (
        <p className="px-4 pb-2 font-mono text-[11px] tracking-[0.03em] text-danger">{errorText}</p>
      ) : null}

      {/* Footer */}
      <div className="flex items-center justify-end gap-2.5 px-4 pt-3 pb-3.5">
        {isCustom && (
          <button
            type="button"
            onClick={onRevert}
            disabled={pending}
            className="rounded-lg border border-danger/45 px-4 py-2 text-[13px] text-danger transition-colors
                       hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleteRule.isPending ? 'Reverting…' : 'Revert to default'}
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-lg bg-accent px-[18px] py-2 text-[13px] font-medium text-bg transition-[filter]
                     hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveRule.isPending ? 'Saving…' : 'Save custom rule'}
        </button>
      </div>
    </section>
  );
}
