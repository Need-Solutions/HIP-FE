import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Ticket } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui';
import { coverArt } from '@/components/events/coverArt';
import { downloadEventIcs } from '@/lib/calendar';
import { formatDate, formatTime, lagosToday } from '@/lib/format';
import type { MyTicket, NotificationPrefs } from '@/types/domain';

const DAY = 86_400_000;
const REMINDER_HOURS = 24; // NOT-010 / Figma "Hiker / Profile": "Event reminders (24 hrs before)"

/** "Today", "Tomorrow" or "In 5 days", counted in Abuja calendar days. */
function daysAway(iso: string) {
  const eventDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(iso));
  const days = Math.round((Date.parse(eventDay) - Date.parse(lagosToday())) / DAY);
  return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
}

/** Figma "Hiker / Dashboard" → next hike: art, countdown chip, details, QR and calendar actions, reminder note. */
export function NextHikeCard({ ticket, notifications }: { ticket: MyTicket; notifications?: NotificationPrefs }) {
  const { event } = ticket;
  const reminderAt = new Date(new Date(event.startsAt).getTime() - REMINDER_HOURS * 3_600_000);
  return (
    <article className="card flex flex-col overflow-hidden md:flex-row">
      <div className="relative h-44 shrink-0 md:h-auto md:w-[320px]">
        <img src={coverArt(event)} alt="" className="absolute inset-0 size-full object-cover" />
        <span className="absolute left-5 top-5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-forest shadow-sm">{daysAway(event.startsAt)}</span>
      </div>
      <div className="flex-1 p-6 md:px-7 md:py-9">
        <p className="text-[11px] font-bold uppercase tracking-wider text-sun-dark">Next hike</p>
        <h2 className="mt-1.5 text-2xl md:text-[26px]">{event.title}</h2>
        <ul className="mt-4 space-y-2.5 text-sm text-slate">
          <li className="flex items-center gap-2.5"><CalendarDays size={17} aria-hidden className="shrink-0" /> {formatDate(event.startsAt)} · {formatTime(event.startsAt)}</li>
          <li className="flex items-center gap-2.5"><MapPin size={17} aria-hidden className="shrink-0" /> {event.meetingPoint}</li>
          <li className="flex items-center gap-2.5"><Ticket size={17} aria-hidden className="shrink-0" /> {ticket.ticketTypeName} · {ticket.code}</li>
        </ul>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to={`/account/tickets/${ticket.code}`} className="sm:w-[180px]">View QR ticket</ButtonLink>
          <Button variant="secondary" className="sm:w-[160px]" onClick={() => downloadEventIcs(event, `Ticket ${ticket.code}`)}>Add to calendar</Button>
        </div>
        {notifications && reminderAt.getTime() > Date.now() && (
          <p className="mt-5 text-[13px] text-slate">
            {notifications.reminders ? (
              `Reminder set for ${formatDate(reminderAt.toISOString())}, ${formatTime(reminderAt.toISOString())}`
            ) : (
              <>Reminders are off. <Link to="/account/profile" className="font-bold text-forest underline">Turn them on</Link></>
            )}
          </p>
        )}
      </div>
    </article>
  );
}
