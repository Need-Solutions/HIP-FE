import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ban, Check, Mail, RotateCcw, UserRound } from 'lucide-react';
import { adminPeopleApi, type AdminHikerProfile, type HikerParticipation } from '@/api/endpoints';
import { Alert, Avatar, Badge, Button, ButtonLink, Card, Dialog, EmptyState, Skeleton, StatCard, Table, TBody, Td, Textarea, Th, THead, Tr, type BadgeTone } from '@/components/ui';
import { HikerStatusBadge } from '@/components/admin/HikerStatusBadge';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { useCan } from '@/features/auth/useCan';
import { formatDate, formatNairaCompact, formatTime } from '@/lib/format';
import { attendanceRate, formatPercent } from '@/lib/metrics';
import { errorMessage, notifyError } from '@/lib/notify';

// Figma: "Admin / Hiker profile" (USR-*, HIS-*). Stats come from check-ins only; the attendance rate is
// lib/metrics attendanceRate (attended ÷ attended + no-shows). Suspending or reactivating an account needs a reason,
// which goes to the audit log; suspended accounts can't log in.

const MonthlyBars = lazy(() => import('@/components/admin/AnalyticsCharts').then((m) => ({ default: m.MonthlyBars })));

const outcome: Record<HikerParticipation['outcome'], { label: string; tone: BadgeTone }> = {
  attended: { label: 'Attended', tone: 'green' },
  no_show: { label: 'No-show', tone: 'amber' },
  refunded: { label: 'Refunded', tone: 'gray' },
  cancelled: { label: 'Event cancelled', tone: 'red' },
  upcoming: { label: 'Upcoming', tone: 'blue' },
};
const methodLabel = { qr: 'QR', qr_offline: 'QR offline', manual: 'Manual' } as const;

