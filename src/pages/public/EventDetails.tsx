import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Check, ChevronLeft, Clock, ExternalLink, MapPin, Mountain, TriangleAlert } from 'lucide-react';
import { eventsApi } from '@/api/endpoints';
import { Badge, Button, EmptyState, Skeleton, StatCard, ButtonLink } from '@/components/ui';
import { TicketPicker } from '@/components/events/TicketPicker';
import { coverArt } from '@/components/events/coverArt';
import { AdSlot } from '@/components/ads/AdSlot';
import { availability, difficultyTone, purchaseBlocker } from '@/lib/events';
import { formatDate, formatNaira, formatTime } from '@/lib/format';
import type { HikeEvent } from '@/types/domain';

// Figma: "Web / Event details" and "Mobile / Event details" (WEB-007, WEB-008, WEB-009, ADS-010).
// Buying is disabled for cancelled, closed, past or sold-out hikes (EVT-010, EVT-011).

export default function EventDetails() {
  const { slug = '' } = useParams();
  const { data: event, isLoading, isError, refetch } = useQuery({ queryKey: ['event', slug], queryFn: () => eventsApi.bySlug(slug) });
  const { data: ticketTypes, isLoading: typesLoading } = useQuery({
    queryKey: ['ticketTypes', event?.id],
    queryFn: () => eventsApi.ticketTypes(event!.id),
    enabled: !!event,
  });

  if (isLoading) return <DetailsSkeleton />;

  // "Couldn't load" only when nothing loaded; a failed refresh keeps the cached hike (and toasts).
  const loadFailed = isError && event === undefined;
  if (!event) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={Mountain}
          title={loadFailed ? "We couldn't load this hike" : 'Hike not found'}
          body={loadFailed ? 'Check your connection and try again.' : 'This hike may have been removed, or the link is wrong.'}
          action={
            loadFailed ? <Button onClick={() => refetch()}>Try again</Button> : <ButtonLink to="/events">Browse all hikes</ButtonLink>
          }
        />
      </div>
    );
  }

  const blocker = purchaseBlocker(event);
  const status = availability(event);

  return (
    <div>
      {/* Mobile: full-bleed hero with a back button */}
      <div className="relative lg:hidden">
        <img src={coverArt(event)} alt="" className="h-[300px] w-full object-cover sm:h-[340px]" />
        <Link
          to="/events"
          aria-label="Back to events"
          className="absolute left-4 top-4 grid size-11 place-items-center rounded-full bg-white text-ink shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
        >
          <ChevronLeft size={22} />
        </Link>
      </div>

      <div className="container-page pb-12 lg:pb-20">
        <nav aria-label="Breadcrumb" className="hidden pt-6 text-[13px] text-slate lg:block">
          <Link to="/events" className="hover:text-forest hover:underline">Events</Link> / <span aria-current="page">{event.title}</span>
        </nav>
        <img src={coverArt(event)} alt="" className="mt-4 hidden h-[420px] w-full rounded-3xl object-cover lg:block" />

        <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12">
          <article>
            <div className="flex flex-wrap gap-2">
              <Badge tone={difficultyTone[event.difficulty]} className="capitalize">{event.difficulty}</Badge>
              <Badge tone={status.tone}>{blocker ? status.label : 'Tickets available'}</Badge>
            </div>
            <h1 className="mt-4 text-[26px] leading-tight md:text-[44px]">{event.title}</h1>
            <ul className="mt-4 flex flex-col gap-3 text-[15px] text-ink md:flex-row md:flex-wrap md:gap-x-10">
              <MetaItem icon={CalendarDays}>{formatDate(event.startsAt, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</MetaItem>
              <MetaItem icon={Clock}>{formatTime(event.startsAt)} · {event.durationLabel}</MetaItem>
              <MetaItem icon={MapPin}>{event.meetingPoint}</MetaItem>
            </ul>

            <div className="mt-6 space-y-9 border-t border-line pt-6">
              <Section title="About this hike">
                <p className="text-base leading-relaxed text-slate">{event.description}</p>
              </Section>

              <Section title="Trail details">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {event.distanceKm !== undefined && <StatCard compact label="Distance" value={`${event.distanceKm} km`} />}
                  {event.elevationM !== undefined && <StatCard compact label="Elevation" value={`${event.elevationM.toLocaleString('en-NG')} m`} />}
                  <StatCard compact label="Duration" value={event.durationLabel} />
                  <StatCard compact label="Capacity" value={`${event.capacity} hikers`} />
                </div>
              </Section>

              {event.requiredEquipment.length > 0 && (
                <Section title="What to bring">
                  <ul className="space-y-2.5">
                    {event.requiredEquipment.map((item) => (
                      <li key={item} className="flex items-center gap-3 text-[15px] text-ink">
                        <span className="grid size-5 shrink-0 place-items-center rounded-md bg-mint text-forest"><Check size={14} aria-hidden /></span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section title="Requirements">
                <p className="text-base leading-relaxed text-slate">
                  {event.requirements} Registration closes{' '}
                  {formatDate(event.registrationDeadline, { weekday: 'long', day: 'numeric', month: 'short' })} at {formatTime(event.registrationDeadline)}.
                </p>
              </Section>

              <div className="rounded-2xl bg-danger-light p-5">
                <h2 className="flex items-center gap-2 text-base font-bold text-danger">
                  <TriangleAlert size={18} aria-hidden /> Emergency information
                </h2>
                <p className="mt-2 text-sm text-ink">{event.emergencyInfo}</p>
              </div>

              <Section title="Meeting point">
                <MeetingPoint event={event} />
              </Section>
            </div>
          </article>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div id="tickets" className="card scroll-mt-6 p-5 md:p-6">
              {typesLoading || !ticketTypes ? (
                <div className="space-y-3" aria-label="Loading tickets">
                  <Skeleton className="h-7 w-40" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-12" />
                </div>
              ) : (
                <TicketPicker key={event.id} event={event} ticketTypes={ticketTypes} blocker={blocker} />
              )}
            </div>
            <AdSlot placement="event_page" compact className="mt-6" />
          </aside>
        </div>
      </div>

      {/* Mobile: sticky price bar ("Mobile / Event details"). Sticky, not fixed, so it stops above the footer. */}
      <div className="sticky bottom-0 z-20 border-t border-line bg-white lg:hidden">
        <div className="container-page flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-xs text-slate">From</p>
            <p className="text-xl font-extrabold text-forest">{formatNaira(event.fromPriceKobo)}</p>
          </div>
          {blocker ? (
            <Badge tone={status.tone}>{status.label}</Badge>
          ) : (
            <Button size="lg" className="w-1/2" onClick={scrollToTickets}>Get tickets</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function scrollToTickets() {
  const el = document.getElementById('tickets');
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Move focus to the first ticket choice so keyboard and screen reader users land in the picker.
  el?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true });
}

function MetaItem({ icon: Icon, children }: { icon: typeof CalendarDays; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <Icon size={18} aria-hidden className="shrink-0 text-forest" />
      <span>{children}</span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[17px] md:text-[22px]">{title}</h2>
      {children}
    </section>
  );
}

/** Meeting point card with a link out to Google Maps (there's no map library in the stack). */
function MeetingPoint({ event }: { event: HikeEvent }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.meetingPoint)}`;
  return (
    <div className="relative grid h-[200px] place-items-center overflow-hidden rounded-2xl border border-line bg-canvas">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-sun text-on-secondary shadow"><MapPin size={18} aria-hidden /></span>
        <div className="rounded-lg bg-white px-3 py-2 shadow-sm">
          <p className="text-[13px] font-bold text-ink">{event.meetingPoint}</p>
          <p className="text-xs text-slate">Meet by {formatTime(event.startsAt)} sharp</p>
        </div>
      </div>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-forest shadow-sm hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
      >
        Open in Google Maps <ExternalLink size={14} aria-hidden />
      </a>
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div className="container-page py-6" aria-busy="true" aria-label="Loading hike">
      <Skeleton className="h-[260px] lg:h-[420px]" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12">
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-[480px]" />
      </div>
    </div>
  );
}
