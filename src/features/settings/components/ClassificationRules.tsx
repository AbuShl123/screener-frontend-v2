import { useMemo, useState } from 'react';
import { fmtSymbol, marketBadge } from '@/features/orderbook/format';
import { bookKey } from '@/features/orderbook/types';
import { useCustomRules, useDefaultRule, useTickers } from '../queries';
import type { CustomRule, RuleTarget } from '../schemas';
import { buildTickerPool } from '../tickerPool';
import { RuleEditor } from './RuleEditor';
import { CustomRulesList } from './CustomRulesList';
import { UpgradeNote, isSubscriptionError } from './UpgradeNote';

/**
 * The Settings → Classification rules pane (design template "Dashboard Page — Final",
 * `tabRules` branch). Search the live ticker universe → open a `(symbol, market)` book in
 * the inline `RuleEditor` → Save (`PUT`) / Revert (`DELETE`); the "Your custom rules" list
 * shows every override. Unlike Notifications (localStorage), these are backend-persisted
 * conventional CRUD via TanStack Query (plan §2).
 *
 * `open` threads the lazy-fetch gate down so the three queries only fire while the modal is
 * open on this tab. Editor prefill comes from the ungated default table (`useDefaultRule`)
 * or the user's own override (`useCustomRules`); the gated custom-rules list degrades to an
 * inline Upgrade note for an EXPIRED user rather than crashing (plan §7).
 */

type Source = 'CUSTOM' | 'HIGH_LIQ' | 'DEFAULT';

