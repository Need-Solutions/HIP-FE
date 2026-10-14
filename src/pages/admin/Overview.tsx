import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronRight, LayoutGrid, Megaphone, Plus, ReceiptText, ScanLine } from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import { Button, Card, EmptyState, ProgressBar, Skeleton, StatCard, Table, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { EventStatusBadge } from '@/components/admin/EventStatusBadge';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { useAuth } from '@/features/auth/AuthContext';
import { TIME_ZONE, formatDate, formatNairaCompact, formatTime } from '@/lib/format';
import { formatPercent, growth, percent } from '@/lib/metrics';
import { weekRangeLabel } from '@/lib/weeks';

// Figma: "Admin / Overview" (ANA-001..ANA-004). Attendance counts check-ins only, never ticket sales, and shows
// instances and unique hikers separately (SRS 3.7.7). Every percentage comes from lib/metrics.ts.

const WeeklyAttendanceChart = lazy(() => import('@/components/admin/WeeklyAttendanceChart').then((m) => ({ default: m.WeeklyAttendanceChart })));

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** Growth badge text from lib/metrics: "12%" (direction shown by the arrow), or nothing when last week was 0. */
function delta(current: number, previous: number) {
  const g = growth(current, previous);
  return g === null ? {} : { delta: formatPercent(Math.abs(g), 0), up: g >= 0 };
}

function when(iso: string) {
  const today = formatDate(new Date().toISOString());
  const yesterday = formatDate(new Date(Date.now() - 86_400_000).toISOString());
  const d = formatDate(iso);
  return d === today ? formatTime(iso) : d === yesterday ? `Yesterday ${formatTime(iso)}` : `${d}, ${formatTime(iso)}`;
}

export default function Overview() {
  const { user } = useAuth();
  useAdminTitle('Overview', `${greeting()}${user ? `, ${user.fullName.split(' ')[0]}` : ''}. Here’s how the group is doing.`);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminApi.overview });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[124px]" />)}</div>
        <Skeleton className="h-[360px]" />
      </div>
    );
  }
  if (isError || !data) {
    return <EmptyState icon={LayoutGrid} title="We couldn’t load the overview" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />;
  }

  const a = data.attendance;
  const quick = [
    { to: '/admin/events/new', label: 'Create event', icon: Plus },
    { to: '/checkin', label: 'Open check-in', icon: ScanLine },
    { to: '/admin/analytics', label: 'View analytics', icon: BarChart3 },
    { to: '/admin/ads/new', label: 'New ad campaign', icon: Megaphone },
    { to: '/admin/transactions?status=refund_requested', label: `Review refunds (${data.pendingRefunds})`, icon: ReceiptText },
  ];

  return (
    <div>
      <p className="text-sm font-semibold text-slate">This week · {weekRangeLabel(new Date(data.weekStart))}</p>
      <p className="sr-only">Compared with last week.</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered hikers" value={data.registeredHikers.toLocaleString('en-NG')} sub="all time" />
        <StatCard label="Attendance this week" value={String(a.instances)} {...delta(a.instances, a.previousInstances)} sub={`vs ${a.previousInstances} · ${a.uniqueHikers} unique hikers`} />
        <StatCard label="Tickets sold this week" value={String(data.ticketsSold.value)} {...delta(data.ticketsSold.value, data.ticketsSold.previous)} sub={`vs ${data.ticketsSold.previous}`} />
        <StatCard label="Net revenue this week" value={formatNairaCompact(data.netRevenueKobo.value)} {...delta(data.netRevenueKobo.value, data.netRevenueKobo.previous)} sub="after refunds" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_352px]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg">Weekly attendance</h2>
              <p className="mt-0.5 text-[13px] text-slate">Check-ins per calendar week. Not ticket sales.</p>
            </div>
            <ul className="flex gap-4 text-xs font-semibold text-slate" aria-label="Legend">
              <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded bg-forest" /> Attendance</li>
              <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded border-t-2 border-dashed border-sun" /> Unique</li>
            </ul>
          </div>
          <div className="mt-4">
            <Suspense fallback={<Skeleton className="h-[240px]" />}>
              <WeeklyAttendanceChart weeks={data.weekly} />
            </Suspense>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg">Quick actions</h2>
          <ul className="mt-4 space-y-2.5">
            {quick.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="flex h-[46px] items-center gap-3 rounded-xl border border-line px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40">
                  <span className="grid size-7 place-items-center rounded-lg bg-mint text-forest"><Icon size={15} aria-hidden /></span>
                  <span className="flex-1">{label}</span>
                  <ChevronRight size={16} aria-hidden className="text-slate-mute" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_352px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5">
            <h2 className="text-lg">Upcoming events</h2>
            <Link to="/admin/events?range=upcoming" className="text-sm font-bold text-forest hover:underline">View all</Link>
          </div>
          <Table caption="Upcoming events" minWidth={560}>
            <THead>
              <Th>Event</Th>
              <Th>Date</Th>
              <Th>Sold</Th>
              <Th>Status</Th>
            </THead>
            <TBody>
              {data.upcoming.map((r) => (
                <Tr key={r.event.id}>
                  <Td className="font-semibold">
                    <Link to={r.event.status === 'draft' ? `/admin/events/${r.event.id}/edit` : `/admin/events/${r.event.id}/participants`} className="hover:text-forest hover:underline">{r.event.title}</Link>
                  </Td>
                  <Td>{formatDate(r.event.startsAt)}</Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <ProgressBar value={percent(r.confirmed, r.capacity)} label={`${r.event.title}: ${r.confirmed} of ${r.capacity} sold`} className="w-16" />
                      <span className="tabular-nums">{r.confirmed}/{r.capacity}</span>
                    </div>
                  </Td>
                  <Td><EventStatusBadge row={r} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg">Recent activity</h2>
          <ul className="mt-4 space-y-4">
            {data.activity.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-moss" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{e.details}</p>
                  <p className="text-xs text-slate">{when(e.createdAt)} · {e.actorName}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link to="/admin/audit-log" className="mt-5 inline-block text-sm font-bold text-forest hover:underline">Full audit log</Link>
        </Card>
      </div>
    </div>
  );
}
