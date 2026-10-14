import { TIME_ZONE, TIME_ZONE_LABEL, formatDate, formatTime } from './format';
import { attendanceRate, formatPercent, formatPoints, formatSignedPercent, growth, noShowRate, pointChange, repeatRate, share } from './metrics';
import { toCsv } from './csv';
import { weekStart } from './weeks';
import type { AnalyticsBucket, AnalyticsCounts, AnalyticsGranularity, AnalyticsReport } from '@/api/endpoints';

// Admin / Analytics: period presets, the numbers on screen and the CSV export. The screen and the export both
// read `deriveAnalytics()`, so they show exactly the same figures for the same filters (ANA-032, ANA-033).
// Every percentage comes from lib/metrics.ts and is "—" when its denominator is 0.

export type AnalyticsPreset = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

export const PRESETS: { value: AnalyticsPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
];

const DAY = 86_400_000;
/** Abuja calendar date (YYYY-MM-DD) of an instant. */
export const lagosDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(d);
/** Shift a YYYY-MM-DD date by whole days. */
export const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);
const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`;
const monthEnd = (ymd: string) => addDays(monthStart(addDays(monthStart(ymd), 32)), -1);
const monthName = (ymd: string, opts: Intl.DateTimeFormatOptions = { month: 'short' }) => formatDate(`${ymd}T12:00:00Z`, opts);

export interface PeriodRange {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  /** "This month · 1–13 Oct 2026" */
  label: string;
  /** "vs Sep", for the stat cards. */
  vsLabel: string;
}

/** "1–13 Oct 2026", "28 Sep – 4 Oct 2026", "13 Oct 2026". */
export function rangeLabel(from: string, to: string) {
  const f = `${from}T12:00:00Z`;
  const t = `${to}T12:00:00Z`;
  if (from === to) return formatDate(t, { day: 'numeric', month: 'short', year: 'numeric' });
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = formatDate(f, sameMonth ? { day: 'numeric' } : sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  return `${start}${sameMonth ? '–' : ' – '}${formatDate(t, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/**
 * The date range for a preset and the period it's compared with: the day/week/month before (a whole one, as in
 * Figma's "vs Sep"), or for a custom range the same number of days just before it.
 */
export function periodRange(preset: AnalyticsPreset, custom?: { from: string; to: string }, now = new Date()): PeriodRange {
  const today = lagosDay(now);
  const thisMonday = lagosDay(new Date(weekStart(now).getTime() + 3_600_000));
  const name = PRESETS.find((p) => p.value === preset)?.label ?? 'Custom';
  const make = (from: string, to: string, prevFrom: string, prevTo: string, vsLabel: string): PeriodRange => ({
    from,
    to,
    prevFrom,
    prevTo,
    label: `${name} · ${rangeLabel(from, to)}`,
    vsLabel,
  });
  switch (preset) {
    case 'today':
      return make(today, today, addDays(today, -1), addDays(today, -1), 'vs yesterday');
    case 'this_week':
      return make(thisMonday, today, addDays(thisMonday, -7), addDays(thisMonday, -1), 'vs last week');
    case 'last_week':
      return make(addDays(thisMonday, -7), addDays(thisMonday, -1), addDays(thisMonday, -14), addDays(thisMonday, -8), 'vs week before');
    case 'this_month': {
      const prev = monthStart(addDays(monthStart(today), -1));
      return make(monthStart(today), today, prev, monthEnd(prev), `vs ${monthName(prev)}`);
    }
    case 'last_month': {
      const start = monthStart(addDays(monthStart(today), -1));
      const prev = monthStart(addDays(start, -1));
      return make(start, monthEnd(start), prev, monthEnd(prev), `vs ${monthName(prev)}`);
    }
    case 'custom': {
      const from = custom?.from && custom.from <= today ? custom.from : addDays(today, -29);
      const to = custom?.to && custom.to >= from ? (custom.to > today ? today : custom.to) : today;
      const length = daysBetween(from, to) + 1;
      return make(from, to, addDays(from, -length), addDays(from, -1), `vs previous ${length} ${length === 1 ? 'day' : 'days'}`);
    }
  }
}

export interface DerivedAnalytics {
  instances: { value: number; growth: number | null };
  unique: { value: number; growth: number | null };
  firstTime: { value: number; shareOfUnique: number | null };
  returning: number;
  repeat: { value: number | null; previous: number | null; change: number | null };
  noShow: { value: number | null; previous: number | null; change: number | null; noShows: number; eligible: number };
  comparison: { label: string; difference: number; growth: number | null } | null;
  events: (AnalyticsReport['events'][number] & { rate: number | null; noShows: number })[];
}

/** All the figures on the Analytics screen, from the report's raw counts and lib/metrics.ts. */
export function deriveAnalytics(r: AnalyticsReport): DerivedAnalytics {
  const c = r.current;
  const p = r.previous;
  const repeatNow = repeatRate(c.returning, c.uniqueHikers);
  const repeatBefore = repeatRate(p.returning, p.uniqueHikers);
  const noShowNow = noShowRate(c.checkedInEligible, c.eligibleConfirmed);
  const noShowBefore = noShowRate(p.checkedInEligible, p.eligibleConfirmed);
  const last = r.series[r.series.length - 1];
  const prior = r.series[r.series.length - 2];
  return {
    instances: { value: c.instances, growth: growth(c.instances, p.instances) },
    unique: { value: c.uniqueHikers, growth: growth(c.uniqueHikers, p.uniqueHikers) },
    firstTime: { value: c.firstTime, shareOfUnique: share(c.firstTime, c.uniqueHikers) },
    returning: c.returning,
    repeat: { value: repeatNow, previous: repeatBefore, change: pointChange(repeatNow, repeatBefore) },
    noShow: {
      value: noShowNow,
      previous: noShowBefore,
      change: pointChange(noShowNow, noShowBefore),
      noShows: Math.max(0, c.eligibleConfirmed - c.checkedInEligible),
      eligible: c.eligibleConfirmed,
    },
    comparison:
      last && prior
        ? { label: `${last.label} vs ${prior.label}`, difference: last.instances - prior.instances, growth: growth(last.instances, prior.instances) }
        : null,
    events: [...r.events]
      .sort((a, b) => b.checkedIn - a.checkedIn || b.startsAt.localeCompare(a.startsAt))
      .map((e) => ({ ...e, rate: attendanceRate(e.checkedIn, e.ticketsSold), noShows: Math.max(0, e.ticketsSold - e.checkedIn) })),
  };
}

export const hasAnyData = (r: AnalyticsReport) => r.current.instances > 0 || r.events.length > 0 || r.series.some((b) => b.instances > 0);

/** "+20 (+12.2%)" for the weekly/monthly comparison line. */
export const comparisonText = (c: NonNullable<DerivedAnalytics['comparison']>) =>
  `${c.label}: ${c.difference > 0 ? '+' : ''}${c.difference} (${formatSignedPercent(c.growth)})`;

const bucketKind = (g: AnalyticsGranularity) => (g === 'weekly' ? 'Week' : 'Month');
const countsRow = (label: string, now: number, before: number, change: string) => [label, String(now), String(before), change];
const day = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * CSV of exactly what's on screen for these filters: the period and filters, the headline figures (with the
 * previous period), the chart series and the ticket sales vs attendance table.
 */
export function analyticsCsv(r: AnalyticsReport, ctx: { periodLabel: string; vsLabel: string; eventLabel: string; brandName: string }): string {
  const d = deriveAnalytics(r);
  const c: AnalyticsCounts = r.current;
  const p: AnalyticsCounts = r.previous;
  const rows: string[][] = [
    [`${ctx.brandName} analytics`],
    ['Period', ctx.periodLabel],
    ['From', r.query.from],
    ['To', r.query.to],
    ['Compared with', `${ctx.vsLabel.replace(/^vs /, '')} (${r.query.prevFrom} to ${r.query.prevTo})`],
    ['Event', ctx.eventLabel],
    ['View', r.query.granularity === 'weekly' ? 'Weekly' : 'Monthly'],
    ['Generated', `${day(r.generatedAt)} ${formatTime(r.generatedAt)} (${TIME_ZONE_LABEL})`],
    ['Note', 'Attendance comes from check-ins only, never from ticket sales.'],
    [],
    ['Metric', 'This period', 'Previous period', 'Change'],
    countsRow('Attendance instances', c.instances, p.instances, formatSignedPercent(d.instances.growth)),
    countsRow('Unique hikers', c.uniqueHikers, p.uniqueHikers, formatSignedPercent(d.unique.growth)),
    ['First-time hikers', String(c.firstTime), String(p.firstTime), `${formatPercent(d.firstTime.shareOfUnique)} of unique`],
    ['Returning hikers', String(c.returning), String(p.returning), ''],
    ['Repeat rate (returning ÷ unique)', formatPercent(d.repeat.value), formatPercent(d.repeat.previous), formatPoints(d.repeat.change)],
    ['No-show rate (no-shows ÷ confirmed tickets for hikes in the period)', formatPercent(d.noShow.value), formatPercent(d.noShow.previous), formatPoints(d.noShow.change)],
    ['Confirmed tickets for hikes in the period', String(c.eligibleConfirmed), String(p.eligibleConfirmed), ''],
    ['Checked in at those hikes', String(c.checkedInEligible), String(p.checkedInEligible), ''],
    [],
    [`${bucketKind(r.query.granularity)}ly attendance`],
    [bucketKind(r.query.granularity), 'Start', 'End', 'Instances', 'Unique hikers', 'First-time', 'Returning', 'Complete'],
    ...r.series.map((b: AnalyticsBucket) => [b.label, day(b.start), day(b.end), String(b.instances), String(b.uniqueHikers), String(b.firstTime), String(b.returning), b.partial ? 'No (to date)' : 'Yes']),
    ...(d.comparison ? [['Comparison', comparisonText(d.comparison)]] : []),
    [],
    ['Ticket sales vs attendance'],
    ['Event', 'Date', 'Tickets sold', 'Checked in', 'Attendance rate', 'No-shows'],
    ...d.events.map((e) => [e.title, day(e.startsAt), String(e.ticketsSold), String(e.checkedIn), formatPercent(e.rate), String(e.noShows)]),
  ];
  return toCsv(rows);
}
