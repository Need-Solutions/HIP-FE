import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarDays, ImagePlus, Lock, Plus, Ticket, Trash2 } from 'lucide-react';
import { adminApi, type EventInput, type TicketTypeInput } from '@/api/endpoints';
import { Alert, Badge, Button, ButtonLink, Card, Dialog, EmptyState, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { TicketTypeDialog } from '@/components/admin/TicketTypeDialog';
import { coverArt } from '@/components/events/coverArt';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { TIME_ZONE, formatDate, formatNaira, formatTime } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';
import type { Difficulty, HikeEvent, TicketType } from '@/types/domain';

// Figma: "Admin / Create event" (EVT-001..EVT-009, EVT-010 cancel). "Save draft" needs only a title; "Publish event"
// needs every required field and at least one ticket type. Errors show under each field (NFR-024).

const LAGOS_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });
const LAGOS_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const today = () => LAGOS_DATE.format(new Date());

const ticketTypeSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  priceKobo: z.number(),
  quantityLimit: z.number(),
  salesStart: z.string(),
  salesEnd: z.string(),
});

const base = z.object({
  title: z.string().trim().min(3, 'Give the event a title (at least 3 characters)').max(80, 'Keep the title under 80 characters'),
  description: z.string().trim(),
  date: z.string(),
  startTime: z.string(),
  durationLabel: z.string().trim(),
  meetingPoint: z.string().trim(),
  location: z.string().trim(),
  difficulty: z.enum(['easy', 'moderate', 'challenging']),
  capacity: z.string().trim(),
  registrationDeadline: z.string(),
  requiredEquipment: z.string(),
  emergencyInfo: z.string().trim(),
  requirements: z.string().trim(),
  coverImageUrl: z.string().optional(),
  ticketTypes: z.array(ticketTypeSchema),
});
type Values = z.infer<typeof base>;

/** Everything needed to put the event on sale. */
const publishSchema = base.superRefine((v, ctx) => {
  const need = (path: keyof Values, ok: boolean, message: string) => !ok && ctx.addIssue({ code: 'custom', path: [path], message });
  need('description', v.description.length >= 20, 'Describe the hike in at least 20 characters');
  need('date', !!v.date, 'Choose the date');
  need('date', !v.date || v.date >= today(), 'The date has passed');
  need('startTime', !!v.startTime, 'Choose the start time');
  need('durationLabel', !!v.durationLabel, 'Say roughly how long it takes, e.g. “About 6 hrs” or “2 days”');
  need('meetingPoint', !!v.meetingPoint, 'Where should hikers meet?');
  need('location', !!v.location, 'Where is the trail?');
  const cap = Number(v.capacity);
  need('capacity', Number.isInteger(cap) && cap >= 1 && cap <= 10_000, 'Enter a whole number between 1 and 10,000');
  need('registrationDeadline', !!v.registrationDeadline, 'Choose when registration closes');
  if (v.registrationDeadline && v.date && v.startTime) need('registrationDeadline', v.registrationDeadline <= `${v.date}T${v.startTime}`, 'Registration must close before the hike starts');
  need('emergencyInfo', !!v.emergencyInfo, 'Add emergency information (guide, medic, nearest hospital)');
  need('ticketTypes', v.ticketTypes.length > 0, 'Add at least one ticket type');
  const deadlineDay = v.registrationDeadline.slice(0, 10);
  v.ticketTypes.forEach((t) => {
    if (deadlineDay && t.salesEnd > deadlineDay) ctx.addIssue({ code: 'custom', path: ['ticketTypes'], message: `“${t.name}” sales end after registration closes` });
  });
});

const empty: Values = {
  title: '',
  description: '',
  date: '',
  startTime: '06:00',
  durationLabel: '',
  meetingPoint: '',
  location: '',
  difficulty: 'moderate',
  capacity: '',
  registrationDeadline: '',
  requiredEquipment: '',
  emergencyInfo: '',
  requirements: '',
  coverImageUrl: undefined,
  ticketTypes: [],
};

