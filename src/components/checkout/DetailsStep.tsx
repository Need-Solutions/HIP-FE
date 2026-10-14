import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { profileApi } from '@/api/endpoints';
import { Button, Checkbox, Input, SegmentedControl } from '@/components/ui';
import { InlineLoginForm } from '@/features/auth/InlineLoginForm';
import { emailSchema, isPhone, nameSchema, normalisePhone, phoneSchema } from '@/lib/validation';
import type { User } from '@/types/domain';

// One per ticket. Ticket 1 can be "Same as me"; everyone else needs a name, and email/phone are optional.
const attendeeSchema = z
  .object({ sameAsBuyer: z.boolean(), fullName: z.string(), email: z.string(), phone: z.string() })
  .superRefine((a, ctx) => {
    if (a.sameAsBuyer) return;
    const name = nameSchema.safeParse(a.fullName);
    if (!name.success) ctx.addIssue({ code: 'custom', path: ['fullName'], message: name.error.issues[0].message });
    if (a.email.trim() && !emailSchema.safeParse(a.email).success) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email address, or leave it blank' });
    if (a.phone.trim() && !isPhone(a.phone)) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a valid phone number, or leave it blank' });
  });

const schema = z
  .object({
    fullName: nameSchema,
    phone: phoneSchema,
    email: emailSchema,
    emergencyName: nameSchema,
    emergencyPhone: phoneSchema,
    meetsRequirements: z.boolean().refine((v) => v, 'Please confirm you meet the requirements for this hike'),
    createAccount: z.boolean(),
    whatsappReminders: z.boolean(),
    attendees: z.array(attendeeSchema),
  })
  .refine((d) => normalisePhone(d.emergencyPhone) !== normalisePhone(d.phone), {
    path: ['emergencyPhone'],
    message: 'Use someone else’s number, so we can reach them if something happens to you',
  });

export type DetailsValues = z.infer<typeof schema>;

/** A seat in the order: items expanded by quantity, e.g. Standard × 2 → two slots. */
export interface AttendeeSlot {
  ticketTypeId: string;
  typeName: string;
}

const blankFor = (slots: AttendeeSlot[]): DetailsValues => ({
  fullName: '',
  phone: '',
  email: '',
  emergencyName: '',
  emergencyPhone: '',
  meetsRequirements: false,
  createAccount: false,
  whatsappReminders: false,
  attendees: slots.map((_, i) => ({ sameAsBuyer: i === 0, fullName: '', email: '', phone: '' })),
});

/**
 * Step 2 (Figma "Hiker / Checkout – guest" and "– details"). Logged out, it defaults to "Continue as guest"
 * with an optional "create account" box; signed-in hikers get their profile pre-filled.
 */
