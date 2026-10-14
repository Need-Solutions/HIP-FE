import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input } from '@/components/ui';
import { authError } from '@/api/endpoints';
import { emailSchema } from '@/lib/validation';
import { useAuth } from './AuthContext';
import { notifyError } from '@/lib/notify';

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof schema>;

/** Compact log-in form for use inside another flow (checkout), so the buyer doesn't lose their place. */
export function InlineLoginForm({ onLoggedIn }: { onLoggedIn?: () => void }) {
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    try {
      await login(email, password);
      onLoggedIn?.();
    } catch (err) {
      const e = authError(err);
      // Same wording whether the email or the password was wrong (AUTH-009); lockout details come from the API (AUTH-013).
      const say = (text: string) => notifyError(text, { id: 'inline-login' });
      if (e?.code === 'locked') say(e.message);
      else if (e?.code === 'invalid_credentials')
        say(`Incorrect email or password.${e.attemptsLeft !== undefined ? ` ${e.attemptsLeft} ${e.attemptsLeft === 1 ? 'attempt' : 'attempts'} left before a ${e.lockMinutes ?? 15}-minute lock.` : ''}`);
      else if (e?.code === 'unverified') say('Please verify your account first. Log in from the main log-in page to get a new code.');
      else say('We couldn’t log you in just now. Please try again.');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Input label="Email" type="email" autoComplete="email" {...register('email')} id="login-email" error={errors.email?.message} />
      <Input label="Password" type="password" autoComplete="current-password" {...register('password')} id="login-password" error={errors.password?.message} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Logging in…' : 'Log in'}</Button>
        <Link to="/forgot-password" className="text-sm font-semibold text-forest hover:underline">Forgot password?</Link>
      </div>
    </form>
  );
}