function toValues(e: HikeEvent, types: TicketType[]): Values {
  return {
    title: e.title,
    description: e.description,
    date: LAGOS_DATE.format(new Date(e.startsAt)),
    startTime: LAGOS_TIME.format(new Date(e.startsAt)),
    durationLabel: e.durationLabel,
    meetingPoint: e.meetingPoint,
    location: e.location,
    difficulty: e.difficulty,
    capacity: e.capacity ? String(e.capacity) : '',
    registrationDeadline: `${LAGOS_DATE.format(new Date(e.registrationDeadline))}T${LAGOS_TIME.format(new Date(e.registrationDeadline))}`,
    requiredEquipment: e.requiredEquipment.join(', '),
    emergencyInfo: e.emergencyInfo,
    requirements: e.requirements,
    coverImageUrl: e.coverImageUrl,
    ticketTypes: types.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description || undefined,
      priceKobo: t.priceKobo,
      quantityLimit: t.quantityLimit,
      salesStart: LAGOS_DATE.format(new Date(t.salesStart)),
      salesEnd: LAGOS_DATE.format(new Date(t.salesEnd)),
    })),
  };
}

function toInput(v: Values, id?: string): EventInput {
  return {
    id,
    title: v.title.trim(),
    description: v.description.trim(),
    date: v.date || today(),
    startTime: v.startTime || '06:00',
    durationLabel: v.durationLabel.trim(),
    meetingPoint: v.meetingPoint.trim(),
    location: v.location.trim(),
    difficulty: v.difficulty as Difficulty,
    capacity: Number(v.capacity) || 0,
    registrationDeadline: v.registrationDeadline || `${v.date || today()}T${v.startTime || '06:00'}`,
    requiredEquipment: v.requiredEquipment.split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
    emergencyInfo: v.emergencyInfo.trim(),
    requirements: v.requirements.trim(),
    coverImageUrl: v.coverImageUrl,
    ticketTypes: v.ticketTypes,
  };
}

export default function EventEditor() {
  const { eventId } = useParams();
  const isNew = !eventId;
  const existing = useQuery({ queryKey: ['admin', 'event', eventId], queryFn: () => adminApi.event(eventId!), enabled: !isNew });
  const settings = useQuery({ queryKey: ['admin', 'checkinSettings'], queryFn: adminApi.checkinSettings });

  if (!isNew && existing.isLoading) return <Skeleton className="h-[600px]" />;
  if (!isNew && !existing.data) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={existing.isError ? 'We couldn’t load this event' : 'Event not found'}
        body={existing.isError ? 'Check your connection and try again.' : 'It may have been removed.'}
        action={<ButtonLink to="/admin/events">Back to events</ButtonLink>}
      />
    );
  }
  return (
    <Editor
      key={eventId ?? 'new'}
      event={existing.data?.event}
      ticketTypes={existing.data?.ticketTypes ?? []}
      closeSalesBeforeHours={settings.data?.closeSalesBeforeHours ?? 2}
    />
  );
}

