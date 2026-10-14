import { lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BarChart3, Download } from 'lucide-react';
import { adminApi, type AnalyticsGranularity } from '@/api/endpoints';
import {
  Button,
  Card,
  EmptyState,
  FilterChips,
  Input,
  ProgressBar,
  SegmentedControl,
  Select,
  Skeleton,
  StatCard,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@/components/ui';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { useBranding } from '@/features/branding/BrandingContext';
import { PRESETS, addDays, analyticsCsv, comparisonText, deriveAnalytics, hasAnyData, lagosDay, periodRange, type AnalyticsPreset } from '@/lib/analytics';
import { downloadText } from '@/lib/csv';
import { formatDate } from '@/lib/format';
import { formatPercent, formatPoints } from '@/lib/metrics';

// Figma: "Admin / Analytics" (ANA-001..ANA-033). Attendance comes from check-ins only, never ticket sales.
// Instances and unique hikers are always separate (SRS 3.7.7). Every percentage comes from lib/metrics.ts and is
// "—" when its denominator is 0. The CSV export is built from the same derived figures as the screen.

const Charts = {
  Trend: lazy(() => import('@/components/admin/AnalyticsCharts').then((m) => ({ default: m.TrendChart }))),
  Donut: lazy(() => import('@/components/admin/AnalyticsCharts').then((m) => ({ default: m.NewVsReturningDonut }))),
  Bars: lazy(() => import('@/components/admin/AnalyticsCharts').then((m) => ({ default: m.ComparisonBars }))),
};

const ymd = /^\d{4}-\d{2}-\d{2}$/;
const customSchema = z
  .object({
    from: z.string().regex(ymd, 'Choose a start date'),
    to: z.string().regex(ymd, 'Choose an end date'),
  })
  .refine((v) => v.to <= lagosDay(new Date()), { path: ['to'], message: 'The end date can’t be in the future' })
  .refine((v) => v.from <= v.to, { path: ['from'], message: 'The start date must be on or before the end date' })
  .refine((v) => v.from >= addDays(v.to, -366), { path: ['from'], message: 'Choose a range of a year or less' });

/** Growth badge from lib/metrics (arrow shows direction); nothing when the previous period was 0. */
function deltaProps(value: number | null, unit: 'percent' | 'points', lowerIsBetter = false) {
  if (value === null) return {};
  return {
    delta: unit === 'percent' ? formatPercent(Math.abs(value)) : formatPoints(Math.abs(value)).replace('+', ''),
    up: value >= 0,
    good: lowerIsBetter ? value <= 0 : value >= 0,
  };
}

export default function Analytics() {
  useAdminTitle('Analytics', 'Attendance comes from check-ins only, never from ticket sales.');
  const { name: brand } = useBranding();
  const [params, setParams] = useSearchParams();
  const preset = (PRESETS.find((p) => p.value === params.get('period'))?.value ?? 'this_month') as AnalyticsPreset;
  const granularity: AnalyticsGranularity = params.get('view') === 'weekly' ? 'weekly' : 'monthly';
  const eventId = params.get('event') ?? undefined;
  const range = periodRange(preset, { from: params.get('from') ?? '', to: params.get('to') ?? '' });

  const set = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') p.delete(k);
          else p.set(k, v);
        }
        return p;
      },
      { replace: true },
    );

  const query = { from: range.from, to: range.to, prevFrom: range.prevFrom, prevTo: range.prevTo, eventId, granularity };
  const report = useQuery({
    queryKey: ['admin', 'analytics', query],
    queryFn: () => adminApi.analytics(query),
    placeholderData: keepPreviousData,
  });
  const data = report.data;
  const eventOptions = data?.eventOptions ?? [];
  const eventLabel = eventId ? (eventOptions.find((e) => e.id === eventId)?.title ?? 'Selected event') : 'All events';

  const exportCsv = () => {
    if (!data) return;
    const name = `hip-analytics_${data.query.from}_to_${data.query.to}${eventId ? `_${eventId}` : ''}_${granularity}.csv`;
    downloadText(name, analyticsCsv(data, { periodLabel: range.label, vsLabel: range.vsLabel, eventLabel, brandName: brand }));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips
          label="Period"
          value={preset}
          onChange={(v) => set({ period: v === 'this_month' ? null : v, ...(v === 'custom' ? { from: range.from, to: range.to } : { from: null, to: null }) })}
          options={PRESETS}
        />
        <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
          <Select label="Event" hideLabel value={eventId ?? ''} onChange={(e) => set({ event: e.target.value || null })} className="w-full sm:w-[220px]">
            <option value="">All events</option>
            {eventOptions.map((e) => (
              <option key={e.id} value={e.id}>{e.title} · {formatDate(e.startsAt, { day: 'numeric', month: 'short', year: 'numeric' })}</option>
            ))}
          </Select>
          <SegmentedControl
            label="View"
            className="w-full sm:w-[200px]"
            value={granularity}
            onChange={(v) => set({ view: v === 'monthly' ? null : v })}
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
          <Button variant="secondary" onClick={exportCsv} disabled={!data || report.isFetching}>
            <Download size={16} aria-hidden /> Export CSV
          </Button>
        </div>
      </div>

      {preset === 'custom' && <CustomRange key={`${range.from}_${range.to}`} from={range.from} to={range.to} onApply={(v) => set({ from: v.from, to: v.to })} />}

      <p className="mt-4 text-sm font-semibold text-slate" aria-live="polite">
        {range.label} · {eventLabel} · compared {range.vsLabel.replace(/^vs /, 'with ')}
      </p>

      {report.isLoading ? (
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[124px]" />)}</div>
          <Skeleton className="h-[360px]" />
        </div>
      ) : !data ? (
        <EmptyState className="mt-4" icon={BarChart3} title="We couldn’t load analytics" body="Check your connection and try again." action={<Button onClick={() => report.refetch()}>Try again</Button>} />
      ) : !hasAnyData(data) ? (
        <EmptyState
          className="mt-4"
          icon={BarChart3}
          title="No check-ins in this period"
          body={eventId ? 'Nobody has checked in to this event in the selected period.' : 'Try a longer period, or check that staff have synced their phones.'}
          action={preset !== 'last_month' ? <Button variant="secondary" onClick={() => set({ period: 'last_month', from: null, to: null })}>Show last month</Button> : undefined}
        />
      ) : (
        <Report data={data} granularity={granularity} periodLabel={range.label} vsLabel={range.vsLabel} fetching={report.isFetching} />
      )}
    </div>
  );
}

