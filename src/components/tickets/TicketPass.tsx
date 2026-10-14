import { Badge, Logo } from '@/components/ui';
import { coverArt } from '@/components/events/coverArt';
import { formatDate, formatTime } from '@/lib/format';
import { hasUsableQr, ticketStatus } from '@/lib/tickets';
import type { TicketDetails } from '@/types/domain';
import { TicketQr } from './TicketQr';

const unusableMessage: Partial<Record<TicketDetails['status'], string>> = {
  pending: 'We’re still confirming the payment for this ticket. The QR code appears as soon as it’s confirmed.',
  cancelled: 'This ticket was cancelled and can’t be used to check in.',
  refunded: 'This ticket was refunded and can’t be used to check in.',
  expired: 'This ticket has expired and can’t be used to check in.',
};

/** Full ticket (Figma "Hiker / Ticket (QR)" and "Mobile / Ticket (QR)"). */
export function TicketPass({ ticket, offlineNote }: { ticket: TicketDetails; offlineNote: string }) {
  const status = ticketStatus[ticket.status];
  const usable = hasUsableQr(ticket.status);
  return (
    <article aria-label={`Ticket ${ticket.code}`} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-line print:shadow-none">
      <header className="relative h-[110px] md:h-[150px]">
        <img src={coverArt(ticket.event)} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="relative flex h-full flex-col justify-between p-5">
          <Logo dark className="hidden md:inline-flex" />
          <h1 className="mt-auto text-xl text-white drop-shadow md:text-[26px]">{ticket.event.title}</h1>
        </div>
      </header>

      <div className="px-5 pb-6 pt-5 md:px-6">
        <div className="flex flex-wrap gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {usable && offlineNote && <Badge tone="gray">{offlineNote}</Badge>}
          {ticket.isGuest && <Badge tone="gray">Guest</Badge>}
        </div>

        {usable ? (
          <div className="mt-5 flex flex-col items-center text-center">
            <TicketQr ticket={ticket} size={224} className="w-full max-w-[250px]" />
            <p className="mt-4 text-lg font-bold tracking-tight text-ink md:text-[22px]">{ticket.code}</p>
            <p className="mt-1 text-[13px] text-slate-mute">Turn your brightness up and hold steady for the scanner.</p>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl bg-canvas p-5 text-center">
            <p className="text-lg font-bold text-ink">{ticket.code}</p>
            <p role="status" className="mt-2 text-sm text-slate">{unusableMessage[ticket.status]}</p>
          </div>
        )}
      </div>

      {/* Perforated divider with side notches, like a paper ticket */}
      <div aria-hidden className="relative h-0 border-t-2 border-dashed border-line">
        <span className="absolute -left-3 -top-3 size-6 rounded-full bg-canvas max-md:bg-forest print:hidden" />
        <span className="absolute -right-3 -top-3 size-6 rounded-full bg-canvas max-md:bg-forest print:hidden" />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 md:px-6">
        <Detail label="Holder" value={ticket.holder.fullName} />
        <Detail label="Ticket" value={ticket.ticketTypeName} />
        <Detail label="Date" value={`${formatDate(ticket.event.startsAt)} · ${formatTime(ticket.event.startsAt)}`} />
        <Detail label="Meet" value={ticket.event.meetingPoint} />
      </dl>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-mute">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold text-ink">{value}</dd>
    </div>
  );
}
