import { lazy, Suspense, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CameraOff, Flashlight, Lock, Search } from 'lucide-react';
import { checkinApi, mockTools } from '@/api/endpoints';
import { Button, ButtonLink } from '@/components/ui';
import { CameraView, type CameraStatus } from '@/components/checkin/CameraView';
import { CheckinHeader, SignalPill } from '@/components/checkin/CheckinHeader';
import { ResultSheet } from '@/components/checkin/ResultSheet';
import { NotDownloadedError, PinError, admitAndFlag, approveReentry, checkTicket, checkinKeys, useCheckinEvent, useLocalState, useServerStats, useStaff } from '@/features/checkin/useCheckin';
import { useOnlineStatus } from '@/features/checkin/useOnlineStatus';
import { errorMessage, notifyError } from '@/lib/notify';
import { cn } from '@/lib/cn';
import type { ScanOutcome } from '@/types/domain';

// Figma: "Check-in / Scanner (online)", "Check-in / Scanner (offline)" and the five "Check-in / Result – *"
// sheets (ATT-005..ATT-012, NFR-003). Online scans are checked by the server; with no signal (or no answer
// within 1.5 s) the phone checks the signature itself and saves the scan for sync (CLAUDE.md "Offline check-in").

// Mock/test builds only. When mockTools.enabled is false at build time, this import is removed from the bundle.
const TestScanPanel = mockTools.enabled ? lazy(() => import('@/components/checkin/TestScanPanel').then((m) => ({ default: m.TestScanPanel }))) : null;

/** The same QR read again within this window is the camera seeing it twice, not a second scan. */
const REPEAT_WINDOW_MS = 2500;

