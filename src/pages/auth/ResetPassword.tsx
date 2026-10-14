import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi, authError } from '@/api/endpoints';
import { Alert, Button, PasswordInput, PasswordStrength } from '@/components/ui';
import type { LoginNotice } from '@/features/auth/flowState';
import { passwordSchema } from '@/lib/validation';
import { notifyError } from '@/lib/notify';
import { useBranding } from '@/features/branding/BrandingContext';

// Figma: "Auth / Reset password" (AUTH-010). Reached from the emailed link: /reset-password?token=…

const schema = z
  .object({ password: passwordSchema, confirm: z.string().min(1, 'Type the new password again') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The passwords don’t match' });
type Values = z.infer<typeof schema>;

export default function ResetPassword() {
  const { name: brand } = useBranding();
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [linkProblem, setLinkProblem] = useState<string | null>(token ? null : 'This reset link is incomplete.');
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) return;
    try {
      await authApi.resetPassword(token, password);
      const state: LoginNotice = { notice: 'Password updated. Log in with your new password.' };
      navigate('/login', { replace: true, state });
    } catch (err) {
      const e = authError(err);
      if (e?.code === 'token_invalid') setLinkProblem(e.message);
      else if (e?.code === 'password_reused') setError('password', { message: e.message }, { shouldFocus: true });
      else notifyError('We couldn’t update your password. Check your connection and try again.', { id: 'reset' });
    }
  });

  return (
    <div>
      <h1 className="text-[28px] md:text-[32px]">Choose a new password</h1>
      <p className="mt-2 text-[15px] text-slate">Pick something you haven’t used on {brand} before.</p>

      {linkProblem ? (
        <Alert tone="error" title={linkProblem} className="mt-6">
          Reset links work once and expire after 30 minutes. <Link to="/forgot-password" className="font-bold text-forest underline">Request a new link</Link>.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          <div>
            <PasswordInput
              label="New password"
              autoComplete="new-password"
              hint={watch('password') ? undefined : 'At least 8 characters, with a number and a symbol.'}
              {...register('password')}
              error={errors.password?.message}
            />
            <PasswordStrength password={watch('password')} />
          </div>
          <PasswordInput label="Confirm password" autoComplete="new-password" {...register('confirm')} error={errors.confirm?.message} />
          <Button type="submit" block size="lg" disabled={isSubmitting}>{isSubmitting ? 'Updating…' : 'Update password'}</Button>
        </form>
      )}
    </div>
  );
}