function Editor({ event, ticketTypes, closeSalesBeforeHours }: { event?: HikeEvent; ticketTypes: TicketType[]; closeSalesBeforeHours: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // A new event's first save moves to its edit URL; the message travels with it.
  const carried = (useLocation().state as { notice?: string; savedAt?: string } | null) ?? {};
  const [savedAt, setSavedAt] = useState<string | null>(carried.savedAt ?? null);
  const [notice, setNotice] = useState<string | null>(carried.notice ?? null);
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [editingType, setEditingType] = useState<{ index: number | null } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = event?.status === 'completed' || event?.status === 'cancelled';

  const form = useForm<Values>({ resolver: zodResolver(publishSchema), defaultValues: event ? toValues(event, ticketTypes) : empty });
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    clearErrors,
    watch,
    reset,
    control,
    formState: { errors, isDirty },
  } = form;
  const types = useFieldArray({ control, name: 'ticketTypes' });
  const values = watch();
  const readyToPublish = publishSchema.safeParse(values).success;

  useAdminTitle(
    event ? 'Edit event' : 'Create event',
    `${event ? statusLabel(event.status) : 'Draft'} · ${isDirty ? 'unsaved changes' : savedAt ? `saved ${formatTime(savedAt)}` : event ? 'all changes saved' : 'not saved yet'}`,
  );

  // Default the registration deadline from Check-in settings ("close ticket sales before start").
  const date = watch('date');
  const startTime = watch('startTime');
  useEffect(() => {
    if (!date || !startTime || getValues('registrationDeadline')) return;
    const start = new Date(`${date}T${startTime}:00+01:00`).getTime();
    const close = new Date(start - closeSalesBeforeHours * 3_600_000);
    setValue('registrationDeadline', `${LAGOS_DATE.format(close)}T${LAGOS_TIME.format(close)}`, { shouldDirty: true });
  }, [date, startTime, closeSalesBeforeHours, getValues, setValue]);

  // Don't lose a half-filled form by clicking away.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && !saving && currentLocation.pathname !== nextLocation.pathname);

  // EVT-008: a published event whose date, time or place changes tells its ticket holders. Confirm first.
  const [pendingSave, setPendingSave] = useState<{ v: Values; publish: boolean; changes: [string, string, string][] } | null>(null);
  const holders = event?.ticketsSold ?? 0;
  const requestSave = (v: Values, publish: boolean) => {
    if (event && event.status !== 'draft' && holders > 0) {
      const before = toValues(event, []);
      const day = (d: string) => (d ? formatDate(`${d}T12:00:00Z`, { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
      const changes: [string, string, string][] = [];
      if (v.date !== before.date) changes.push(['Date', day(before.date), day(v.date)]);
      if (v.startTime !== before.startTime) changes.push(['Start time', before.startTime, v.startTime]);
      if (v.meetingPoint.trim() !== before.meetingPoint) changes.push(['Meeting point', before.meetingPoint, v.meetingPoint.trim()]);
      if (v.location.trim() !== before.location) changes.push(['Location', before.location, v.location.trim()]);
      if (changes.length) return setPendingSave({ v, publish, changes });
    }
    void save(v, publish);
  };

  const save = async (v: Values, publish: boolean, notified = 0) => {
    setSaving(publish ? 'publish' : 'draft');
    setNotice(null);
    try {
      const saved = await adminApi.saveEvent(toInput(v, event?.id), publish);
      reset(toValues(saved.event, saved.ticketTypes));
      const at = new Date().toISOString();
      const message = notified
        ? `Saved. ${notified === 1 ? 'The ticket holder is' : `All ${notified} ticket holders are`} being told about the change by email.`
        : publish ? `Published. “${saved.event.title}” is live on the Events page.` : event && event.status !== 'draft' ? 'Changes saved.' : 'Draft saved.';
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      if (!event) {
        navigate(`/admin/events/${saved.event.id}/edit`, { replace: true, state: { notice: message, savedAt: at } });
        return;
      }
      setSavedAt(at);
      setNotice(message);
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t save the event. Please try again.'), { id: 'event-save' });
    } finally {
      setSaving(null);
    }
  };

  const saveDraft = () => {
    clearErrors();
    const v = getValues();
    const r = base.pick({ title: true }).safeParse({ title: v.title });
    if (!r.success) return setError('title', { message: r.error.issues[0].message }, { shouldFocus: true });
    requestSave(v, false);
  };

  const uploadCover = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return notifyError('Choose a JPG, PNG or WebP image.', { id: 'cover' });
    if (file.size > 8 * 1024 * 1024) return notifyError('Choose an image under 8 MB.', { id: 'cover' });
    setUploading(true);
    try {
      const { url } = await adminApi.uploadCover(file);
      setValue('coverImageUrl', url, { shouldDirty: true });
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t upload that image.'), { id: 'cover' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deadlineDay = (values.registrationDeadline || values.date || today()).slice(0, 10);
  const editing = editingType && editingType.index !== null ? values.ticketTypes[editingType.index] : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="text-sm text-slate">
          <Link to="/admin/events" className="font-semibold text-forest hover:underline">Events</Link> / {event ? event.title : 'New event'}
        </nav>
        {!locked && (
          <div className="flex gap-3">
            <Button variant="secondary" onClick={saveDraft} disabled={!!saving}>{saving === 'draft' ? 'Saving…' : event && event.status !== 'draft' ? 'Save changes' : 'Save draft'}</Button>
            <Button onClick={handleSubmit((v) => requestSave(v, true))} disabled={!!saving}>
              {saving === 'publish' ? 'Publishing…' : event && event.status !== 'draft' ? 'Save and keep live' : 'Publish event'}
            </Button>
          </div>
        )}
      </div>

      {notice && (
        <Alert tone="success" className="mt-4">
          {notice} {event && event.status !== 'draft' && <Link to={`/events/${event.slug}`} className="font-bold text-forest underline">View public page</Link>}
        </Alert>
      )}
      {locked && (
        <Alert tone="info" title={`This event is ${event?.status}`} className="mt-4">It can’t be edited any more. Attendance corrections are made on the participants page.</Alert>
      )}

      <form noValidate onSubmit={(e) => e.preventDefault()} className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_352px]">
        <fieldset disabled={locked} className="min-w-0">
          <Card className="p-6">
            <h2 className="text-lg">Event details</h2>
            <div className="mt-5 grid gap-x-5 gap-y-4 md:grid-cols-6">
              <Input label="Event title" className="md:col-span-6" {...register('title')} error={errors.title?.message} />
              <Textarea label="Description" rows={4} className="md:col-span-6" {...register('description')} error={errors.description?.message} />
              <Input label="Date" type="date" min={today()} className="md:col-span-2" {...register('date')} error={errors.date?.message} />
              <Input label="Start time" type="time" className="md:col-span-2" {...register('startTime')} error={errors.startTime?.message} />
              <Input label="Est. duration" placeholder="About 6 hrs" className="md:col-span-2" {...register('durationLabel')} error={errors.durationLabel?.message} />
              <Input label="Meeting point" placeholder="Wuse Meeting Point, Abuja" className="md:col-span-3" {...register('meetingPoint')} error={errors.meetingPoint?.message} />
              <Input label="Trail / location" placeholder="Bwari Hills, Abuja" className="md:col-span-3" {...register('location')} error={errors.location?.message} />
              <Select label="Difficulty" className="md:col-span-2" {...register('difficulty')} error={errors.difficulty?.message}>
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="challenging">Challenging</option>
              </Select>
              <Input label="Capacity" type="number" min={1} inputMode="numeric" className="md:col-span-2" {...register('capacity')} error={errors.capacity?.message} />
              <Input
                label="Registration closes"
                type="datetime-local"
                className="md:col-span-2"
                hint={`Default: ${closeSalesBeforeHours} h before the start (Check-in settings)`}
                {...register('registrationDeadline')}
                error={errors.registrationDeadline?.message}
              />
              <Input label="Required equipment" placeholder="Hiking boots, 3L water, headlamp" hint="Separate items with commas" className="md:col-span-6" {...register('requiredEquipment')} error={errors.requiredEquipment?.message} />
              <Input label="Emergency information" placeholder="Lead guide + medic on site · nearest hospital" className="md:col-span-6" {...register('emergencyInfo')} error={errors.emergencyInfo?.message} />
              <Input label="Participant requirements (optional)" placeholder="18+, good fitness, signed waiver" className="md:col-span-6" {...register('requirements')} error={errors.requirements?.message} />
            </div>
          </Card>
        </fieldset>

        <div className="space-y-5">
          <Card className="p-6">
            <h2 className="text-lg">Cover image</h2>
            <div className="relative mt-4 aspect-[16/9] overflow-hidden rounded-xl border border-dashed border-line bg-canvas">
              <img src={values.coverImageUrl ?? coverArt({ id: event?.id ?? 'new', coverImageUrl: undefined })} alt="" className="size-full object-cover" />
              {!values.coverImageUrl && <span className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate">Default illustration</span>}
            </div>
            {!locked && (
              <div className="mt-3 flex items-center gap-4 text-sm font-bold">
                <label className="cursor-pointer rounded text-forest hover:underline focus-within:ring-2 focus-within:ring-forest/40">
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => uploadCover(e.target.files?.[0])} disabled={uploading} />
                  <ImagePlus size={15} aria-hidden className="mr-1 inline align-[-2px]" />
                  {uploading ? 'Uploading…' : values.coverImageUrl ? 'Replace image' : 'Upload image'}
                </label>
                {values.coverImageUrl && (
                  <button type="button" onClick={() => setValue('coverImageUrl', undefined, { shouldDirty: true })} className="text-slate hover:underline">Remove</button>
                )}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg">Ticket types</h2>
              {!locked && (
                <button type="button" onClick={() => setEditingType({ index: null })} className="flex items-center gap-1 text-sm font-bold text-forest hover:underline">
                  <Plus size={15} aria-hidden /> Add
                </button>
              )}
            </div>
            {values.ticketTypes.length === 0 ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-canvas p-4 text-sm text-slate"><Ticket size={16} aria-hidden /> No ticket types yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {types.fields.map((f, i) => {
                  const t = values.ticketTypes[i] ?? f;
                  return (
                    <li key={f.id} className="rounded-xl border border-line p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-bold text-ink">{t.name}</p>
                        <p className="font-bold text-ink">{formatNaira(t.priceKobo)}</p>
                      </div>
                      <p className="mt-1 text-[13px] text-slate">Limit {t.quantityLimit}</p>
                      <p className="text-[13px] text-slate">
                        Sales: {formatDate(`${t.salesStart}T12:00:00Z`, { day: 'numeric', month: 'short' })} – {formatDate(`${t.salesEnd}T12:00:00Z`, { day: 'numeric', month: 'short' })}
                      </p>
                      {!locked && (
                        <div className="mt-2 flex gap-4 text-[13px] font-bold">
                          <button type="button" onClick={() => setEditingType({ index: i })} className="text-forest hover:underline">Edit</button>
                          <button type="button" onClick={() => types.remove(i)} className="flex items-center gap-1 text-danger hover:underline">
                            <Trash2 size={13} aria-hidden /> Remove
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {errors.ticketTypes && <p className="mt-2 text-xs text-danger">{errors.ticketTypes.message ?? errors.ticketTypes.root?.message}</p>}
          </Card>

          <Card className="p-6">
            <h2 className="text-lg">Status</h2>
            <Badge tone={event?.status === 'published' ? 'green' : 'gray'} className="mt-3">{event ? statusLabel(event.status) : 'Draft'}</Badge>
            <p className="mt-2 text-[13px] text-slate">
              {locked ? 'Read only.' : readyToPublish ? 'Ready to publish.' : 'Fill all required fields to publish.'}
            </p>
            {event && !locked && (
              <button type="button" onClick={() => setCancelling(true)} className="mt-4 flex items-center gap-1.5 text-sm font-bold text-danger hover:underline">
                <Lock size={14} aria-hidden /> Cancel this event
              </button>
            )}
          </Card>
        </div>
      </form>

      <TicketTypeDialog
        open={!!editingType}
        initial={editing as TicketTypeInput | undefined}
        defaultSalesEnd={deadlineDay}
        onClose={() => setEditingType(null)}
        onSave={(t) => {
          if (editingType?.index !== null && editingType?.index !== undefined) types.update(editingType.index, t);
          else types.append(t);
          clearErrors('ticketTypes');
          setEditingType(null);
        }}
      />
      <Dialog open={!!pendingSave} onClose={() => setPendingSave(null)} title="Notify ticket holders?">
        {pendingSave && (
          <div className="p-6">
            <h2 className="text-xl">Tell {holders === 1 ? '1 ticket holder' : `${holders} ticket holders`} about this change?</h2>
            <p className="mt-2 text-sm text-slate">They’ll get an email (and SMS or WhatsApp where it’s turned on) as soon as you save. The change is logged.</p>
            <dl className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
              {pendingSave.changes.map(([label, from, to]) => (
                <div key={label} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-4 py-2.5">
                  <dt className="text-slate">{label}</dt>
                  <dd className="min-w-0 break-words text-ink"><span className="text-slate line-through">{from || '—'}</span> → <span className="font-semibold">{to || '—'}</span></dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setPendingSave(null)}>Keep editing</Button>
              <Button
                onClick={() => {
                  const p = pendingSave;
                  setPendingSave(null);
                  void save(p.v, p.publish, holders);
                }}
              >
                Save and notify {holders}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
      {event && <CancelEventDialog open={cancelling} event={event} onClose={() => setCancelling(false)} onCancelled={() => navigate('/admin/events')} />}
      <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title="Leave without saving?">
        <div className="p-6">
          <h2 className="text-xl">Leave without saving?</h2>
          <p className="mt-2 text-sm text-slate">Your changes to this event haven’t been saved.</p>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => blocker.reset?.()}>Keep editing</Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>Leave</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

const statusLabel = (s: HikeEvent['status']) => ({ draft: 'Draft', published: 'Published', sales_closed: 'Sales closed', completed: 'Completed', cancelled: 'Cancelled' })[s];

const cancelSchema = z.object({ reason: z.string().trim().min(10, 'Give a reason of at least 10 characters (hikers are told why)') });

function CancelEventDialog({ open, event, onClose, onCancelled }: { open: boolean; event: HikeEvent; onClose: () => void; onCancelled: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ reason: string }>({ resolver: zodResolver(cancelSchema), defaultValues: { reason: '' } });
  return (
    <Dialog open={open} onClose={onClose} title="Cancel event">
      <form
        noValidate
        className="p-6"
        onSubmit={handleSubmit(async ({ reason }) => {
          try {
            await adminApi.cancelEvent(event.id, reason);
            await queryClient.invalidateQueries({ queryKey: ['admin'] });
            onCancelled();
          } catch (err) {
            notifyError(errorMessage(err, 'We couldn’t cancel the event.'), { id: 'cancel-event' });
          }
        })}
      >
        <h2 className="text-xl">Cancel “{event.title}”?</h2>
        <p className="mt-2 text-sm text-slate">Ticket sales stop, and {event.ticketsSold === 1 ? 'the 1 ticket holder is' : `all ${event.ticketsSold} ticket holders are`} refunded in full and told by email. This is logged and can’t be undone.</p>
        <Textarea label="Reason" className="mt-4" {...register('reason')} error={errors.reason?.message} />
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Keep event</Button>
          <Button type="submit" variant="danger" disabled={isSubmitting}>{isSubmitting ? 'Cancelling…' : 'Cancel event'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
