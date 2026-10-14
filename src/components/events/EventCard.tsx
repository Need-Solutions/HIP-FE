import { Link } from 'react-router-dom';
import { Clock, MapPin } from 'lucide-react';
import { Badge, Skeleton } from '@/components/ui';
import { availability, difficultyTone } from '@/lib/events';
import { coverArt } from './coverArt';
import { formatDate, formatNaira, formatTime } from '@/lib/format';
import type { HikeEvent } from '@/types/domain';

/** Event preview card (WEB-003). Events without a cover photo get one of the Figma mountain illustrations. */
export function EventCard({ event }: { event: HikeEvent }) {
  const a = availability(event);
  return (
    <Link to={`/events/${event.slug}`} className="card group block overflow-hidden transition hover:shadow-lg">
      <div className="relative h-[220px] bg-gradient-to-b from-sun-soft to-sun">
        <img src={coverArt(event)} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute left-4 top-4 rounded-xl bg-white px-3 py-2 text-center">
          <p className="text-[11px] font-bold text-sun-dark">{formatDate(event.startsAt, { weekday: 'short' }).toUpperCase()}</p>
          <p className="text-2xl font-extrabold leading-none">{formatDate(event.startsAt, { day: 'numeric' })}</p>
          <p className="text-[10px] font-semibold text-slate">{formatDate(event.startsAt, { month: 'short' }).toUpperCase()}</p>
        </div>
      </div>
      <div className="p-5">
        <Badge tone={difficultyTone[event.difficulty]} className="capitalize">{event.difficulty}</Badge>
        <h3 className="mt-4 text-[21px] font-bold">{event.title}</h3>
        <p className="mt-3 flex items-center gap-2 text-sm text-slate"><MapPin size={16} /> {event.location}</p>
        <p className="mt-2 flex items-center gap-2 text-sm text-slate"><Clock size={16} /> {formatTime(event.startsAt)} · {event.durationLabel}</p>
        <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
          <span className="text-[21px] font-extrabold text-forest">{formatNaira(event.fromPriceKobo)}</span>
          <Badge tone={a.tone}>{a.label}</Badge>
        </div>
      </div>
    </Link>
  );
}

export function EventCardSkeleton() {
  return <Skeleton className="h-[480px] border border-line" />;
}