export default function Scanner() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const { title, gate, event, manifest, admitNotInList, requireSupervisorPin, supervisorPinSet, offlineAllowed } = useCheckinEvent(eventId);
  const staff = useStaff(gate);
  const local = useLocalState(eventId);
  const stats = useServerStats(eventId);

  const [result, setResult] = useState<{ outcome: ScanOutcome; elapsedMs: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState<CameraStatus>('starting');
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const checking = useRef(false);
  const last = useRef<{ payload: string; at: number } | null>(null);
  const resultOpen = useRef(false);
  resultOpen.current = !!result;

  const closedAt = stats.data?.attendanceClosedAt ?? event?.attendanceClosedAt;
  const refresh = () => queryClient.invalidateQueries({ queryKey: checkinKeys.all });

  const handleScan = async (payload: string) => {
    const now = Date.now();
    if (resultOpen.current || checking.current) return;
    if (last.current && last.current.payload === payload && now - last.current.at < REPEAT_WINDOW_MS) return;
    last.current = { payload, at: now };
    checking.current = true;
    setBusy(true);
    const started = performance.now();
    try {
      const outcome = await checkTicket(payload, eventId, staff);
      setResult({ outcome, elapsedMs: performance.now() - started });
      void refresh();
    } catch (err) {
      notifyError(err instanceof NotDownloadedError ? err.message : errorMessage(err, 'We couldn’t check that ticket. Try again, or find the hiker by name.'), { id: 'scan' });
    } finally {
      checking.current = false;
      setBusy(false);
    }
  };

  const scanNext = () => {
    setResult(null);
    last.current = null;
  };

  const admit = async (code: string) => {
    setBusy(true);
    const started = performance.now();
    try {
      setResult({ outcome: await admitAndFlag(code, eventId, staff), elapsedMs: performance.now() - started });
      void refresh();
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t save that check-in. Please try again.'), { id: 'scan' });
    } finally {
      setBusy(false);
    }
  };

  /** "Allow re-entry" with the supervisor PIN; the sheet shows a refusal under the PIN field. */
  const reenter = async (pin: string) => {
    if (result?.outcome.kind !== 'already_used') return;
    const { code, holderName, ticketTypeName } = result.outcome;
    const started = performance.now();
    try {
      const outcome = await approveReentry({ code, holderName, ticketTypeName: ticketTypeName ?? '' }, eventId, staff, pin);
      setResult({ outcome, elapsedMs: performance.now() - started });
      void refresh();
    } catch (err) {
      if (err instanceof PinError) {
        return {
          error: err.code === 'invalid_pin' && err.attemptsLeft !== undefined ? `Wrong PIN. ${err.attemptsLeft} ${err.attemptsLeft === 1 ? 'try' : 'tries'} left.` : err.message,
          locked: err.code === 'pin_locked',
        };
      }
      if (err instanceof NotDownloadedError) return { error: err.message };
      notifyError(errorMessage(err, 'We couldn’t approve the re-entry. Please try again.'), { id: 'reentry' });
    }
  };

  const report = async (code: string, note: string) => {
    if (!navigator.onLine) {
      notifyError('Reporting needs signal. Tell a supervisor now, and report it once you’re back online.', { id: 'report' });
      return;
    }
    setBusy(true);
    try {
      await checkinApi.reportIssue(eventId, code, note);
      scanNext();
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t send the report. Please try again.'), { id: 'report' });
    } finally {
      setBusy(false);
    }
  };

  // Counts: the server's when online, else what this phone knows.
  const total = stats.data?.confirmed ?? local.data?.ticketCount ?? 0;
  const checkedIn = online && stats.data ? stats.data.checkedIn : (local.data?.checkedIn ?? 0);
  const waiting = local.data?.unsynced ?? 0;
  const offlineNotReady = !online && local.data && !local.data.downloaded;

  if (closedAt) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-camera">
        <CheckinHeader dark back="/checkin" title={title || 'Check-in'} subtitle={[gate, staff.name].filter(Boolean).join(' · ')} />
        <div className="m-5 rounded-2xl bg-white p-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-canvas text-slate"><Lock size={24} aria-hidden /></span>
          <h2 className="mt-4 text-xl">Attendance is closed</h2>
          <p className="mt-1 text-sm text-slate">This event’s attendance was closed. Only an admin can add or correct check-ins now.</p>
          <ButtonLink to="/checkin" className="mt-5" block>Back to events</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-camera">
      {/* Live camera behind everything, dimmed so the frame and text stay readable. */}
      <div className="absolute inset-0">
        <CameraView
          attempt={cameraAttempt}
          torchOn={torchOn}
          onScan={handleScan}
          onStatus={setCamera}
          onTorchSupport={setTorchSupported}
        />
        {camera === 'running' && <div aria-hidden className="absolute inset-0 bg-camera/45" />}
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        <CheckinHeader dark back="/checkin" title={title || 'Check-in'} subtitle={[gate, staff.name].filter(Boolean).join(' · ')} right={<SignalPill online={online} />} />

        {!online && (
          <div className="mx-5 mt-1 rounded-xl bg-offline px-4 py-2.5 text-[13px]">
            {offlineNotReady ? (
              <>
                <p className="font-bold text-sun-soft">This event isn’t saved on this phone</p>
                <p className="mt-0.5 text-offline-text">Reconnect and download it to scan without signal. Manual search needs it too.</p>
              </>
            ) : (
              <>
                <p className="font-bold text-sun-soft">Offline mode — scans are saved on this phone</p>
                <p className="mt-0.5 text-offline-text">
                  {waiting === 1 ? '1 check-in will' : `${waiting} check-ins will`} sync when signal returns
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex flex-1 flex-col items-center justify-center px-5 py-6">
          {camera === 'denied' || camera === 'unavailable' || camera === 'error' ? (
            <div role="alert" className="w-full max-w-[300px] rounded-2xl border border-white/15 bg-white/5 p-5 text-center text-white">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-white/10"><CameraOff size={22} aria-hidden /></span>
              <h2 className="mt-3 text-lg font-bold text-white">
                {camera === 'denied' ? 'Camera access is off' : camera === 'unavailable' ? 'No camera available' : 'The camera didn’t start'}
              </h2>
              <p className="mt-1 text-sm text-camera-mute">
                {camera === 'denied'
                  ? 'Allow the camera for this site in your browser settings, then try again. Meanwhile, check hikers in by name.'
                  : camera === 'unavailable'
                    ? 'This phone or browser can’t open a camera here. Check hikers in by name instead.'
                    : 'Try again, or check hikers in by name.'}
              </p>
              <div className="mt-4 grid gap-2">
                <ButtonLink to={`/checkin/${eventId}/search`} variant="light" block>
                  <Search size={17} aria-hidden /> Use manual search
                </ButtonLink>
                {camera !== 'unavailable' && (
                  <Button variant="ghost" block className="text-white hover:bg-white/10" onClick={() => setCameraAttempt((n) => n + 1)}>Try again</Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="relative h-[320px] w-[240px]" aria-hidden>
                {(['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'] as const).map((c) => (
                  <span key={c} className={cn('absolute size-10 border-white', c)} />
                ))}
                <span className={cn('absolute inset-x-[5px] h-0.5 rounded-full bg-sun shadow-[0_0_12px] shadow-sun', busy ? 'top-1/2' : 'hip-scanline')} />
              </div>
              <p id="scanner-focus" tabIndex={-1} className="mt-6 text-sm font-semibold text-white focus:outline-none" aria-live="polite">
                {busy ? 'Checking…' : camera === 'starting' ? 'Starting camera…' : 'Point the camera at the ticket QR'}
              </p>
            </>
          )}
        </div>

        <div className="px-5 pb-8">
          <div className="flex items-center rounded-2xl bg-white px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate">Checked in</p>
              <p className="mt-0.5 text-[26px] font-extrabold leading-none text-ink">
                {checkedIn} <span className="text-sm font-semibold text-slate">/ {total}</span>
              </p>
            </div>
            <span aria-hidden className="mx-4 h-9 w-px bg-line" />
            <div className="min-w-0 flex-1">
              {online ? (
                <>
                  <p className="text-xs text-slate">Not checked in</p>
                  <p className="mt-0.5 text-[26px] font-extrabold leading-none text-ink">{Math.max(0, total - checkedIn)}</p>
                </>
              ) : (
                <Link to={`/checkin/${eventId}/sync`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40">
                  <p className="text-xs text-slate">Waiting to sync</p>
                  <p className="mt-0.5 text-[26px] font-extrabold leading-none text-sun-dark">{waiting}</p>
                </Link>
              )}
            </div>
            <ButtonLink to={`/checkin/${eventId}/search?filter=out`} variant="secondary" size="sm" className="w-20">List</ButtonLink>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <ButtonLink to={`/checkin/${eventId}/search`} variant="light" size="lg" className="whitespace-nowrap px-3">
              <Search size={17} aria-hidden className="shrink-0" /> Manual search
            </ButtonLink>
            <Button
              variant="dark"
              size="lg"
              className="whitespace-nowrap px-3"
              aria-pressed={torchOn}
              disabled={!torchSupported}
              title={torchSupported ? undefined : 'This camera has no torch'}
              onClick={() => setTorchOn((t) => !t)}
            >
              <Flashlight size={17} aria-hidden className="shrink-0" /> {torchOn ? 'Torch on' : 'Torch'}
            </Button>
          </div>
          {!manifest && online && offlineAllowed && (
            <p className="mt-3 text-center text-xs text-camera-mute">
              Not saved for offline yet. <Link to={`/checkin/${eventId}/offline`} className="font-bold text-white underline">Download now</Link>
            </p>
          )}
          {TestScanPanel && (
            <Suspense fallback={null}>
              <TestScanPanel eventId={eventId} onScan={handleScan} disabled={busy || !!result} />
            </Suspense>
          )}
        </div>
      </div>

      {result && (
        <ResultSheet
          outcome={result.outcome}
          elapsedMs={result.elapsedMs}
          busy={busy}
          admitNotInList={admitNotInList}
          requireSupervisorPin={requireSupervisorPin}
          supervisorPinSet={supervisorPinSet}
          onReentry={reenter}
          onNext={scanNext}
          onAdmit={admit}
          onFindHiker={(q) => navigate(`/checkin/${eventId}/search${q ? `?q=${encodeURIComponent(q)}` : ''}`)}
          onReport={report}
        />
      )}
    </div>
  );
}
