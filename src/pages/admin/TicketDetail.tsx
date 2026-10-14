import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Ticket as TicketIcon } from 'lucide-react';
import { adminTicketsApi, type AdminTicketDetail } from '@/api/endpoints';
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, Skeleton, type BadgeTone } from '@/components/ui';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { useCan } from '@/features/auth/useCan';
import { formatDate, formatNaira, formatTime } from '@/lib/format';

// TKT-020: one ticket for admins: status, holder, payment and check-ins, with its history from the payment record,
// check-in records and the audit log. Linked from participants, transactions and the top-bar search.

const STATUS: Record<AdminTicketDetail['status'], { label: string; tone: BadgeTone }> = {
  confirmed: { label: 'Confirmed · not checked in', tone: 'blue' },
  checked_in: { label: 'Checked in', tone: 'green' },
  refund_requested: { label: 'Refund requested', tone: 'amber' },
  refunded: { label: 'Refunded', tone: 'gray' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};
const METHOD = { qr: 'QR scan', qr_offline: 'QR scan (offline)', manual: 'Manual' } as const;
const when = (iso: string) => `${formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${formatTime(iso)}`;

export default function TicketDetail() {
  const { code = '' } = useParams();
  const canMoney = useCan('sell_refund_tickets');
  const canHikers = useCan('view_hikers');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'ticket', code], queryFn: () => adminTicketsApi.detail(code) });
  useAdminTitle('Ticket', code.toUpperCase());

  if (isLoading) return <Skeleton className="h-[560px]" />;
  if (!data) {
    return (
      <EmptyState
        icon={TicketIcon}
        title={isError ? 'We couldn’t load this ticket' : 'Ticket not found'}
        body={isError ? 'Check your connection and try again.' : 'Check the ticket ID, e.g. HIP-7Q4K-2291.'}
        action={isError ? <Button onClick={() => refetch()}>Try again</Button> : <ButtonLink to="/admin/events">Back to events</ButtonLink>}
      />
    );
  }

  const t = data;
  const pay = t.payment;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="text-sm text-slate">
          <Link to="/admin/events" className="font-semibold text-forest hover:underline">Events</Link> /{' '}
          <Link to={`/admin/events/${t.event.id}/participants?q=${encodeURIComponent(t.code)}`} className="font-semibold text-forest hover:underline">{t.event.title}</Link> / <span className="font-mono">{t.code}</span>
        </nav>
        <ButtonLink to={`/admin/events/${t.event.id}/participants?q=${encodeURIComponent(t.code)}`} variant="secondary">Correct attendance</ButtonLink>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <h2 className="font-mono text-2xl">{t.code}</h2>
        <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
        {t.holder.isGuest && <Badge tone="gray">Guest</Badge>}
      </div>
      {t.issue && <Alert tone="warning" className="mt-4">This ticket has an open offline sync issue. <Link to={`/admin/checkin/${t.event.id}/sync`} className="font-bold text-forest underline">Review it</Link></Alert>}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-lg font-bold">Ticket</h3>
          <dl className="mt-3 divide-y divide-line text-sm">
            <Row label="Event"><Link to={`/admin/events/${t.event.id}/participants`} className="font-semibold text-forest hover:underline">{t.event.title}</Link></Row>
            <Row label="Date">{when(t.event.startsAt)}</Row>
            <Row label="Ticket type">{t.ticketTypeName}</Row>
          </dl>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-bold">Holder</h3>
          <dl className="mt-3 divide-y divide-line text-sm">
            <Row label="Name">{t.holder.hikerId && canHikers ? <Link to={`/admin/hikers/${encodeURIComponent(t.holder.hikerId)}`} className="font-semibold text-forest hover:underline">{t.holder.name}</Link> : t.holder.name}</Row>
            <Row label="Email">{t.holder.email ?? '—'}</Row>
            <Row label="Phone">{t.holder.phone ?? '—'}</Row>
          </dl>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-bold">Payment</h3>
          {!canMoney ? (
            <p className="mt-3 text-sm text-slate">Your role can’t see payment details.</p>
          ) : !pay ? (
            <p className="mt-3 text-sm text-slate">No payment record (free ticket or issued by an admin).</p>
          ) : (
            <dl className="mt-3 divide-y divide-line text-sm">
              <Row label="Reference"><Link to={`/admin/transactions?q=${encodeURIComponent(pay.reference)}&period=custom&from=2000-01-01&to=2100-12-31`} className="font-mono font-semibold text-forest hover:underline">{pay.reference}</Link></Row>
              <Row label="Buyer">{pay.buyerName}{pay.buyerEmail ? ` · ${pay.buyerEmail}` : ''}</Row>
              <Row label="Ticket price">{formatNaira(pay.ticketKobo)}</Row>
              <Row label="Paystack fee">{pay.feeKobo ? formatNaira(pay.feeKobo) : '₦0'}</Row>
              <Row label="Amount charged">{pay.amountKobo ? formatNaira(pay.amountKobo) : '₦0'}</Row>
              <Row label="Paid">{when(pay.createdAt)}</Row>
              {pay.refund && <Row label="Refund">{formatNaira(pay.refund.amountKobo)} · {pay.refund.decision ?? 'waiting for review'}</Row>}
            </dl>
          )}
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-bold">Check-in</h3>
          {t.checkIn ? (
            <dl className="mt-3 divide-y divide-line text-sm">
              <Row label="Time">{when(t.checkIn.at)}</Row>
              <Row label="Method">{METHOD[t.checkIn.method]}</Row>
              <Row label="Staff">{t.checkIn.staffName}{t.checkIn.gate ? ` · ${t.checkIn.gate}` : ''}</Row>
              {t.checkIn.flagged && <Row label="Flag">Admitted while not in the offline list</Row>}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate">Not checked in.</p>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-6">
        <h3 className="text-lg font-bold">Status history</h3>
        <ol className="mt-4 space-y-4 border-l-2 border-line pl-5">
          {t.history.map((h, i) => (
            <li key={i} className="relative">
              <span aria-hidden className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-white bg-forest" />
              <p className="text-sm font-semibold text-ink">{h.label}</p>
              <p className="text-xs text-slate">
                <time dateTime={h.at}>{when(h.at)}</time>{h.by ? ` · ${h.by}` : ''}
              </p>
              {h.detail && <p className="mt-0.5 break-words text-sm text-slate">{h.detail}</p>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-slate">{label}</dt>
      <dd className="min-w-0 break-words text-right text-ink">{children}</dd>
    </div>
  );
}
