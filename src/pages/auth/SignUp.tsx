import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi, authError } from '@/api/endpoints';
import { Button, Checkbox, Input, PasswordInput } from '@/components/ui';
import { emailSchema, nameSchema, normalisePhone, passwordSchema, phoneSchema } from '@/lib/validation';
import type { VerifyState } from '@/features/auth/flowState';
import { notifyError } from '@/lib/notify';

// Figma: "Auth / Sign up" (AUTH-001..AUTH-004, AUTH-006). Sign-up is optional: guests can always buy without it.
// Guest tickets bought with the same email or phone join the new account once it's verified.

const schema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  acceptTerms: z.boolean().refine((v) => v, 'Please accept the Terms and Privacy Policy to continue'),
});
type Values = z.infer<typeof schema>;

export default function SignUp() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    // Pre-filled when coming from "Create free account" after a guest checkout.
    defaultValues: { fullName: params.get('name') ?? '', email: params.get('email') ?? '', phone: params.get('phone') ?? '', password: '', acceptTerms: false },
  });

  const onSubmit = handleSubmit(async (v) => {
    try {
      const started = await authApi.signup({ fullName: v.fullName.trim(), email: v.email.trim(), phone: normalisePhone(v.phone), password: v.password });
      const state: VerifyState = { ...started, firstName: v.fullName.trim().split(' ')[0] };
      navigate(`/verify?id=${encodeURIComponent(started.verificationId)}`, { state });
    } catch (err) {
      const e = authError(err);
      // AUTH-004: a verified account already uses this email or phone.
      if (e?.code === 'email_taken' || e?.code === 'phone_taken') {
        const field = e.code === 'email_taken' ? 'email' : 'phone';
        setError(field, { message: `An account already uses this ${field === 'email' ? 'email' : 'phone number'}.` }, { shouldFocus: true });
        notifyError(
          <>
            You already have an account. <Link to="/login">Log in</Link> instead, or <Link to="/forgot-password">reset your password</Link> if you’ve forgotten it.
          </>,
          { id: 'signup' },
        );
      } else notifyError('We couldn’t create your account. Please check your connection and try again.', { id: 'signup' });
    }
  });

  return (
    <div>
      <h1 className="text-[28px] md:text-[32px]">Create your account</h1>
      <p className="mt-2 text-[15px] text-slate">Join the group and book your first hike in minutes.</p>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <Input label="Full name" autoComplete="name" {...register('fullName')} error={errors.fullName?.message} />
        <Input label="Email address" type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
        <Input label="Phone number" type="tel" inputMode="tel" autoComplete="tel" {...register('phone')} error={errors.phone?.message} />
        <PasswordInput
          label="Password"
          autoComplete="new-password"
          hint="At least 8 characters, with a number and a symbol."
          {...register('password')}
          error={errors.password?.message}
        />
        <p className="rounded-xl bg-canvas p-3 text-[13px] text-slate">
          Bought a ticket as a guest before? Use the same email or phone and we’ll add those tickets and your hiking history to this account.
        </p>
        <Checkbox
          label={
            <span className="text-[13px] text-slate">
              I agree to the{' '}
              {/* New tab, so the half-filled form isn't lost. */}
              <a href="/terms" target="_blank" rel="noopener" className="font-bold text-forest underline">Terms</a> and{' '}
              <a href="/privacy" target="_blank" rel="noopener" className="font-bold text-forest underline">Privacy Policy</a>
            </span>
          }
          {...register('acceptTerms')}
          error={errors.acceptTerms?.message}
        />
        <Button type="submit" block size="lg" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'}</Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate">
        Already have an account? <Link to="/login" className="font-bold text-forest hover:underline">Log in</Link>
      </p>
    </div>
  );
}
