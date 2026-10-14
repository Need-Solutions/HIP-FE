import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { formatDate, formatTime } from '@/lib/format';
import { hasUsableQr, ticketStatus } from '@/lib/tickets';
import type { TicketDetails } from '@/types/domain';
import { TicketQr } from './TicketQr';

/** Compact ticket: QR on the left, details on the right (Figma "Hiker / Checkout – confirmed"). */
export function TicketSummary({ ticket, footer }: { ticket: TicketDetails; footer?: ReactNode }) {
  const status = ticketStatus[ticket.status];
  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-line bg-canvas p-4 sm:flex-row sm:items-start sm:p-5">
      {hasUsableQr(ticket.status) && <TicketQr ticket={ticket} size={156} className="shrink-0 border-0" />}
      <div className="w-full min-w-0 text-center sm:text-left">
        <p className="text-[22px] font-bold tracking-tight text-ink">{ticket.code}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
          <Badge tone={status.tone}>{status.label}</Badge>
          {ticket.isGuest && <Badge tone="gray">Guest</Badge>}
        </div>
        <p className="mt-4 font-bold text-ink">{ticket.event.title}</p>
        <p className="mt-1 text-sm text-slate">{formatDate(ticket.event.startsAt)} · {formatTime(ticket.event.startsAt)}</p>
        <p className="mt-1 text-sm text-slate">{ticket.holder.fullName} · {ticket.ticketTypeName}</p>
        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </div>
  );
}
