import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CircleCheck, RefreshCw } from 'lucide-react';
import { adminApi, type SyncReview } from '@/api/endpoints';
import { Alert, Badge, Button, Card, Dialog, EmptyState, Skeleton, StatCard, Table, TBody, Td, Textarea, Th, THead, Tr } from '@/components/ui';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { formatDate, formatTime } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';
import type { ScanBy, SyncConflict } from '@/types/domain';

// Figma: "Admin / Offline sync review" (CLAUDE.md "Offline check-in" 4). The server already kept the earliest
// scan of each ticket; admins confirm that, and confirm or reject tickets admitted although they weren't in a
// phone's offline list. Every decision goes to the audit log; rejecting removes the check-in and needs a reason.

const kindLabel: Record<SyncConflict['kind'], { label: string; tone: 'amber' | 'blue' | 'red' }> = {
  duplicate: { label: 'Duplicate scan', tone: 'amber' },
  not_in_list: { label: 'Not in offline list', tone: 'blue' },
  reported: { label: 'Reported at the gate', tone: 'red' },
};

const scan = (s: ScanBy) => `${s.gate ? `${s.gate} ` : ''}${formatTime(s.at)} (${s.staffName})`;
const resolutionLabel: Record<NonNullable<SyncConflict['resolution']>, string> = {
  kept_earliest: 'Kept earliest',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  resolved: 'Resolved',
};

