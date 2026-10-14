import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { authApi } from '@/api/endpoints';
import { Alert, Button, Input } from '@/components/ui';
import { emailSchema } from '@/lib/validation';
import { notifyError } from '@/lib/notify';

// Figma: "Auth / Forgot password" (AUTH-010). The confirmation is identical whether or not the email has an
// account, so the form can't be used to find out who is registered.

const schema = z.object({ email: emailSchema });
type Values = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [state, setState] = useState<'idle' | 'sent'>('idle');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await authApi.forgotPassword(email.trim());
      setState('sent');
    } catch {
      // A network failure isn't about the account, so it's fine to say so and offer a retry.
      notifyError('We couldn’t send the link. Check your connection and try again.', { id: 'forgot' });
    }
  });

  return (
    <div>
      <h1 className="text-[28px] md:text-[32px]">Reset your password</h1>
      <p className="mt-2 text-[15px] text-slate">Enter the email on your account and we’ll send a reset link.</p>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <Input label="Email address" type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
        <Button type="submit" block size="lg" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : state === 'sent' ? 'Send another link' : 'Send reset link'}
        </Button>
      </form>
      <p className="mt-5 text-center">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-bold text-forest hover:underline">
          <ArrowLeft size={16} aria-hidden /> Back to log in
        </Link>
      </p>

      {state === 'sent' && (
        <Alert tone="success" title="If an account exists, a link is on its way." className="mt-8">
          Check spam too. The link expires in 30 minutes.
        </Alert>
      )}
    </div>
  );
}
