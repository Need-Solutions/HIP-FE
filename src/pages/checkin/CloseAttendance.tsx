import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Lock, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import { checkinApi } from '@/api/endpoints';
import { Alert, Button, ButtonLink, Card, Dialog, Skeleton } from '@/components/ui';
import { CheckinHeader } from '@/components/checkin/CheckinHeader';
import { forgetEventTickets } from '@/features/checkin/offline/db';
import { syncPendingCheckIns } from '@/features/checkin/offline/sync';
import { checkinKeys, useCheckinEvent, useLocalState, useServerStats } from '@/features/checkin/useCheckin';
import { useOnlineStatus } from '@/features/checkin/useOnlineStatus';
import { formatTime } from '@/lib/format';
import { attendanceRate, formatPercent } from '@/lib/metrics';
import { errorMessage, notifyError } from '@/lib/notify';

// Figma: "Check-in / Close attendance" (ATT-020, ATT-021). Closing is blocked while this phone has scans
// waiting to sync (CLAUDE.md "Offline check-in" 5), and needs signal so the server has the final count.
// Afterwards only an admin can correct records, with a reason (ATT-018), and the ticket list leaves the phone.

export default function CloseAttendance() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const { title } = useCheckinEvent(eventId);
  const local = useLocalState(eventId);
  const stats = useServerStats(eventId);
  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const waiting = local.data?.unsynced ?? 0;
  const s = stats.data;
  const noShows = s ? Math.max(0, s.confirmed - s.checkedIn) : 0;
  const closedAt = s?.attendanceClosedAt;
  const blockedReason = !online ? 'offline' : waiting > 0 ? 'unsynced' : null;

  const syncNow = async () => {
    setSyncing(true);
    try {
      await syncPendingCheckIns();
      await queryClient.invalidateQueries({ queryKey: checkinKeys.all });
    } catch (err) {
      notifyError(errorMessage(err, 'Sync didn’t finish. Try again when the signal is better.'), { id: 'sync' });
    } finally {
      setSyncing(false);
    }
  };

  const close = async () => {
    // Check again right before closing: a scan may have been saved since the screen loaded.
    if ((await local.refetch()).data?.unsynced) {
      setConfirming(false);
      notifyError('Some scans are still waiting to sync. Sync them before closing.', { id: 'close' });
      return;
    }
    setClosing(true);
    try {
      await checkinApi.close(eventId);
      await forgetEventTickets(eventId).catch(() => undefined);
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: checkinKeys.all });
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t close attendance. Please try again.'), { id: 'close' });
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="pb-10">
      <CheckinHeader back={closedAt ? '/checkin' : `/checkin/${eventId}/scan`} title="Close attendance" subtitle={title} />
      <div className="px-5">
        {closedAt && (
          <Alert tone="success" title={`Attendance closed at ${formatTime(closedAt)}`} className="mt-3">
            Only an admin can correct records now, and every change is logged with a reason.
          </Alert>
        )}

        <Card className="mt-4 p-5">
          {!online && !s ? (
            <p className="flex items-center gap-2 text-sm text-slate"><WifiOff size={16} aria-hidden /> Connect to see the final count.</p>
          ) : !s ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <p className="text-sm text-slate">Final count</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-[44px] font-extrabold leading-none text-ink">{s.checkedIn}</span>
                <span className="text-sm text-slate">checked in</span>
              </p>
              <dl className="mt-4 divide-y divide-line border-t border-line text-sm">
                <Row label="Confirmed tickets" value={String(s.confirmed)} />
                <Row label="No-shows" value={String(noShows)} />
                <Row label="Attendance rate" value={formatPercent(attendanceRate(s.checkedIn, s.confirmed))} />
                <Row label="Manual check-ins" value={String(s.manual)} />
              </dl>
            </>
          )}
        </Card>

        {!closedAt && (
          <>
            {waiting > 0 ? (
              <div className="mt-4 flex gap-3 rounded-xl bg-warn-light p-4" role="status">
                <RefreshCw size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
                <div className="min-w-0 flex-1 text-[13px] text-ink">
                  <p className="font-bold">{waiting === 1 ? '1 scan is' : `${waiting} scans are`} waiting to sync</p>
                  <p className="mt-0.5">Sync them before closing, so nobody who came is counted as a no-show.</p>
                  <Button size="sm" variant="secondary" className="mt-3" onClick={syncNow} disabled={!online || syncing}>
                    {syncing ? 'Syncing…' : online ? 'Sync now' : 'Waiting for signal'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex gap-3 rounded-xl border border-line bg-white p-4">
                <CircleCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-forest" />
                <div className="text-[13px]">
                  <p className="font-bold text-ink">All offline scans are synced</p>
                  <p className="mt-0.5 text-slate">Nothing waiting on this phone.</p>
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-3 rounded-xl bg-warn-light p-4">
              <Lock size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
              <div className="text-[13px] text-ink">
                <p className="font-bold">Closing locks attendance</p>
                <p className="mt-0.5">After closing, only an admin can correct records, and every change is logged with a reason.</p>
              </div>
            </div>

            <div className="mt-8 grid gap-3">
              <Button variant="danger" size="lg" block disabled={!!blockedReason || !s} onClick={() => setConfirming(true)} aria-describedby={blockedReason ? 'close-blocked' : undefined}>
                Close attendance
              </Button>
              {blockedReason && (
                <p id="close-blocked" className="flex items-center justify-center gap-1.5 text-center text-[13px] text-slate">
                  <TriangleAlert size={14} aria-hidden className="text-warn" />
                  {blockedReason === 'offline' ? 'Connect to the internet to close attendance.' : 'Sync the waiting scans first.'}
                </p>
              )}
              <ButtonLink to={`/checkin/${eventId}/scan`} variant="ghost" size="lg" block>Keep scanning</ButtonLink>
            </div>
          </>
        )}
        {closedAt && (
          <Button size="lg" block className="mt-8" onClick={() => navigate('/checkin')}>Back to events</Button>
        )}
      </div>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Close attendance?">
        <div className="p-6">
          <h2 className="text-xl">Close attendance for {title}?</h2>
          <p className="mt-2 text-sm text-slate">
            {s ? `${s.checkedIn} checked in, ${noShows} no-shows. ` : ''}You won’t be able to scan more tickets for this event.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={closing}>Cancel</Button>
            <Button variant="danger" onClick={close} disabled={closing}>{closing ? 'Closing…' : 'Close it'}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-slate">{label}</dt>
      <dd className="font-bold text-ink">{value}</dd>
    </div>
  );
}
