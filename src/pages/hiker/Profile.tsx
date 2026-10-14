import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, CircleAlert, Download, UserRound } from 'lucide-react';
import { authError, profileApi } from '@/api/endpoints';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, Skeleton } from '@/components/ui';
import { DeleteAccountDialog } from '@/components/hiker/DeleteAccountDialog';
import { NotificationSettings } from '@/components/hiker/NotificationSettings';
import { VerifyContactDialog } from '@/components/hiker/VerifyContactDialog';
import { useAuth } from '@/features/auth/AuthContext';
import { formatDate, lagosToday } from '@/lib/format';
import { emailSchema, isPhone, nameSchema, normalisePhone, phoneSchema } from '@/lib/validation';
import type { HikerProfile, PendingContactChange } from '@/types/domain';
import { errorMessage, notifyError } from '@/lib/notify';
import { downloadText } from '@/lib/csv';
import { lagosDay } from '@/lib/analytics';

// Figma: "Hiker / Profile" (AUTH-016, AUTH-017, NOT-010). A new email or phone isn't used until the code sent
// to it is entered (AUTH-017): the form shows the new value with a "waiting for code" note, and the account
// keeps the old one until then.

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_MB = 5;

const schema = z
  .object({
    fullName: nameSchema,
    dateOfBirth: z
      .string()
      .refine((v) => !v || (v >= '1900-01-01' && v <= lagosToday()), 'Enter a real date of birth, not in the future'),
    email: emailSchema,
    phone: phoneSchema,
    emergencyName: z.string().trim().max(80, 'Keep the name under 80 characters'),
    emergencyPhone: z.string().trim().refine((v) => !v || isPhone(v), 'Enter a valid phone number, e.g. +234 802 111 2233'),
  })
  .superRefine((v, ctx) => {
    // The emergency contact is optional, but half of one is no use on the trail.
    if (v.emergencyName && !v.emergencyPhone) ctx.addIssue({ code: 'custom', path: ['emergencyPhone'], message: 'Add their phone number too' });
    if (v.emergencyPhone && !v.emergencyName) ctx.addIssue({ code: 'custom', path: ['emergencyName'], message: 'Add their name too' });
    if (v.emergencyPhone && normalisePhone(v.emergencyPhone) === normalisePhone(v.phone)) {
      ctx.addIssue({ code: 'custom', path: ['emergencyPhone'], message: 'Use someone else’s number, not your own' });
    }
  });
type Values = z.infer<typeof schema>;

const formValues = (p: HikerProfile): Values => ({
  fullName: p.user.fullName,
  dateOfBirth: p.dateOfBirth ?? '',
  // A pending change shows its new value, with a note that it's waiting for its code.
  email: p.pendingContacts.find((c) => c.field === 'email')?.value ?? p.user.email,
  phone: p.pendingContacts.find((c) => c.field === 'phone')?.value ?? p.user.phone,
  emergencyName: p.emergencyContact?.name ?? '',
  emergencyPhone: p.emergencyContact?.phone ?? '',
});

export default function Profile() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['profile'], queryFn: profileApi.get });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Profile" subtitle="Keep your details up to date so tickets and reminders reach you." />
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-[420px]" />
        </div>
      </div>
    );
  }
  // Load panel only when there's nothing to show; a failed refresh keeps the cached profile (and toasts).
  if (!data) {
    return <EmptyState icon={UserRound} title="We couldn’t load your profile" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />;
  }
  return <ProfileView profile={data} />;
}

