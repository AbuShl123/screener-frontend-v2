import type { TierThreshold } from './schemas';

/**
 * Form parse/format for the classification-rule editor, plus `validateTiers` — a
 * client-side mirror of the backend's per-tier checks (see
 * [`.claude/docs/classification-rule-api.md`](../../../.claude/docs/classification-rule-api.md)
 * "Per-Tier Checks") so the user gets instant feedback instead of a round-tripped `400`.
 *
 * The editor holds display strings (`"5,000,000"`, `"0.5"`); this module converts to/from
 * the wire model (`minNotional` USD number, `maxDistance` fraction). This is the "form-input"
 * Zod-adjacent concern kept separate from the server-response schemas in `schemas.ts` —
 * the same two-file split the auth module keeps (`schemas.ts` vs `validation.ts`).
 */

/** One row of the editor — a single tier's two threshold inputs, as display strings. */
export interface EditorRow {
  tier: number; // 1–4
  minNotional: string; // display, e.g. "5,000,000"
  maxDistancePct: string; // display percent, e.g. "0.5"
}

/** `5000000` → `"5,000,000"` (thousands separators for readability). */
export function formatNotional(n: number): string {
  return n.toLocaleString('en-US');
}

/** Fraction → trimmed percent string: `0.005` → `"0.5"`, `0.025` → `"2.5"` (template's `fmtPct`). */
export function formatPercent(fraction: number): string {
  return parseFloat((fraction * 100).toFixed(4)).toString();
}

/** Strip non-numeric characters (commas, `$`, spaces) then parse. `NaN` on empty/garbage. */
export function parseNotional(s: string): number {
  return Number(s.replace(/[^0-9.]/g, ''));
}

/** Strip non-numerics, parse a percent, and return the fraction (`"0.5"` → `0.005`). */
export function parsePercent(s: string): number {
  return Number(s.replace(/[^0-9.]/g, '')) / 100;
}

/**
 * Wire tiers → editor rows, sorted **T4 → T1** (the display order; the API may return any
 * order, so we always sort). Each threshold becomes a display string.
 */
export function toEditorRows(tiers: TierThreshold[]): EditorRow[] {
  return [...tiers]
    .sort((a, b) => b.tier - a.tier)
    .map((t) => ({
      tier: t.tier,
      minNotional: formatNotional(t.minNotional),
      maxDistancePct: formatPercent(t.maxDistance),
    }));
}

export type ValidateResult =
  | { ok: true; tiers: TierThreshold[] }
  | { ok: false; error: string };

/**
 * Parse the four editor rows into wire tiers, enforcing the backend's per-tier rules with
 * matching messages. Structural guarantees (exactly four distinct tiers 1–4, valid market,
 * tracked symbol, ≤200 targets) are ensured by the UI and need no runtime guard here.
 */
export function validateTiers(rows: EditorRow[]): ValidateResult {
  const tiers: TierThreshold[] = [];
  for (const row of rows) {
    const minNotional = parseNotional(row.minNotional);
    const maxDistance = parsePercent(row.maxDistancePct);

    if (!Number.isFinite(minNotional) || minNotional < 0) {
      return { ok: false, error: 'minNotional must be ≥ 0' };
    }
    if (!Number.isFinite(maxDistance) || maxDistance <= 0 || maxDistance > 0.1) {
      return { ok: false, error: 'maxDistance must be in (0, 0.1]' };
    }
    tiers.push({ tier: row.tier, minNotional, maxDistance });
  }
  return { ok: true, tiers };
}
