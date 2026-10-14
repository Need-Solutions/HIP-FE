import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Ticket } from 'lucide-react';
import { checkoutApi, ticketsApi } from '@/api/endpoints';
import { Alert, Button, ButtonLink, EmptyState, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { HolderLine, MyTicketCard, OfflineChip } from '@/components/tickets/MyTicketCard';
import { RefundDialog } from '@/components/tickets/RefundDialog';
import { usePaystackPopup } from '@/features/checkout/usePaystackPopup';
import { loadOfflineTicket } from '@/features/tickets/offlineTickets';
import { encodeSelection } from '@/lib/events';
import { formatDate, formatNaira, formatTime } from '@/lib/format';
import { methodLabel } from '@/lib/history';
import { REFUND_POLICY, canRequestRefund } from '@/lib/refunds';
import { ticketStatus, ticketTab, type TicketTab } from '@/lib/tickets';
import { useCountdown } from '@/lib/useCountdown';
import type { MyTicket, PendingOrder } from '@/types/domain';
import { errorMessage, notifyError } from '@/lib/notify';
import { useBranding } from '@/features/branding/BrandingContext';

// Figma: "Hiker / My tickets" (TKT-016, TKT-019, TKT-021). Tabs: Upcoming, Past, Cancelled. Orders waiting for
// payment sit in Upcoming with their seat-hold countdown; they become tickets only once the backend verifies
// the payment (TKT-010), so "Complete payment" reopens Paystack and then polls on the checkout page.

const tabs: TicketTab[] = ['upcoming', 'past', 'cancelled'];
const tabLabel: Record<TicketTab, string> = { upcoming: 'Upcoming', past: 'Past', cancelled: 'Cancelled' };

type Row = { kind: 'ticket'; ticket: MyTicket; at: string } | { kind: 'pending'; order: PendingOrder; at: string };

export default function MyTickets() {
  const [params, setParams] = useSearchParams();
  const tab: TicketTab = tabs.includes(params.get('tab') as TicketTab) ? (params.get('tab') as TicketTab) : 'upcoming';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const paystack = usePaystackPopup();
  const [refunding, setRefunding] = useState<MyTicket | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'info'; text: string } | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['myTickets'], queryFn: ticketsApi.mine });

  const rows: Record<TicketTab, Row[]> = { upcoming: [], past: [], cancelled: [] };
  for (const t of data?.tickets ?? []) rows[ticketTab(t)].push({ kind: 'ticket', ticket: t, at: t.event.startsAt });
  for (const o of data?.pending ?? []) rows.upcoming.push({ kind: 'pending', order: o, at: o.event.startsAt });
  rows.upcoming.sort((a, b) => a.at.localeCompare(b.at));
  rows.past.sort((a, b) => b.at.localeCompare(a.at));
  rows.cancelled.sort((a, b) => b.at.localeCompare(a.at));

  const setTab = (next: TicketTab) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'upcoming') p.delete('tab');
      else p.set('tab', next);
      return p;
    }, { replace: true });

  const completePayment = async (order: PendingOrder) => {
    setNotice(null);
    setPaying(order.checkoutId);
    try {
      const checkout = await checkoutApi.resume(order.checkoutId);
      const result = await paystack.pay(checkout, order.buyerEmail, order.paymentChannel);
      if (result.outcome === 'success') {
        const items = encodeSelection(Object.fromEntries(order.lines.map((l) => [l.ticketTypeId, l.quantity])));
        navigate(`/checkout/${order.event.id}?items=${items}&checkout=${checkout.checkoutId}`);
        return;
      }
      if (result.outcome === 'cancelled') setNotice({ tone: 'info', text: 'Payment cancelled. Your seats are held until the timer runs out.' });
      else notifyError(result.message, { id: 'complete-payment' });
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t reopen the payment. Please try again.'), { id: 'complete-payment' });
      void refetch();
    } finally {
      setPaying(null);
    }
  };

  return (
    <div>
      <PageHeader title="My tickets" subtitle="Show the QR code at check-in. Tickets also work offline once opened." />

      <Tabs
        idPrefix="tickets"
        label="Ticket groups"
        value={tab}
        onChange={setTab}
        options={tabs.map((t) => ({ value: t, label: tabLabel[t], count: data ? rows[t].length : undefined }))}
      />

      {notice && <Alert tone={notice.tone} className="mt-6">{notice.text}</Alert>}

      <section id="tickets-panel" role="tabpanel" aria-labelledby={`tickets-tab-${tab}`} className="mt-7 space-y-6">
        {isLoading ? (
          <>
            <Skeleton className="h-[212px]" />
            <Skeleton className="h-[212px]" />
          </>
        ) : isError && !data ? (
          <EmptyState icon={Ticket} title="We couldn’t load your tickets" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />
        ) : rows[tab].length === 0 ? (
          <EmptyTab tab={tab} />
        ) : (
          rows[tab].map((row) =>
            row.kind === 'pending' ? (
              <PendingCard key={row.order.checkoutId} order={row.order} busy={paying === row.order.checkoutId} disabled={!!paying} onPay={() => completePayment(row.order)} onExpired={() => refetch()} />
            ) : (
              <TicketCard key={row.ticket.code} ticket={row.ticket} tab={tab} onRefund={() => setRefunding(row.ticket)} />
            ),
          )
        )}
      </section>

      <aside className="mt-10 flex gap-3.5 rounded-2xl border border-line bg-white p-5 md:px-6">
        <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-forest" />
        <div>
          <h2 className="text-[15px] font-bold">Refund policy</h2>
          <p className="mt-1 text-sm text-slate">{REFUND_POLICY}</p>
        </div>
      </aside>

      <RefundDialog
        ticket={refunding}
        onClose={() => setRefunding(null)}
        onDone={(refund) => {
          setRefunding(null);
          setNotice({ tone: 'success', text: `Refund of ${formatNaira(refund.amountKobo)} requested. We’ll email you when it’s processed.` });
          void queryClient.invalidateQueries({ queryKey: ['myTickets'] });
        }}
      />
      {paystack.dialog}
    </div>
  );
}

