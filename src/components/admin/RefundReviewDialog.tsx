import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { adminPeopleApi, type TransactionRow } from '@/api/endpoints';
import { Button, Dialog, RadioCard, Textarea } from '@/components/ui';
import { formatDate, formatNaira, formatTime } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';
import { REFUND_POLICY } from '@/lib/refunds';

// Admin / Transactions → Review refund (TKT-021). The amount follows the refund policy as worked out when the hiker
// asked. Approving or declining both need a reason, which goes to the audit log; the hiker sees the outcome.

const schema = z.object({
  decision: z.enum(['approve', 'decline'], { errorMap: () => ({ message: 'Choose approve or decline' }) }),
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters. It goes in the audit log.').max(500, 'Keep it under 500 characters'),
});
type Values = z.input<typeof schema>;

export function RefundReviewDialog({ row, onClose, onDone }: { row: TransactionRow | null; onClose: () => void; onDone: (row: TransactionRow) => void }) {
  return (
    <Dialog open={!!row} onClose={onClose} title="Review refund request" className="max-w-lg">
      {row && <ReviewForm key={row.reference} row={row} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function ReviewForm({ row, onClose, onDone }: { row: TransactionRow; onClose: () => void; onDone: (row: TransactionRow) => void }) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { decision: undefined as unknown as Values['decision'], reason: '' } });
  const decision = watch('decision');
  const refund = row.refund!;

  return (
    <form
      noValidate
      className="p-6"
      onSubmit={handleSubmit(async (v) => {
        try {
          onDone(await adminPeopleApi.reviewRefund(row.reference, v.decision, v.reason));
        } catch (err) {
          notifyError(errorMessage(err, 'We couldn’t save the decision. Please try again.'), { id: 'refund-review' });
        }
      })}
    >
      <h2 className="text-xl">Review refund request</h2>
      <p className="mt-1 text-sm text-slate">{row.buyerName} · {row.eventTitle} · {row.ticketCode}</p>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-canvas p-4 text-sm">
        <div><dt className="text-slate">Paid</dt><dd className="font-semibold text-ink">{formatNaira(row.amountKobo)} <span className="font-normal text-slate">(incl. {formatNaira(row.feeKobo)} fee)</span></dd></div>
        <div><dt className="text-slate">Refund under the policy</dt><dd className="text-lg font-extrabold text-ink">{formatNaira(refund.amountKobo)}</dd></div>
        <div><dt className="text-slate">Asked</dt><dd className="text-ink">{formatDate(refund.requestedAt)}, {formatTime(refund.requestedAt)}</dd></div>
        <div><dt className="text-slate">Hiker’s reason</dt><dd className="text-ink">{refund.reason ?? '—'}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-slate">{REFUND_POLICY} The Paystack fee isn’t refunded.</p>
      <fieldset className="mt-5">
        <legend className="label">Decision</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <RadioCard name="decision" value="approve" checked={decision === 'approve'} onChange={() => setValue('decision', 'approve', { shouldValidate: true })} title="Approve" description={`Refund ${formatNaira(refund.amountKobo)}; the ticket is cancelled`} />
          <RadioCard name="decision" value="decline" checked={decision === 'decline'} onChange={() => setValue('decision', 'decline', { shouldValidate: true })} title="Decline" description="The ticket stays valid" />
        </div>
        {errors.decision && <p className="mt-1.5 text-xs text-danger">{errors.decision.message}</p>}
      </fieldset>
      <Textarea label="Reason (required)" className="mt-4" rows={3} {...register('reason')} error={errors.reason?.message} />
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant={decision === 'decline' ? 'secondary' : 'primary'} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : decision === 'decline' ? 'Decline refund' : decision === 'approve' ? `Approve ${formatNaira(refund.amountKobo)}` : 'Save decision'}
        </Button>
      </div>
    </form>
  );
}