function ProfileView({ profile }: { profile: HikerProfile }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { signIn, logout } = useAuth();
  const [verifying, setVerifying] = useState<PendingContactChange | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  // NFR-035: a JSON copy of what the group holds about the hiker.
  const downloadMyData = async () => {
    setExporting(true);
    try {
      const data = await profileApi.exportData();
      const name = `my-hiking-data-${lagosDay(new Date())}.json`;
      downloadText(name, JSON.stringify(data, null, 2), 'application/json');
      setExported(name);
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t prepare your data. Please try again.'), { id: 'export' });
    } finally {
      setExporting(false);
    }
  };

  const apply = (p: HikerProfile) => {
    queryClient.setQueryData(['profile'], p);
    signIn(p.user); // keeps the nav name and the session user in step
  };

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: formValues(profile) });

  const onSubmit = handleSubmit(async (v) => {
    setNotice(null);
    try {
      const p = await profileApi.update({
        fullName: v.fullName.trim(),
        dateOfBirth: v.dateOfBirth || undefined,
        email: v.email.trim(),
        phone: normalisePhone(v.phone),
        emergencyContact: v.emergencyName ? { name: v.emergencyName.trim(), phone: normalisePhone(v.emergencyPhone) } : undefined,
      });
      apply(p);
      reset(formValues(p));
      const newChange = p.pendingContacts.find((c) => !profile.pendingContacts.some((old) => old.verificationId === c.verificationId));
      if (newChange) setVerifying(newChange);
      else setNotice('Changes saved.');
    } catch (err) {
      const e = authError(err);
      if (e?.code === 'email_taken') setError('email', { message: 'Another account already uses this email.' }, { shouldFocus: true });
      else if (e?.code === 'phone_taken') setError('phone', { message: 'Another account already uses this phone number.' }, { shouldFocus: true });
      else notifyError(errorMessage(err, 'We couldn’t save your changes. Please try again.'), { id: 'profile' });
    }
  });

  const pendingFor = (field: 'email' | 'phone') => profile.pendingContacts.find((c) => c.field === field);

  const cancelChange = async (change: PendingContactChange) => {
    try {
      const p = await profileApi.cancelContactChange(change.verificationId);
      apply(p);
      reset(formValues(p));
      setNotice(`We’ll keep using ${change.field === 'email' ? p.user.email : p.user.phone}.`);
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t cancel the change. Please try again.'), { id: 'profile' });
    }
  };

  const pendingHint = (field: 'email' | 'phone') => {
    const change = pendingFor(field);
    if (!change) return null;
    const current = field === 'email' ? profile.user.email : profile.user.phone;
    return (
      <div className="mt-1.5 rounded-lg bg-warn-light px-3 py-2 text-xs text-ink">
        <p>
          <CircleAlert size={13} aria-hidden className="mr-1 inline align-[-2px] text-warn" />
          Waiting for the code we sent. Until then we use <span className="font-semibold">{current}</span>.
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3">
          <button type="button" onClick={() => setVerifying(change)} className="font-bold text-forest hover:underline">Enter code</button>
          <button type="button" onClick={() => cancelChange(change)} className="font-bold text-slate hover:underline">Keep current {field === 'email' ? 'email' : 'number'}</button>
        </p>
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Profile" subtitle="Keep your details up to date so tickets and reminders reach you." />
      {notice && <Alert tone="success" className="mb-6">{notice}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <IdentityCard profile={profile} onChange={apply} onError={(text) => notifyError(text, { id: 'profile-photo' })} />

        <Card className="p-6 md:p-7">
          <h2 className="text-lg">Personal details</h2>
          <form onSubmit={onSubmit} noValidate className="mt-5">
            <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
              <Input label="Full name" autoComplete="name" {...register('fullName')} error={errors.fullName?.message} />
              <Input label="Date of birth" type="date" max={lagosToday()} autoComplete="bday" {...register('dateOfBirth')} error={errors.dateOfBirth?.message} />
              <div>
                <Input
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                  error={errors.email?.message}
                  hint={pendingFor('email') ? undefined : 'Changing this sends a new verification code.'}
                />
                {pendingHint('email')}
              </div>
              <div>
                <Input
                  label="Phone number"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  {...register('phone')}
                  error={errors.phone?.message}
                  hint={pendingFor('phone') ? undefined : 'Changing this sends a new verification code.'}
                />
                {pendingHint('phone')}
              </div>
            </div>
            <fieldset className="mt-5">
              <legend className="label">Emergency contact</legend>
              <p className="-mt-1 mb-2 text-xs text-slate">Who the guides should call if something happens on a hike. We’ll fill it in at checkout.</p>
              <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
                <Input label="Name" autoComplete="off" {...register('emergencyName')} error={errors.emergencyName?.message} />
                <Input label="Phone" type="tel" inputMode="tel" autoComplete="off" {...register('emergencyPhone')} error={errors.emergencyPhone?.message} />
              </div>
            </fieldset>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              {isDirty && (
                <Button type="button" variant="ghost" onClick={() => reset(formValues(profile))} disabled={isSubmitting}>Discard</Button>
              )}
              <Button type="submit" disabled={isSubmitting || !isDirty} className="min-w-[150px]">{isSubmitting ? 'Saving…' : 'Save changes'}</Button>
            </div>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <NotificationSettings prefs={profile.notifications} />
      </div>

      <Card className="mt-6 p-6 md:p-7">
        <h2 className="text-lg">Your data</h2>
        <p className="mt-1 text-sm text-slate">Download a copy of your profile, tickets and check-ins as a JSON file.</p>
        <Button type="button" variant="secondary" className="mt-4" disabled={exporting} onClick={downloadMyData}>
          <Download size={16} aria-hidden /> {exporting ? 'Preparing…' : 'Download my data'}
        </Button>
        <p role="status" className="mt-2 text-sm text-forest">{exported && `Downloaded ${exported}.`}</p>
      </Card>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/', { replace: true });
          }}
          className="text-[15px] font-bold text-ink hover:underline"
        >
          Log out
        </button>
        <button type="button" onClick={() => setDeleting(true)} className="text-[15px] font-bold text-danger hover:underline">Delete my account</button>
      </div>

      <VerifyContactDialog
        change={verifying}
        onClose={() => setVerifying(null)}
        onVerified={(p, change) => {
          apply(p);
          reset(formValues(p));
          const next = p.pendingContacts[0] ?? null;
          setVerifying(next);
          setNotice(`${change.field === 'email' ? 'Email' : 'Phone number'} updated to ${change.value}.`);
        }}
      />
      <DeleteAccountDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={async () => {
          setDeleting(false);
          await logout().catch(() => undefined);
          queryClient.clear();
          navigate('/', { replace: true });
        }}
      />
    </div>
  );
}

