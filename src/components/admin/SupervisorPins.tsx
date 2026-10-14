import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import { Badge, Button, Card, Dialog, PasswordInput, Skeleton } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { formatDate, formatTime } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';
import type { SupervisorPinStatus } from '@/types/domain';

// Admin / Check-in settings → Supervisor PINs. A super admin sets a 4–6 digit PIN per event for approving re-entry.
// The server keeps only a salted hash and phones download only that hash (lib/pin.ts); the PIN is never shown again.

const schema = z
  .object({
    pin: z.string().regex(/^\d{4,6}$/, 'Use 4 to 6 digits'),
    confirm: z.string(),
  })
  .refine((v) => v.pin === v.confirm, { path: ['confirm'], message: 'The PINs don’t match' });

export function SupervisorPins({ enabled }: { enabled: boolean }) {
  const { hasRole } = useAuth();
  const canSet = hasRole('super_admin');
  const pins = useQuery({ queryKey: ['admin', 'supervisorPins'], queryFn: adminApi.supervisorPins });
  const [editing, setEditing] = useState<SupervisorPinStatus | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <Card className="mt-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">Supervisor PINs</h2>
          <p className="mt-1 text-sm text-slate">
            Staff enter the event’s PIN to let someone back in after they’ve checked in. Phones get only a salted hash of the PIN with their download.
          </p>
        </div>
        {!enabled && <Badge tone="gray">Re-entry PIN is off</Badge>}
      </div>
      {!canSet && <p className="mt-3 text-[13px] text-slate">Only a super admin can set or change PINs.</p>}
      {saved && <p role="status" className="mt-3 text-[13px] font-semibold text-forest">{saved}</p>}
      {pins.isLoading ? (
        <Skeleton className="mt-4 h-20" />
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {(pins.data ?? []).map((p) => (
            <li key={p.eventId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-semibold text-ink">{p.eventTitle} <span className="font-normal text-slate">· {formatDate(p.startsAt)}</span></p>
                <p className="text-[13px] text-slate">
                  {p.setAt ? `PIN set ${formatDate(p.setAt)}, ${formatTime(p.setAt)} by ${p.setBy}` : 'No PIN yet'}
                </p>
              </div>
              {canSet && (
                <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                  <KeyRound size={14} aria-hidden /> {p.setAt ? 'Change PIN' : 'Set PIN'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <PinDialog
        status={editing}
        onClose={() => setEditing(null)}
        onSaved={(s) => {
          setEditing(null);
          setSaved(`PIN saved for ${s.eventTitle}. Phones pick it up with their next download.`);
        }}
      />
    </Card>
  );
}

function PinDialog({ status, onClose, onSaved }: { status: SupervisorPinStatus | null; onClose: () => void; onSaved: (s: SupervisorPinStatus) => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { pin: '', confirm: '' } });
  const close = () => {
    reset();
    onClose();
  };
  return (
    <Dialog open={!!status} onClose={close} title="Set supervisor PIN">
      {status && (
        <form
          noValidate
          className="p-6"
          onSubmit={handleSubmit(async ({ pin }) => {
            try {
              const saved = await adminApi.setSupervisorPin(status.eventId, pin);
              await queryClient.invalidateQueries({ queryKey: ['admin', 'supervisorPins'] });
              reset();
              onSaved(saved);
            } catch (err) {
              notifyError(errorMessage(err, 'We couldn’t save the PIN. Please try again.'), { id: 'pin' });
            }
          })}
        >
          <h2 className="text-xl">{status.setAt ? 'Change' : 'Set'} supervisor PIN</h2>
          <p className="mt-1 text-sm text-slate">{status.eventTitle} · {formatDate(status.startsAt)}. Share it only with supervisors at the trailhead.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <PasswordInput label="New PIN" inputMode="numeric" autoComplete="new-password" maxLength={6} {...register('pin')} error={errors.pin?.message} />
            <PasswordInput label="Confirm PIN" inputMode="numeric" autoComplete="new-password" maxLength={6} {...register('confirm')} error={errors.confirm?.message} />
          </div>
          <p className="mt-3 text-[13px] text-slate">Phones that downloaded the list before this change keep the old PIN until they download again.</p>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={close} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save PIN'}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