export default function OfflineSync() {
  const { eventId = '' } = useParams();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<SyncConflict | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const event = useQuery({ queryKey: ['admin', 'event', eventId], queryFn: () => adminApi.event(eventId) });
  const review = useQuery({ queryKey: ['admin', 'syncReview', eventId], queryFn: () => adminApi.syncReview(eventId), refetchInterval: 15_000 });
  useAdminTitle('Offline sync review', 'Check-ins recorded without signal');

  const decide = async (c: SyncConflict, decision: NonNullable<SyncConflict['resolution']>, reason?: string) => {
    setBusy(c.id);
    try {
      await adminApi.resolveConflict(c.id, decision, reason);
      setNotice(`${c.holderName ?? c.ticketCode}: ${resolutionLabel[decision].toLowerCase()}. Saved to the audit log.`);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      setRejecting(null);
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t save that decision. Please try again.'), { id: 'resolve' });
    } finally {
      setBusy(null);
    }
  };

  const title = event.data?.event.title;
  const data: SyncReview | undefined = review.data;
  const open = data?.conflicts.filter((c) => !c.resolvedAt) ?? [];
  const done = data?.conflicts.filter((c) => c.resolvedAt) ?? [];

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-sm text-slate">
        <Link to="/admin/checkin" className="font-semibold text-forest hover:underline">Check-in</Link> /{' '}
        {title ? <Link to={`/admin/events/${eventId}/participants`} className="hover:underline">{title} · {formatDate(event.data!.event.startsAt)}</Link> : '…'}
      </nav>

      {review.isLoading ? (
        <Skeleton className="mt-5 h-[520px]" />
      ) : !data ? (
        <EmptyState className="mt-5" icon={RefreshCw} title="We couldn’t load the sync review" body="Check your connection and try again." action={<Button onClick={() => review.refetch()}>Try again</Button>} />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Offline check-ins" value={String(data.stats.offline)} sub={`from ${data.stats.devices} ${data.stats.devices === 1 ? 'phone' : 'phones'}`} />
            <StatCard label="Synced" value={String(data.stats.synced)} />
            <StatCard label="Waiting on device" value={String(data.stats.waiting)} sub={data.stats.waitingDevices.join(', ') || 'none'} />
            <StatCard label="Needs review" value={String(data.stats.needsReview)} />
          </div>

          {notice && <Alert tone="success" className="mt-5">{notice}</Alert>}

          <Card className="mt-5 overflow-hidden">
            <h2 className="px-6 py-5 text-lg">Needs review</h2>
            {open.length === 0 ? (
              <p className="flex items-center gap-2 border-t border-line px-6 py-5 text-sm text-ink">
                <CircleCheck size={18} aria-hidden className="text-forest" /> Nothing needs review.
              </p>
            ) : (
              <Table caption="Check-ins that need review" minWidth={880}>
                <THead>
                  <Th>Issue</Th>
                  <Th>Hiker / ticket</Th>
                  <Th>What happened</Th>
                  <Th className="text-right">Action</Th>
                </THead>
                <TBody>
                  {open.map((c) => (
                    <Tr key={c.id}>
                      <Td><Badge tone={kindLabel[c.kind].tone}>{kindLabel[c.kind].label}</Badge></Td>
                      <Td className="font-semibold">{c.holderName ? `${c.holderName} · ` : ''}<span className="font-mono text-[13px]">{c.ticketCode}</span></Td>
                      <Td className="text-[13px]">
                        {c.kind === 'duplicate' && <>{c.scans.map(scan).join(' and ')}. {c.note}</>}
                        {c.kind === 'not_in_list' && <>{[c.scans[0] ? `Admitted ${formatTime(c.scans[0].at)} by ${c.scans[0].staffName}` : 'Admitted', `Server: ${c.serverNote ?? 'no details'}`].join(' · ')}</>}
                        {c.kind === 'reported' && <>{c.note}</>}
                      </Td>
                      <Td className="whitespace-nowrap text-right">
                        {c.kind === 'duplicate' ? (
                          <Button size="sm" variant="secondary" disabled={busy === c.id} onClick={() => decide(c, 'kept_earliest')}>Keep earliest</Button>
                        ) : c.kind === 'not_in_list' ? (
                          <span className="inline-flex gap-2">
                            <Button size="sm" disabled={busy === c.id} onClick={() => decide(c, 'confirmed')}>Confirm</Button>
                            <Button size="sm" variant="secondary" disabled={busy === c.id} onClick={() => setRejecting(c)}>Reject</Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="secondary" disabled={busy === c.id} onClick={() => decide(c, 'resolved')}>Mark resolved</Button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          {done.length > 0 && (
            <details className="mt-3 rounded-2xl border border-line bg-white px-6 py-4 text-sm">
              <summary className="cursor-pointer font-semibold text-ink">Resolved ({done.length})</summary>
              <ul className="mt-3 space-y-2 text-slate">
                {done.map((c) => (
                  <li key={c.id}>
                    {kindLabel[c.kind].label} · {c.holderName ?? c.ticketCode}: <span className="font-semibold text-ink">{resolutionLabel[c.resolution ?? 'resolved']}</span>
                    {c.resolvedBy ? ` by ${c.resolvedBy}` : ''} · {formatTime(c.resolvedAt!)}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <Card className="mt-5 overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 py-5">
              <h2 className="text-lg">Re-entries</h2>
              <span className="text-[13px] text-slate">Approved with the event’s supervisor PIN. They don’t add to attendance.</span>
            </div>
            {data.reentries.length === 0 ? (
              <p className="border-t border-line px-6 py-5 text-sm text-slate">No re-entries for this event.</p>
            ) : (
              <Table caption="Re-entries approved with the supervisor PIN" minWidth={720}>
                <THead>
                  <Th>Time</Th>
                  <Th>Hiker / ticket</Th>
                  <Th>Gate · staff</Th>
                  <Th>Approval</Th>
                </THead>
                <TBody>
                  {data.reentries.map((r) => (
                    <Tr key={`${r.ticketCode}-${r.at}`}>
                      <Td className="whitespace-nowrap">{formatTime(r.at)}</Td>
                      <Td className="font-semibold">{r.holderName} · <span className="font-mono text-[13px]">{r.ticketCode}</span></Td>
                      <Td>{[r.gate, r.staffName].filter(Boolean).join(' · ')}</Td>
                      <Td>
                        <Badge tone="green">Re-entry, supervisor approved</Badge>
                        {r.offline && <Badge tone="gray" className="ml-2">Offline</Badge>}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card className="mt-5 overflow-hidden">
            <h2 className="px-6 py-5 text-lg">Sync log</h2>
            {data.log.length === 0 ? (
              <p className="border-t border-line px-6 py-5 text-sm text-slate">No phone has synced for this event yet.</p>
            ) : (
              <Table caption="Sync log" minWidth={720}>
                <THead>
                  <Th>Time</Th>
                  <Th>Device</Th>
                  <Th>Staff</Th>
                  <Th>Check-ins</Th>
                  <Th>Result</Th>
                </THead>
                <TBody>
                  {data.log.map((l) => (
                    <Tr key={l.id}>
                      <Td className="whitespace-nowrap">{formatTime(l.at)}</Td>
                      <Td>{l.deviceLabel}{l.gate ? ` · ${l.gate}` : ''}</Td>
                      <Td>{l.staffName}</Td>
                      <Td className="tabular-nums">{l.checkIns}</Td>
                      <Td className="text-[13px]">
                        {[`${l.accepted} accepted`, l.duplicates ? `${l.duplicates} duplicate${l.duplicates === 1 ? '' : 's'}` : null, l.flagged ? `${l.flagged} flagged` : null, l.reentries ? `${l.reentries} re-entr${l.reentries === 1 ? 'y' : 'ies'}` : null].filter(Boolean).join(' · ')}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </>
      )}

      <RejectDialog conflict={rejecting} busy={!!busy} onClose={() => setRejecting(null)} onReject={(reason) => rejecting && decide(rejecting, 'rejected', reason)} />
    </div>
  );
}

const rejectSchema = z.object({ reason: z.string().trim().min(10, 'Explain why in at least 10 characters. It goes in the audit log.') });

function RejectDialog({ conflict, busy, onClose, onReject }: { conflict: SyncConflict | null; busy: boolean; onClose: () => void; onReject: (reason: string) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ reason: string }>({ resolver: zodResolver(rejectSchema), defaultValues: { reason: '' } });
  const close = () => {
    reset();
    onClose();
  };
  return (
    <Dialog open={!!conflict} onClose={close} title="Reject flagged admission">
      <form noValidate className="p-6" onSubmit={handleSubmit(({ reason }) => onReject(reason))}>
        <h2 className="text-xl">Reject this admission?</h2>
        <p className="mt-2 text-sm text-slate">
          {conflict?.holderName ?? conflict?.ticketCode} will no longer count as checked in. The decision and reason go in the audit log.
        </p>
        <Textarea label="Reason (required)" className="mt-4" {...register('reason')} error={errors.reason?.message} />
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={busy}>{busy ? 'Saving…' : 'Reject'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
