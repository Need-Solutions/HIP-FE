import { Link } from 'react-router-dom';
import { CalendarDays, Check, CloudDownload, Lock, WifiOff } from 'lucide-react';
import { Avatar, Badge, Button, ButtonLink, Card, EmptyState, Logo, Select, Skeleton } from '@/components/ui';
import { coverArt } from '@/components/events/coverArt';
import { useAuth } from '@/features/auth/AuthContext';
import { DEFAULT_GATE, useCheckinEvents, useGate } from '@/features/checkin/useCheckin';
import { formatDate, formatTime, lagosToday } from '@/lib/format';
import type { CheckinEvent } from '@/types/domain';
import type { StoredManifest } from '@/features/checkin/offline/db';
import { useBranding } from '@/features/branding/BrandingContext';

// Figma: "Check-in / Select event" (ATT-005). The soonest event first, with whether it's ready for offline
// scanning; the rest of the next two weeks below. Offline, it lists the events saved on this phone.

const isToday = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(iso)) === lagosToday();
const when = (iso: string) => `${isToday(iso) ? 'Today' : formatDate(iso)} · ${formatTime(iso)}`;

export default function SelectEvent() {
  const { name: brand } = useBranding();
  const { user } = useAuth();
  const { events, manifests, online } = useCheckinEvents();
  const saved = new Map((manifests.data ?? []).map((m) => [m.eventId, m]));

  // Offline (or the server can't be reached): fall back to what's saved on this phone.
  const list: { event: CheckinEvent['event']; confirmedTickets: number; gate?: string; gates: string[]; closedAt?: string; offlineAllowed: boolean }[] = events.data
    ? events.data.map((e) => ({ event: e.event, confirmedTickets: e.confirmedTickets, gate: e.gate, gates: e.gates, closedAt: e.attendanceClosedAt, offlineAllowed: e.offline.allowed }))
    : (manifests.data ?? []).map((m) => ({ event: { id: m.eventId, slug: '', title: m.eventTitle, startsAt: m.eventStartsAt, location: '', meetingPoint: '' }, confirmedTickets: m.ticketCount, gates: [DEFAULT_GATE], offlineAllowed: true }));
  const usingSaved = !events.data && !!manifests.data;
  const [first, ...rest] = list;

  return (
    <div className="px-5 pb-10 pt-6">
      <div className="flex items-center justify-between">
        <Logo />
        {user && <Avatar name={user.fullName} />}
      </div>
      <h1 className="mt-6 text-[30px]">Check-in</h1>
      <p className="mt-1 text-[15px] text-slate">Choose today’s event to start scanning.</p>

      {usingSaved && (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-warn-light px-3.5 py-2.5 text-[13px] text-ink">
          <WifiOff size={15} aria-hidden className="shrink-0 text-warn" />
          {online ? `Can’t reach ${brand} right now.` : 'You’re offline.'} Showing events saved on this phone.
        </p>
      )}

      {events.isLoading && manifests.isLoading ? (
        <Skeleton className="mt-6 h-[320px]" />
      ) : !first ? (
        events.isError && !usingSaved ? (
          <EmptyState className="mt-6" icon={WifiOff} title="We couldn’t load your events" body="Check your connection and try again." action={<Button onClick={() => events.refetch()}>Try again</Button>} />
        ) : (
          <EmptyState className="mt-6" icon={CalendarDays} title={usingSaved ? 'No events saved on this phone' : 'No events in the next two weeks'} body={usingSaved ? 'Connect to the internet to see your events and download them for offline scanning.' : 'Events you’re assigned to show up here.'} />
        )
      ) : (
        <>
          <Card className="mt-6 overflow-hidden">
            <div className="relative h-[100px]">
              <img src={coverArt(first.event)} alt="" className="absolute inset-0 size-full object-cover" />
              <span className="absolute left-4 top-3.5 rounded-full bg-white px-3 py-1 text-xs font-bold text-forest">{when(first.event.startsAt)}</span>
            </div>
            <div className="p-4">
              <h2 className="text-xl">{first.event.title}</h2>
              <p className="mt-1 text-sm text-slate">{first.confirmedTickets} confirmed tickets</p>
              <GatePicker eventId={first.event.id} assigned={first.gate} gates={first.gates} />
              <OfflineStatus eventId={first.event.id} manifest={saved.get(first.event.id)} closed={!!first.closedAt} allowed={first.offlineAllowed} hero />
            </div>
          </Card>
          {first.closedAt ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-slate"><Lock size={15} aria-hidden /> Attendance closed {formatTime(first.closedAt)}</p>
          ) : (
            <>
              <ButtonLink to={`/checkin/${first.event.id}/scan`} size="lg" block className="mt-4">Start scanning</ButtonLink>
              <div className="mt-3 flex justify-center gap-6 text-sm font-bold">
                <Link to={`/checkin/${first.event.id}/sync`} className="text-forest hover:underline">Sync</Link>
                <Link to={`/checkin/${first.event.id}/close`} className="text-forest hover:underline">Close attendance</Link>
              </div>
            </>
          )}

          {rest.length > 0 && (
            <section className="mt-8" aria-labelledby="coming-up">
              <h2 id="coming-up" className="text-base font-bold">Coming up</h2>
              <ul className="mt-3 space-y-3">
                {rest.map((e) => (
                  <li key={e.event.id}>
                    <Card className="flex items-start gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <Link to={`/checkin/${e.event.id}/scan`} className="text-base font-bold text-ink hover:underline">{e.event.title}</Link>
                        <p className="mt-0.5 text-[13px] text-slate">{formatDate(e.event.startsAt)} · {e.confirmedTickets} tickets</p>
                        <OfflineStatus eventId={e.event.id} manifest={saved.get(e.event.id)} closed={!!e.closedAt} allowed={e.offlineAllowed} />
                      </div>
                      {!saved.get(e.event.id) && !e.closedAt && online && e.offlineAllowed && (
                        <Link to={`/checkin/${e.event.id}/offline`} className="shrink-0 pt-6 text-sm font-bold text-forest hover:underline">Download</Link>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Gate for this phone's scans. Admins will assign gates in Admin / Check-in settings; until then staff pick. */
function GatePicker({ eventId, assigned, gates }: { eventId: string; assigned?: string; gates: string[] }) {
  const { gate, choose } = useGate(eventId, assigned);
  if (assigned) return <p className="mt-1 text-sm text-slate">Your gate: <span className="font-semibold text-ink">{assigned}</span> (assigned)</p>;
  return (
    <Select label="Your gate" value={gate} onChange={(e) => choose(e.target.value)} className="mt-3 max-w-[180px]">
      {(gates.includes(gate) ? gates : [gate, ...gates]).map((g) => <option key={g} value={g}>{g}</option>)}
    </Select>
  );
}

const expiry = (iso: string) => {
  const sameDay = formatDate(iso) === formatDate(new Date().toISOString());
  return `expires ${sameDay ? '' : `${formatDate(iso)}, `}${formatTime(iso)}`;
};

function OfflineStatus({ eventId, manifest, closed, allowed, hero }: { eventId: string; manifest?: StoredManifest; closed: boolean; allowed: boolean; hero?: boolean }) {
  if (closed) return <Badge tone="gray" className="mt-2.5">Attendance closed</Badge>;
  if (!allowed) return <Badge tone="gray" className="mt-2.5">Online scanning only</Badge>;
  if (!hero) {
    return manifest ? <Badge className="mt-2.5">Saved for offline</Badge> : <Badge tone="gray" className="mt-2.5">Not downloaded for offline</Badge>;
  }
  return manifest ? (
    <div className="mt-4 flex items-start gap-3 rounded-xl bg-mint px-3.5 py-3">
      <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-forest text-on-primary"><Check size={12} strokeWidth={3} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-forest">Ready for offline scanning</p>
        <p className="text-[13px] text-slate">
          {manifest.ticketCount} tickets saved · updated {formatTime(manifest.downloadedAt)} · {expiry(manifest.expiresAt)}
        </p>
      </div>
      <Link to={`/checkin/${eventId}/offline`} className="shrink-0 text-[13px] font-bold text-forest hover:underline">Update</Link>
    </div>
  ) : (
    <div className="mt-4 flex items-start gap-3 rounded-xl bg-warn-light px-3.5 py-3">
      <CloudDownload size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">Not saved for offline yet</p>
        <p className="text-[13px] text-slate">Download before you lose signal at the trailhead.</p>
      </div>
      <Link to={`/checkin/${eventId}/offline`} className="shrink-0 text-[13px] font-bold text-forest hover:underline">Download</Link>
    </div>
  );
}
