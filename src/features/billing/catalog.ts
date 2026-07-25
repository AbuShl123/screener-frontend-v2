import type { ParseKeys } from 'i18next';
import type { Plan, PlansResponse } from './schemas';

/**
 * Plan presentation catalog (plan §7). Bridges the API's bare
 * `code / displayName / type / durationDays / amount` with the hardcoded card copy
 * (badge, description, display name) keyed by `code`, and derives the view models the
 * cards render so `PlanCard` can stay purely presentational.
 *
 * Placed in `billing` (not `landing`) so a future "choose plan" page reuses it.
 *
 * i18n (§6.2, labelKey pattern): this module is kept FREE of the i18next instance and
 * stays a pure constant/derivation. The copy is stored as stable `billing:` KEYS
 * (`nameKey`/`badgeKey`/`descKey`) and the unit/per-day lines as `{ key, values }`
 * descriptors; a component resolves them via `resolvePlanDisplay(t, …)` at render.
 *
 * Renders fallback-first (§2.4): each entry carries built-in fallback price/type/
 * duration so the pricing section is correct and layout-stable immediately — no
 * spinner, no skeleton — and live API values override the fallbacks once resolved.
 */

type BillingKey = ParseKeys<'billing'>;

const CURRENCY_FALLBACK = 'UZS';

export interface PlanCopy {
  order: number; // fixed display order
  nameKey: BillingKey; // card title key (may differ from API displayName, per template)
  badgeKey?: BillingKey; // 'FLEXIBLE' | 'SAVE 17%' key | undefined
  badgeStyle?: 'accent' | 'muted';
  descKey: BillingKey;
  fallbackAmount: number; // used until/unless the API responds (§2.4)
  fallbackType: Plan['type']; // shape the fallback render (unit + per-day) before the API answers
  fallbackDurationDays: number | null;
}

// Design deliberately depends on this known set of codes (locked §2.5).
const PLAN_COPY: Record<string, PlanCopy> = {
  pay_as_you_go: {
    order: 0,
    nameKey: 'plans.pay_as_you_go.name',
    badgeKey: 'plans.pay_as_you_go.badge',
    badgeStyle: 'accent',
    descKey: 'plans.pay_as_you_go.desc',
    fallbackAmount: 10000,
    fallbackType: 'PER_DAY',
    fallbackDurationDays: null,
  },
  weekly: {
    order: 1,
    nameKey: 'plans.weekly.name',
    descKey: 'plans.weekly.desc',
    fallbackAmount: 50000,
    fallbackType: 'FIXED',
    fallbackDurationDays: 7,
  },
  monthly: {
    order: 2,
    nameKey: 'plans.monthly.name',
    descKey: 'plans.monthly.desc',
    fallbackAmount: 150000,
    fallbackType: 'FIXED',
    fallbackDurationDays: 30,
  },
  yearly: {
    order: 3,
    nameKey: 'plans.yearly.name',
    badgeKey: 'plans.yearly.badge',
    badgeStyle: 'muted',
    descKey: 'plans.yearly.desc',
    fallbackAmount: 1500000,
    fallbackType: 'FIXED',
    fallbackDurationDays: 365,
  },
};

/**
 * Plan code → display-name KEY, derived from the copy catalog so the four known plans'
 * labels live in one place. Reused by the billing-history page to render a readable
 * plan name (resolved with `t()`) instead of the raw `planCode`.
 */
export const PLAN_NAME_KEYS: Record<string, BillingKey> = Object.fromEntries(
  Object.entries(PLAN_COPY).map(([code, copy]) => [code, copy.nameKey] as const),
);

/** A translation KEY plus its interpolation values, resolved with `t()` at render (§6.2). */
export interface PlanText {
  key: BillingKey;
  values?: Record<string, string | number>;
}

/** Everything a `PlanCard` needs, all derived here (§7). Text is KEYS, not prose (§6.2). */
export interface PlanView {
  code: string;
  nameKey: BillingKey;
  highlight: boolean;
  badgeKey?: BillingKey;
  badgeStyle?: 'accent' | 'muted';
  amount: number; // raw amount (unformatted), e.g. for pre-filling an input
  durationDays: number | null; // null for PER_DAY; the fixed span for a FIXED plan
  price: string; // e.g. "150,000" — grouping only (a fixed number, never localized §10.1)
  unit: PlanText; // FIXED → `${currency} / ${days} days`; PER_DAY → `${currency} / day`
  descKey: BillingKey;
  perDay: PlanText; // PER_DAY → 'from 1 day, any amount'; FIXED → `≈ N ${currency} / day`
}

const groupFmt = new Intl.NumberFormat('en-US'); // grouping only, no currency symbol

/**
 * Merge the copy map with a (possibly absent) API response into ordered `PlanView`s.
 *
 * - Ordered by `PlanCopy.order` (pay-as-you-go → weekly → monthly → yearly).
 * - Amount/type/duration come from the API when present, else the fallbacks (§2.4).
 * - Highlight = pay-as-you-go (§2.5).
 * - A known code absent from a *successful* response is dropped (don't advertise a
 *   plan the backend no longer sells). Unknown API codes are ignored (no copy).
 * - With no data yet (loading/error) all four render from fallbacks.
 */
export function buildPlanViews(data?: PlansResponse): PlanView[] {
  const currency = data?.currency ?? CURRENCY_FALLBACK;
  const byCode = new Map<string, Plan>(data?.plans.map((p) => [p.code, p]));

  return Object.entries(PLAN_COPY)
    .sort(([, a], [, b]) => a.order - b.order)
    .flatMap(([code, copy]) => {
      const apiPlan = byCode.get(code);
      // Known code missing from a successful response → drop it.
      if (data && !apiPlan) return [];

      const type = apiPlan?.type ?? copy.fallbackType;
      const durationDays = apiPlan ? apiPlan.durationDays : copy.fallbackDurationDays;
      const amount = apiPlan?.amount ?? copy.fallbackAmount;

      let unit: PlanText;
      let perDay: PlanText;
      if (type === 'PER_DAY' || durationDays == null) {
        unit = { key: 'plans.unit.perDay', values: { currency } };
        perDay = { key: 'plans.rate.payg' };
      } else {
        unit = { key: 'plans.unit.fixed', values: { currency, days: durationDays } };
        const per = amount / durationDays;
        const rounded = Math.round(per);
        // '=' when it divides evenly, '≈' otherwise (matching the template).
        const sign = per === rounded ? '=' : '≈';
        // `amount` here is the pre-formatted, fixed-format number string (§10.1) passed
        // straight through as an interpolation value — it is never re-localized.
        perDay = { key: 'plans.rate.fixed', values: { sign, amount: groupFmt.format(rounded), currency } };
      }

      return [
        {
          code,
          nameKey: copy.nameKey,
          highlight: code === 'pay_as_you_go',
          badgeKey: copy.badgeKey,
          badgeStyle: copy.badgeStyle,
          amount,
          durationDays,
          price: groupFmt.format(amount),
          unit,
          descKey: copy.descKey,
          perDay,
        } satisfies PlanView,
      ];
    });
}
