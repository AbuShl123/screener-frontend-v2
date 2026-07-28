import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import { Banner } from '@/components/Banner';
import { AccountLayout } from '@/features/billing';
import { usePresence, useUsage, useUsersTotal } from '../queries';
import {
  buildUsageChart,
  estimateSliceCount,
  fmtCount,
  formatSliceStart,
  isTooFine,
  PRESET_SLICE,
  rangeToDates,
  ymdInZone,
  type RangePreset,
  type SliceValue,
} from '../usageChart';

/**
 * Usage analytics (`/account/analytics`, ADMIN-only), from the design template's `analytics`
 * view. Two independent queries answer two different questions on different cadences: `/presence`
 * (live, in-memory) drives the "Online now" tile; `/usage` (persisted history) drives the chart +
 * the Total-connections / Most-active tiles.
 *
 * The `tooFine` guard is computed from the range+slice BEFORE fetching: a wide range × fine slice
 * would return an enormous slice count, so we gate `useUsage` off and show the warning banner
 * instead of firing a request the backend would choke on (plan §2b).
 */

const ZONE = 'Asia/Tashkent';
const GRID_TOPS = ['0%', '25%', '50%', '75%', '100%'];

type AdminKey = ParseKeys<'admin'>;

const SLICE_OPTIONS: { value: SliceValue; labelKey: AdminKey }[] = [
  { value: 'P1Y', labelKey: 'analytics.slice.year' },
  { value: 'P1M', labelKey: 'analytics.slice.month' },
  { value: 'PT24H', labelKey: 'analytics.slice.24h' },
  { value: 'PT1H', labelKey: 'analytics.slice.1h' },
  { value: 'PT30M', labelKey: 'analytics.slice.30min' },
];
const RANGE_OPTIONS: { value: RangePreset; labelKey: AdminKey }[] = [
  { value: 'today', labelKey: 'analytics.range.today' },
  { value: 'week', labelKey: 'analytics.range.week' },
  { value: 'month', labelKey: 'analytics.range.month' },
  { value: 'year', labelKey: 'analytics.range.year' },
  { value: 'custom', labelKey: 'analytics.range.custom' },
];

