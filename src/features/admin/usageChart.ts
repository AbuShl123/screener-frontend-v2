import { resolveLocale } from '@/lib/i18n';
import { i18n } from '@/lib/i18n/index';
import type { UsageReport } from './schemas';

/**
 * Pure chart view-model builder for the Analytics usage chart, ported from the design template's
 * `buildChart`/chart-vals but driven by REAL API data instead of the template's `noise()` seed.
 *
 * The single most important correctness detail (api doc §"empty slices are omitted"): the API's
 * `slices[]` omits empty buckets, so the chart must synthesize the full contiguous bucket set
 * over the report's `[start, end)` window at the chosen slice and fill absent buckets with 0.
 *
 * Nothing here is on a hot path (this is a conventional screen), so locale-aware `Intl` is fine —
 * unlike the order-book surface, chart labels localize their prose while numbers stay fixed.
 */

export type RangePreset = 'today' | 'week' | 'month' | 'year' | 'custom';
export type SliceValue = 'P1Y' | 'P1M' | 'PT24H' | 'PT1H' | 'PT30M';

/**
 * The slice each non-custom preset locks to (the range implies its own granularity, so the slice
 * dropdown is only shown for `custom`): today → hourly, week/month → daily, year → monthly.
 */
export const PRESET_SLICE: Record<Exclude<RangePreset, 'custom'>, SliceValue> = {
  today: 'PT1H',
  week: 'PT24H',
  month: 'PT24H',
  year: 'P1M',
};

/** How many wall-clock minutes each FIXED slice spans (calendar P1M/P1Y are handled separately). */
const FIXED_SLICE_MIN: Partial<Record<SliceValue, number>> = {
  PT30M: 30,
  PT1H: 60,
  PT24H: 1440,
};

const DAY_MS = 86_400_000;
const MAX_BARS = 96; // > this ⇒ `tooFine`: refuse to fetch/render, ask for a coarser slice (plan §2b)
const BAR_MAX_PX = 174; // tallest bar, matching the template
const groupFmt = new Intl.NumberFormat('en-US'); // numbers stay fixed-format (i18n §10.1)

// ── Date helpers (all zone-aware; the app's usage zone is Asia/Tashkent, a fixed offset) ──

/** `YYYY-MM-DD` for a Date as seen in `zone` (en-CA renders ISO-ordered date parts). */
export function ymdInZone(date: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Shift a `YYYY-MM-DD` by whole days, staying in `YYYY-MM-DD` (noon anchor dodges any edge). */
function shiftYmd(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T12:00:00Z`) + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Map a range preset to the inclusive `start`/`end` calendar dates the API expects. `today` is a
 * single day; `week` = last 7 days; `month` = last 30 days; `year` = the last 12 whole calendar
 * months; `custom` echoes the two inputs. All computed in `zone` so they line up with the server's
 * zone-local slice boundaries.
 *
 * The `year` preset aligns to month boundaries (1st → last day) rather than a rolling 365-day
 * window, because its slice is `P1M`: a mid-month start would leave the backend's calendar-month
 * slices straddling two of our buckets (a July-1 slice landing in a "Jun 29 – Jul 29" bucket).
 */
export function rangeToDates(
  range: RangePreset,
  from: string,
  to: string,
  zone: string,
): { start: string; end: string } {
  if (range === 'custom') return { start: from, end: to };
  const today = ymdInZone(new Date(), zone);
  if (range === 'today') return { start: today, end: today };
  if (range === 'week') return { start: shiftYmd(today, -6), end: today };
  if (range === 'month') return { start: shiftYmd(today, -29), end: today };
  // year: the last 12 whole calendar months — start = 1st of the month 11 months back,
  // end = last day of the current month (Date.UTC day 0 = last day of the previous month index).
  const { y, m } = ymdParts(today); // m is 1-based
  return {
    start: new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  };
}

const ymdParts = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
};

/**
 * How many buckets a range+slice would produce — computed BEFORE fetching so the page can gate
 * the request off (and show the too-fine warning) when it exceeds `MAX_BARS`. `start`/`end` are
 * inclusive `YYYY-MM-DD`; the window is `[start 00:00, (end+1) 00:00)`.
 */
export function estimateSliceCount(start: string, end: string, slice: SliceValue): number {
  const a = ymdParts(start);
  const b = ymdParts(end);
  if (slice === 'P1M') return Math.max(1, (b.y - a.y) * 12 + (b.m - a.m) + 1);
  if (slice === 'P1Y') return Math.max(1, b.y - a.y + 1);
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`) + DAY_MS; // exclusive end = day after `end`
  const days = Math.max(1, Math.round((endMs - startMs) / DAY_MS));
  const sliceMin = FIXED_SLICE_MIN[slice] ?? 60;
  return Math.max(1, Math.ceil((days * 1440) / sliceMin));
}

