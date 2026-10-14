import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ImagePlus, Link2Off, Loader2, Megaphone } from 'lucide-react';
import { adsAdminApi, type AdImage, type AdInput } from '@/api/endpoints';
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, Input, RadioCard, ScaleToFit, SegmentedControl, Select, Skeleton, Textarea } from '@/components/ui';
import { AdCreative } from '@/components/ads/AdCreative';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { useAuth } from '@/features/auth/AuthContext';
import { useCan } from '@/features/auth/useCan';
import { lagosDay } from '@/lib/analytics';
import { AD_STATUS, PLACEMENT_LABEL, PLACEMENT_WHERE, lagosEndIso, lagosStartIso } from '@/lib/ads';
import { formatDate } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';
import type { AdCampaign, AdPlacement } from '@/types/domain';

// Figma: "Admin / Create ad" (ADS-002..ADS-006). Also edits a campaign (/admin/ads/:id/edit). An advertiser's
// campaign goes to "Pending approval"; an admin's goes live on its dates. The live preview renders the same component
// as the public ad slot. The destination must be https and is checked by the server before submitting.

const HTTPS = /^https:\/\/[^\s/$.?#][^\s]*$/i;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE = 5 * 1024 * 1024;

function makeSchema(today: string, originalStart: string | undefined, admin: boolean) {
  return z
    .object({
      name: z.string().trim().min(3, 'Give the campaign a name of at least 3 characters').max(80, 'Keep the name under 80 characters'),
      headline: z.string().trim().min(5, 'Write a headline of at least 5 characters').max(60, 'Keep the headline to 60 characters'),
      description: z.string().trim().min(10, 'Write a description of at least 10 characters').max(150, 'Keep the description to 150 characters'),
      destinationUrl: z.string().trim().min(1, 'Enter the link people go to').regex(HTTPS, 'Enter a full link starting with https://'),
      placement: z.enum(['homepage_banner', 'event_page'], { errorMap: () => ({ message: 'Choose where the ad shows' }) }),
      // Single-field date rules sit on the fields so they show with the other errors; zod runs superRefine only
      // once every field is valid.
      startDate: z.string().min(1, 'Choose a start date').refine((d) => d >= today || d === originalStart, 'The start date can’t be in the past'),
      endDate: z.string().min(1, 'Choose an end date').refine((d) => d >= today, 'The end date can’t be in the past'),
      advertiserId: z.string(),
      advertiserName: z.string().trim().max(60, 'Keep the name under 60 characters'),
      mediaUrl: z.string().optional(),
    })
    .superRefine((v, ctx) => {
      if (v.endDate < v.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'The end date must be on or after the start date' });
      if (admin && !v.advertiserId && v.advertiserName.length < 2) ctx.addIssue({ code: 'custom', path: ['advertiserName'], message: 'Name the sponsor' });
    });
}
type Values = z.infer<ReturnType<typeof makeSchema>>;

export default function AdEditor() {
  const { adId } = useParams();
  const { data: ad, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'ad', adId], queryFn: () => adsAdminApi.get(adId!), enabled: !!adId });
  useAdminTitle(adId ? 'Edit campaign' : 'New ad campaign');

  if (adId && isLoading) return <Skeleton className="h-[640px]" />;
  if (adId && !ad) {
    return (
      <EmptyState
        icon={Megaphone}
        title={isError ? 'We couldn’t load this campaign' : 'Campaign not found'}
        body={isError ? 'Check your connection and try again.' : 'It may belong to another advertiser, or the link is wrong.'}
        action={isError ? <Button onClick={() => refetch()}>Try again</Button> : <ButtonLink to="/admin/ads">Back to campaigns</ButtonLink>}
      />
    );
  }
  if (ad?.status === 'completed') {
    return (
      <EmptyState
        icon={Megaphone}
        title="This campaign has ended"
        body="Ended campaigns can’t be edited. Their numbers stay on the performance page."
        action={<ButtonLink to={`/admin/ads/${ad.id}`}>View performance</ButtonLink>}
      />
    );
  }
  return <EditorForm key={ad?.id ?? 'new'} ad={ad ?? undefined} />;
}

