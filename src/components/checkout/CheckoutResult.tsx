import { Link } from 'react-router-dom';
import { Check, Loader2, XCircle } from 'lucide-react';
import type { CheckoutStatus } from '@/api/endpoints';
import { Button, ButtonLink } from '@/components/ui';
import { TicketSummary } from '@/components/tickets/TicketSummary';
import { downloadEventIcs } from '@/lib/calendar';

// Step 4 views. Tickets appear only once the backend reports the checkout as paid (TKT-010).

export function PaymentPending({ slow }: { slow: boolean }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center py-10 text-center">
      <Loader2 size={40} aria-hidden className="animate-spin text-forest motion-reduce:animate-none" />
      <h2 className="mt-5 text-xl">Confirming your payment…</h2>
      <p className="mt-2 max-w-md text-sm text-slate">
        {slow
          ? 'Paystack is taking longer than usual. You can close this page: we’ll email and WhatsApp your ticket as soon as the payment is confirmed.'
          : 'We’re checking with Paystack. This usually takes a few seconds. Please keep this page open.'}
      </p>
      {slow && <Link to="/find-ticket" className="mt-4 text-sm font-semibold text-forest hover:underline">Find my ticket later</Link>}
    </div>
  );
}

export function PaymentFailed({ reason, onRetry }: { reason?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center py-10 text-center">
      <XCircle size={44} aria-hidden className="text-danger" />
      <h2 className="mt-5 text-xl">Your payment didn’t go through</h2>
      <p className="mt-2 max-w-md text-sm text-slate">{reason ?? 'Paystack declined the payment. You haven’t been charged.'}</p>
      <Button className="mt-6" onClick={onRetry}>Try again</Button>
    </div>
  );
}

/** Figma "Hiker / Checkout – confirmed" (account) and "– guest confirmed". */
export function CheckoutConfirmation({ status }: { status: CheckoutStatus }) {
  const [first] = status.tickets;
  if (!first) return null;
  const { buyer } = status;
  const firstName = buyer.fullName.split(' ')[0];
  const many = status.tickets.length > 1;
  // Attendees other than the buyer who gave an email or phone get their own copy.
  const sharedWithOthers = status.tickets.some((t) => t.holder.fullName !== buyer.fullName && (t.holder.email || t.holder.phone));

  return (
    <div>
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-mint text-forest sm:size-14"><Check size={28} aria-hidden /></span>
        <div>
          <h2 className="text-xl sm:text-2xl">Payment confirmed. You’re going{status.isGuest ? `, ${firstName}` : ''}!</h2>
          <p className="mt-1 text-sm text-slate">
            {status.isGuest
              ? `${many ? `${status.tickets.length} tickets` : 'Ticket'} sent to ${buyer.email} and WhatsApp`
              : `Ref ${status.reference} · Receipt sent to ${buyer.email}`}
          </p>
        </div>
      </div>

      {many && (
        <p className="mt-6 text-sm text-slate">
          One ticket per hiker, each with its own name and QR code.{sharedWithOthers ? ' We also sent each person their ticket where you gave their email or phone.' : ''}
        </p>
      )}
      <ul aria-label="Your tickets" className={many ? 'mt-3 space-y-4' : 'mt-6 space-y-4'}>
        {status.tickets.map((t) => (
          <li key={t.code}>
            <TicketSummary
              ticket={t}
              footer={status.isGuest && !many ? <Button variant="secondary" onClick={() => window.print()} className="print:hidden">Download PDF</Button> : undefined}
            />
          </li>
        ))}
      </ul>
      {(many || !status.isGuest) && <p className="mt-3 text-[13px] text-slate-mute">Show this code at the trailhead. It works even without signal.</p>}

      {status.isGuest ? (
        <>
          {status.accountCreated ? (
            <div className="mt-6 rounded-2xl bg-sand p-5">
              <p className="font-bold text-ink">Your account is ready</p>
              <p className="mt-1 text-sm text-slate">We sent a link to {buyer.email} to verify it. {many ? 'Your ticket is' : 'This ticket is'} already saved there.</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-sand p-5 sm:flex-row sm:items-center sm:justify-between print:hidden">
              <div>
                <p className="text-[17px] font-bold text-ink">Save {many ? 'your ticket' : 'this ticket'} to an account?</p>
                <p className="mt-1 text-sm text-slate">Keep all your tickets in one place and track every hike you finish. Your past guest tickets join automatically.</p>
              </div>
              <ButtonLink to={`/signup?${new URLSearchParams({ name: buyer.fullName, email: buyer.email, phone: buyer.phone })}`} className="shrink-0">
                Create free account
              </ButtonLink>
            </div>
          )}
          <p className="mt-6 text-[13px] text-slate-mute print:hidden">
            You can always find {many ? 'these tickets' : 'this ticket'} again at <Link to="/find-ticket" className="font-semibold text-forest hover:underline">{window.location.host}/find-ticket</Link>
          </p>
          {many && (
            <div className="mt-4 flex flex-wrap gap-3 print:hidden">
              <Button variant="secondary" onClick={() => window.print()}>Download PDF</Button>
              <Button variant="secondary" onClick={() => downloadEventIcs(first.event, `Ticket ${first.code}`)}>Add to calendar</Button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3 print:hidden">
          <ButtonLink to="/account/tickets" size="lg">View my tickets</ButtonLink>
          <Button size="lg" variant="secondary" onClick={() => window.print()}>Download PDF</Button>
          <Button size="lg" variant="secondary" onClick={() => downloadEventIcs(first.event, `Ticket ${first.code}`)}>Add to calendar</Button>
        </div>
      )}
    </div>
  );
}