/** Whether a range+slice would return too many buckets to fetch/render (plan §2b). */
export function isTooFine(start: string, end: string, slice: SliceValue): boolean {
  return estimateSliceCount(start, end, slice) > MAX_BARS;
}

// ── Bucket generation over the report's echoed [start, end) window ──

/** Parse the fixed UTC offset (ms) from an ISO offset datetime, e.g. "…+05:00" → 5h, "…Z" → 0. */
function offsetMsOf(iso: string): number {
  const m = iso.match(/([+-])(\d{2}):(\d{2})$/);
  if (!m) return 0; // trailing 'Z' or no offset ⇒ UTC
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
}

interface Bucket {
  startMs: number;
  endMs: number;
  value: number;
}

/**
 * Generate the contiguous bucket set spanning `[startMs, endMs)`. Fixed slices step by a constant
 * millisecond duration (Asia/Tashkent has no DST, so fixed steps stay aligned to local midnight/
 * `:00`/`:30`); the calendar literals `P1M`/`P1Y` step by real local month/year boundaries.
 */
function generateBuckets(
  startMs: number,
  endMs: number,
  slice: SliceValue,
  offsetMs: number,
): Bucket[] {
  const buckets: Bucket[] = [];
  if (slice === 'P1M' || slice === 'P1Y') {
    // Anchor buckets to the calendar boundary (1st of the month for P1M, Jan 1 for P1Y) rather
    // than the window's start day, so they line up with the backend's calendar-month/-year slices
    // even when the window starts mid-period.
    const local = new Date(startMs + offsetMs);
    let y = local.getUTCFullYear();
    let mo = slice === 'P1M' ? local.getUTCMonth() : 0;
    let cursor = Date.UTC(y, mo, 1) - offsetMs;
    while (cursor < endMs) {
      if (slice === 'P1M') mo += 1;
      else y += 1;
      const next = Math.min(Date.UTC(y, mo, 1) - offsetMs, endMs);
      buckets.push({ startMs: cursor, endMs: next, value: 0 });
      cursor = next;
    }
    return buckets;
  }
  const stepMs = (FIXED_SLICE_MIN[slice] ?? 60) * 60_000;
  for (let t = startMs; t < endMs; t += stepMs) {
    buckets.push({ startMs: t, endMs: Math.min(t + stepMs, endMs), value: 0 });
  }
  return buckets;
}

// ── Label formatting (localized prose, fixed-format numbers) ──

/**
 * Local wall-clock parts for a UTC instant, obtained by shifting into the zone then reading UTC
 * fields — deterministic for the fixed-offset usage zone.
 */
function localParts(ms: number, offsetMs: number) {
  const d = new Date(ms + offsetMs);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth(),
    day: d.getUTCDate(),
    hh: String(d.getUTCHours()).padStart(2, '0'),
    mm: String(d.getUTCMinutes()).padStart(2, '0'),
    date: d, // a Date whose UTC fields are the local ones — format with timeZone:'UTC'
  };
}

/** Minutes a slice spans (fixed durations, or the calendar literals' nominal length). */
function sliceMinutes(slice: SliceValue): number {
  return FIXED_SLICE_MIN[slice] ?? (slice === 'P1M' ? 43_200 : 525_600);
}

/** The full slice label used for tooltips and the "most active slice" tile (localized month). */
function whenLabel(ms: number, offsetMs: number, slice: SliceValue, monthFmt: Intl.DateTimeFormat): string {
  const p = localParts(ms, offsetMs);
  const mon = monthFmt.format(p.date);
  const min = sliceMinutes(slice);
  if (min < 1440) return `${p.day} ${mon} ${p.hh}:${p.mm}`;
  if (min === 1440) return `${p.day} ${mon}`;
  if (slice === 'P1M') return `${mon} ${p.y}`;
  return String(p.y);
}

