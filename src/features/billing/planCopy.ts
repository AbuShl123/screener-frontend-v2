/**
 * Render-time resolver for a `PlanView`'s translatable copy (§6.2 labelKey pattern).
 *
 * `catalog.ts` is kept free of the i18next instance: it stores plan copy as stable
 * `billing:` keys + `{ key, values }` descriptors. This helper takes a `t` bound to the
 * `billing` namespace and turns a `PlanView` into the display strings a card renders —
 * the single place that resolution happens, shared by every consumer (Choose Plan,
 * Payment Method, Checkout stub, and landing's pricing card).
 *
 * The `price` and any numeric interpolation values stay fixed-format (§10.1) — this only
 * resolves the surrounding words, never reformats a number.
 */

import type { TFunction } from 'i18next';
import type { PlanView } from './catalog';

export interface PlanDisplay {
  name: string;
  badge?: string;
  desc: string;
  unit: string;
  perDay: string;
}

export function resolvePlanDisplay(t: TFunction<'billing'>, plan: PlanView): PlanDisplay {
  return {
    name: t(plan.nameKey),
    badge: plan.badgeKey ? t(plan.badgeKey) : undefined,
    desc: t(plan.descKey),
    unit: t(plan.unit.key, plan.unit.values),
    perDay: t(plan.perDay.key, plan.perDay.values),
  };
}
