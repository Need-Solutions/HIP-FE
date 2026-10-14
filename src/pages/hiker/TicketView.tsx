import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, Ticket } from 'lucide-react';
import { ticketsApi } from '@/api/endpoints';
import { Button, ButtonLink, EmptyState, Skeleton } from '@/components/ui';
import { TicketPass } from '@/components/tickets/TicketPass';
import { useAuth } from '@/features/auth/AuthContext';
import { loadOfflineTicket, saveTicketOffline } from '@/features/tickets/offlineTickets';
import { downloadEventIcs } from '@/lib/calendar';
import { formatDate, formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { hasUsableQr } from '@/lib/tickets';
import { useBranding } from '@/features/branding/BrandingContext';

// Figma: "Hiker / Ticket (QR)" and "Mobile / Ticket (QR)" (TKT-014, TKT-015, TKT-018).
// Two routes: /account/tickets/:code for signed-in hikers, and /tickets/:code?token=… for guests arriving from
// their one-time link. Every ticket opened here is copied to the device so it still opens at a trailhead
// without signal; the copy is used only when the network request fails.

export default function TicketView() {
  const { name: brand } = useBranding();
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') ?? undefined;
  const inAccount = useLocation().pathname.startsWith('/account');
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ticket', code, token],
    queryFn: async () => {
      try {
        return { ticket: await ticketsApi.byCode(code, token), offlineSavedAt: null as string | null };
      } catch (err) {
        const cached = loadOfflineTicket(code);
        if (cached) return { ticket: cached.ticket, offlineSavedAt: cached.savedAt };
        throw err;
      }
    },
    retry: 1,
  });
  const ticket = data?.ticket;

  useEffect(() => {
    if (ticket && !data?.offlineSavedAt && hasUsableQr(ticket.status)) setSaved(saveTicketOffline(ticket));
  }, [ticket, data?.offlineSavedAt]);

  // "Download PDF" on My tickets links here with ?print=1: open the print dialog (Save as PDF) once it's loaded.
  const printRequested = params.get('print') === '1';
  const printed = useRef(false);
  useEffect(() => {
    if (!printRequested || !ticket || printed.current) return;
    // Let the QR render first. The flag is set when it fires, so StrictMode's re-run doesn't cancel it.
    const t = setTimeout(() => {
      printed.current = true;
      window.print();
    }, 300);
    return () => clearTimeout(t);
  }, [printRequested, ticket]);

  const backTo = inAccount || user ? '/account/tickets' : null;

  return (
    // On phones the ticket sits on the forest background from "Mobile / Ticket (QR)".
    <div className={cn('max-md:bg-forest max-md:pb-8', inAccount ? 'max-md:-mx-4 max-md:-my-10 max-md:px-4 sm:max-md:-mx-6 sm:max-md:px-6' : 'md:bg-canvas')}>
      <div className={cn(!inAccount && 'container-page', 'py-6 md:py-10')}>
        {backTo ? (
          <>
            <Link to={backTo} className="hidden items-center gap-1.5 text-sm font-bold text-forest hover:underline md:inline-flex print:hidden">
              <ArrowLeft size={16} aria-hidden /> Back to my tickets
            </Link>
            <Link to={backTo} className="inline-flex items-center gap-2 text-lg font-bold text-white md:hidden print:hidden">
              <ChevronLeft size={26} aria-hidden /> My ticket
            </Link>
          </>
        ) : (
          <p className="text-lg font-bold text-white md:hidden print:hidden">My ticket</p>
        )}

        <div className="mx-auto mt-6 grid max-w-[500px] gap-5 md:mt-8 md:max-w-none md:grid-cols-[minmax(0,500px)_220px] md:justify-center md:gap-7">
          {isLoading ? (
            <Skeleton className="h-[640px] rounded-3xl max-md:bg-white/10" />
          ) : isError && !data ? (
            <EmptyState
              icon={Ticket}
              title="We couldn’t load this ticket"
              body="Check your connection and try again. Tickets you’ve opened before on this device also work offline."
              action={<Button onClick={() => refetch()}>Try again</Button>}
            />
          ) : !ticket ? (
            <EmptyState
              icon={Ticket}
              title="We couldn’t find that ticket"
              body="The link may have expired or the ticket ID is wrong. We can send you a fresh link."
              action={<ButtonLink to="/find-ticket">Find my ticket</ButtonLink>}
            />
          ) : (
            <>
              <div>
                <TicketPass
                  ticket={ticket}
                  offlineNote={data?.offlineSavedAt ? 'Offline copy' : saved ? 'Saved for offline' : ''}
                />
                {data?.offlineSavedAt && (
                  <p className="mt-3 text-center text-xs text-white md:text-slate">
                    Couldn’t reach {brand}, so this is the copy saved {formatDate(data.offlineSavedAt)} at {formatTime(data.offlineSavedAt)}.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3 print:hidden">
                <Button variant="secondary" size="lg" block onClick={() => window.print()} className="max-md:border-0 max-md:text-forest">
                  Download PDF
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  block
                  className="max-md:hidden"
                  onClick={() => downloadEventIcs(ticket.event, `Ticket ${ticket.code}`)}
                >
                  Add to calendar
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
