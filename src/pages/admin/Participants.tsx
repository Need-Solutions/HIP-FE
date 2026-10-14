import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Search, Users } from 'lucide-react';
import { adminApi, type ParticipantRow } from '@/api/endpoints';
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, FilterChips, Input, Skeleton, StatCard, Table, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { AttendanceCorrectionDialog } from '@/components/admin/AttendanceCorrectionDialog';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { formatDate, formatTime } from '@/lib/format';
import { downloadText, toCsv } from '@/lib/csv';
import { attendanceRate, formatPercent } from '@/lib/metrics';

// Figma: "Admin / Event participants" (ATT-013..ATT-018). Live while staff scan. Attendance is check-ins only;
// the rate is lib/metrics.ts attendanceRate (checked in ÷ confirmed tickets). Corrections go through the
// Attendance correction dialog, which needs a reason and writes the audit log.

const LIVE_REFRESH_MS = 10_000;

const methodShort = { qr: 'QR', qr_offline: 'QR offline', manual: 'Manual' } as const;

function checkInText(r: ParticipantRow) {
  if (!r.checkIn) return '—';
  if (r.checkIn.flagged) return `${formatTime(r.checkIn.at)} · Admitted & flagged`;
  return [formatTime(r.checkIn.at), methodShort[r.checkIn.method], r.checkIn.method === 'qr_offline' ? null : r.checkIn.staffName].filter(Boolean).join(' · ');
}

function statusBadge(r: ParticipantRow) {
  if (r.ticketStatus !== 'confirmed') return <Badge tone="red" className="capitalize">{r.ticketStatus}</Badge>;
  if (r.issue?.kind === 'duplicate') return <Badge tone="amber">Duplicate scan</Badge>;
  if (r.issue) return <Badge tone="blue">Flagged</Badge>;
  return r.checkIn ? <Badge>Checked in</Badge> : <Badge tone="gray">Not checked in</Badge>;
}

