import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ProgressBar, QuantityStepper, RadioCard } from '@/components/ui';
import { FEW_SPOTS_THRESHOLD, MAX_TICKETS_PER_ORDER, encodeSelection, spotsLeft, ticketTypeRemaining } from '@/lib/events';
import { formatDate, formatNaira } from '@/lib/format';
import { percent } from '@/lib/metrics';
import type { HikeEvent, TicketType } from '@/types/domain';

/** Why a ticket type can't be picked right now, or a low-stock note. */
function ticketNote(t: TicketType, now = Date.now()): { text: string; muted: boolean } | null {
  if (t.status === 'sold_out' || t.quantitySold >= t.quantityLimit) return { text: 'Sold out', muted: true };
  if (t.status === 'paused') return { text: 'Not on sale', muted: true };
  if (new Date(t.salesStart).getTime() > now) return { text: `On sale ${formatDate(t.salesStart)}`, muted: true };
  if (new Date(t.salesEnd).getTime() < now) return { text: 'Sales ended', muted: true };
  const left = ticketTypeRemaining(t, now);
  return left <= FEW_SPOTS_THRESHOLD ? { text: `Only ${left} left`, muted: false } : null;
}

/**
 * "Select tickets" card on the event page (WEB-008, Figma "Web / Event details"): one ticket type, a quantity,
 * the total and the capacity bar. Sends the choice to checkout in the URL.
 * `blocker` is the reason the event can't be bought (EVT-010, EVT-011); when set, nothing can be picked.
 */
export function TicketPicker({ event, ticketTypes, blocker }: { event: HikeEvent; ticketTypes: TicketType[]; blocker: string | null }) {
  const navigate = useNavigate();
  const [typeId, setTypeId] = useState(() => ticketTypes.find((t) => ticketTypeRemaining(t) > 0)?.id ?? '');
  const [qty, setQty] = useState(1);

  const selected = ticketTypes.find((t) => t.id === typeId);
  // One order can't exceed the per-order cap, the ticket type's stock or the event's remaining capacity.
  const maxQty = selected ? Math.min(MAX_TICKETS_PER_ORDER, ticketTypeRemaining(selected), spotsLeft(event)) : 0;
  const canBuy = !blocker && !!selected && maxQty > 0;

  const chooseType = (id: string) => {
    setTypeId(id);
    const t = ticketTypes.find((x) => x.id === id);
    if (t) setQty((q) => Math.max(1, Math.min(q, MAX_TICKETS_PER_ORDER, ticketTypeRemaining(t), spotsLeft(event))));
  };

  const checkout = () => {
    if (!selected) return;
    navigate(`/checkout/${event.id}?items=${encodeSelection({ [selected.id]: qty })}`);
  };

  const booked = percent(event.ticketsSold, event.capacity);

  return (
    <div>
      <h2 className="text-[22px]">Select tickets</h2>
      <p className="mt-1 text-[13px] text-slate">Prices include VAT. Paystack fee shown at checkout.</p>

      {ticketTypes.length === 0 ? (
        <p className="mt-5 rounded-xl bg-canvas p-4 text-sm text-slate">Tickets for this hike aren't on sale yet.</p>
      ) : (
        <fieldset className="mt-5">
          <legend className="sr-only">Ticket type</legend>
          <div className="space-y-3">
            {ticketTypes.map((t) => {
              const note = ticketNote(t);
              return (
                <RadioCard
                  key={t.id}
                  name="ticketType"
                  value={t.id}
                  checked={t.id === typeId}
                  onChange={chooseType}
                  disabled={!!blocker || ticketTypeRemaining(t) === 0}
                  title={t.name}
                  description={t.description}
                  note={note && <span className={note.muted ? 'text-slate' : 'text-sun-dark'}>{note.text}</span>}
                  aside={<span className="text-[15px] font-bold text-ink">{formatNaira(t.priceKobo)}</span>}
                />
              );
            })}
          </div>
        </fieldset>
      )}

      {canBuy && (
        <>
          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm text-ink">Quantity</span>
            <QuantityStepper label="tickets" value={qty} min={1} max={maxQty} onChange={setQty} />
          </div>
          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-[15px] font-bold text-ink">Total</span>
            <span className="text-2xl font-extrabold text-forest" aria-live="polite">{formatNaira(selected.priceKobo * qty)}</span>
          </div>
        </>
      )}

      {blocker && <p role="status" className="mt-5 rounded-xl bg-canvas p-4 text-sm font-semibold text-slate">{blocker}</p>}

      <Button block size="lg" className="mt-5" disabled={!canBuy} onClick={checkout}>
        {blocker ? 'Tickets unavailable' : 'Get tickets'}
      </Button>
      {canBuy && <p className="mt-2 text-center text-xs text-slate">No account needed. You can check out as a guest.</p>}

      <p className="mt-5 text-[13px] text-slate">{event.ticketsSold} of {event.capacity} spots booked</p>
      <ProgressBar
        className="mt-2"
        label="Spots booked"
        value={booked}
        tone={spotsLeft(event) === 0 ? 'danger' : 'sun'}
      />
    </div>
  );
}