function TicketCard({ ticket: t, tab, onRefund }: { ticket: MyTicket; tab: TicketTab; onRefund: () => void }) {
  const { name: brand } = useBranding();
  const line = `${t.ticketTypeName} · ${t.code}`;
  const holder = !t.heldByMe && <HolderLine name={t.holder.fullName} />;

  if (tab === 'past') {
    // Outcome comes from check-ins only: no check-in means missed (HIS-004).
    const attended = !!t.checkIn;
    return (
      <MyTicketCard
        event={t.event}
        badge={attended ? { label: 'Attended', tone: 'green' } : { label: 'Missed', tone: 'gray' }}
        ticketLine={line}
        muted
        extra={
          <>
            {holder}
            <p className="text-sm text-slate">
              {t.checkIn ? `Checked in ${formatTime(t.checkIn.at)} · ${methodLabel[t.checkIn.method]}` : 'No check-in recorded'}
            </p>
          </>
        }
        actions={<ButtonLink to={`/events/${t.event.slug}`} variant="secondary" className="sm:w-[170px]">View hike</ButtonLink>}
      />
    );
  }

  if (tab === 'cancelled') {
    const eventCancelled = t.eventStatus === 'cancelled';
    return (
      <MyTicketCard
        event={t.event}
        badge={t.status === 'refunded' ? ticketStatus.refunded : ticketStatus.cancelled}
        ticketLine={line}
        muted
        extra={
          <>
            {holder}
            {eventCancelled && <p className="text-sm font-semibold text-danger">This hike was cancelled by {brand}.</p>}
            {t.refund?.status === 'refunded' && (
              <p className="text-sm text-slate">
                {formatNaira(t.refund.amountKobo)} refunded{t.refund.processedAt ? ` on ${formatDate(t.refund.processedAt, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.
              </p>
            )}
          </>
        }
      />
    );
  }

  const requested = t.refund?.status === 'requested';
  const offline = !!loadOfflineTicket(t.code);
  return (
    <MyTicketCard
      event={t.event}
      badge={requested ? { label: 'Refund requested', tone: 'amber' } : ticketStatus[t.status]}
      ticketLine={line}
      extra={
        (holder || requested || offline) && (
          <>
            {holder}
            {requested && (
              <p className="text-sm text-slate">
                {formatNaira(t.refund!.amountKobo)} refund requested on {formatDate(t.refund!.requestedAt)}. The ticket stays valid until it’s processed.
              </p>
            )}
            {offline && <OfflineChip />}
          </>
        )
      }
      actions={
        <>
          <ButtonLink to={`/account/tickets/${t.code}`} className="sm:w-[170px]">View QR ticket</ButtonLink>
          <ButtonLink to={`/account/tickets/${t.code}?print=1`} variant="secondary" className="sm:w-[170px]">Download PDF</ButtonLink>
        </>
      }
      footer={
        canRequestRefund(t) && (
          <button type="button" onClick={onRefund} className="font-semibold text-slate underline-offset-2 hover:text-ink hover:underline">
            Request refund
          </button>
        )
      }
    />
  );
}

function PendingCard({ order, busy, disabled, onPay, onExpired }: { order: PendingOrder; busy: boolean; disabled: boolean; onPay: () => void; onExpired: () => void }) {
  const { msLeft, expired } = useCountdown(order.holdExpiresAt);
  const minutes = Math.ceil(msLeft / 60_000);
  const lines = order.lines.map((l) => (l.quantity > 1 ? `${l.ticketTypeName} × ${l.quantity}` : l.ticketTypeName)).join(', ');
  return (
    <MyTicketCard
      event={order.event}
      badge={expired ? { label: 'Hold expired', tone: 'gray' } : ticketStatus.pending}
      ticketLine={`${lines} · Ref ${order.reference}`}
      extra={<p className="text-sm font-semibold text-ink">{formatNaira(order.amountKobo)} to pay</p>}
      actions={
        expired ? (
          <Button variant="secondary" className="sm:w-[170px]" onClick={onExpired}>Refresh</Button>
        ) : (
          <Button variant="accent" className="sm:w-[170px]" onClick={onPay} disabled={disabled}>{busy ? 'Opening…' : 'Complete payment'}</Button>
        )
      }
      footer={
        expired ? (
          <span className="text-slate">
            Seats released. <Link to={`/events/${order.event.slug}`} className="font-bold text-forest underline">Book again</Link>
          </span>
        ) : (
          // role="timer" isn't read out on every tick.
          <span className="font-semibold text-sun-dark" role="timer">
            Hold expires in {minutes > 1 ? `${minutes} min` : `${Math.ceil(msLeft / 1000)} sec`}
          </span>
        )
      }
    />
  );
}

function EmptyTab({ tab }: { tab: TicketTab }) {
  if (tab === 'upcoming') {
    return <EmptyState icon={Ticket} title="No upcoming hikes" body="When you book a hike, your QR ticket shows up here." action={<ButtonLink to="/events">Browse hikes</ButtonLink>} />;
  }
  if (tab === 'past') return <EmptyState icon={Ticket} title="No past hikes yet" body="Hikes you’ve booked move here once they’ve happened." />;
  return <EmptyState icon={Ticket} title="Nothing cancelled" body="Cancelled and refunded tickets show up here." />;
}
