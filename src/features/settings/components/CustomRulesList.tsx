import { fmtMoney, fmtSymbol, marketBadge } from '@/features/orderbook/format';
import { useDeleteRule } from '../queries';
import type { CustomRule, RuleTarget } from '../schemas';
import { formatPercent } from '../rulesValidation';

/**
 * The "Your custom rules" list (design template Settings → Classification rules): one row
 * per overridden book — symbol + market badge + a compact tier-1→tier-4 summary
 * (`$200K–$5.00M · 0.5–4%`) + Edit / Revert. Reads the `useCustomRules` data from the
 * parent (single subscription) and routes Edit through the same `onSelect` search uses.
 */

/** `$200K–$5.00M · 0.5–4%` — tier-1 (tightest) through tier-4 (widest) span. */
function ruleSummary(rule: CustomRule): string {
  const t1 = rule.tiers.find((t) => t.tier === 1);
  const t4 = rule.tiers.find((t) => t.tier === 4);
  if (!t1 || !t4) return '';
  return `${fmtMoney(t1.minNotional)}–${fmtMoney(t4.minNotional)} · ${formatPercent(
    t1.maxDistance,
  )}–${formatPercent(t4.maxDistance)}%`;
}

export function CustomRulesList({
  rules,
  onSelect,
}: {
  rules: CustomRule[];
  onSelect: (target: RuleTarget) => void;
}) {
  const deleteRule = useDeleteRule();

  if (rules.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-border-subtle px-[13px] py-4
                      text-center font-mono text-[12px] tracking-[0.03em] text-text-dim">
        No custom rules — all tickers follow the defaults
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-border-subtle bg-input">
      {rules.map((rule) => {
        const target: RuleTarget = { symbol: rule.symbol, market: rule.market };
        const badge = marketBadge(rule.market);
        const reverting =
          deleteRule.isPending && deleteRule.variables?.symbol === rule.symbol
          && deleteRule.variables?.market === rule.market;
        return (
          <div
            key={`${rule.symbol}:${rule.market}`}
            className="flex items-center gap-2.5 border-b border-border-subtle px-[13px] py-[11px] last:border-b-0"
          >
            <span className="font-mono text-[13px] tracking-[0.02em] text-text-strong">
              {fmtSymbol(rule.symbol)}
            </span>
            <span
              className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badge.className}`}
            >
              {badge.label}
            </span>
            <span className="font-mono text-[11px] tracking-[0.02em] text-text-muted">
              {ruleSummary(rule)}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => onSelect(target)}
              className="shrink-0 rounded-lg border border-accent/45 px-3.5 py-1.5 text-[12px] text-accent
                         transition-colors hover:bg-accent/10"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => deleteRule.mutate(target)}
              disabled={reverting}
              className="shrink-0 rounded-lg border border-danger/45 px-3.5 py-1.5 text-[12px] text-danger
                         transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reverting ? 'Reverting…' : 'Revert'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
