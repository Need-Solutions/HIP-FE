import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Mountain } from 'lucide-react';
import { eventsApi, historyApi, profileApi, ticketsApi } from '@/api/endpoints';
import { Badge, ButtonLink, Card, EmptyState, Skeleton, StatCard } from '@/components/ui';
import { EventMiniCard } from '@/components/events/EventMiniCard';
import { NextHikeCard } from '@/components/hiker/NextHikeCard';
import { useAuth } from '@/features/auth/AuthContext';
import { purchaseBlocker } from '@/lib/events';
import { TIME_ZONE, formatDate, formatTime, lagosDayBoundary, lagosToday } from '@/lib/format';
import { checkInsPerMonth, historySummary, methodLabel } from '@/lib/history';
import { ticketTab } from '@/lib/tickets';
import type { HistoryEntry, MyTicket } from '@/types/domain';

// Figma: "Hiker / Dashboard" (AUTH-018, HIS-003). Every count here comes from check-ins (SRS 2.4 rules 5 and 11);
// bookings only show up as "upcoming".

// recharts is large, so the chart loads after the rest of the dashboard.
const ActivityChart = lazy(() => import('@/components/hiker/ActivityChart').then((m) => ({ default: m.ActivityChart })));

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** End of this week (Sunday) in Abuja, as a UTC ISO string. */
function endOfWeek() {
  const today = lagosToday();
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return lagosDayBoundary(lagosToday(weekday === 0 ? 0 : 7 - weekday), 'end');
}

const km = (n: number) => `${n.toLocaleString('en-NG', { maximumFractionDigits: 1 })} km`;

export default function Dashboard() {
  const { user } = useAuth();
  const tickets = useQuery({ queryKey: ['myTickets'], queryFn: ticketsApi.mine });
  const history = useQuery({ queryKey: ['history'], queryFn: historyApi.list });
  const profile = useQuery({ queryKey: ['profile'], queryFn: profileApi.get });
  const events = useQuery({ queryKey: ['events', 'upcoming'], queryFn: eventsApi.list });

  const name = (user ?? profile.data?.user)?.fullName.split(' ')[0];

  // Hikes the hiker is going on: tickets they hold that are confirmed (paid) and still to come.
  const upcoming = (tickets.data?.tickets ?? [])
    .filter((t) => t.heldByMe && t.status === 'confirmed' && ticketTab(t) === 'upcoming')
    .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  const next = upcoming[0];
  const weekEnd = endOfWeek();
  const thisWeek = upcoming.filter((t) => t.event.startsAt <= weekEnd).length;

  const subtitle = !tickets.data
    ? ' '
    : thisWeek > 0
      ? `You have ${thisWeek} ${thisWeek === 1 ? 'hike' : 'hikes'} this week. Pack light, start early.`
      : next
        ? `Your next hike is on ${formatDate(next.event.startsAt)}.`
        : 'No hikes booked yet. Find one you like below.';

  const booked = new Set((tickets.data?.tickets ?? []).map((t) => t.eventId));
  const recommended = (events.data ?? []).filter((e) => !booked.has(e.id) && purchaseBlocker(e) === null).slice(0, 3);

  return (
    <div>
      <h1 className="text-[28px] md:text-[32px]">{greeting()}{name ? `, ${name}` : ''}</h1>
      <p className="mt-1.5 text-[15px] text-slate">{subtitle}</p>

      <Stats history={history.data} upcoming={upcoming} loading={history.isLoading || tickets.isLoading} />

      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.86fr)_minmax(0,1fr)]">
        {tickets.isLoading ? (
          <Skeleton className="h-[330px]" />
        ) : next ? (
          <NextHikeCard ticket={next} notifications={profile.data?.notifications} />
        ) : (
          <EmptyState
            icon={Mountain}
            title="No upcoming hikes"
            body="Book a hike and your ticket and countdown show up here."
            action={<ButtonLink to="/events">Browse hikes</ButtonLink>}
          />
        )}
        <Card className="p-6">
          <h2 className="text-lg">Your activity</h2>
          <p className="mt-0.5 text-[13px] text-slate">Check-ins per month</p>
          <div className="mt-4">
            {history.data ? (
              <Suspense fallback={<Skeleton className="h-[220px]" />}>
                <ActivityChart data={checkInsPerMonth(history.data)} />
              </Suspense>
            ) : (
              <Skeleton className="h-[220px]" />
            )}
          </div>
        </Card>
      </div>

      {(events.isLoading || recommended.length > 0) && (
        <section className="mt-10" aria-labelledby="recommended">
          <div className="flex items-end justify-between gap-4">
            <h2 id="recommended" className="text-xl md:text-[22px]">Recommended for you</h2>
            <Link to="/events" className="whitespace-nowrap text-sm font-bold text-forest hover:underline">See all events →</Link>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {events.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[120px]" />) : recommended.map((e) => <EventMiniCard key={e.id} event={e} />)}
          </div>
        </section>
      )}

      <RecentCheckIns history={history.data} />
    </div>
  );
}

function Stats({ history, upcoming, loading }: { history?: HistoryEntry[]; upcoming: MyTicket[]; loading: boolean }) {
  if (loading || !history) {
    return <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[124px]" />)}</div>;
  }
  const summary = historySummary(history);
  const [lastMonth, thisMonth] = checkInsPerMonth(history, 2);
  const change = thisMonth.count - lastMonth.count;
  return (
    <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
      <StatCard
        label="Hikes completed"
        value={String(summary.hikesAttended)}
        sub={summary.firstHike ? `Since ${formatDate(summary.firstHike.event.startsAt, { month: 'short', year: 'numeric' })}` : 'From check-ins'}
      />
      <StatCard
        label="This month"
        value={String(thisMonth.count)}
        delta={change !== 0 ? `${Math.abs(change)} vs ${lastMonth.label}` : undefined}
        up={change > 0}
        sub={change === 0 ? `Same as ${lastMonth.label}` : undefined}
      />
      <StatCard
        label="Upcoming bookings"
        value={String(upcoming.length)}
        sub={upcoming[0] ? `Next: ${formatDate(upcoming[0].event.startsAt)}` : 'None booked'}
      />
      <StatCard label="Distance walked" value={km(summary.distanceKm)} sub="From check-ins" />
    </div>
  );
}

function RecentCheckIns({ history }: { history?: HistoryEntry[] }) {
  const recent = (history ?? []).filter((e) => e.outcome === 'attended' && e.checkIn).slice(0, 3);
  if (history && recent.length === 0) return null;
  return (
    <Card className="mt-10 p-6">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-lg">Recent check-ins</h2>
        <Link to="/account/history" className="text-sm font-bold text-forest hover:underline">Full history</Link>
      </div>
      {!history ? (
        <Skeleton className="mt-5 h-24" />
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {recent.map((e) => (
            <li key={e.ticketCode} className="flex items-center gap-3 py-3">
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-mint text-forest"><Check size={15} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{e.event.title}</p>
                <p className="text-[13px] text-slate">Checked in {formatTime(e.checkIn!.at)} · {formatDate(e.checkIn!.at)}</p>
              </div>
              <Badge tone="gray" className="shrink-0">{methodLabel[e.checkIn!.method]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
