import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { Button, Input, Textarea } from '@/components/ui';
import { formatDate, formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { InvalidReason, ScanBy, ScanOutcome } from '@/types/domain';
import { useBranding } from '@/features/branding/BrandingContext';

// Bottom sheet over the camera (Figma "Check-in / Result – valid | already used | invalid | offline valid |
// not in offline list"). Each tone pairs a light circle and info box with a strong icon and title colour, and
// the title always says the result in words, so colour is never the only signal (WCAG 1.4.1).

type Tone = 'valid' | 'used' | 'invalid' | 'notInList';

const tones: Record<Tone, { circle: string; icon: string; title: string; box: string; Icon: LucideIcon }> = {
  valid: { circle: 'bg-mint', icon: 'text-forest', title: 'text-forest', box: 'bg-mint text-ink', Icon: Check },
  used: { circle: 'bg-warn-light', icon: 'text-warn', title: 'text-warn', box: 'bg-warn-light text-ink', Icon: TriangleAlert },
  invalid: { circle: 'bg-danger-light', icon: 'text-danger', title: 'text-danger', box: 'bg-danger-light text-ink', Icon: X },
  notInList: { circle: 'bg-info-light', icon: 'text-info', title: 'text-info', box: 'bg-info-light text-ink', Icon: Info },
};

const by = (s: ScanBy) => [formatTime(s.at), s.gate, `by ${s.staffName}`].filter(Boolean).join(' · ');
const day = (iso?: string) => (iso ? formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : undefined);

function invalidCopy(o: Extract<ScanOutcome, { kind: 'invalid' }>, brand: string): { line: string; sub?: string; box: string } {
  const sub = [o.code, o.eventTitle ?? o.holderName].filter(Boolean).join(' · ') || undefined;
  const generic = 'Wrong event, refunded or cancelled ticket.';
  const copy: Record<InvalidReason, { line: string; box: string }> = {
    refunded: { line: day(o.detail) ? `Refunded on ${day(o.detail)}` : 'Refunded ticket', box: generic },
    cancelled: { line: day(o.detail) ? `Cancelled on ${day(o.detail)}` : 'Cancelled ticket', box: generic },
    expired: { line: 'Ticket expired', box: generic },
    wrong_event: { line: 'Ticket for another event', box: generic },
    bad_signature: { line: 'QR code can’t be verified', box: `It may be a copy or edited. Ask the hiker to open the ticket from their ${brand} email or account.` },
    not_hip: { line: `Not a ${brand} ticket`, box: `This QR code isn’t a ${brand} ticket. Ask for the QR in their confirmation email.` },
    unknown_ticket: { line: 'Ticket not found', box: 'Check the hiker’s name in manual search.' },
    attendance_closed: { line: 'Attendance is closed', box: 'Only an admin can add check-ins now.' },
  };
  return { ...copy[o.reason], sub };
}

export interface ResultActions {
  onNext: () => void;
  /** Re-entry with the supervisor PIN. Resolves with an error to show under the PIN field, or nothing on success. */
  onReentry: (pin: string) => Promise<{ error: string; locked?: boolean } | void>;
  onAdmit: (code: string) => void;
  onFindHiker: (code?: string) => void;
  onReport: (code: string, note: string) => Promise<void>;
}

export function ResultSheet({
  outcome,
  elapsedMs,
  busy,
  admitNotInList = true,
  requireSupervisorPin = false,
  supervisorPinSet = false,
  ...actions
}: {
  outcome: ScanOutcome;
  elapsedMs?: number;
  busy?: boolean;
  /** Admin / Check-in settings: "Admit tickets not in the offline list". */
  admitNotInList?: boolean;
  /** Admin / Check-in settings: "Require supervisor PIN for re-entry". */
  requireSupervisorPin?: boolean;
  /** A PIN has been set for this event, so "Allow re-entry" can be offered. */
  supervisorPinSet?: boolean;
} & ResultActions) {
  const { name: brand } = useBranding();
  const [reporting, setReporting] = useState(false);
  const [reentering, setReentering] = useState(false);
  const [note, setNote] = useState('');
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Like a modal: remember what had focus and give it back when the sheet closes (WCAG 2.4.3).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener?.isConnected && opener !== document.body) opener.focus();
      else (document.getElementById('scanner-focus') ?? document.getElementById('main'))?.focus(); // the control that opened it is gone (e.g. a closed panel)
    };
  }, []);

  useEffect(() => {
    primaryRef.current?.focus();
    // A short buzz for "go", a long one for "stop", where the phone supports it.
    navigator.vibrate?.(outcome.kind === 'valid' ? 60 : [120, 60, 120]);
  }, [outcome]);

  let tone: Tone;
  let title: string;
  let name: string | undefined;
  let sub: string | undefined;
  let box: ReactNode;
  let boxClass: string | undefined;
  let buttons: ReactNode;

  const next = (label = 'Scan next') => (
    <Button ref={primaryRef} size="lg" block onClick={actions.onNext}>{label}</Button>
  );

  switch (outcome.kind) {
    case 'valid':
      tone = 'valid';
      if (outcome.reentry) {
        title = 'Re-entry approved';
        name = outcome.holderName;
        sub = [outcome.ticketTypeName, outcome.code].filter(Boolean).join(' · ');
        box = (
          <>
            <p className="font-semibold">Re-entry, supervisor approved</p>
            <p className="mt-0.5">{by(outcome.scan)}{outcome.offline ? ' · saved on this phone, will sync later' : ''}</p>
          </>
        );
        boxClass = outcome.offline ? 'bg-warn-light text-warn' : undefined;
      } else if (outcome.flagged) {
        title = 'Admitted and flagged';
        name = outcome.code;
        sub = 'Not in the offline list';
        box = (
          <>
            <p className="font-semibold">Saved on this phone · will sync later</p>
            <p className="mt-0.5">An admin reviews flagged check-ins after sync.</p>
          </>
        );
        boxClass = 'bg-warn-light text-warn';
      } else if (outcome.offline) {
        title = 'Checked in (offline)';
        name = outcome.holderName;
        sub = [outcome.ticketTypeName, outcome.code].filter(Boolean).join(' · ');
        box = (
          <>
            <p className="font-semibold">Saved on this phone · will sync later</p>
            <p className="mt-0.5">Signature verified with the offline key</p>
          </>
        );
        boxClass = 'bg-warn-light text-warn';
      } else {
        title = 'Checked in';
        name = outcome.holderName;
        sub = [outcome.ticketTypeName, outcome.code].filter(Boolean).join(' · ');
        box = by(outcome.scan);
      }
      buttons = next();
      break;
    case 'already_used':
      tone = 'used';
      title = 'Already checked in';
      name = outcome.holderName;
      sub = `First scanned ${formatTime(outcome.firstScan.at)}${outcome.firstScan.gate ? ` at ${outcome.firstScan.gate}` : ''} by ${outcome.firstScan.staffName}`;
      if (requireSupervisorPin && supervisorPinSet) {
        box = 'Do not admit again unless a supervisor approves re-entry with the event PIN.';
        buttons = (
          <div className="grid gap-3">
            {next()}
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" variant="secondary" onClick={() => setReentering(true)}>Allow re-entry</Button>
              <Button size="lg" variant="secondary" onClick={() => setReporting(true)}>Report issue</Button>
            </div>
          </div>
        );
      } else {
        box = requireSupervisorPin
          ? 'Re-entry needs a supervisor PIN, but none is set for this event. Ask an admin.'
          : 'Do not admit again without a supervisor.';
        buttons = (
          <div className="grid grid-cols-2 gap-3">
            {next()}
            <Button size="lg" variant="secondary" onClick={() => setReporting(true)}>Report issue</Button>
          </div>
        );
      }
      break;
    case 'invalid': {
      tone = 'invalid';
      title = 'Ticket not valid';
      const c = invalidCopy(outcome, brand);
      name = c.line;
      sub = c.sub;
      box = c.box;
      buttons = (
        <div className="grid grid-cols-2 gap-3">
          {next()}
          <Button size="lg" variant="secondary" onClick={() => actions.onFindHiker(outcome.holderName ?? outcome.code)}>Find hiker</Button>
        </div>
      );
      break;
    }
    case 'not_in_offline_list':
      tone = 'notInList';
      title = 'Not in offline list';
      name = `Signature valid · ${outcome.code}`;
      sub = 'Probably bought after your last download';
      if (admitNotInList) {
        box = 'Check the hiker’s ID and payment receipt, then admit and flag for review.';
        buttons = (
          <div className="grid grid-cols-2 gap-3">
            <Button ref={primaryRef} size="lg" onClick={() => actions.onAdmit(outcome.code)} disabled={busy}>Admit &amp; flag</Button>
            <Button size="lg" variant="secondary" onClick={actions.onNext}>Don’t admit</Button>
          </div>
        );
      } else {
        // An admin turned this off in Check-in settings.
        box = 'Admitting tickets that aren’t in the list is turned off. Send the hiker to the event lead.';
        buttons = next('Don’t admit');
      }
      break;
  }

  const t = tones[tone];
  const Icon = t.Icon;

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/45">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        aria-describedby="result-name"
        data-kind={outcome.kind}
        data-elapsed-ms={elapsedMs !== undefined ? Math.round(elapsedMs) : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return actions.onNext();
          if (e.key !== 'Tab') return;
          // Keep Tab inside the sheet while it's open (it covers the scanner like a modal).
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
          if (!items.length) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
        className="max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-[28px] bg-white px-5 pb-8 pt-3.5 text-center shadow-2xl"
      >
        <span aria-hidden className="mx-auto block h-[5px] w-[60px] rounded-full bg-line" />
        {reentering && outcome.kind === 'already_used' ? (
          <ReentryForm holderName={outcome.holderName} onCancel={() => setReentering(false)} onSubmit={actions.onReentry} />
        ) : reporting ? (
          <form
            className="mt-6 text-left"
            onSubmit={async (e) => {
              e.preventDefault();
              await actions.onReport(outcome.kind === 'already_used' ? outcome.code : '', note.trim());
              setReporting(false);
            }}
          >
            <h2 id="result-title" className="text-xl">Report an issue</h2>
            <p id="result-name" className="mt-1 text-sm text-slate">An admin will look at this ticket. Say what happened at the gate.</p>
            <Textarea className="mt-4" label="What happened?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} autoFocus />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button type="submit" size="lg" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</Button>
              <Button type="button" size="lg" variant="secondary" onClick={() => setReporting(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <>
            <span className={cn('mx-auto mt-6 grid size-20 place-items-center rounded-full', t.circle)}>
              <Icon size={34} strokeWidth={2.75} aria-hidden className={t.icon} />
            </span>
            <h2 id="result-title" className={cn('mt-4 text-[26px] font-extrabold', t.title)}>{title}</h2>
            <p id="result-name" className="mt-1.5 text-lg font-bold text-ink">{name}</p>
            {sub && <p className="mt-1 text-sm text-slate">{sub}</p>}
            <div className={cn('mt-5 rounded-xl px-4 py-3.5 text-left text-sm', boxClass ?? t.box)}>{box}</div>
            <div className="mt-6">{buttons}</div>
          </>
        )}
      </div>
    </div>
  );
}

/** "Allow re-entry": a supervisor types the event PIN on the staff phone. Errors show under the field (NFR-024). */
function ReentryForm({ holderName, onCancel, onSubmit }: { holderName: string; onCancel: () => void; onSubmit: ResultActions['onReentry'] }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-6 text-left"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^\d{4,6}$/.test(pin)) return setError('Enter the 4–6 digit PIN.');
        setBusy(true);
        setError(null);
        const result = await onSubmit(pin);
        setBusy(false);
        if (result) {
          setError(result.error);
          setLocked(!!result.locked);
          setPin('');
        }
      }}
    >
      <h2 id="result-title" className="text-xl">Allow re-entry</h2>
      <p id="result-name" className="mt-1 text-sm text-slate">
        A supervisor enters the event PIN to let {holderName} back in. It’s recorded as re-entry, supervisor approved.
      </p>
      <Input
        className="mt-4"
        label="Supervisor PIN"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        error={error ?? undefined}
        disabled={locked || busy}
        autoFocus
      />
      {locked ? (
        <Button type="button" size="lg" block className="mt-5" onClick={onCancel}>Close</Button>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Checking…' : 'Approve'}</Button>
          <Button type="button" size="lg" variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      )}
    </form>
  );
}
