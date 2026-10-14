import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, History as HistoryIcon } from 'lucide-react';
import { historyApi } from '@/api/endpoints';
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader, Select, Skeleton, StatCard, type BadgeTone } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { formatPercent } from '@/lib/metrics';
import { downloadText } from '@/lib/csv';
import { checkInLabel, historyCsv, historySummary, historyYears, inYear, outcomeLabel } from '@/lib/history';
import type { HikeOutcome, HistoryEntry } from '@/types/domain';

// Figma: "Hiker / Hiking history" (HIS-001..HIS-008). Only check-ins count: a booking without one is listed as
// Missed (HIS-004), a refunded booking as Refunded (HIS-008), and neither adds to the totals.

const outcomeTone: Record<HikeOutcome, BadgeTone> = { attended: 'green', missed: 'amber', refunded: 'gray' };
const longDate = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export default function History() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['history'], queryFn: historyApi.list });
  const years = data ? historyYears(data) : [];
  const [pickedYear, setYear] = useState<number | null>(null);
  const year = pickedYear ?? years[0] ?? null;

  const subtitle = 'Only hikes you checked in to count here. Bookings without a check-in are listed as missed.';
  if (isLoading) {
    return (
      <div>
        <PageHeader title="Hiking history" subtitle={subtitle} />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[124px]" />)}</div>
        <Skeleton className="mt-7 h-[460px]" />
      </div>
    );
  }
  // Load panel only when there's nothing to show; a failed refresh keeps the cached history (and toasts).
  if (!data) {
    return (
      <div>
        <PageHeader title="Hiking history" subtitle={subtitle} />
        <EmptyState icon={HistoryIcon} title="We couldn’t load your history" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div>
        <PageHeader title="Hiking history" subtitle={subtitle} />
        <EmptyState icon={HistoryIcon} title="No hikes yet" body="After your first hike, your check-ins and stats show up here." action={<ButtonLink to="/events">Find a hike</ButtonLink>} />
      </div>
    );
  }

  const summary = historySummary(data);
  const rows = year === null ? data : data.filter((e) => inYear(e, year));

  return (
    <div>
      <PageHeader title="Hiking history" subtitle={subtitle} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
        <StatCard label="Hikes attended" value={String(summary.hikesAttended)} sub="From check-ins" />
        <StatCard
          label="Attendance rate"
          value={formatPercent(summary.attendanceRate, 0)}
          sub={`${summary.hikesAttended} of ${summary.eligibleBookings} booked`}
        />
        <StatCard
          label="First hike"
          value={summary.firstHike ? formatDate(summary.firstHike.event.startsAt, { month: 'short', year: 'numeric' }) : '—'}
          sub={summary.firstHike ? shortTitle(summary.firstHike) : undefined}
        />
        <StatCard
          label="Longest trail"
          value={summary.longestTrail ? `${summary.longestTrail.event.distanceKm} km` : '—'}
          sub={summary.longestTrail ? shortTitle(summary.longestTrail) : undefined}
        />
      </div>

      <Card className="mt-7 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 md:px-6">
          <h2 className="text-lg">All hikes</h2>
          <div className="flex items-center gap-3">
            <Select label="Year" hideLabel value={year ?? ''} onChange={(e) => setYear(Number(e.target.value))} className="w-[110px]">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
            <Button variant="secondary" onClick={() => downloadText(`hip-hiking-history-${year}.csv`, historyCsv(rows))}>
              <Download size={16} aria-hidden /> Export
            </Button>
          </div>
        </div>

        {/* Table from md up; cards on phones. */}
        <table className="hidden w-full text-left text-sm md:table">
          <caption className="sr-only">Hikes in {year}</caption>
          <thead className="border-y border-line bg-canvas text-[11px] font-bold uppercase tracking-wide text-slate">
            <tr>
              <th scope="col" className="px-6 py-3">Hike</th>
              <th scope="col" className="px-4 py-3">Date</th>
              <th scope="col" className="px-4 py-3">Ticket</th>
              <th scope="col" className="px-4 py-3">Check-in</th>
              <th scope="col" className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((e) => (
              <tr key={e.ticketCode}>
                <th scope="row" className="px-6 py-4 font-semibold text-ink">
                  <Link to={`/events/${e.event.slug}`} className="hover:text-forest hover:underline">{e.event.title}</Link>
                </th>
                <td className="px-4 py-4 text-ink">{longDate(e.event.startsAt)}</td>
                <td className="px-4 py-4 text-ink">{e.pricePaidKobo === 0 ? 'Free' : e.ticketTypeName}</td>
                <td className="px-4 py-4 text-ink">{checkInLabel(e)}</td>
                <td className="px-6 py-4"><Badge tone={outcomeTone[e.outcome]}>{outcomeLabel[e.outcome]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-line border-t border-line md:hidden">
          {rows.map((e) => (
            <li key={e.ticketCode} className="flex items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <Link to={`/events/${e.event.slug}`} className="font-semibold text-ink hover:underline">{e.event.title}</Link>
                <p className="mt-1 text-[13px] text-slate">
                  {longDate(e.event.startsAt)} · {e.pricePaidKobo === 0 ? 'Free' : e.ticketTypeName}
                </p>
                <p className="mt-0.5 text-[13px] text-slate">Check-in: {checkInLabel(e)}</p>
              </div>
              <Badge tone={outcomeTone[e.outcome]} className="shrink-0">{outcomeLabel[e.outcome]}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** "Jabi Lake Walk" → "Jabi Lake", as in the Figma stat cards. */
const shortTitle = (e: HistoryEntry) => e.event.title.replace(/\s+(Walk|Trek|Trail|Loop|Summit|Day Trip)$/i, '');
