import { useEffect, useState } from 'react';
import { authError, profileApi } from '@/api/endpoints';
import { Alert, Button, Dialog, OtpInput } from '@/components/ui';
import { useCountdown } from '@/lib/useCountdown';
import type { HikerProfile, PendingContactChange } from '@/types/domain';
import { notifyError } from '@/lib/notify';

/**
 * AUTH-017: a new email or phone needs the code sent to it before it replaces the old one. Closing the dialog
 * leaves the change pending; the profile page offers "Enter code" again.
 */
export function VerifyContactDialog({
  change,
  onClose,
  onVerified,
}: {
  change: PendingContactChange | null;
  onClose: () => void;
  onVerified: (profile: HikerProfile, change: PendingContactChange) => void;
}) {
  const what = change?.field === 'phone' ? 'phone number' : 'email';
  return (
    <Dialog open={!!change} onClose={onClose} title={`Verify your new ${what}`}>
      {change && <VerifyForm key={change.verificationId} change={change} onClose={onClose} onVerified={onVerified} />}
    </Dialog>
  );
}

function VerifyForm({ change, onClose, onVerified }: { change: PendingContactChange; onClose: () => void; onVerified: (profile: HikerProfile, change: PendingContactChange) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(change.resendAvailableAt);
  const [resent, setResent] = useState(false);
  const resend = useCountdown(resendAt);
  const isPhone = change.field === 'phone';

  const verify = async (value: string) => {
    setError(null);
    setBusy(true);
    try {
      onVerified(await profileApi.confirmContact(change.verificationId, value), change);
    } catch (err) {
      const e = authError(err);
      setCode('');
      // A wrong code belongs to the code field; anything else (expired, offline) is a toast.
      if (e?.code === 'invalid_code') setError(`That code isn’t right.${e.attemptsLeft !== undefined ? ` ${e.attemptsLeft} ${e.attemptsLeft === 1 ? 'try' : 'tries'} left.` : ''}`);
      else notifyError(e?.message ?? 'We couldn’t check the code. Please try again.', { id: 'contact-verify' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (code.length === 6 && !busy) void verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const sendAgain = async () => {
    setError(null);
    try {
      const p = await profileApi.resendContactCode(change.verificationId);
      const updated = p.pendingContacts.find((c) => c.verificationId === change.verificationId);
      if (updated) setResendAt(updated.resendAvailableAt);
      setResent(true);
    } catch (err) {
      notifyError(authError(err)?.message ?? 'We couldn’t send a new code. Please try again.', { id: 'contact-verify' });
    }
  };

  return (
    <form
      className="p-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (/^\d{6}$/.test(code)) void verify(code);
        else setError('Enter all 6 digits of the code.');
      }}
    >
      <h2 className="text-xl">Verify your new {isPhone ? 'phone number' : 'email'}</h2>
      <p className="mt-1 text-sm text-slate">
        We sent a 6-digit code {isPhone ? 'by SMS to' : 'to'} <span className="font-semibold text-ink">{change.value}</span>. Until you enter it, we’ll keep using your current {isPhone ? 'number' : 'email'}.
      </p>
      {resent && !error && <Alert tone="success" className="mt-4">New code sent.</Alert>}
      <div className="mt-5">
        <OtpInput label="Verification code" value={code} onChange={setCode} error={error ?? undefined} disabled={busy} autoFocus />
      </div>
      <p className="mt-4 text-sm text-slate">
        Didn’t get it?{' '}
        {resend.expired ? (
          <button type="button" onClick={sendAgain} className="font-bold text-forest hover:underline">Send a new code</button>
        ) : (
          <span>You can ask for a new code in {resend.label}.</span>
        )}
      </p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Later</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</Button>
      </div>
    </form>
  );
}