export function ClassificationRules({ open }: { open: boolean }) {
  const defaultQuery = useDefaultRule(open);
  const customQuery = useCustomRules(open);
  const tickersQuery = useTickers(open);

  const [query, setQuery] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const [selected, setSelected] = useState<RuleTarget | null>(null);

  const pool = useMemo(() => buildTickerPool(tickersQuery.data?.tickers), [tickersQuery.data]);

  const customRules = customQuery.data ?? [];
  const customMap = useMemo(() => {
    const m = new Map<string, CustomRule>();
    for (const r of customRules) m.set(bookKey(r.symbol, r.market), r);
    return m;
  }, [customRules]);

  // The gated list 403s for a lapsed user — degrade to an inline Upgrade note (plan §7).
  const listGated = customQuery.isError && isSubscriptionError(customQuery.error);

  const trimmed = query.trim().toUpperCase();
  const results = trimmed ? pool.filter((e) => e.symbol.includes(trimmed)).slice(0, 8) : [];

  const select = (target: RuleTarget) => {
    setSelected(target);
    setQuery(''); // close the dropdown, matching the template
  };

  // Resolve the editor prefill for the selected book: the user's override if any, else the
  // default table (high-liq vs normal). `null` while the needed query is still loading.
  const selectedKey = selected ? bookKey(selected.symbol, selected.market) : null;
  const editorProps = useMemo(() => {
    if (!selected || !selectedKey) return null;
    const custom = customMap.get(selectedKey);
    if (custom) return { source: 'CUSTOM' as Source, initialTiers: custom.tiers, isCustom: true };
    const def = defaultQuery.data;
    if (!def) return null; // defaults not loaded yet
    const highLiq = def.highLiquiditySymbols.includes(selected.symbol);
    return {
      source: (highLiq ? 'HIGH_LIQ' : 'DEFAULT') as Source,
      initialTiers: highLiq ? def.highLiquidityTiers : def.normalTiers,
      isCustom: false,
    };
  }, [selected, selectedKey, customMap, defaultQuery.data]);

  return (
    <div className="flex flex-col gap-[24px]">
      {/* Intro + search */}
      <section className="flex flex-col gap-[15px]">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <span className="flex items-center gap-[7px]">
              <h3 className="mb-[5px] text-[14px] font-semibold text-text">Per-ticker thresholds</h3>
              <button
                type="button"
                onClick={() => setInfoOpen((v) => !v)}
                title="What does this mean?"
                className="mb-[5px] inline-flex h-[18px] w-[18px] flex-none items-center justify-center
                           rounded-full border border-text-strong font-mono text-[12px] font-bold leading-none
                           text-text-strong transition-colors hover:bg-white/[0.06]"
              >
                ?
              </button>
            </span>
            {infoOpen && (
              <p className="max-w-[62ch] text-[13px] leading-[1.55] text-text-secondary">
                Each tier pairs a minimum notional with a maximum distance from mid-price. A custom
                rule replaces the default entirely for one ticker + market — all four tiers, every
                time.
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-md border border-accent/45 bg-accent/[0.12] px-2 py-[3px]
                           font-mono text-[10px] tracking-[0.1em] whitespace-nowrap text-accent">
            {customRules.length} CUSTOM
          </span>
        </div>

        {/* Search */}
        <div className="relative flex items-center">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3 text-text-dim"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tickers to edit rules…"
            className="box-border w-full rounded-lg border border-border-input bg-input py-[11px]
                       pr-3 pl-9 font-mono text-[12px] tracking-[0.02em] text-text outline-none
                       focus:border-accent"
          />
        </div>

        {/* Loading / error hints — the input stays usable; results appear when data lands. */}
        {tickersQuery.isLoading && (
          <p className="font-mono text-[11px] tracking-[0.03em] text-text-dim">Loading tickers…</p>
        )}
        {tickersQuery.isError && (
          <p className="font-mono text-[11px] tracking-[0.03em] text-danger">Couldn't load tickers</p>
        )}

        {/* Search results */}
        {trimmed && (
          <div className="overflow-hidden rounded-[10px] border border-border-subtle bg-input">
            {results.length > 0 ? (
              results.map((e) => {
                const badge = marketBadge(e.market);
                const isCustom = customMap.has(e.key);
                return (
                  <button
                    key={e.key}
                    type="button"
                    onClick={() => select({ symbol: e.symbol, market: e.market })}
                    className="flex w-full items-center justify-between gap-2.5 border-b border-border-subtle
                               px-[13px] py-2.5 text-left transition-colors last:border-b-0 hover:bg-white/[0.03]"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="font-mono text-[13px] tracking-[0.02em] text-text-strong">
                        {fmtSymbol(e.symbol)}
                      </span>
                      <span
                        className={`rounded border px-[5px] py-px font-mono text-[9px] tracking-[0.08em] ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      {isCustom && (
                        <span className="rounded border border-accent/45 bg-accent/[0.12] px-[5px] py-px
                                         font-mono text-[9px] tracking-[0.08em] text-accent">
                          CUSTOM
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[12px] text-accent">Edit rules ›</span>
                  </button>
                );
              })
            ) : (
              <div className="px-[13px] py-5 text-center font-mono text-[12px] tracking-[0.03em] text-text-dim">
                No tickers match “{query.trim()}”
              </div>
            )}
          </div>
        )}
      </section>

      {/* Inline rule editor */}
      {selected &&
        (editorProps ? (
          <RuleEditor
            key={selectedKey}
            target={selected}
            source={editorProps.source}
            initialTiers={editorProps.initialTiers}
            isCustom={editorProps.isCustom}
            onClose={() => setSelected(null)}
          />
        ) : (
          <p className="font-mono text-[11px] tracking-[0.03em] text-text-dim">Loading defaults…</p>
        ))}

      <div className="h-px shrink-0 bg-border-subtle" />

      {/* Your custom rules */}
      <section className="flex flex-col gap-[15px]">
        <div>
          <h3 className="mb-[5px] text-[14px] font-semibold text-text">Your custom rules</h3>
          <p className="max-w-[62ch] text-[13px] leading-[1.55] text-text-secondary">
            Tickers overriding the defaults. Every other ticker follows the default rule.
          </p>
        </div>
        {listGated ? (
          <UpgradeNote />
        ) : (
          <CustomRulesList rules={customRules} onSelect={select} />
        )}
      </section>
    </div>
  );
}
