import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, FileText } from 'lucide-react';
import { adminApi, type ParticipantRow } from '@/api/endpoints';
import { Button, Dialog, Input, Select, Textarea } from '@/components/ui';
import { TIME_ZONE, formatTime } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';
import type { CheckInMethod } from '@/types/domain';

// Figma: "Admin / Attendance correction" (ATT-016..ATT-018). The reason is required and saved to the audit log
// with the admin's name and the old and new state.

const schema = z
  .object({
    newState: z.enum(['checked_in', 'not_checked_in']),
    time: z.string(),
    method: z.enum(['manual', 'qr', 'qr_offline']),
    reason: z.string().trim().min(10, 'Explain what happened in at least 10 characters. It goes in the audit log.').max(500, 'Keep it under 500 characters'),
  })
  .refine((v) => v.newState === 'not_checked_in' || /^\d{2}:\d{2}$/.test(v.time), { path: ['time'], message: 'Enter the check-in time' });
type Values = z.infer<typeof schema>;

const methodLabel: Record<CheckInMethod, string> = { manual: 'Manual', qr: 'QR scan', qr_offline: 'QR (offline)' };
const lagosTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const lagosDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(iso));

export function AttendanceCorrectionDialog({
  eventId,
  eventStartsAt,
  row,
  onClose,
  onSaved,
}: {
  eventId: string;
  eventStartsAt: string;
  row: ParticipantRow | null;
  onClose: () => void;
  onSaved: (row: ParticipantRow) => void;
}) {
  return (
    <Dialog open={!!row} onClose={onClose} title="Correct attendance" className="max-w-lg">
      {row && <CorrectionForm key={row.ticketCode} eventId={eventId} eventStartsAt={eventStartsAt} row={row} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function CorrectionForm({ eventId, eventStartsAt, row, onClose, onSaved }: { eventId: string; eventStartsAt: string; row: ParticipantRow; onClose: () => void; onSaved: (row: ParticipantRow) => void }) {
  const isIn = !!row.checkIn;
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      newState: 'checked_in',
      time: row.checkIn ? lagosTime(row.checkIn.at) : lagosTime(eventStartsAt),
      method: row.checkIn?.method ?? 'manual',
      reason: '',
    },
  });
  const newState = watch('newState');

  const submit = handleSubmit(async (v) => {
    try {
      // The time is on the event's day (Abuja), or the original check-in's day when editing one.
      const day = lagosDate(row.checkIn?.at ?? eventStartsAt);
      const saved = await adminApi.correctAttendance(eventId, {
        ticketCode: row.ticketCode,
        checkedIn: v.newState === 'checked_in',
        at: v.newState === 'checked_in' ? new Date(`${day}T${v.time}:00+01:00`).toISOString() : undefined,
        method: v.newState === 'checked_in' ? v.method : undefined,
        reason: v.reason.trim(),
      });
      onSaved(saved);
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t save the correction. Please try again.'), { id: 'correction' });
    }
  });

  const current = row.checkIn ? `Checked in ${formatTime(row.checkIn.at)} · ${methodLabel[row.checkIn.method]}` : 'Not checked in';

  return (
    <form noValidate onSubmit={submit} className="p-6">
      <h2 className="text-xl">Correct attendance</h2>
      <p className="mt-1 text-sm text-slate">{row.holderName} · {row.ticketCode} · {row.ticketTypeName}</p>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="rounded-xl bg-canvas p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate">Current</p>
          <p className="mt-1 text-sm font-semibold text-ink">{current}</p>
        </div>
        <ArrowRight size={18} aria-hidden className="text-slate" />
        <div className="rounded-xl bg-mint p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-forest">New</p>
          {isIn ? (
            <Select label="New state" hideLabel {...register('newState')} className="mt-1">
              <option value="checked_in">Checked in (change time)</option>
              <option value="not_checked_in">Not checked in</option>
            </Select>
          ) : (
            <p className="mt-1 text-sm font-semibold text-forest">Checked in</p>
          )}
        </div>
      </div>

      {newState === 'checked_in' && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Input label="Check-in time" type="time" {...register('time')} error={errors.time?.message} />
          <Select label="Method" {...register('method')} error={errors.method?.message}>
            <option value="manual">Manual</option>
            <option value="qr">QR scan</option>
            <option value="qr_offline">QR (offline)</option>
          </Select>
        </div>
      )}

      <Textarea
        label="Reason (required)"
        className="mt-4"
        rows={3}
        placeholder="e.g. Scanner phone died at Gate B. Hiker was on the bus manifest and confirmed by the lead guide."
        {...register('reason')}
        error={errors.reason?.message}
      />
      <p className="mt-3 flex items-center gap-2 text-[13px] text-slate">
        <FileText size={15} aria-hidden className="shrink-0" /> Saved to the audit log with your name, the old and new state.
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save correction'}</Button>
      </div>
    </form>
  );
}
