import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authError, type AuthErrorBody } from '@/api/endpoints';
import { Alert, Button, Checkbox, Input, PasswordInput } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { MockHint } from '@/features/auth/MockHint';
import type { LoginNotice, VerifyState } from '@/features/auth/flowState';
import { notifyError } from '@/lib/notify';
import { emailSchema, isPhone } from '@/lib/validation';
import { useBranding } from '@/features/branding/BrandingContext';

// Figma: "Auth / Log in" and "Auth / Log in – error" (AUTH-008, AUTH-009, AUTH-013).
// AUTH-009: a wrong email and a wrong password get exactly the same message, so the page never reveals
// whether an account exists. AUTH-013: attempts left and lockout come from the API.

const schema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Enter your email or phone number')
    .refine((v) => emailSchema.safeParse(v).success || isPhone(v), 'Enter a valid email address or phone number'),
  password: z.string().min(1, 'Enter your password'),
  remember: z.boolean(),
});
type Values = z.infer<typeof schema>;


export default function Login() {
  const { name: brand } = useBranding();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LoginNotice | null) ?? {};
  // Marks both fields red after wrong credentials; the message itself is a toast.
  const [badCredentials, setBadCredentials] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { identifier: '', password: '', remember: false } });

  const destination = state.from ? `${state.from.pathname}${state.from.search ?? ''}` : '/account';

  const onSubmit = handleSubmit(async ({ identifier, password, remember }) => {
    setBadCredentials(false);
    try {
      await login(identifier.trim(), password, remember);
      navigate(destination, { replace: true });
    } catch (err) {
      const e: AuthErrorBody | null = authError(err);
      if (e?.code === 'unverified' && e.verificationId) {
        const next: VerifyState = { verificationId: e.verificationId, destination: e.destination, channel: 'email' };
        navigate(`/verify?id=${encodeURIComponent(e.verificationId)}`, { state: next });
      } else if (e?.code === 'invalid_credentials') {
        setBadCredentials(true);
        // Same wording for a wrong email and a wrong password (AUTH-009); attempts left come from the API (AUTH-013).
        notifyError(
          `Incorrect email or password. ${
            e.attemptsLeft !== undefined
              ? `${e.attemptsLeft} ${e.attemptsLeft === 1 ? 'attempt' : 'attempts'} left before a ${e.lockMinutes ?? 15}-minute lock.`
              : 'Please try again.'
          }`,
          { id: 'login' },
        );
      } else if (e?.code === 'suspended') {
        notifyError(e.message, { id: 'login' });
      } else if (e?.code === 'locked') {
        notifyError(
          <>
            {e.message} You can also <Link to="/forgot-password">reset your password</Link>.
          </>,
          { id: 'login' },
        );
      } else notifyError('We couldn’t log you in. Check your connection and try again.', { id: 'login' });
    }
  });

  if (user && !isSubmitting) return <Navigate to={destination} replace />;

  return (
    <div>
      <h1 className="text-[28px] md:text-[32px]">Welcome back</h1>
      <p className="mt-2 text-[15px] text-slate">Log in to see your tickets and upcoming hikes.</p>

      {state.notice && <Alert tone="success" className="mt-6">{state.notice}</Alert>}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <Input
          label="Email or phone"
          autoComplete="username"
          {...register('identifier')}
          invalid={badCredentials}
          error={errors.identifier?.message}
        />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          {...register('password')}
          error={errors.password?.message ?? (badCredentials ? 'Check your details and try again.' : undefined)}
        />
        <div className="flex items-center justify-between gap-4">
          <Checkbox label={<span className="text-[13px] text-slate">Remember me</span>} {...register('remember')} />
          <Link to="/forgot-password" className="text-[13px] font-bold text-forest hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" block size="lg" disabled={isSubmitting}>{isSubmitting ? 'Logging in…' : 'Log in'}</Button>
      </form>

      <div className="mt-6 border-t border-line pt-6 text-center text-sm text-slate">
        New to {brand}? <Link to="/signup" className="font-bold text-forest hover:underline">Create an account</Link>
        <p className="mt-2">
          Bought as a guest? <Link to="/find-ticket" className="font-bold text-forest hover:underline">Find my ticket</Link>
        </p>
      </div>
      {import.meta.env.DEV && <MockHint>adaeze@example.com / Hiking123!</MockHint>}
    </div>
  );
}
