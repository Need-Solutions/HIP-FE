import { coverArt } from '@/components/events/coverArt';
import { formatDate, formatNaira, formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { HikeEvent } from '@/types/domain';

export interface SummaryLine {
  label: string;
  amountKobo: number;
}

/**
 * Right-hand order card on every checkout step (Figma "Hiker / Checkout – *"): event, line items,
 * the estimated Paystack fee, total and the seat-hold countdown.
 */
export function OrderSummary({
  event,
  lines,
  feeKobo,
  totalKobo,
  holdLabel,
  holdExpired,
  className,
}: {
  event: HikeEvent;
  lines: SummaryLine[];
  feeKobo: number;
  totalKobo: number;
  /** "09:42", or undefined once the order is paid. */
  holdLabel?: string;
  holdExpired?: boolean;
  className?: string;
}) {
  return (
    <aside aria-label="Order summary" className={cn('card p-4 md:p-5', className)}>
      <img src={coverArt(event)} alt="" className="hidden h-[130px] w-full rounded-xl object-cover md:block" />
      <h2 className="text-[19px] md:mt-4">{event.title}</h2>
      <p className="mt-1 text-[13px] text-slate">
        {formatDate(event.startsAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {formatTime(event.startsAt)} · {event.meetingPoint.split(',')[0]}
      </p>

      <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
        {lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-4">
            <dt className="text-slate">{l.label}</dt>
            <dd className="font-bold text-ink">{formatNaira(l.amountKobo)}</dd>
          </div>
        ))}
        {totalKobo > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-slate">Paystack processing fee</dt>
            <dd className="font-bold text-ink">{feeKobo === 0 ? '₦0' : formatNaira(feeKobo)}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
        <span className="font-bold text-ink">Total</span>
        <span className="text-2xl font-extrabold text-forest">{formatNaira(totalKobo)}</span>
      </div>
      {totalKobo > 0 && <p className="mt-1 text-xs text-slate">The fee is an estimate. Paystack confirms the final amount before you pay.</p>}

      {holdLabel && (
        <p role="timer" aria-live="off" className={cn('mt-4 text-[13px] font-bold', holdExpired ? 'text-danger' : 'text-sun-dark')}>
          {holdExpired ? 'Seat hold expired' : `Seats held for ${holdLabel}`}
        </p>
      )}
    </aside>
  );
}
