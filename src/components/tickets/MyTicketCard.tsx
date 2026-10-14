import type { ReactNode } from 'react';
import { CalendarDays, Check, Ticket as TicketIcon, User } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui';
import { coverArt } from '@/components/events/coverArt';
import { formatDate, formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { TicketDetails } from '@/types/domain';

/**
 * Row card on "Hiker / My tickets": cover art, title with a status badge, date and ticket lines, then actions
 * on the right (stacked under the details on phones). Used for tickets and for orders waiting for payment.
 */
export function MyTicketCard({
  event,
  badge,
  ticketLine,
  extra,
  actions,
  footer,
  muted,
}: {
  event: TicketDetails['event'];
  badge: { label: string; tone: BadgeTone };
  /** e.g. "With transport · HIP-7Q4K-2291" */
  ticketLine: string;
  /** Extra lines under the ticket line (attendee name, refund status, offline chip). */
  extra?: ReactNode;
  actions?: ReactNode;
  /** Small text under the actions, e.g. "Request refund" or the hold countdown. */
  footer?: ReactNode;
  muted?: boolean;
}) {
  return (
    <article className="card flex flex-col gap-5 p-4 sm:p-5 md:flex-row md:items-center md:gap-8">
      <img
        src={coverArt(event)}
        alt=""
        className={cn('h-36 w-full shrink-0 rounded-xl object-cover md:h-[172px] md:w-[240px]', muted && 'grayscale-[60%]')}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-xl md:text-[22px]">{event.title}</h2>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        <p className="mt-3 flex items-center gap-2.5 text-sm text-slate">
          <CalendarDays size={17} aria-hidden className="shrink-0" />
          {formatDate(event.startsAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {formatTime(event.startsAt)}
        </p>
        <p className="mt-2 flex items-center gap-2.5 text-sm text-slate">
          <TicketIcon size={17} aria-hidden className="shrink-0" />
          {ticketLine}
        </p>
        {extra && <div className="mt-3 space-y-2">{extra}</div>}
      </div>
      {(actions || footer) && (
        <div className="flex shrink-0 flex-col gap-3 md:items-end">
          {actions && <div className="flex flex-col gap-3 sm:flex-row">{actions}</div>}
          {footer && <div className="text-[13px] md:text-right">{footer}</div>}
        </div>
      )}
    </article>
  );
}

export function HolderLine({ name }: { name: string }) {
  return (
    <p className="flex items-center gap-2.5 text-sm text-slate">
      <User size={17} aria-hidden className="shrink-0" /> For {name}
    </p>
  );
}

export function OfflineChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-2.5 py-1 text-xs font-semibold text-forest">
      <Check size={13} aria-hidden /> Available offline
    </span>
  );
}