export default function HikerProfile() {
  const { hikerId = '' } = useParams();
  const maySuspend = useCan('suspend_hikers');
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'hiker', hikerId], queryFn: () => adminPeopleApi.hiker(hikerId) });
  useAdminTitle('Hiker profile');

  if (isLoading) return <Skeleton className="h-[600px]" />;
  if (!data) {
    return (
      <EmptyState
        icon={UserRound}
        title={isError ? 'We couldn’t load this hiker' : 'Hiker not found'}
        body={isError ? 'Check your connection and try again.' : 'They may have been merged into another account.'}
        action={isError ? <Button onClick={() => refetch()}>Try again</Button> : <ButtonLink to="/admin/hikers">Back to hikers</ButtonLink>}
      />
    );
  }

  const { hiker, stats } = data;
  const canSuspend = maySuspend && !hiker.isGuest;
  const suspended = hiker.status === 'suspended';
  const rate = attendanceRate(stats.attended, stats.eligible);
  const kind = hiker.isGuest ? 'Guest' : hiker.hikesAttended > 1 ? 'Returning hiker' : hiker.hikesAttended === 1 ? 'First-timer' : 'New hiker';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="text-sm text-slate">
          <Link to="/admin/hikers" className="font-semibold text-forest hover:underline">Hikers</Link> / {hiker.name}
        </nav>
        <div className="flex gap-3">
          {canSuspend &&
            (suspended ? (
              <Button variant="secondary" onClick={() => setDialog('reactivate')}><RotateCcw size={16} aria-hidden /> Reactivate</Button>
            ) : (
              <Button variant="secondary" className="text-danger" onClick={() => setDialog('suspend')}><Ban size={16} aria-hidden /> Suspend</Button>
            ))}
          {hiker.email && (
            <a href={`mailto:${hiker.email}`} className={buttonClasses({})}>
              <Mail size={16} aria-hidden /> Message
            </a>
          )}
        </div>
      </div>

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {hiker.suspension && (
        <Alert tone="error" title={`Suspended ${formatDate(hiker.suspension.at, { day: 'numeric', month: 'short', year: 'numeric' })} by ${hiker.suspension.by}`} className="mt-4">
          {hiker.suspension.reason} They can’t log in or buy tickets with this account until it’s reactivated.
        </Alert>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="p-6">
          <div className="text-center">
            <Avatar name={hiker.name} size="lg" className="mx-auto" />
            <h2 className="mt-4 text-xl">{hiker.name}</h2>
            <p className="mt-1 text-[13px] text-slate">{kind} · since {formatDate(hiker.joinedAt, { month: 'short', year: 'numeric' })}</p>
            <div className="mt-3"><HikerStatusBadge status={hiker.status} /></div>
          </div>
          <dl className="mt-6 divide-y divide-line border-t border-line text-sm">
            <Row label="Email" value={hiker.email ?? '—'} verified={hiker.emailVerified} />
            <Row label="Phone" value={hiker.phone ?? '—'} verified={hiker.phoneVerified} />
            <Row label="Emergency" value={hiker.emergencyContact ? `${hiker.emergencyContact.name} · ${hiker.emergencyContact.phone}` : '—'} />
            <Row label={hiker.isGuest ? 'Guest ID' : 'User ID'} value={(hiker.userId ?? hiker.id).toUpperCase().replace('_', '-')} />
          </dl>
        </Card>

        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Hikes attended" value={String(stats.attended)} sub="From check-ins" />
            <StatCard label="Attendance rate" value={formatPercent(rate, 0)} sub={stats.eligible ? `${stats.attended} of ${stats.eligible}` : 'no past bookings'} />
            <StatCard label="Total spent" value={formatNairaCompact(stats.spentKobo)} sub="net of refunds" />
          </div>
          <Card className="p-6">
            <h2 className="text-lg">Attendance by month</h2>
            <p className="mt-0.5 text-[13px] text-slate">Check-ins, last 8 months</p>
            <div className="mt-4">
              <Suspense fallback={<Skeleton className="h-[200px]" />}>
                <MonthlyBars data={data.monthly} />
              </Suspense>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-5 overflow-hidden">
        <h2 className="px-6 py-5 text-lg">Participation history</h2>
        {data.history.length === 0 ? (
          <p className="border-t border-line px-6 py-5 text-sm text-slate">No bookings yet.</p>
        ) : (
          <Table caption={`Participation history for ${hiker.name}`} minWidth={820}>
            <THead>
              <Th>Event</Th>
              <Th>Date</Th>
              <Th>Ticket</Th>
              <Th>Check-in</Th>
              <Th>Status</Th>
            </THead>
            <TBody>
              {data.history.map((h) => (
                <Tr key={h.ticketCode}>
                  <Td className="font-semibold">
                    <Link to={`/admin/events/${h.eventId}/participants?q=${encodeURIComponent(h.ticketCode)}`} className="hover:text-forest hover:underline">{h.eventTitle}</Link>
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(h.startsAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Td>
                  <Td className="whitespace-nowrap">
                    <span className="font-mono text-[13px]">{h.ticketCode.split('-').slice(0, 2).join('-')}</span> · {h.priceKobo === 0 ? 'Free' : h.ticketTypeName}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {h.checkIn ? [formatTime(h.checkIn.at), methodLabel[h.checkIn.method], h.checkIn.method === 'qr_offline' ? null : h.checkIn.staffName].filter(Boolean).join(' · ') : '—'}
                  </Td>
                  <Td><Badge tone={outcome[h.outcome].tone}>{outcome[h.outcome].label}</Badge></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <SuspendDialog
        mode={dialog}
        hikerId={hiker.id}
        name={hiker.name}
        onClose={() => setDialog(null)}
        onDone={(p) => {
          setDialog(null);
          setNotice(`${p.hiker.name} ${p.hiker.status === 'suspended' ? 'is suspended' : 'is active again'}. Saved to the audit log.`);
          queryClient.setQueryData(['admin', 'hiker', hiker.id], p);
          void queryClient.invalidateQueries({ queryKey: ['admin', 'hikers'] });
        }}
      />
    </div>
  );
}

function Row({ label, value, verified }: { label: string; value: string; verified?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <dt className="text-slate">{label}</dt>
      <dd className="min-w-0 break-words text-right font-semibold text-ink">
        {value}
        {verified && <Check size={14} aria-label="verified" className="ml-1 inline align-[-2px] text-forest" />}
      </dd>
    </div>
  );
}

const reasonSchema = z.object({ reason: z.string().trim().min(10, 'Give a reason of at least 10 characters. It goes in the audit log.').max(500, 'Keep it under 500 characters') });

function SuspendDialog({ mode, hikerId, name, onClose, onDone }: { mode: 'suspend' | 'reactivate' | null; hikerId: string; name: string; onClose: () => void; onDone: (p: AdminHikerProfile) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ reason: string }>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: '' } });
  const close = () => {
    reset();
    onClose();
  };
  const suspend = mode === 'suspend';
  return (
    <Dialog open={!!mode} onClose={close} title={suspend ? 'Suspend account' : 'Reactivate account'}>
      <form
        noValidate
        className="p-6"
        onSubmit={handleSubmit(async ({ reason }) => {
          try {
            const p = await adminPeopleApi.setHikerSuspended(hikerId, suspend, reason);
            reset();
            onDone(p);
          } catch (err) {
            notifyError(errorMessage(err, 'We couldn’t save that. Please try again.'), { id: 'suspend' });
          }
        })}
      >
        <h2 className="text-xl">{suspend ? `Suspend ${name}?` : `Reactivate ${name}?`}</h2>
        <p className="mt-2 text-sm text-slate">
          {suspend
            ? 'They won’t be able to log in or buy tickets. Tickets they already hold stay valid unless you refund them. The reason is saved to the audit log.'
            : 'They can log in and buy tickets again. The reason is saved to the audit log.'}
        </p>
        <Textarea label="Reason (required)" className="mt-4" rows={3} {...register('reason')} error={errors.reason?.message} />
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={close} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" variant={suspend ? 'danger' : 'primary'} disabled={isSubmitting}>{isSubmitting ? 'Saving…' : suspend ? 'Suspend account' : 'Reactivate account'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
