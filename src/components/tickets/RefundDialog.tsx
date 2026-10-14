import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ticketsApi } from '@/api/endpoints';
import { Button, Dialog, Select, Textarea } from '@/components/ui';
import { formatDate, formatNaira, formatTime } from '@/lib/format';
import { REFUND_POLICY, refundQuote } from '@/lib/refunds';
import type { MyTicket, RefundInfo } from '@/types/domain';
import { errorMessage, notifyError } from '@/lib/notify';

// TKT-021: refund request from My tickets. The amount shown follows the policy in lib/refunds.ts; the backend
// recalculates it when the request arrives.

const reasons = ['I can no longer attend', 'I booked the wrong date or ticket', 'Health or safety reason', 'Other'] as const;

const schema = z
  .object({
    reason: z.enum(reasons, { errorMap: () => ({ message: 'Choose a reason' }) }),
    note: z.string().trim().max(500, 'Keep it under 500 characters'),
  })
  .refine((v) => v.reason !== 'Other' || v.note.length > 0, { path: ['note'], message: 'Tell us a little about why' });
type Values = z.input<typeof schema>;

export function RefundDialog({ ticket, onClose, onDone }: { ticket: MyTicket | null; onClose: () => void; onDone: (refund: RefundInfo) => void }) {
  return (
    <Dialog open={!!ticket} onClose={onClose} title="Request a refund" className="max-w-lg">
      {ticket && <RefundForm ticket={ticket} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function RefundForm({ ticket, onClose, onDone }: { ticket: MyTicket; onClose: () => void; onDone: (refund: RefundInfo) => void }) {
  // Quoted once when the dialog opens, so the amount doesn't change under the hiker while they type.
  const [quote] = useState(() => refundQuote(ticket.event.startsAt, ticket.pricePaidKobo));
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { reason: '' as Values['reason'], note: '' } });

  const onSubmit = handleSubmit(async ({ reason, note }) => {
    try {
      onDone(await ticketsApi.requestRefund(ticket.code, { reason, note: note.trim() || undefined }));
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t send your request. Please try again.'), { id: 'refund' });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="p-6">
      <h2 className="text-xl">Request a refund</h2>
      <p className="mt-1 text-sm text-slate">
        {ticket.event.title} · {ticket.ticketTypeName} · {ticket.code}
      </p>

      <div className="mt-5 rounded-xl bg-canvas p-4">
        <p className="text-[13px] text-slate">You’ll get back</p>
        <p className="mt-1 text-2xl font-extrabold text-ink">
          {formatNaira(quote.amountKobo)} <span className="text-sm font-semibold text-slate">({quote.percent}% of {formatNaira(ticket.pricePaidKobo)})</span>
        </p>
        {quote.until && (
          <p className="mt-1 text-xs text-slate">
            {quote.percent === 100 ? 'Full refund' : '50% refund'} if you ask before {formatDate(quote.until.toISOString())}, {formatTime(quote.until.toISOString())}.
          </p>
        )}
        <p className="mt-3 border-t border-line pt-3 text-xs text-slate">{REFUND_POLICY} The Paystack fee isn’t refunded.</p>
      </div>

      <div className="mt-5 space-y-4">
        <Select label="Reason" {...register('reason')} error={errors.reason?.message}>
          <option value="" disabled>Choose a reason</option>
          {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Textarea
          label={watch('reason') === 'Other' ? 'Details' : 'Details (optional)'}
          maxLength={500}
          {...register('note')}
          error={errors.note?.message}
        />
      </div>

      <p className="mt-4 text-xs text-slate">
        Your ticket stays valid until we process the refund. Once it’s refunded, the ticket is cancelled and the money goes back to how you paid.
      </p>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Keep my ticket</Button>
        <Button type="submit" variant="danger" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : `Request ${formatNaira(quote.amountKobo)} refund`}</Button>
      </div>
    </form>
  );
}
