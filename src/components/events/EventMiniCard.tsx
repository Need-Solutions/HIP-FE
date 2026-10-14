import { Link } from 'react-router-dom';
import { coverArt } from './coverArt';
import { formatDate, formatNaira } from '@/lib/format';
import type { HikeEvent } from '@/types/domain';

/** "Abuja" from "Bwari, Abuja"; "Niger" from "Gurara, Niger". */
const regionOf = (location: string) => location.split(',').pop()!.replace(/\s+State$/i, '').trim();

/** Compact horizontal event card (Figma "Hiker / Dashboard" → Recommended for you). */
export function EventMiniCard({ event }: { event: HikeEvent }) {
  return (
    <Link to={`/events/${event.slug}`} className="card group flex items-center gap-4 p-3 transition hover:shadow-md">
      <img src={coverArt(event)} alt="" className="h-24 w-[120px] shrink-0 rounded-xl object-cover" />
      <div className="min-w-0 flex-1 py-1">
        <h3 className="truncate text-base font-bold">{event.title}</h3>
        <p className="mt-1.5 text-[13px] text-slate">{formatDate(event.startsAt)} · {regionOf(event.location)}</p>
        <div className="mt-3 flex items-center justify-between gap-2 pr-2">
          <span className="text-base font-extrabold text-forest">{formatNaira(event.fromPriceKobo)}</span>
          <span aria-hidden className="text-[13px] font-bold text-sun-dark group-hover:underline">Book →</span>
        </div>
      </div>
    </Link>
  );
}
