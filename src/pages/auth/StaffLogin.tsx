import { useEffect, useState } from 'react';
import { adminHome } from '@/lib/permissions';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Lock } from 'lucide-react';
import { authApi, authError, type StaffChallenge } from '@/api/endpoints';
import { Button, Input, Logo, OtpInput, PasswordInput } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { MockHint } from '@/features/auth/MockHint';
import type { LoginNotice } from '@/features/auth/flowState';
import { emailSchema } from '@/lib/validation';
import type { User } from '@/types/domain';
import { notifyError } from '@/lib/notify';
import { useBranding } from '@/features/branding/BrandingContext';

// Figma: "Admin / Log in" (ADM-001). Separate from hiker log-in: work email + password, then a 6-digit code
// from an authenticator app (two-step verification is required for every staff account). Errors follow the
// same rules as hiker log-in: one generic message (AUTH-009) and lockout from the API (AUTH-013).

const schema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password') });
type Values = z.infer<typeof schema>;

const homeFor = (u: User) => adminHome(u);

export default function StaffLogin() {
  const { name: brand } = useBranding();
  const navigate = useNavigate();
  const from = (useLocation().state as LoginNotice | null)?.from;
  const { signIn } = useAuth();
  const [challenge, setChallenge] = useState<StaffChallenge | null>(null);
  // Marks the email red after wrong credentials; the message itself is a toast (AUTH-009 wording).
  const [badCredentials, setBadCredentials] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setBadCredentials(false);
    try {
      setChallenge(await authApi.staffLogin(email.trim(), password));
    } catch (err) {
      const e = authError(err);
      if (e?.code === 'invalid_credentials') {
        setBadCredentials(true);
        notifyError(`Incorrect email or password.${e.attemptsLeft !== undefined ? ` ${e.attemptsLeft} ${e.attemptsLeft === 1 ? 'attempt' : 'attempts'} left before a ${e.lockMinutes ?? 15}-minute lock.` : ''}`, { id: 'staff-login' });
      } else if (e?.code === 'locked' || e?.code === 'suspended') notifyError(e.message, { id: 'staff-login' });
      else notifyError('We couldn’t sign you in just now. Check your connection and try again.', { id: 'staff-login' });
    }
  });

  const verify = async (value: string) => {
    if (!challenge) return;
    setCodeError(null);
    setVerifying(true);
    try {
      const user = await authApi.staffVerify(challenge.challengeId, value);
      signIn(user);
      navigate(from ? `${from.pathname}${from.search ?? ''}` : homeFor(user), { replace: true });
    } catch (err) {
      const e = authError(err);
      setCode('');
      if (e?.code === 'code_expired') {
        setChallenge(null);
        notifyError(e.message, { id: 'staff-login' });
      } else if (e?.code === 'invalid_code') setCodeError(e.message);
      else notifyError('We couldn’t check the code. Please try again.', { id: 'staff-login' });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (code.length === 6 && !verifying) void verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-pine px-4 py-10">
      {/* Decorative circles from the Figma frame */}
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-36 size-[520px] rounded-full bg-forest/60" />
      <span aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-[440px] rounded-full bg-moss/30" />

      <main id="main" tabIndex={-1} className="relative w-full max-w-[400px] rounded-3xl bg-white p-8 shadow-xl focus:outline-none sm:p-10">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label={`${brand} home`}><Logo /></Link>
          <span className="rounded-full bg-sun-light px-3 py-1 text-xs font-bold text-sun-dark">Staff</span>
        </div>

        {!challenge ? (
          <>
            <h1 className="mt-10 text-[26px]">Staff sign in</h1>
            <p className="mt-1.5 text-sm text-slate">Admins and check-in staff only.</p>
            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
              <Input label="Work email" type="email" autoComplete="username" {...register('email')} invalid={badCredentials} error={errors.email?.message} />
              <PasswordInput label="Password" autoComplete="current-password" {...register('password')} error={errors.password?.message} />
              <Button type="submit" block size="lg" className="!mt-6" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</Button>
            </form>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate">
              <Lock size={13} aria-hidden /> Two-step verification required
            </p>
            <p className="mt-3 text-center">
              <Link to="/forgot-password" className="text-sm font-bold text-forest hover:underline">Forgot password?</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-10 text-[26px]">Enter your code</h1>
            <p className="mt-1.5 text-sm text-slate">
              {challenge.method === 'authenticator'
                ? `Open your authenticator app and enter the 6-digit code for ${brand}.`
                : `We sent a 6-digit code to ${challenge.destination ?? 'your work email'}.`}
            </p>
            <form
              className="mt-6"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (/^\d{6}$/.test(code)) void verify(code);
                else setCodeError('Enter all 6 digits of the code.');
              }}
            >
              <OtpInput label="Verification code" value={code} onChange={setCode} error={codeError ?? undefined} disabled={verifying} autoFocus />
              <Button type="submit" block size="lg" className="mt-6" disabled={verifying}>{verifying ? 'Checking…' : 'Verify and sign in'}</Button>
            </form>
            <button
              type="button"
              onClick={() => {
                setChallenge(null);
                setCode('');
                setCodeError(null);
              }}
              className="mx-auto mt-4 flex items-center gap-1.5 text-sm font-bold text-forest hover:underline"
            >
              <ArrowLeft size={16} aria-hidden /> Use a different account
            </button>
          </>
        )}
        {import.meta.env.DEV && <MockHint>kunle@hip.ng (admin) or tola@hip.ng (check-in) / Hiking123! · code 123456</MockHint>}
      </main>
    </div>
  );
}
