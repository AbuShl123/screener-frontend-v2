import { TIER_COLORS } from '@/features/orderbook/tiers';
import { useNotificationSettingsStore } from '../notificationSettingsStore';

/**
 * The 4-segment T1–T4 minimum-tier control (design template "Dashboard Page — Final",
 * Settings → Notifications). Only order-book levels at/above the picked tier are
 * surfaced as notifications. Tier 0 is not offered as a choice — it never notifies by
 * construction (see `selectNotifications`), so it would be a dead option.
 *
 * The per-tier dot reuses `TIER_COLORS` from the order-book surface — the same shared
 * tier scale the cards and notification stripes use (exactly the cross-surface reuse
 * `tiers.ts` anticipated). Index 0 (no color) is skipped.
 */
export function MinimumTierControl() {
  const minTier = useNotificationSettingsStore((s) => s.minTier);
  const setMinTier = useNotificationSettingsStore((s) => s.setMinTier);

  const caption =
    minTier === 1
      ? 'All tiers notify — nothing filtered by rank'
      : `Notifying tier ${minTier}–4 · tier 1–${minTier - 1} filtered out`;

  return (
    <section className="flex flex-col gap-[15px]">
      <div>
        <h3 className="mb-[5px] text-[14px] font-semibold text-text">Minimum tier</h3>
        <p className="max-w-[54ch] text-[13px] leading-[1.55] text-text-secondary">
          Every order book level is classified 0–4 by significance. Notify only levels at or above
          the tier you pick — anything lower is filtered out.
        </p>
      </div>

      <div className="flex gap-2">
        {TIER_COLORS.map((hex, i) => {
          if (i === 0) return null; // tier 0 never notifies — not offered as a choice
          const color = hex ?? 'var(--color-text-dim)';
          const active = i >= minTier;
          const isPivot = i === minTier;
          const border = isPivot
            ? '1px solid var(--color-accent)'
            : active
              ? `1px solid color-mix(in oklab, ${color} 45%, transparent)`
              : '1px solid var(--color-border-input)';
          return (
            <button
              key={i}
              type="button"
              onClick={() => setMinTier(i)}
              className="flex flex-1 flex-col items-center gap-2 rounded-[10px] px-[6px] py-[13px]
                         [transition:background-color_150ms_ease,border-color_150ms_ease]"
              style={{
                border,
                background: active ? `color-mix(in oklab, ${color} 14%, transparent)` : 'transparent',
              }}
            >
              <span
                className="h-[11px] w-[11px] rounded-full"
                style={{ background: color, opacity: active ? 1 : 0.3 }}
              />
              <span
                className={`font-mono text-[13px] tracking-[0.04em] ${
                  active ? 'text-text-strong' : 'text-text-dim'
                }`}
              >
                T{i}
              </span>
            </button>
          );
        })}
      </div>

      <p className="font-mono text-[11px] tracking-[0.04em] text-text-dim">{caption}</p>
    </section>
  );
}