function CustomRange({ from, to, onApply }: { from: string; to: string; onApply: (v: { from: string; to: string }) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof customSchema>>({ resolver: zodResolver(customSchema), defaultValues: { from, to } });
  return (
    <form noValidate onSubmit={handleSubmit(onApply)} className="mt-4 flex flex-wrap items-start gap-3 rounded-2xl border border-line bg-white p-4">
      <Input label="From" type="date" max={lagosDay(new Date())} className="w-[170px]" {...register('from')} error={errors.from?.message} />
      <Input label="To" type="date" max={lagosDay(new Date())} className="w-[170px]" {...register('to')} error={errors.to?.message} />
      <Button type="submit" className="mt-[26px]">Apply</Button>
    </form>
  );
}

function Report({
  data,
  granularity,
  periodLabel,
  vsLabel,
  fetching,
}: {
  data: NonNullable<Awaited<ReturnType<typeof adminApi.analytics>>>;
  granularity: AnalyticsGranularity;
  periodLabel: string;
  vsLabel: string;
  fetching: boolean;
}) {
  const d = deriveAnalytics(data);
  const kind = granularity === 'weekly' ? 'Weekly' : 'Monthly';
  const partial = data.series.length ? data.series[data.series.length - 1] : undefined;

  return (
    <div aria-busy={fetching} className={fetching ? 'opacity-70 transition-opacity' : undefined}>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Attendance instances" value={String(d.instances.value)} {...deltaProps(d.instances.growth, 'percent')} sub={vsLabel} />
        <StatCard label="Unique hikers" value={String(d.unique.value)} {...deltaProps(d.unique.growth, 'percent')} sub={vsLabel} />
        <StatCard label="First-time hikers" value={String(d.firstTime.value)} sub={`${formatPercent(d.firstTime.shareOfUnique, 0)} of unique`} />
        <StatCard label="Repeat rate" value={formatPercent(d.repeat.value)} {...deltaProps(d.repeat.change, 'points')} sub="returning ÷ unique" />
        <StatCard
          label="No-show rate"
          value={formatPercent(d.noShow.value)}
          {...deltaProps(d.noShow.change, 'points', true)}
          sub={d.noShow.eligible ? `${d.noShow.noShows} of ${d.noShow.eligible} tickets` : 'no hikes in period'}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_352px]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg">{kind} attendance</h2>
              <p className="mt-0.5 text-[13px] text-slate">
                Instances vs unique hikers.{partial?.partial ? ` ${partial.label.replace(/ \d{4}$/, '')} shows ${granularity === 'weekly' ? 'week' : 'month'} to date.` : ''}
              </p>
            </div>
            <ul className="flex gap-4 text-xs font-semibold text-slate" aria-label="Legend">
              <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded bg-forest" /> Instances</li>
              <li className="flex items-center gap-1.5"><span aria-hidden className="w-4 border-t-2 border-dashed border-sun" /> Unique</li>
            </ul>
          </div>
          <div className="mt-4">
            <Suspense fallback={<Skeleton className="h-[250px]" />}>
              <Charts.Trend buckets={data.series} />
            </Suspense>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-forest">Show as table</summary>
            <Table caption={`${kind} attendance`} minWidth={480} className="mt-3">
              <THead>
                <Th>{granularity === 'weekly' ? 'Week' : 'Month'}</Th>
                <Th>Instances</Th>
                <Th>Unique hikers</Th>
                <Th>First-time</Th>
                <Th>Returning</Th>
              </THead>
              <TBody>
                {data.series.map((b) => (
                  <Tr key={b.label}>
                    <Td>{b.label}{b.partial ? ' (to date)' : ''}</Td>
                    <Td className="tabular-nums">{b.instances}</Td>
                    <Td className="tabular-nums">{b.uniqueHikers}</Td>
                    <Td className="tabular-nums">{b.firstTime}</Td>
                    <Td className="tabular-nums">{b.returning}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </details>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg">New vs returning</h2>
          <p className="mt-0.5 text-[13px] text-slate">{periodLabel.replace(/^[^·]+· /, '')} · unique hikers</p>
          <div className="mt-6">
            <Suspense fallback={<Skeleton className="mx-auto h-[190px] w-[190px] rounded-full" />}>
              <Charts.Donut firstTime={d.firstTime.value} returning={d.returning} />
            </Suspense>
          </div>
          <ul className="mt-6 flex justify-center gap-6 text-sm">
            <li className="flex items-center gap-2"><span aria-hidden className="size-2.5 rounded-full bg-forest" /> Returning <span className="font-bold text-ink">{d.returning}</span></li>
            <li className="flex items-center gap-2"><span aria-hidden className="size-2.5 rounded-full bg-sun" /> First-time <span className="font-bold text-ink">{d.firstTime.value}</span></li>
          </ul>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_352px]">
        <Card className="p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg">{kind} comparison</h2>
            {d.comparison && <p className="text-sm font-semibold text-slate">{comparisonText(d.comparison)}</p>}
          </div>
          <p className="mt-0.5 text-[13px] text-slate">Attendance instances. Paler bars are still in progress.</p>
          <div className="mt-4">
            <Suspense fallback={<Skeleton className="h-[210px]" />}>
              <Charts.Bars buckets={data.series} />
            </Suspense>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg">Top events by attendance</h2>
          {d.events.length === 0 ? (
            <p className="mt-4 text-sm text-slate">No hikes took place in this period.</p>
          ) : (
            <ol className="mt-4 space-y-4">
              {d.events.slice(0, 5).map((e) => (
                <li key={e.eventId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <Link to={`/admin/events/${e.eventId}/participants`} className="min-w-0 truncate font-semibold text-ink hover:underline">
                      {e.title} <span className="font-normal text-slate">({formatDate(e.startsAt, { day: 'numeric', month: 'short' })})</span>
                    </Link>
                    <span className="shrink-0 tabular-nums text-slate">{e.checkedIn} / {e.ticketsSold} sold</span>
                  </div>
                  <ProgressBar value={e.rate} label={`${e.title}: ${formatPercent(e.rate)} attended`} className="mt-1.5" />
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 py-5">
          <h2 className="text-lg">Ticket sales vs attendance</h2>
          <span className="text-[13px] text-slate">Hikes that took place in the period. Attendance rate = checked in ÷ tickets sold.</span>
        </div>
        {d.events.length === 0 ? (
          <p className="border-t border-line px-6 py-5 text-sm text-slate">No hikes took place in this period.</p>
        ) : (
          <Table caption="Ticket sales vs attendance" minWidth={680}>
            <THead>
              <Th>Event</Th>
              <Th>Date</Th>
              <Th>Tickets sold</Th>
              <Th>Checked in</Th>
              <Th>Attendance rate</Th>
              <Th>No-shows</Th>
            </THead>
            <TBody>
              {d.events.map((e) => (
                <Tr key={e.eventId}>
                  <Td className="font-semibold">{e.title}</Td>
                  <Td className="whitespace-nowrap">{formatDate(e.startsAt, { day: 'numeric', month: 'short', year: 'numeric' })}</Td>
                  <Td className="tabular-nums">{e.ticketsSold}</Td>
                  <Td className="tabular-nums">{e.checkedIn}</Td>
                  <Td className="tabular-nums">{formatPercent(e.rate)}</Td>
                  <Td className="tabular-nums">{e.noShows}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
