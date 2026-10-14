import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Smartphone } from 'lucide-react';
import { authApi, authError } from '@/api/endpoints';
import { Alert, Button, OtpInput } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { MockHint } from '@/features/auth/MockHint';
import type { VerifyState, WelcomeState } from '@/features/auth/flowState';
import { useCountdown } from '@/lib/useCountdown';
import { notifyError } from '@/lib/notify';

// Figma: "Auth / Verify OTP" (AUTH-005, NOT-002). Reached from sign-up, or from log-in when an account isn't
// verified yet. The verification ID is in the URL so a refresh keeps working; the rest comes from router state.

export default function VerifyOtp() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [info, setInfo] = useState<VerifyState>(() => (location.state as VerifyState | null) ?? {});
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(() => info.resendAvailableAt ?? new Date(Date.now() + 60_000).toISOString());
  const resend = useCountdown(resendAt);
  const verificationId = params.get('id');
  const channel = info.channel ?? 'email';

  const submit = async (value = code) => {
    if (!verificationId) return;
    if (!/^\d{6}$/.test(value)) return setError('Enter all 6 digits of the code.');
    setError(null);
    setBusy(true);
    try {
      const { user, mergedTickets } = await authApi.verify(verificationId, value);
      signIn(user);
      const state: WelcomeState = { firstName: info.firstName ?? user.fullName.split(' ')[0], mergedTickets };
      navigate('/welcome', { replace: true, state });
    } catch (err) {
      const e = authError(err);
      setCode('');
      if (e?.code === 'invalid_code') setError(`That code isn’t right.${e.attemptsLeft !== undefined ? ` ${e.attemptsLeft} ${e.attemptsLeft === 1 ? 'try' : 'tries'} left.` : ''}`);
      else if (e?.code === 'code_expired') notifyError(`${e.message} Use “Resend code” below.`, { id: 'verify' });
      else notifyError('We couldn’t check the code just now. Please try again.', { id: 'verify' });
    } finally {
      setBusy(false);
    }
  };

  // Submit as soon as the last digit is in.
  useEffect(() => {
    if (code.length === 6 && !busy) void submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const sendNew = async (to: 'email' | 'phone') => {
    if (!verificationId) return;
    setError(null);
    try {
      const started = await authApi.resendCode(verificationId, to);
      setInfo((prev) => ({ ...prev, ...started }));
      setResendAt(started.resendAvailableAt);
      setParams({ id: started.verificationId }, { replace: true });
      setCode('');
      setNotice(`We sent a new code to ${started.destination}.`);
    } catch (err) {
      notifyError(authError(err)?.message ?? 'We couldn’t send a new code. Please try again.', { id: 'verify' });
    }
  };

  if (!verificationId) {
    return (
      <div>
        <h1 className="text-[28px] md:text-[32px]">Verify your account</h1>
        <p className="mt-2 text-[15px] text-slate">This verification link is incomplete. Sign up again, or log in to get a new code.</p>
        <div className="mt-6 flex gap-3">
          <Link to="/signup" className="font-bold text-forest hover:underline">Sign up</Link>
          <Link to="/login" className="font-bold text-forest hover:underline">Log in</Link>
        </div>
      </div>
    );
  }

  const Icon = channel === 'email' ? Mail : Smartphone;
  return (
    <div>
      <span className="grid size-12 place-items-center rounded-xl bg-mint text-forest"><Icon size={22} aria-hidden /></span>
      <h1 className="mt-5 text-[28px] md:text-[32px]">Verify your {channel === 'email' ? 'email' : 'phone'}</h1>
      <p className="mt-2 text-[15px] text-slate">
        We sent a 6-digit code to {info.destination ?? (channel === 'email' ? 'your email' : 'your phone')}
      </p>

      {!!info.guestTicketsToMerge && (
        <Alert tone="success" title={`We found ${info.guestTicketsToMerge} ${info.guestTicketsToMerge === 1 ? 'ticket' : 'tickets'} you bought as a guest`} className="mt-5">
          {info.guestTicketsToMerge === 1 ? 'It' : 'They'}’ll be added to your account, with your hiking history, once you verify.
        </Alert>
      )}
      {notice && !error && <Alert tone="info" className="mt-5">{notice}</Alert>}

      <form
        className="mt-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <OtpInput label="Verification code" value={code} onChange={setCode} error={error ?? undefined} disabled={busy} autoFocus />
        <Button type="submit" block size="lg" className="mt-6" disabled={busy}>{busy ? 'Checking…' : 'Verify and continue'}</Button>
      </form>

      <div className="mt-6 space-y-3 text-sm">
        <p className="text-slate">
          Didn’t get it?{' '}
          {resend.expired ? (
            <button type="button" onClick={() => sendNew(channel)} className="font-bold text-forest hover:underline">Resend code</button>
          ) : (
            <span className="font-bold text-slate-mute">Resend code in {resend.label.replace(/^0/, '')}</span>
          )}
        </p>
        <button type="button" onClick={() => sendNew(channel === 'email' ? 'phone' : 'email')} className="font-bold text-forest hover:underline">
          Use {channel === 'email' ? 'phone number' : 'email'} instead
        </button>
      </div>
      <MockHint>the code is always 123456.</MockHint>
    </div>
  );
}
