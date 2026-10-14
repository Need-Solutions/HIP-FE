import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mountain, TimerOff } from 'lucide-react';
import { checkoutApi, eventsApi, type CheckoutAttendee, type OrderItem } from '@/api/endpoints';
import { Button, ButtonLink, EmptyState, Skeleton, Stepper } from '@/components/ui';
import { OrderSummary, type SummaryLine } from '@/components/checkout/OrderSummary';
import { DetailsStep, type AttendeeSlot, type DetailsValues } from '@/components/checkout/DetailsStep';
import { PaymentStep } from '@/components/checkout/PaymentStep';
import { CheckoutConfirmation, PaymentFailed, PaymentPending } from '@/components/checkout/CheckoutResult';
import { useAuth } from '@/features/auth/AuthContext';
import { MAX_TICKETS_PER_ORDER, decodeSelection, purchaseBlocker, spotsLeft, ticketTypeRemaining } from '@/lib/events';
import { orderTotals } from '@/lib/fees';
import { useCountdown } from '@/lib/useCountdown';
import { normalisePhone } from '@/lib/validation';
import type { HikeEvent, TicketType } from '@/types/domain';

// Figma: "Hiker / Checkout – guest", "– details", "– payment", "– confirmed", "– guest confirmed"
// (TKT-006..TKT-011). Step 1 (Tickets) happens on the event page; the selection arrives as ?items=tt_1:2.
// Guest checkout is the default; an account is optional. Once Paystack reports success, ?checkout=<id> is added
// to the URL so a refresh keeps polling the backend instead of losing the order.

const STEPS = ['Tickets', 'Your details', 'Payment', 'Confirmation'];
const SLOW_AFTER_MS = 60_000;

interface Order {
  items: OrderItem[];
  lines: SummaryLine[];
  /** One per ticket, for naming each attendee. */
  slots: AttendeeSlot[];
  subtotalKobo: number;
}

/**
 * Checks the URL selection against live ticket types. Returns a reason when it can't be bought as asked.
 * `checkStock: false` after payment: the order is already paid, so selling out since then must not hide it.
 */
function buildOrder(raw: string | null, event: HikeEvent, types: TicketType[], checkStock = true): Order | { error: string } {
  const selection = decodeSelection(raw);
  const entries = Object.entries(selection);
  if (entries.length === 0) return { error: 'No tickets were selected.' };
  const total = entries.reduce((n, [, q]) => n + q, 0);
  if (total > MAX_TICKETS_PER_ORDER) return { error: `You can buy up to ${MAX_TICKETS_PER_ORDER} tickets in one order.` };
  if (checkStock && total > spotsLeft(event)) return { error: `Only ${spotsLeft(event)} spots are left on this hike.` };
  const lines: SummaryLine[] = [];
  const slots: AttendeeSlot[] = [];
  let subtotalKobo = 0;
  for (const [id, qty] of entries) {
    const t = types.find((x) => x.id === id);
    if (!t) return { error: 'One of the selected tickets is no longer available.' };
    if (checkStock && qty > ticketTypeRemaining(t)) return { error: `${t.name} tickets are sold out or no longer on sale.` };
    lines.push({ label: `${t.name} × ${qty}`, amountKobo: t.priceKobo * qty });
    for (let n = 0; n < qty; n++) slots.push({ ticketTypeId: t.id, typeName: t.name });
    subtotalKobo += t.priceKobo * qty;
  }
  return { items: entries.map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })), lines, slots, subtotalKobo };
}

export default function Checkout() {
  const { eventId = '' } = useParams();
  const [params] = useSearchParams();
  const { data: event, isLoading } = useQuery({ queryKey: ['event', 'id', eventId], queryFn: () => eventsApi.byId(eventId) });
  const { data: types } = useQuery({ queryKey: ['ticketTypes', eventId], queryFn: () => eventsApi.ticketTypes(eventId), enabled: !!event });

  if (isLoading || (event && !types)) return <CheckoutShell step={1}><CheckoutSkeleton /></CheckoutShell>;
  if (!event || !types) {
    return (
      <CheckoutShell step={1}>
        <EmptyState icon={Mountain} title="Hike not found" body="This hike may have been removed, or the link is wrong." action={<ButtonLink to="/events">Browse hikes</ButtonLink>} />
      </CheckoutShell>
    );
  }

  const checkoutId = params.get('checkout');
  const backToEvent = `/events/${event.slug}`;

  // After payment, the result view doesn't depend on live stock or the hold any more.
  if (checkoutId) {
    const paidOrder = buildOrder(params.get('items'), event, types, false);
    if (!('error' in paidOrder)) return <CheckoutResultView checkoutId={checkoutId} event={event} order={paidOrder} />;
  }

  const order = buildOrder(params.get('items'), event, types);

  const blocker = purchaseBlocker(event);
  const problem = blocker ?? ('error' in order ? order.error : null);
  if (problem || 'error' in order) {
    return (
      <CheckoutShell step={0}>
        <EmptyState icon={Mountain} title="We can’t check out this order" body={problem ?? undefined} action={<ButtonLink to={backToEvent}>Back to the hike</ButtonLink>} />
      </CheckoutShell>
    );
  }

  return <CheckoutFlow event={event} order={order} backToEvent={backToEvent} />;
}

