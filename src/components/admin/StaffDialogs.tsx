import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { QRCodeSVG } from 'qrcode.react';
import { adminPeopleApi, authError, type AuthenticatorSetup, type StaffMember } from '@/api/endpoints';
import { Button, Dialog, Input, OtpInput, Select, Skeleton } from '@/components/ui';
import { ROLE_ACCESS, ROLE_LABEL, STAFF_ROLES, type StaffRole } from '@/lib/permissions';
import { errorMessage, notifyError } from '@/lib/notify';
import { emailSchema, nameSchema } from '@/lib/validation';

// Dialogs for Admin / Staff & roles: inviting staff, and setting up your own authenticator for two-step login
// (ADM-001).

const inviteSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: z.enum(STAFF_ROLES),
});
type InviteValues = z.infer<typeof inviteSchema>;

export function InviteStaffDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (m: StaffMember) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { name: '', email: '', role: 'checkin_staff' } });
  const close = () => {
    reset();
    onClose();
  };
  const role = watch('role');
  return (
    <Dialog open={open} onClose={close} title="Invite staff">
      <form
        noValidate
        className="p-6"
        onSubmit={handleSubmit(async (v) => {
          try {
            const m = await adminPeopleApi.inviteStaff({ name: v.name.trim(), email: v.email.trim(), role: v.role });
            reset();
            onInvited(m);
          } catch (err) {
            if (authError(err)?.code === 'email_taken') setError('email', { message: 'This email already belongs to a staff member or invite.' }, { shouldFocus: true });
            else notifyError(errorMessage(err, 'We couldn’t send the invite. Please try again.'), { id: 'invite' });
          }
        })}
      >
        <h2 className="text-xl">Invite staff</h2>
        <p className="mt-1 text-sm text-slate">They get an email to set a password and their authenticator app.</p>
        <div className="mt-5 space-y-4">
          <Input label="Full name" autoComplete="off" {...register('name')} error={errors.name?.message} />
          <Input label="Work email" type="email" autoComplete="off" {...register('email')} error={errors.email?.message} />
          <Select label="Role" {...register('role')} error={errors.role?.message}>
            {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
          <p className="-mt-2 text-xs text-slate">{ROLE_ACCESS[role as StaffRole]}</p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={close} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send invite'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Groups a base32 secret in fours so it's easier to type into an authenticator app. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

export function AuthenticatorDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: StaffMember) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Set up two-step login" className="max-w-lg">
      {open && <AuthenticatorSetupForm onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function AuthenticatorSetupForm({ onClose, onDone }: { onClose: () => void; onDone: (m: StaffMember) => void }) {
  const [setup, setSetup] = useState<AuthenticatorSetup | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminPeopleApi
      .startAuthenticatorSetup()
      .then((s) => !cancelled && setSetup(s))
      .catch((err) => notifyError(errorMessage(err, 'We couldn’t start the setup. Please try again.'), { id: 'totp' }));
    return () => {
      cancelled = true;
    };
  }, []);

  const confirm = async (value: string) => {
    setError(null);
    setBusy(true);
    try {
      onDone(await adminPeopleApi.confirmAuthenticator(value));
    } catch (err) {
      setCode('');
      const e = authError(err);
      if (e?.code === 'invalid_code') setError('That code isn’t right. Check the time on your phone and try again.');
      else notifyError(errorMessage(err, 'We couldn’t confirm the code. Please try again.'), { id: 'totp' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (code.length === 6 && !busy) void confirm(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <form
      noValidate
      className="p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (/^\d{6}$/.test(code)) void confirm(code);
        else setError('Enter all 6 digits from your authenticator app.');
      }}
    >
      <h2 className="text-xl">Set up two-step login</h2>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate">
        <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>Scan this code, or type the key by hand.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="mt-5 flex flex-col items-center gap-4 rounded-xl bg-canvas p-5 sm:flex-row sm:items-start">
        {setup ? (
          <div className="rounded-xl bg-white p-3 text-ink">
            <QRCodeSVG value={setup.otpauthUri} size={148} fgColor="currentColor" bgColor="transparent" title="Authenticator setup code" />
          </div>
        ) : (
          <Skeleton className="size-[172px] bg-white" />
        )}
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-ink">Setup key</p>
          <p className="mt-1 break-all font-mono text-[13px] text-ink">{setup ? grouped(setup.secret) : '…'}</p>
          <p className="mt-2 text-xs text-slate">Time-based, 6 digits, every 30 seconds.</p>
        </div>
      </div>
      <div className="mt-5">
        <OtpInput label="Code from your authenticator app" value={code} onChange={setCode} error={error ?? undefined} disabled={busy || !setup} />
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy || !setup}>{busy ? 'Checking…' : 'Turn on two-step login'}</Button>
      </div>
    </form>
  );
}