export function AnalyticsPage() {
  const { t } = useTranslation('admin');
  const [range, setRange] = useState<RangePreset>('week');
  // The slice dropdown only applies to the `custom` range; every preset locks its own slice
  // (today → hourly, week/month → daily, year → monthly) so no slice control is shown for them.
  const [customSlice, setCustomSlice] = useState<SliceValue>('PT24H');
  // Custom-range defaults: the last-7-days window, so switching to Custom starts sensibly.
  const [from, setFrom] = useState(() => rangeToDates('week', '', '', ZONE).start);
  const [to, setTo] = useState(() => ymdInZone(new Date(), ZONE));

  const slice = range === 'custom' ? customSlice : PRESET_SLICE[range];
  const { start, end } = rangeToDates(range, from, to, ZONE);
  const tooFine = isTooFine(start, end, slice);
  const requestedSliceCount = estimateSliceCount(start, end, slice);

  const presence = usePresence(true);
  const usersTotal = useUsersTotal();
  const usage = useUsage({ start, end, slice, zone: ZONE }, !tooFine);

  const report = usage.data;
  const chart = report ? buildUsageChart(report) : null;

  const online = presence.data?.onlineUsers ?? 0;
  const total = usersTotal.data;
  const onlineMeter = total && total > 0 ? Math.max(2, Math.round((online / total) * 100)) : 0;

  const totalConnections = tooFine || !report ? '—' : fmtCount(report.totalConnections);
  const peakValue = report?.mostActive ? fmtCount(report.mostActive.uniqueConnections) : '—';
  const peakWhen = report?.mostActive
    ? formatSliceStart(report.mostActive.start, report.slice as SliceValue)
    : t('analytics.mostActive.noData');

  const chartCaption = tooFine
    ? t('analytics.chart.captionTooFine', { count: fmtCount(requestedSliceCount) })
    : chart
      ? t('analytics.chart.caption', { count: chart.bars.length, peak: peakValue })
      : '';

  return (
    <AccountLayout>
      <div className="max-w-[1240px] p-10">
        <div className="text-[27px] font-semibold tracking-[-0.01em] text-text">{t('analytics.title')}</div>
        <div className="mt-2 font-mono text-[12px] text-text-dim">{t('analytics.subtitle', { zone: ZONE })}</div>

        {/* Controls */}
        <div className="mt-[26px] flex flex-wrap items-end gap-7 rounded-[10px] border border-border bg-input px-5 py-[18px]">
          <div className="flex flex-col gap-[9px]">
            <ControlLabel>{t('analytics.range.label')}</ControlLabel>
            <SelectControl
              value={range}
              onChange={(v) => setRange(v as RangePreset)}
              className="font-sans"
            >
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </SelectControl>
          </div>

          {range === 'custom' && (
            <>
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-[9px]">
                  <ControlLabel>{t('analytics.from')}</ControlLabel>
                  <DateInput value={from} onChange={setFrom} />
                </div>
                <div className="flex flex-col gap-[9px]">
                  <ControlLabel>{t('analytics.to')}</ControlLabel>
                  <DateInput value={to} onChange={setTo} />
                </div>
              </div>

              <div className="flex flex-col gap-[9px]">
                <ControlLabel>{t('analytics.slice.label')}</ControlLabel>
                <SelectControl
                  value={customSlice}
                  onChange={(v) => setCustomSlice(v as SliceValue)}
                  className="font-mono"
                >
                  {SLICE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(o.labelKey)}
                    </option>
                  ))}
                </SelectControl>
              </div>
            </>
          )}
        </div>

        {/* Stat tiles */}
        <div className="mt-4 flex flex-wrap gap-4">
          <div className="flex-[1_1_300px] rounded-[14px] border border-border bg-surface px-6 py-[22px] shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-2">
              <span className="h-[6px] w-[6px] animate-pulse rounded-full bg-bid" />
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">{t('analytics.online.label')}</span>
            </div>
            <div className="mt-[14px] flex items-baseline gap-2">
              <span className="font-mono text-[38px] font-semibold leading-none tracking-[-0.02em] text-bid">{fmtCount(online)}</span>
              <span className="font-mono text-[15px] text-text-dim">/ {total != null ? fmtCount(total) : '—'}</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">{t('analytics.online.users')}</span>
            </div>
            <div className="mt-4 h-1 overflow-hidden rounded-[2px] bg-input">
              <div className="h-full rounded-[2px] bg-bid transition-[width] duration-150" style={{ width: `${onlineMeter}%` }} />
            </div>
            <div className="mt-3 font-mono text-[11px] text-text-dim">
              {t('analytics.online.sessions', { count: presence.data?.totalSessions ?? 0 })}
            </div>
          </div>

          <StatTile label={t('analytics.totalConnections')} value={totalConnections} valueClass="text-text" />
          <div className="flex-[1_1_220px] rounded-[10px] border border-border bg-input px-6 py-[22px]">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">{t('analytics.mostActive.label')}</span>
            <div className="mt-[14px] font-mono text-[38px] font-semibold leading-none tracking-[-0.02em] text-accent">{peakValue}</div>
            <div className="mt-[14px] font-mono text-[11px] text-text-dim">{peakWhen}</div>
          </div>
        </div>

        {/* Too-fine warning */}
        {tooFine && (
          <div className="mt-4">
            <Banner variant="warning">
              {t('analytics.tooFine.banner', { slice, count: fmtCount(requestedSliceCount) })}
            </Banner>
          </div>
        )}

        {/* Chart */}
        <div className="mt-4 rounded-[10px] border border-border bg-input px-6 pb-[18px] pt-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">{t('analytics.chart.uniqueLabel')}</span>
            <span className="font-mono text-[11px] text-text-secondary">{chartCaption}</span>
          </div>

          {tooFine ? (
            <div className="mt-[22px] flex h-[208px] items-center justify-center rounded-[10px] border border-dashed border-border-input font-mono text-[12px] text-text-secondary">
              {t('analytics.tooFine.placeholder')}
            </div>
          ) : chart ? (
            <div>
              <div className="mt-[22px] flex h-[208px] gap-3">
                <div className="flex w-11 flex-none flex-col items-end justify-between">
                  {chart.yTicks.map((tick, i) => (
                    <span key={i} className="font-mono text-[10px] leading-none text-text-secondary">{tick}</span>
                  ))}
                </div>
                <div className="relative min-w-0 flex-1">
                  {GRID_TOPS.map((topPct) => (
                    <div key={topPct} className="absolute left-0 right-0 h-px bg-border-subtle" style={{ top: topPct }} />
                  ))}
                  <div className="absolute inset-0 flex items-end" style={{ gap: chart.barGap }}>
                    {chart.bars.map((b, i) => (
                      <div
                        key={i}
                        title={t('analytics.chart.tip', { when: b.whenLabel, count: b.value })}
                        className="flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-[5px]"
                      >
                        {b.showValue && (
                          <span className="font-mono text-[10px] leading-none" style={{ color: b.valueColor }}>
                            {b.valueStr}
                          </span>
                        )}
                        <div
                          className="w-full rounded-t-[2px] transition-[height] duration-150 hover:brightness-[1.3]"
                          style={{ height: `${b.heightPx}px`, background: b.fill, borderTop: `1px solid ${b.cap}` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="ml-[56px] mt-[9px] flex" style={{ gap: chart.barGap }}>
                {chart.bars.map((b, i) => (
                  <span key={i} className="min-w-0 flex-1 overflow-hidden text-center font-mono text-[10px] text-text-secondary whitespace-nowrap">
                    {b.xLabel}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-[22px] flex h-[208px] items-center justify-center font-mono text-[12px] text-text-secondary">
              {usage.isLoading ? '…' : t('analytics.empty')}
            </div>
          )}
        </div>
      </div>
    </AccountLayout>
  );
}

// ── Small pieces ──

function ControlLabel({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">{children}</span>;
}

function SelectControl({
  value,
  onChange,
  className = '',
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full cursor-pointer appearance-none rounded-[8px] border border-border-input bg-bg py-[11px] pl-3 pr-9 text-[13px] text-text-strong outline-none ${className}`}
      >
        {children}
      </select>
      <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true" className="pointer-events-none absolute right-[13px] top-1/2 -translate-y-1/2">
        <path d="M1 1l4 4 4-4" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-[8px] border border-border-input bg-bg px-3 py-[11px] font-mono text-[13px] text-text-strong outline-none [color-scheme:dark]"
    />
  );
}

function StatTile({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="flex-[1_1_220px] rounded-[10px] border border-border bg-input px-6 py-[22px]">
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">{label}</span>
      <div className={`mt-[14px] font-mono text-[38px] font-semibold leading-none tracking-[-0.02em] ${valueClass}`}>{value}</div>
    </div>
  );
}