function CheckoutFlow({ event, order, backToEvent }: { event: HikeEvent; order: Order; backToEvent: string }) {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const { user } = useAuth();
  const [step, setStep] = useState<'details' | 'payment'>('details');
  const [details, setDetails] = useState<DetailsValues | undefined>();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const itemsKey = order.items.map((i) => `${i.ticketTypeId}:${i.quantity}`).join(',');
  const hold = useQuery({
    queryKey: ['hold', event.id, itemsKey],
    queryFn: () => checkoutApi.hold({ eventId: event.id, items: order.items }),
    meta: { silentError: true }, // the page explains a failed hold and offers a way back
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const countdown = useCountdown(hold.data?.expiresAt);
  const { feeKobo, totalKobo } = orderTotals(order.subtotalKobo);

  // Move focus to the page heading when the step changes, so keyboard and screen reader users notice.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else headingRef.current?.focus();
  }, [step]);

  const toPayment = (values: DetailsValues) => {
    setDetails(values);
    setStep('payment');
  };

  const onPaid = (checkoutId: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('checkout', checkoutId);
      return next;
    });

  return (
    <CheckoutShell
      step={step === 'details' ? 1 : 2}
      headingRef={headingRef}
      summary={
        <OrderSummary event={event} lines={order.lines} feeKobo={feeKobo} totalKobo={totalKobo} holdLabel={hold.data ? countdown.label : undefined} holdExpired={countdown.expired} />
      }
    >
      {hold.isError ? (
        <EmptyState
          icon={TimerOff}
          title="We couldn’t hold your seats"
          body={(hold.error as Error).message || 'Those tickets may have just sold out.'}
          action={<ButtonLink to={backToEvent}>Back to the hike</ButtonLink>}
        />
      ) : (
        <>
          {countdown.expired && (
            <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl bg-warn-light p-4 text-sm text-ink sm:flex-row sm:items-center sm:justify-between">
              <span>Your seat hold expired, so the seats were released. Hold them again to carry on.</span>
              <Button size="sm" variant="secondary" onClick={() => hold.refetch()}>Hold my seats again</Button>
            </div>
          )}
          {step === 'details' ? (
            <DetailsStep user={user} slots={order.slots} initial={details} disabled={!hold.data || countdown.expired} onSubmit={toPayment} onBack={() => navigate(backToEvent)} />
          ) : (
            details &&
            hold.data && (
              <PaymentStep
                request={{
                  holdId: hold.data.holdId,
                  eventId: event.id,
                  items: order.items,
                  buyer: buyerOf(details),
                  attendees: attendeesOf(details, order.slots),
                  emergencyContact: { name: details.emergencyName.trim(), phone: normalisePhone(details.emergencyPhone) },
                  createAccount: !user && details.createAccount,
                  whatsappReminders: !!user && details.whatsappReminders,
                }}
                totalKobo={totalKobo}
                disabled={countdown.expired}
                onPaid={onPaid}
                onBack={() => setStep('details')}
              />
            )
          )}
        </>
      )}
    </CheckoutShell>
  );
}

const buyerOf = (d: DetailsValues) => ({ fullName: d.fullName.trim(), email: d.email.trim(), phone: normalisePhone(d.phone) });

/** Maps the form's attendee rows to one CheckoutAttendee per ticket. "Same as me" copies the buyer. */
function attendeesOf(d: DetailsValues, slots: AttendeeSlot[]): CheckoutAttendee[] {
  return slots.map((slot, i) => {
    const a = d.attendees[i];
    if (!a || a.sameAsBuyer) return { ticketTypeId: slot.ticketTypeId, ...buyerOf(d) };
    return {
      ticketTypeId: slot.ticketTypeId,
      fullName: a.fullName.trim(),
      email: a.email.trim() || undefined,
      phone: a.phone.trim() ? normalisePhone(a.phone) : undefined,
    };
  });
}

function CheckoutResultView({ checkoutId, event, order }: { checkoutId: string; event: HikeEvent; order: Order }) {
  const [, setParams] = useSearchParams();
  const [startedAt] = useState(() => Date.now());
  const { data, isError } = useQuery({
    queryKey: ['checkout', checkoutId],
    queryFn: () => checkoutApi.status(checkoutId),
    meta: { silentError: true }, // polling: the page switches to its "taking longer" state instead
    refetchInterval: (q) => (q.state.data?.status === 'paid' || q.state.data?.status === 'failed' ? false : 2000),
  });
  const slow = Date.now() - startedAt > SLOW_AFTER_MS || isError;

  const retry = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('checkout');
      return next;
    });

  const paid = data?.status === 'paid';
  // The backend's amount is the real one; the line items are what was ordered.
  const totalKobo = data?.amountKobo ?? orderTotals(order.subtotalKobo).totalKobo;

  return (
    <CheckoutShell
      step={paid ? STEPS.length : 3}
      summary={<OrderSummary event={event} lines={order.lines} feeKobo={totalKobo - order.subtotalKobo} totalKobo={totalKobo} />}
    >
      {paid ? <CheckoutConfirmation status={data} /> : data?.status === 'failed' ? <PaymentFailed reason={data.failureReason} onRetry={retry} /> : <PaymentPending slow={slow} />}
    </CheckoutShell>
  );
}

/** Page frame shared by every step: title, stepper, form card and the order summary. */
function CheckoutShell({
  step,
  summary,
  headingRef,
  children,
}: {
  step: number;
  summary?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full bg-canvas print:bg-white">
      <div className="container-page py-8 md:py-12">
        <h1 ref={headingRef} tabIndex={-1} className="text-[26px] focus:outline-none md:text-[30px] print:hidden">Checkout</h1>
        <Stepper className="mt-6 print:hidden" label="Checkout progress" steps={STEPS} current={step} />
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
          <section className="card order-2 p-5 md:p-6 lg:order-1">{children}</section>
          {summary && <div className="order-1 lg:order-2 lg:sticky lg:top-6 lg:self-start print:hidden">{summary}</div>}
        </div>
      </div>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading checkout">
      <Skeleton className="h-11" />
      <Skeleton className="h-6 w-48" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-16" />
    </div>
  );
}
