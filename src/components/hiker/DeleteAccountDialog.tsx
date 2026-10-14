import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authError, profileApi } from '@/api/endpoints';
import { Button, Dialog, PasswordInput } from '@/components/ui';
import { useBranding } from '@/features/branding/BrandingContext';

const schema = z.object({ password: z.string().min(1, 'Enter your password to confirm') });
type Values = z.infer<typeof schema>;

/** Account deletion needs the current password. What happens to past records is the backend's call (retention rules). */
export function DeleteAccountDialog({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => void }) {
  const { name: brand } = useBranding();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '' } });

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await profileApi.deleteAccount(password);
      onDeleted();
    } catch (err) {
      setError('password', { message: authError(err)?.code === 'invalid_credentials' ? 'That password isn’t right.' : 'We couldn’t delete your account. Please try again.' }, { shouldFocus: true });
    }
  });

  return (
    <Dialog open={open} onClose={close} title="Delete your account">
      <form onSubmit={onSubmit} noValidate className="p-6">
        <h2 className="text-xl">Delete your account?</h2>
        <p className="mt-2 text-sm text-slate">
          This can’t be undone. You’ll be logged out, and your tickets and hiking history won’t be available in {brand} any more. If you want a refund for an upcoming hike, request it first.
        </p>
        <PasswordInput label="Password" autoComplete="current-password" className="mt-5" {...register('password')} error={errors.password?.message} />
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={close} disabled={isSubmitting}>Keep my account</Button>
          <Button type="submit" variant="danger" disabled={isSubmitting}>{isSubmitting ? 'Deleting…' : 'Delete my account'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