export default function Participants() {
  const { eventId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [correcting, setCorrecting] = useState<ParticipantRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const q = params.get('q') ?? '';
  const filter = (['all', 'in', 'out', 'flagged'] as const).find((f) => f === params.get('filter')) ?? 'all';
  const setParam = (k: string, v: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (v && v !== 'all') p.set(k, v);
      else p.delete(k);
      return p;
    }, { replace: true });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'participants', eventId],
    queryFn: () => adminApi.participants(eventId),
    refetchInterval: (query) => (query.state.data?.attendanceClosedAt ? false : LIVE_REFRESH_MS),
  });
  useAdminTitle('Participants & attendance', data ? (data.attendanceClosedAt ? `Attendance closed ${formatDate(data.attendanceClosedAt)}, ${formatTime(data.attendanceClosedAt)}` : 'Live · updates as staff scan') : undefined);

  if (isLoading) return <Skeleton className="h-[600px]" />;
  if (!data) {
    return <EmptyState icon={Users} title="We couldn’t load the participants" body={isError ? 'Check your connection and try again.' : 'This event may have been removed.'} action={<Button onClick={() => refetch()}>Try again</Button>} />;
  }

  const { event, stats } = data;
  const valid = data.rows.filter((r) => r.ticketStatus === 'confirmed');
  const term = q.trim().toLowerCase();
  const shown = data.rows
    .filter((r) => (filter === 'in' ? !!r.checkIn : filter === 'out' ? r.ticketStatus === 'confirmed' && !r.checkIn : filter === 'flagged' ? !!r.issue : true))
    .filter((r) => !term || [r.holderName, r.email, r.phone, r.ticketCode].some((f) => f?.toLowerCase().includes(term)));
  const rate = attendanceRate(stats.checkedIn, stats.confirmed);

  const exportCsv = () => {
    const rows = [
      ['Hiker', 'Email', 'Phone', 'Guest', 'Ticket', 'Type', 'Ticket status', 'Checked in at', 'Method', 'By', 'Issue'],
      ...data.rows.map((r) => [
        r.holderName,
        r.email ?? '',
        r.phone ?? '',
        r.isGuest ? 'Yes' : 'No',
        r.ticketCode,
        r.ticketTypeName,
        r.ticketStatus,
        r.checkIn ? `${formatDate(r.checkIn.at, { day: 'numeric', month: 'short', year: 'numeric' })} ${formatTime(r.checkIn.at)}` : '',
        r.checkIn ? methodShort[r.checkIn.method] : '',
        r.checkIn?.staffName ?? '',
        r.issue?.kind ?? '',
      ]),
    ];
    downloadText(`${event.slug}-participants.csv`, toCsv(rows));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="text-sm text-slate">
          <Link to="/admin/events" className="font-semibold text-forest hover:underline">Events</Link> / {event.title} · {formatDate(event.startsAt)}
        </nav>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={exportCsv}><Download size={16} aria-hidden /> Export CSV</Button>
          {!data.attendanceClosedAt && <ButtonLink to={`/checkin/${event.id}/scan`}>Open check-in</ButtonLink>}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Confirmed tickets" value={String(stats.confirmed)} />
        <StatCard label="Checked in" value={String(stats.checkedIn)} sub={data.attendanceClosedAt ? 'final' : 'live'} />
        <StatCard label="Not checked in" value={String(Math.max(0, stats.confirmed - stats.checkedIn))} />
        <StatCard label="Attendance rate" value={formatPercent(rate)} sub={rate === null ? 'no confirmed tickets' : `${stats.checkedIn} ÷ ${stats.confirmed}`} />
        <StatCard label="Offline scans" value={String(stats.offlineScans + stats.offlineWaiting)} sub={stats.offlineWaiting ? `${stats.offlineWaiting} waiting on phones` : 'all synced'} />
      </div>

      {notice && <Alert tone="success" className="mt-5">{notice}</Alert>}

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <Input
            label="Search participants"
            className="w-full max-w-[340px] [&_label]:sr-only"
            icon={Search}
            filled
            placeholder="Name, email, phone or ticket ID"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
          />
          <FilterChips
            label="Show"
            value={filter}
            onChange={(v) => setParam('filter', v)}
            options={[
              { value: 'all', label: `All ${data.rows.length}` },
              { value: 'in', label: `Checked in ${stats.checkedIn}` },
              { value: 'out', label: `Not in ${valid.filter((r) => !r.checkIn).length}` },
              { value: 'flagged', label: `Flagged ${stats.flagged}` },
            ]}
          />
        </div>
        {shown.length === 0 ? (
          <EmptyState className="border-0" icon={Search} title="No one matches" body="Try another search or filter." />
        ) : (
          <Table caption={`Participants of ${event.title}`} minWidth={920}>
            <THead>
              <Th>Hiker</Th>
              <Th>Ticket</Th>
              <Th>Type</Th>
              <Th>Check-in</Th>
              <Th>Status</Th>
              <Th><span className="sr-only">Actions</span></Th>
            </THead>
            <TBody>
              {shown.map((r) => (
                <Tr key={r.ticketCode}>
                  <Td>
                    <p className="font-semibold">
                      {r.holderName} {r.isGuest && <Badge tone="gray" className="ml-1 align-middle">Guest</Badge>}
                    </p>
                    {r.email && <p className="text-xs text-slate">{r.email}</p>}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-[13px]"><Link to={`/admin/tickets/${encodeURIComponent(r.ticketCode)}`} className="text-forest hover:underline">{r.ticketCode}</Link></Td>
                  <Td>{r.ticketTypeName}</Td>
                  <Td className="whitespace-nowrap">{checkInText(r)}</Td>
                  <Td>{statusBadge(r)}</Td>
                  <Td className="text-right">
                    {r.issue ? (
                      <Link to={`/admin/checkin/${event.id}/sync`} className="text-sm font-bold text-forest hover:underline">Review</Link>
                    ) : r.ticketStatus === 'confirmed' ? (
                      <button type="button" onClick={() => setCorrecting(r)} aria-label={`${r.checkIn ? 'Edit check-in for' : 'Check in'} ${r.holderName}`} className="text-sm font-bold text-forest hover:underline">
                        {r.checkIn ? 'Edit' : 'Check in'}
                      </button>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <AttendanceCorrectionDialog
        eventId={event.id}
        eventStartsAt={event.startsAt}
        row={correcting}
        onClose={() => setCorrecting(null)}
        onSaved={(row) => {
          setCorrecting(null);
          setNotice(`${row.holderName}: ${row.checkIn ? `checked in at ${formatTime(row.checkIn.at)}` : 'marked not checked in'}. Saved to the audit log.`);
          void queryClient.invalidateQueries({ queryKey: ['admin'] });
        }}
      />
    </div>
  );
}