export function DetailsStep({
  user,
  slots,
  initial,
  disabled,
  onSubmit,
  onBack,
}: {
  user: User | null;
  slots: AttendeeSlot[];
  initial?: DetailsValues;
  disabled?: boolean;
  onSubmit: (values: DetailsValues) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'guest' | 'login'>('guest');
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DetailsValues>({ resolver: zodResolver(schema), defaultValues: initial ?? blankFor(slots) });
  const firstIsMe = watch('attendees.0.sameAsBuyer');
  const group = slots.length > 1;

  // Logging in mid-checkout pre-fills the form from the profile, keeping anything already typed for the emergency contact.
  useEffect(() => {
    if (!user) return;
    const current = getValues();
    reset({ ...current, fullName: user.fullName, email: user.email, phone: user.phone, createAccount: false });
    setMode('guest');
  }, [user, reset, getValues]);

  // Signed-in hikers: the emergency contact saved on their profile fills in, unless they've typed one already.
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: profileApi.get, enabled: !!user, staleTime: 60_000, meta: { silentError: true } });
  useEffect(() => {
    const saved = profile?.emergencyContact;
    if (!saved) return;
    const { emergencyName, emergencyPhone } = getValues();
    if (emergencyName || emergencyPhone) return;
    setValue('emergencyName', saved.name);
    setValue('emergencyPhone', saved.phone);
  }, [profile, getValues, setValue]);

  const guest = !user;

  return (
    <div>
      {guest && (
        <SegmentedControl
          label="How do you want to check out?"
          className="mb-6"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'guest', label: 'Continue as guest' },
            { value: 'login', label: 'Log in for faster checkout' },
          ]}
        />
      )}

      {guest && mode === 'login' ? (
        <div>
          <h2 className="text-xl">Log in</h2>
          <p className="mb-5 mt-1 text-sm text-slate">We’ll fill in your details and add this ticket to your account.</p>
          <InlineLoginForm />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <h2 className="text-xl">{guest ? 'Your details' : 'Participant details'}</h2>
          <p className="mt-1 text-sm text-slate">
            {guest ? 'No account needed. We’ll send your QR ticket here.' : 'We pre-filled this from your profile. The ticket will carry this name.'}
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Input label="Full name" autoComplete="name" {...register('fullName')} error={errors.fullName?.message} />
            <Input label="Phone number" type="tel" autoComplete="tel" inputMode="tel" {...register('phone')} error={errors.phone?.message} />
            <Input
              className="sm:col-span-2"
              label="Email for ticket"
              type="email"
              autoComplete="email"
              hint="Your ticket and receipt go to this address."
              {...register('email')}
              error={errors.email?.message}
            />
          </div>

          {!guest && <h3 className="mt-7 text-base font-bold">Emergency contact</h3>}
          <div className={guest ? 'mt-4 grid gap-4 sm:grid-cols-2' : 'mt-3 grid gap-4 sm:grid-cols-2'}>
            <Input label={guest ? 'Emergency contact name' : 'Contact name'} {...register('emergencyName')} error={errors.emergencyName?.message} />
            <Input
              label={guest ? 'Emergency contact phone' : 'Contact phone'}
              type="tel"
              inputMode="tel"
              {...register('emergencyPhone')}
              error={errors.emergencyPhone?.message}
            />
          </div>

          {group && (
            <section aria-labelledby="attendees-heading" className="mt-8">
              <h3 id="attendees-heading" className="text-base font-bold">Who’s coming?</h3>
              <p className="mt-1 text-sm text-slate">
                Each ticket carries its own name, so every hiker gets their own check-in and hiking history. Add their email or phone and we’ll send them
                their ticket too.
              </p>
              <div className="mt-4 space-y-4">
                {slots.map((slot, i) => {
                  const err = errors.attendees?.[i];
                  const showFields = !(i === 0 && firstIsMe);
                  return (
                    <fieldset key={i} className="rounded-xl border border-line p-4">
                      <legend className="px-1 text-sm font-bold text-ink">Ticket {i + 1} · {slot.typeName}</legend>
                      {i === 0 && <Checkbox className="mb-1" label="Same as me" {...register('attendees.0.sameAsBuyer')} />}
                      {showFields && (
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <Input className="sm:col-span-2" label="Full name" autoComplete="off" {...register(`attendees.${i}.fullName`)} error={err?.fullName?.message} />
                          <Input label="Email (optional)" type="email" autoComplete="off" {...register(`attendees.${i}.email`)} error={err?.email?.message} />
                          <Input label="Phone (optional)" type="tel" inputMode="tel" autoComplete="off" {...register(`attendees.${i}.phone`)} error={err?.phone?.message} />
                        </div>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            </section>
          )}

          <div className="mt-6 space-y-3">
            <Checkbox
              label={group ? 'Everyone on this order meets the fitness and age requirements for this hike' : 'I meet the fitness and age requirements for this hike'}
              {...register('meetsRequirements')}
              error={errors.meetsRequirements?.message}
            />
            {guest ? (
              <Checkbox label="Create a free account with these details to keep my hiking history" {...register('createAccount')} />
            ) : (
              <Checkbox label="Send me WhatsApp reminders (optional)" {...register('whatsappReminders')} />
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button type="submit" size="lg" disabled={disabled}>Continue to payment</Button>
            <Button type="button" variant="ghost" size="lg" onClick={onBack}>Back</Button>
          </div>
        </form>
      )}
    </div>
  );
}