const monthShortFmt = () =>
  new Intl.DateTimeFormat(resolveLocale(i18n.language), { month: 'short', timeZone: 'UTC' });

/** Format a single slice's `start` ISO for the "most active" tile — same shape as chart tooltips. */
export function formatSliceStart(iso: string, slice: SliceValue): string {
  return whenLabel(Date.parse(iso), offsetMsOf(iso), slice, monthShortFmt());
}

export interface ChartBar {
  heightPx: number;
  fill: string;
  cap: string;
  showValue: boolean;
  value: number;
  valueStr: string;
  valueColor: string;
  xLabel: string; // thinned to ~10 labels once there are > 16 bars
  whenLabel: string; // full slice label, for the tooltip + the "most active" tile
}

export interface UsageChartVM {
  bars: ChartBar[];
  yTicks: string[]; // [max, ¾, ½, ¼, 0], fixed-format
  barGap: string;
}

/**
 * Build the chart view-model from a fetched report: zero-filled contiguous buckets, per-bar
 * render fields (height, accent-vs-dim fill, thinned x-labels, tooltip label), and the y-axis
 * ticks. The page reads the tiles (total / most-active) straight off the report; only the bars
 * come from here.
 */
export function buildUsageChart(report: UsageReport): UsageChartVM {
  const slice = report.slice as SliceValue;
  const offsetMs = offsetMsOf(report.start);
  const startMs = Date.parse(report.start);
  const endMs = Date.parse(report.end);

  const buckets = generateBuckets(startMs, endMs, slice, offsetMs);
  // Match each non-empty API slice into its bucket by containment (robust to boundary defn drift).
  for (const s of report.slices) {
    const sMs = Date.parse(s.start);
    const bucket = buckets.find((b) => sMs >= b.startMs && sMs < b.endMs);
    if (bucket) bucket.value = s.uniqueConnections;
  }

  const values = buckets.map((b) => b.value);
  const max = Math.max(1, ...values);
  let peakIndex = 0;
  values.forEach((v, i) => {
    if (v > values[peakIndex]) peakIndex = i;
  });

  const monthShort = monthShortFmt();
  const sliceMin = sliceMinutes(slice);
  const singleDay = endMs - startMs <= DAY_MS;
  const labelEvery = buckets.length <= 16 ? 1 : Math.ceil(buckets.length / 10);

  const bars: ChartBar[] = buckets.map((b, i) => {
    const p = localParts(b.startMs, offsetMs);
    const mon = monthShort.format(p.date);
    let xLabel: string;
    if (sliceMin < 1440) {
      xLabel = singleDay ? `${p.hh}:${p.mm}` : `${p.day}/${p.hh}h`;
    } else if (sliceMin === 1440) {
      xLabel = `${p.day} ${mon}`;
    } else if (slice === 'P1M') {
      xLabel = mon; // month name only; the tooltip's whenLabel carries the full year
    } else {
      xLabel = String(p.y);
    }
    const isPeak = i === peakIndex;
    return {
      heightPx: b.value > 0 ? Math.max(3, Math.round((b.value / max) * BAR_MAX_PX)) : 0,
      fill: isPeak ? 'var(--color-accent)' : 'color-mix(in oklab, var(--color-accent) 30%, transparent)',
      cap: isPeak ? 'var(--color-accent)' : 'color-mix(in oklab, var(--color-accent) 55%, transparent)',
      showValue: buckets.length <= 16 && b.value > 0,
      value: b.value,
      valueStr: groupFmt.format(b.value),
      valueColor: isPeak ? 'var(--color-accent)' : 'var(--color-text-secondary)',
      xLabel: i % labelEvery === 0 ? xLabel : '',
      whenLabel: whenLabel(b.startMs, offsetMs, slice, monthShort),
    };
  });

  const yTicks = [4, 3, 2, 1, 0].map((k) => groupFmt.format(Math.round((max * k) / 4)));
  const barGap = buckets.length > 40 ? '2px' : buckets.length > 16 ? '4px' : '8px';

  return { bars, yTicks, barGap };
}

/** Fixed-format a number for the analytics tiles (e.g. "1,204"). */
export function fmtCount(n: number): string {
  return groupFmt.format(n);
}