function IdentityCard({ profile, onChange, onError }: { profile: HikerProfile; onChange: (p: HikerProfile) => void; onError: (text: string) => void }) {
  const { user } = profile;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const hikes = profile.hikesAttended;
  const level = hikes === 0 ? 'New hiker' : hikes === 1 ? 'First hike done' : `Returning hiker · ${hikes} hikes`;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    if (!PHOTO_TYPES.includes(file.type)) return setPhotoError('Choose a JPG, PNG or WebP image.');
    if (file.size > PHOTO_MAX_MB * 1024 * 1024) return setPhotoError(`Choose an image under ${PHOTO_MAX_MB} MB.`);
    setUploading(true);
    try {
      onChange(await profileApi.uploadPhoto(file));
    } catch {
      onError('We couldn’t upload that photo. Please try another.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    try {
      onChange(await profileApi.removePhoto());
    } catch {
      onError('We couldn’t remove the photo. Please try again.');
    }
  };

  return (
    <Card className="p-6 text-center">
      <Avatar name={user.fullName} photoUrl={profile.photoUrl} size="lg" className="mx-auto mt-4" />
      <h2 className="mt-5 text-xl">{user.fullName}</h2>
      <p className="mt-1 text-[13px] text-slate">Hiker since {formatDate(user.createdAt, { month: 'long', year: 'numeric' })}</p>
      <Badge className="mt-3">{level}</Badge>

      <ul className="mt-7 divide-y divide-line border-t border-line text-left text-sm">
        <VerifiedRow label="Email" verified={user.emailVerified} pending={profile.pendingContacts.some((c) => c.field === 'email')} />
        <VerifiedRow label="Phone" verified={user.phoneVerified} pending={profile.pendingContacts.some((c) => c.field === 'phone')} />
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-left">
        <label className="cursor-pointer rounded text-sm font-bold text-forest hover:underline focus-within:ring-2 focus-within:ring-forest/40">
          <input
            ref={fileRef}
            type="file"
            accept={PHOTO_TYPES.join(',')}
            className="sr-only"
            disabled={uploading}
            onChange={(e) => upload(e.target.files?.[0])}
            aria-describedby={photoError ? 'photo-error' : undefined}
          />
          {uploading ? 'Uploading…' : profile.photoUrl ? 'Change photo' : 'Add a photo'}
        </label>
        {profile.photoUrl && !uploading && (
          <button type="button" onClick={remove} className="text-sm font-semibold text-slate hover:underline">Remove</button>
        )}
      </div>
      {photoError && <p id="photo-error" role="alert" className="mt-1.5 text-left text-xs text-danger">{photoError}</p>}
    </Card>
  );
}

function VerifiedRow({ label, verified, pending }: { label: string; verified: boolean; pending: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <span className="text-ink">{label} {verified ? 'verified' : 'not verified'}</span>
      {verified ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-forest">
          {pending && <span className="mr-1 font-normal text-warn">New one waiting</span>}
          <Check size={15} aria-hidden />
        </span>
      ) : (
        <CircleAlert size={15} aria-label="Not verified" className="text-warn" />
      )}
    </li>
  );
}
