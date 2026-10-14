import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CloudDownload, TriangleAlert, WifiOff } from 'lucide-react';
import { Button, ButtonLink, Card, ProgressBar } from '@/components/ui';
import { CheckinHeader } from '@/components/checkin/CheckinHeader';
import { downloadForOffline, type DownloadProgress } from '@/features/checkin/offline/download';
import { checkinKeys, useCheckinEvent } from '@/features/checkin/useCheckin';
import { useOnlineStatus } from '@/features/checkin/useOnlineStatus';
import { formatDate, formatTime } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';
import { cn } from '@/lib/cn';

// Figma: "Check-in / Download for offline" (CLAUDE.md "Offline check-in" 1). Saves the signed ticket list, the
// names for manual search and the event's public key on this phone. Starts by itself when the event isn't
// saved yet; otherwise offers "Download again".

const kb = (bytes?: number) => (bytes === undefined ? '' : bytes < 1024 * 1024 ? `about ${Math.max(1, Math.round(bytes / 1024))} KB` : `about ${(bytes / 1024 / 1024).toFixed(1)} MB`);

export default function OfflineDownload() {
  const { eventId = '' } = useParams();
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const { title, manifest, loading, event } = useCheckinEvent(eventId);
  const allowed = event ? event.offline.allowed : true;
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [salesCloseAt, setSalesCloseAt] = useState<string | undefined>();
  const autoStarted = useRef(false);

  const start = async () => {
    setRunning(true);
    setProgress(null);
    try {
      const m = await downloadForOffline(eventId, setProgress);
      setSalesCloseAt(m.salesCloseAt);
      await queryClient.invalidateQueries({ queryKey: checkinKeys.all });
    } catch (err) {
      setProgress(null);
      notifyError(errorMessage(err, 'The download didn’t finish. Check your signal and try again.'), { id: 'download' });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (loading || autoStarted.current || manifest || !online || !allowed) return;
    autoStarted.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, manifest, online, allowed]);

  const done = progress?.done || (!running && !!manifest);
  const total = progress?.totalTickets ?? manifest?.ticketCount ?? 0;
  const saved = progress?.savedTickets ?? (manifest ? manifest.ticketCount : 0);
  const percent = progress ? Math.round(((progress.key ? 1 : 0) + (total ? (saved / total) * 8 : 8) + (progress.done ? 1 : 0)) * 10) : done ? 100 : 0;
  const closeAt = salesCloseAt ?? manifest?.salesCloseAt;

  return (
    <div className="pb-10">
      <CheckinHeader back="/checkin" title="Prepare offline mode" subtitle={title} />
      <div className="px-5">
        <section className="mt-3 rounded-2xl bg-forest p-5 text-on-primary">
          <CloudDownload size={26} aria-hidden className="text-sun-soft" />
          <h2 className="mt-3 text-[22px] font-extrabold text-on-primary">Scan without signal</h2>
          <p className="mt-1 text-sm opacity-85">Save today’s ticket list to this phone before you leave network coverage.</p>
        </section>

        <Card className="mt-5 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-bold text-ink" aria-live="polite">
              {running ? 'Downloading tickets…' : done ? 'Saved on this phone' : online ? 'Ready to download' : 'Waiting for signal'}
            </p>
            <span className="text-sm font-bold text-ink">{percent}%</span>
          </div>
          <ProgressBar value={percent} label="Download progress" className="mt-3" />
          <ul className="mt-5 divide-y divide-line text-sm">
            <Step label="Signed ticket list" value={done ? `${total} of ${total}` : progress ? `${saved} of ${total}` : '—'} done={done} />
            <Step label="Hiker names for manual search" value={done || progress?.names ? 'Done' : '—'} done={done || !!progress?.names} />
            <Step label="Verification key" value={done || progress?.key ? 'Done' : '—'} done={done || !!progress?.key} />
          </ul>
          <p className="mt-3 text-xs text-slate">
            {progress?.sizeBytes ? `Size: ${kb(progress.sizeBytes)}. ` : ''}Saved only on this phone, and removed when attendance is closed.
            {manifest && !running && ` Last updated ${formatDate(manifest.downloadedAt)}, ${formatTime(manifest.downloadedAt)}. Wiped automatically ${formatDate(manifest.expiresAt)}, ${formatTime(manifest.expiresAt)}; scans that haven’t synced are kept.`}
          </p>
        </Card>

        <div className="mt-5 flex gap-3 rounded-xl bg-warn-light p-4">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
          <div className="text-[13px] text-ink">
            <p className="font-bold">Before you go offline</p>
            <p className="mt-1">
              Tickets sold after this download won’t be in the list.
              {closeAt ? ` Sales close at ${formatTime(closeAt)}${formatDate(closeAt) !== formatDate(new Date().toISOString()) ? ` on ${formatDate(closeAt)}` : ''}, so download again after that if you can.` : ' Download again just before you leave signal.'}
            </p>
          </div>
        </div>

        {!allowed && (
          <p role="status" className="mt-5 rounded-xl bg-warn-light px-3.5 py-2.5 text-[13px] text-ink">
            An admin has turned off offline scanning in Check-in settings. You can still scan while you have signal.
          </p>
        )}

        {!online && !running && (
          <p role="status" className="mt-5 flex items-center gap-2 rounded-xl bg-warn-light px-3.5 py-2.5 text-[13px] text-ink">
            <WifiOff size={15} aria-hidden className="shrink-0 text-warn" /> You’re offline. Connect to download.
          </p>
        )}

        <div className="mt-6 grid gap-3">
          {done && !running ? (
            <>
              <ButtonLink to={`/checkin/${eventId}/scan`} size="lg" block>Start scanning</ButtonLink>
              <Button variant="secondary" size="lg" block onClick={start} disabled={!online || !allowed}>Download again</Button>
            </>
          ) : (
            <Button size="lg" block onClick={start} disabled={running || !online || !allowed}>{running ? 'Downloading…' : 'Download'}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2.5 text-ink">
        <span aria-hidden className={cn('grid size-5 place-items-center rounded-full', done ? 'bg-forest text-on-primary' : 'bg-line text-transparent')}>
          <Check size={12} strokeWidth={3} />
        </span>
        {label}
      </span>
      <span className={cn('font-semibold', done ? 'text-forest' : 'text-slate')}>{value}</span>
    </li>
  );
}
