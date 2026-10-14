import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, RefreshCw, WifiOff } from 'lucide-react';
import { checkinApi } from '@/api/endpoints';
import { Alert, Badge, Button, ButtonLink, Card, Skeleton } from '@/components/ui';
import { CheckinHeader } from '@/components/checkin/CheckinHeader';
import { useAuth } from '@/features/auth/AuthContext';
import { syncPendingCheckIns } from '@/features/checkin/offline/sync';
import { checkinKeys, useCheckinEvent, useLocalState } from '@/features/checkin/useCheckin';
import { useOnlineStatus } from '@/features/checkin/useOnlineStatus';
import { formatTime } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';
import type { ScanBy, SyncConflict } from '@/types/domain';

// Figma: "Check-in / Sync & conflicts" (CLAUDE.md "Offline check-in" 4). Sync runs by itself whenever the phone
// has signal (useAutoSync in CheckinLayout); this screen shows where it's at and what the server flagged. The
// server keeps the earliest scan per ticket. Deciding a conflict is an admin's job (Admin / Offline sync review).

const scanLabel = (s: ScanBy) => `${s.gate ? `${s.gate} ` : ''}${formatTime(s.at)} (${s.staffName})`;

export default function Sync() {
  const { eventId = '' } = useParams();
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin', 'super_admin');
  const { title } = useCheckinEvent(eventId);
  const local = useLocalState(eventId);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const conflicts = useQuery({
    queryKey: checkinKeys.conflicts(eventId),
    queryFn: () => checkinApi.conflicts(eventId),
    enabled: online,
    networkMode: 'always',
    retry: 0,
    meta: { silentError: true }, // the review card shows its own retry
  });

  const waiting = local.data?.unsynced ?? 0;
  const totalHere = local.data?.localTotal ?? 0;
  const open = (conflicts.data ?? []).filter((c) => !c.resolvedAt);

  const syncNow = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const r = await syncPendingCheckIns();
      await queryClient.invalidateQueries({ queryKey: checkinKeys.all });
      setNotice(`${r.uploaded} synced.${r.conflicts > 0 ? ` ${r.conflicts} ${r.conflicts === 1 ? 'needs' : 'need'} an admin’s review, listed below.` : ''}`);
    } catch (err) {
      notifyError(errorMessage(err, 'Sync didn’t finish. It will try again when the signal is better.'), { id: 'sync' });
    } finally {
      setSyncing(false);
    }
  };

  const resolve = async (c: SyncConflict) => {
    try {
      await checkinApi.resolveConflict(c.id);
      await queryClient.invalidateQueries({ queryKey: checkinKeys.conflicts(eventId) });
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t mark that resolved. Please try again.'), { id: 'resolve' });
    }
  };

  return (
    <div className="pb-10">
      <CheckinHeader back={`/checkin/${eventId}/scan`} title="Sync check-ins" subtitle={`${online ? 'Back online' : 'Offline'} · ${title}`} />
      <div className="px-5">
        <section className="mt-3 rounded-2xl bg-forest p-5 text-on-primary" aria-live="polite">
          {local.isLoading ? (
            <Skeleton className="h-14 bg-white/10" />
          ) : (
            <>
              <p className="text-[24px] font-extrabold">
                {totalHere - waiting} of {totalHere} synced
              </p>
              <p className="mt-1 text-sm opacity-85">
                {local.data?.lastSyncAt ? `Last sync ${formatTime(local.data.lastSyncAt)}` : 'Not synced yet'} ·{' '}
                {waiting === 0 ? 'nothing waiting' : `${waiting} waiting${online ? '' : ' for signal'}`}
              </p>
              {waiting > 0 && (
                <Button variant="light" className="mt-4" onClick={syncNow} disabled={!online || syncing}>
                  <RefreshCw size={16} aria-hidden className={syncing ? 'animate-spin' : undefined} /> {syncing ? 'Syncing…' : online ? 'Sync now' : 'Waiting for signal'}
                </Button>
              )}
            </>
          )}
        </section>

        {notice && <Alert tone="info" className="mt-4">{notice}</Alert>}

        <h2 className="mt-8 text-base font-bold">Needs review{online && conflicts.data ? ` (${open.length})` : ''}</h2>
        <p className="mt-1 text-[13px] text-slate">Two phones scanned the same ticket, or a ticket wasn’t in the offline list. An admin decides which to keep.</p>

        <div className="mt-4 space-y-3">
          {!online ? (
            <p className="flex items-center gap-2 rounded-xl bg-warn-light px-3.5 py-3 text-[13px] text-ink">
              <WifiOff size={15} aria-hidden className="shrink-0 text-warn" /> Connect to see what needs review.
            </p>
          ) : conflicts.isLoading ? (
            <Skeleton className="h-28" />
          ) : conflicts.isError ? (
            <Card className="p-4 text-sm text-slate">
              We couldn’t load the review list. <button type="button" onClick={() => conflicts.refetch()} className="font-bold text-forest underline">Try again</button>
            </Card>
          ) : open.length === 0 ? (
            <Card className="flex items-center gap-3 p-4 text-sm text-ink">
              <CircleCheck size={18} aria-hidden className="text-forest" /> Nothing needs review.
            </Card>
          ) : (
            open.map((c) => (
              <Card key={c.id} className="p-4">
                <Badge tone={c.kind === 'duplicate' ? 'amber' : c.kind === 'not_in_list' ? 'blue' : 'red'}>
                  {c.kind === 'duplicate' ? 'Duplicate scan' : c.kind === 'not_in_list' ? 'Not in offline list' : 'Reported at the gate'}
                </Badge>
                <p className="mt-3 text-[15px] font-bold text-ink">
                  {c.holderName ? `${c.holderName} · ${c.ticketCode.split('-').slice(0, 2).join('-')}` : c.ticketCode}
                </p>
                {c.kind === 'not_in_list' && c.scans[0] ? (
                  <p className="mt-1 text-[13px] text-slate">Admitted &amp; flagged {formatTime(c.scans[0].at)} by {c.scans[0].staffName}</p>
                ) : (
                  c.scans.length > 0 && <p className="mt-1 text-[13px] text-slate">{c.scans.map(scanLabel).join(' · ')}</p>
                )}
                {c.serverNote && <p className="mt-1 text-[13px] text-slate">Server: {c.serverNote}</p>}
                {c.note && <p className="mt-1 text-[13px] text-slate">{c.note}</p>}
                <div className="mt-3 text-right text-sm font-bold">
                  {isAdmin ? (
                    c.kind === 'duplicate' ? (
                      <Link to={`/admin/checkin/${eventId}/sync`} className="text-forest hover:underline">Review →</Link>
                    ) : (
                      <button type="button" onClick={() => resolve(c)} className="text-forest hover:underline">Mark resolved →</button>
                    )
                  ) : (
                    <span className="font-semibold text-slate">An admin will review this</span>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>

        <ButtonLink to={`/checkin/${eventId}/scan`} size="lg" block className="mt-8">Back to scanner</ButtonLink>
        <p className="mt-4 text-center text-[13px] text-slate">Auto-sync runs whenever this phone has signal.</p>
      </div>
    </div>
  );
}