function EditorForm({ ad }: { ad?: AdCampaign }) {
  const admin = useCan('review_ads');
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = lagosDay(new Date());
  const originalStart = ad ? lagosDay(new Date(ad.startsAt)) : undefined;
  const schema = useMemo(() => makeSchema(today, originalStart, admin), [today, originalStart, admin]);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: ad
      ? {
          name: ad.name,
          headline: ad.headline,
          description: ad.description,
          destinationUrl: ad.destinationUrl,
          placement: ad.placement,
          startDate: originalStart,
          endDate: lagosDay(new Date(ad.endsAt)),
          advertiserId: ad.advertiserId ?? '',
          advertiserName: ad.advertiserName,
          mediaUrl: ad.mediaUrl,
        }
      : { name: '', headline: '', description: '', destinationUrl: 'https://', placement: undefined as unknown as AdPlacement, startDate: '', endDate: '', advertiserId: '', advertiserName: '', mediaUrl: undefined },
  });
  const v = watch();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [image, setImage] = useState<AdImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [link, setLink] = useState<'idle' | 'checking' | 'ok' | 'unreachable'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: advertisers } = useQuery({ queryKey: ['admin', 'ads', 'advertisers'], queryFn: adsAdminApi.advertisers, enabled: admin, staleTime: 5 * 60_000 });
  useEffect(() => {
    // A new campaign by an admin defaults to the first advertiser account; the sponsor name follows the choice.
    if (!ad && admin && advertisers?.length && !getValues('advertiserId') && !getValues('advertiserName')) setValue('advertiserId', advertisers[0].id);
  }, [ad, admin, advertisers, getValues, setValue]);

  const datesOk = !!v.startDate && !!v.endDate && v.endDate >= v.startDate;
  const { data: slot } = useQuery({
    queryKey: ['admin', 'ads', 'slot', v.placement, v.startDate, v.endDate, ad?.id],
    queryFn: () => adsAdminApi.slotInfo(v.placement, lagosStartIso(v.startDate), lagosEndIso(v.endDate), ad?.id),
    enabled: !!v.placement && datesOk,
    meta: { silentError: true },
  });

  const checkLink = async () => {
    const url = getValues('destinationUrl').trim();
    if (!HTTPS.test(url)) return setLink('idle');
    setLink('checking');
    try {
      const r = await adsAdminApi.checkLink(url);
      if (getValues('destinationUrl').trim() === url) setLink(r.reachable ? 'ok' : 'unreachable');
    } catch {
      setLink('idle');
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return notifyError('Choose a JPG, PNG or WebP image.', { id: 'ad-image' });
    if (file.size > MAX_IMAGE) return notifyError('Choose an image under 5 MB.', { id: 'ad-image' });
    setUploading(true);
    try {
      const img = await adsAdminApi.uploadImage(file);
      setImage(img);
      setValue('mediaUrl', img.url, { shouldDirty: true });
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t upload that image.'), { id: 'ad-image' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const unapproved = !ad || ad.status === 'draft' || ad.status === 'rejected';
  const liveForAdvertiser = !!ad && !admin && (ad.status === 'active' || ad.status === 'scheduled' || ad.status === 'paused');
  const primaryLabel = unapproved ? (admin ? 'Publish campaign' : 'Submit for approval') : liveForAdvertiser ? 'Submit changes for approval' : 'Save changes';

  const save = (submit: boolean) =>
    handleSubmit(async (values) => {
      const input: AdInput = {
        name: values.name,
        headline: values.headline,
        description: values.description,
        mediaUrl: values.mediaUrl,
        destinationUrl: values.destinationUrl,
        placement: values.placement,
        startsAt: lagosStartIso(values.startDate),
        endsAt: lagosEndIso(values.endDate),
        advertiserId: admin ? values.advertiserId || null : undefined,
        advertiserName: values.advertiserName,
      };
      try {
        const saved = await adsAdminApi.save(ad?.id ?? null, input, submit);
        void queryClient.invalidateQueries({ queryKey: ['admin', 'ads'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'ad', saved.id] });
        void queryClient.invalidateQueries({ queryKey: ['ads'] });
        const notice =
          saved.status === 'draft'
            ? `${saved.name} is saved as a draft.`
            : saved.status === 'pending_approval'
              ? `${saved.name} is waiting for approval. ${Date.parse(saved.startsAt) > Date.now() ? `It goes live on ${formatDate(saved.startsAt, { day: 'numeric', month: 'short' })} once approved.` : 'It goes live as soon as it’s approved.'}`
              : `${saved.name} is saved and ${saved.status === 'active' ? 'live now' : saved.status === 'scheduled' ? `goes live on ${formatDate(saved.startsAt, { day: 'numeric', month: 'short' })}` : AD_STATUS[saved.status].label.toLowerCase()}.`;
        navigate(saved.status === 'draft' ? '/admin/ads?tab=draft' : `/admin/ads/${saved.id}`, { state: { notice } });
      } catch (err) {
        notifyError(errorMessage(err, 'We couldn’t save the campaign. Please try again.'), { id: 'ad-save' });
      }
    });

  const headlineLength = v.headline?.length ?? 0;
  const willStart = v.startDate ? formatDate(`${v.startDate}T12:00:00Z`, { day: 'numeric', month: 'short' }) : null;

  return (
    <form noValidate onSubmit={(e) => e.preventDefault()}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="text-sm text-slate">
          <Link to="/admin/ads" className="font-semibold text-forest hover:underline">Ads</Link> / {ad ? ad.name : 'New campaign'}
        </nav>
        <div className="flex flex-wrap gap-3">
          {unapproved && <Button type="button" variant="secondary" disabled={isSubmitting} onClick={save(false)}>Save draft</Button>}
          <Button type="button" disabled={isSubmitting || (!!ad && !isDirty && !unapproved)} onClick={save(true)}>{isSubmitting ? 'Saving…' : primaryLabel}</Button>
        </div>
      </div>

      {ad?.status === 'rejected' && ad.rejection && (
        <Alert tone="error" title={`Rejected by ${ad.rejection.by} on ${formatDate(ad.rejection.at, { day: 'numeric', month: 'short' })}`} className="mt-4">
          {ad.rejection.reason} Edit the campaign and submit it again.
        </Alert>
      )}
      {liveForAdvertiser && <Alert tone="warning" className="mt-4">Changes to an approved campaign go back to the group for approval. While it’s waiting, the campaign doesn’t show.</Alert>}
      {ad?.status === 'pending_approval' && <Alert tone="info" className="mt-4">This campaign is waiting for approval. You can still change it.</Alert>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="p-6">
          <h2 className="text-lg">Campaign content</h2>
          <div className="mt-5 grid gap-5">
            <Input label="Campaign name" placeholder="Abuja Camping Co. — November" hint="Only staff and the advertiser see this." {...register('name')} error={errors.name?.message} />
            {admin ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Select label="Advertiser" {...register('advertiserId')}>
                  {advertisers?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  <option value="">Direct sponsor (no account)</option>
                </Select>
                {!v.advertiserId && <Input label="Sponsor name" placeholder="Abuja Camping Co." {...register('advertiserName')} error={errors.advertiserName?.message} />}
              </div>
            ) : (
              <p className="text-sm text-slate">Advertiser: <span className="font-semibold text-ink">{user?.fullName}</span></p>
            )}
            <Input
              label="Headline"
              placeholder="Gear up for weekend camping"
              maxLength={60}
              hint={`${headlineLength} / 60 characters`}
              {...register('headline')}
              error={errors.headline?.message}
            />
            <Textarea label="Description" rows={3} maxLength={150} placeholder="Tents, stoves and sleeping bags to rent or buy." hint={`${v.description?.length ?? 0} / 150 characters`} {...register('description')} error={errors.description?.message} />

            <div>
              <p className="label">Image</p>
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-line p-4">
                <div className="h-[60px] w-[180px] shrink-0 overflow-hidden rounded-lg bg-sand">
                  {v.mediaUrl ? <img src={v.mediaUrl} alt="" className="size-full object-cover" /> : <div aria-hidden className="size-full bg-gradient-to-r from-sun-soft to-sun-dark/60" />}
                </div>
                <div className="min-w-0 text-sm">
                  {image ? (
                    <>
                      <p className="truncate font-semibold text-ink">{image.name}</p>
                      <p className="text-xs text-slate">{image.width} × {image.height} · {Math.round(image.bytes / 1024)} KB</p>
                    </>
                  ) : (
                    <p className="text-xs text-slate">{v.mediaUrl ? 'Current image.' : 'Optional. Without one, a brand-colour panel shows.'} Best at 1200 × 400, JPG, PNG or WebP under 5 MB.</p>
                  )}
                  <div className="mt-1.5 flex gap-4 font-bold">
                    <label className="cursor-pointer rounded text-forest hover:underline focus-within:ring-2 focus-within:ring-forest/40">
                      <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
                      <ImagePlus size={15} aria-hidden className="mr-1 inline align-[-2px]" />
                      {uploading ? 'Uploading…' : v.mediaUrl ? 'Replace' : 'Upload image'}
                    </label>
                    {v.mediaUrl && (
                      <button type="button" className="text-slate hover:underline" onClick={() => { setImage(null); setValue('mediaUrl', undefined, { shouldDirty: true }); }}>Remove</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Input
                label="Destination URL"
                type="url"
                inputMode="url"
                placeholder="https://"
                {...register('destinationUrl', { onChange: () => setLink('idle'), onBlur: checkLink })}
                error={errors.destinationUrl?.message}
              />
              <p className="mt-1.5 min-h-[18px] text-xs" aria-live="polite">
                {!errors.destinationUrl && link === 'checking' && <span className="text-slate"><Loader2 size={13} aria-hidden className="mr-1 inline animate-spin align-[-2px]" />Checking the link…</span>}
                {!errors.destinationUrl && link === 'ok' && <span className="font-semibold text-forest"><Check size={13} aria-hidden className="mr-1 inline align-[-2px]" />Link checked and reachable</span>}
                {!errors.destinationUrl && link === 'unreachable' && <span className="font-semibold text-warn"><Link2Off size={13} aria-hidden className="mr-1 inline align-[-2px]" />We couldn’t reach this link. Check it before you submit.</span>}
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Input label="Start date" type="date" min={originalStart && originalStart < today ? originalStart : today} {...register('startDate')} error={errors.startDate?.message} />
              <Input label="End date" type="date" min={v.startDate || today} {...register('endDate')} error={errors.endDate?.message} />
            </div>

            <fieldset>
              <legend className="label">Placement</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(PLACEMENT_LABEL) as AdPlacement[]).map((p) => (
                  <RadioCard key={p} name="placement" value={p} checked={v.placement === p} onChange={() => setValue('placement', p, { shouldDirty: true, shouldValidate: true })} title={PLACEMENT_LABEL[p]} description={p === 'homepage_banner' ? 'Wide banner below “Upcoming hikes”' : 'Card beside every event’s details'} />
                ))}
              </div>
              {errors.placement && <p className="mt-1.5 text-xs text-danger">{errors.placement.message}</p>}
            </fieldset>
          </div>
        </Card>

        <div className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg">Live preview</h2>
              <SegmentedControl label="Preview size" value={device} onChange={setDevice} options={[{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }]} />
            </div>
            <div className="mt-4 rounded-xl bg-canvas p-3">
              {v.placement === 'event_page' ? (
                <ScaleToFit width={device === 'desktop' ? 340 : 358} className="mx-auto max-w-[358px]">
                  <AdCreative ad={{ headline: v.headline, description: v.description, mediaUrl: v.mediaUrl }} variant="card" layout={device} className="bg-white" />
                </ScaleToFit>
              ) : (
                <ScaleToFit width={device === 'desktop' ? 1100 : 358} className={device === 'mobile' ? 'mx-auto max-w-[358px]' : undefined}>
                  <AdCreative ad={{ headline: v.headline, description: v.description, mediaUrl: v.mediaUrl }} variant="banner" layout={device} className="bg-white" />
                </ScaleToFit>
              )}
            </div>
            {device === 'mobile' && v.placement === 'event_page' && <p className="mt-2 text-xs text-slate">On phones the event-page card shows the headline only, below the event details.</p>}
          </Card>

          <Card className="p-6 text-sm">
            <h2 className="text-base">Where it shows</h2>
            <p className="mt-1.5 text-slate">
              {v.placement ? PLACEMENT_WHERE[v.placement] : 'Choose a placement.'}{' '}
              {v.placement && datesOk && slot && (slot.others === 0 ? 'No other campaign shares this slot on these dates.' : `Takes turns with ${slot.others} other ${slot.others === 1 ? 'campaign' : 'campaigns'} in this slot, one per page view.`)}
            </p>
            <h2 className="mt-5 text-base">{unapproved ? 'Status after submit' : 'Status'}</h2>
            <div className="mt-2">
              {unapproved ? (
                admin ? <Badge tone={v.startDate && v.startDate > today ? 'blue' : 'green'}>{v.startDate && v.startDate > today ? 'Scheduled' : 'Active'}</Badge> : <Badge tone="amber">Pending approval</Badge>
              ) : (
                <Badge tone={AD_STATUS[liveForAdvertiser && isDirty ? 'pending_approval' : ad!.status].tone}>{AD_STATUS[liveForAdvertiser && isDirty ? 'pending_approval' : ad!.status].label}</Badge>
              )}
            </div>
            <p className="mt-2 text-slate">
              {admin
                ? willStart
                  ? `Goes live automatically on ${willStart}.`
                  : 'Goes live on its start date.'
                : willStart
                  ? `Goes live automatically on ${willStart} once approved.`
                  : 'Goes live on its start date once approved.'}
            </p>
          </Card>
        </div>
      </div>
    </form>
  );
}
