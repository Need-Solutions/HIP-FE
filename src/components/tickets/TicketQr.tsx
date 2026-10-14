import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/cn';
import type { Ticket } from '@/types/domain';

/**
 * The scannable code. Encodes only `ticket.qrToken`, which carries the ticket code, event ID and signature
 * and no personal data (TKT-018). Format lives in lib/ticketQr.ts.
 */
export function TicketQr({ ticket, size = 200, className }: { ticket: Pick<Ticket, 'code' | 'qrToken'>; size?: number; className?: string }) {
  return (
    <div className={cn('inline-block rounded-2xl border border-line bg-white p-3', className)}>
      <QRCodeSVG
        value={ticket.qrToken}
        size={size}
        level="M"
        marginSize={0}
        fgColor="currentColor"
        className="block h-auto max-w-full text-ink"
        role="img"
        aria-label={`QR code for ticket ${ticket.code}`}
      />
    </div>
  );
}
