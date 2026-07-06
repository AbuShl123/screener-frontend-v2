import type { Plan, PlansResponse } from './schemas';

/**
 * Plan presentation catalog (plan §7). Bridges the API's bare
 * `code / displayName / type / durationDays / amount` with the hardcoded card copy
 * (badge, description, display name) keyed by `code`, and derives the fully-formatted
 * view models the cards render so `PlanCard` can stay purely presentational.
 *
 * Placed in `billing` (not `landing`) so a future "choose plan" page reuses it.
 *
 * Renders fallback-first (§2.4): each entry carries built-in fallback price/type/
 * duration so the pricing section is correct and layout-stable immediately — no
 * spinner, no skeleton — and live API values override the fallbacks once resolved.
 */

const CURRENCY_FALLBACK = 'UZS';

export interface PlanCopy {
  order: number; // fixed display order
  name: string; // card title (may differ from API displayName, per template)
  badge?: string; // 'FLEXIBLE' | 'SAVE 17%' | undefined
  badgeStyle?: 'accent' | 'muted';
  desc: string;
  fallbackAmount: number; // used until/unless the API responds (§2.4)
  fallbackType: Plan['type']; // shape the fallback render (unit + per-day) before the API answers
  fallbackDurationDays: number | null;
}

// Design deliberately depends on this known set of codes (locked §2.5).
const PLAN_COPY: Record<string, PlanCopy> = {
  pay_as_you_go: {
    order: 0,
    name: 'Pay by days',
    badge: 'FLEXIBLE',
    badgeStyle: 'accent',
    desc: 'Pay only for the days you trade. Top up any number of days — access ends when they run out. No auto-renewal.',
    fallbackAmount: 10000,
    fallbackType: 'PER_DAY',
    fallbackDurationDays: null,
  },
  weekly: {
    order: 1,
    name: 'Weekly',
    desc: 'Seven days of full access. Good for trying a strategy or trading an event week.',
    fallbackAmount: 50000,
    fallbackType: 'FIXED',
    fallbackDurationDays: 7,
  },
  monthly: {
    order: 2,
    name: 'Monthly',
    desc: 'The standard plan. One payment, thirty days of everything.',
    fallbackAmount: 150000,
    fallbackType: 'FIXED',
    fallbackDurationDays: 30,
  },
  yearly: {
    order: 3,
    name: 'Yearly',
    badge: 'SAVE 17%',
    badgeStyle: 'muted',
    desc: 'A full year at the lowest per-day rate. Set it once, forget billing.',
    fallbackAmount: 1500000,
    fallbackType: 'FIXED',
    fallbackDurationDays: 365,
  },
};

/** Everything a `PlanCard` needs, all derived here (§7). */
export interface PlanView {
  code: string;
  name: string;
  highlight: boolean;
  badge?: string;
  badgeStyle?: 'accent' | 'muted';
  price: string; // e.g. "150,000" — grouping only
  unit: string; // FIXED → `${currency} / ${durationDays} days`; PER_DAY → `${currency} / day`
  desc: string;
  perDay: string; // PER_DAY → 'from 1 day, any amount'; FIXED → `≈ N ${currency} / day`
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

      let unit: string;
      let perDay: string;
      if (type === 'PER_DAY' || durationDays == null) {
        unit = `${currency} / day`;
        perDay = 'from 1 day, any amount';
      } else {
        unit = `${currency} / ${durationDays} days`;
        const per = amount / durationDays;
        const rounded = Math.round(per);
        // '=' when it divides evenly, '≈' otherwise (matching the template).
        const sign = per === rounded ? '=' : '≈';
        perDay = `${sign} ${groupFmt.format(rounded)} ${currency} / day`;
      }

      return [
        {
          code,
          name: copy.name,
          highlight: code === 'pay_as_you_go',
          badge: copy.badge,
          badgeStyle: copy.badgeStyle,
          price: groupFmt.format(amount),
          unit,
          desc: copy.desc,
          perDay,
        } satisfies PlanView,
      ];
    });
}
