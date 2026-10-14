import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Brush, Check, ImagePlus, RotateCcw, TriangleAlert } from 'lucide-react';
import { brandingApi, type BrandAssetKind, type Branding as BrandingData, type BrandingInput } from '@/api/endpoints';
import { Alert, Badge, Button, Card, EmptyState, Input, Logo, ScaleToFit, Skeleton } from '@/components/ui';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { BrandingContext, DEFAULT_BRANDING } from '@/features/branding/BrandingContext';
import { brandTokens, isHexColor } from '@/lib/brandColors';
import { DEFAULT_BRAND_COLORS, cssVariables } from '@/lib/brandDefaults';
import { brandContrastChecks, formatRatio } from '@/lib/contrast';
import { formatDate, formatTime } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';

// Figma: "Admin / Branding" (SRS 2.3, BRD-*). Edits the group's name, logo, favicon, colours, homepage banner and
// contact details. The preview renders real components inside a draft brand (CSS variables + BrandingContext), so it
// matches the site. Contrast is checked against WCAG AA on the pairings the site uses; a failing pair warns but doesn't
// block publishing. "Reset to defaults" fills the form with the built-in brand; nothing changes until Publish. The
// server audit-logs every published change.

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1E4D3A');
const link = z.string().trim().refine((v) => !v || /^https:\/\/\S+$/i.test(v), 'Use a full link starting with https://');
const schema = z.object({
  name: z.string().trim().min(1, 'Enter the group’s short name').max(24, 'Keep it to 24 characters'),
  fullName: z.string().trim().min(1, 'Enter the full name').max(60, 'Keep it to 60 characters'),
  tagline: z.string().trim().max(120, 'Keep it under 120 characters'),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  colors: z.object({ primary: hex, secondary: hex, surface: hex, onPrimary: hex, onSecondary: hex }),
  contact: z.object({
    email: z.string().trim().email('Enter a contact email'),
    phone: z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,18}$/, 'Enter a phone number with the country code'),
    location: z.string().trim().max(60, 'Keep it under 60 characters'),
    instagram: link,
    x: link,
    facebook: link,
    whatsapp: link,
  }),
});
type Values = z.infer<typeof schema>;

const toValues = (b: BrandingData): Values => ({
  name: b.name,
  fullName: b.fullName,
  tagline: b.tagline,
  logoUrl: b.logoUrl,
  faviconUrl: b.faviconUrl,
  bannerUrl: b.bannerUrl,
  colors: { ...b.colors, onPrimary: b.colors.onPrimary ?? DEFAULT_BRAND_COLORS.onPrimary, onSecondary: b.colors.onSecondary ?? DEFAULT_BRAND_COLORS.onSecondary },
  contact: { email: b.contact.email, phone: b.contact.phone, location: b.contact.location, instagram: b.contact.instagram ?? '', x: b.contact.x ?? '', facebook: b.contact.facebook ?? '', whatsapp: b.contact.whatsapp ?? '' },
});

export default function Branding() {
  useAdminTitle('Branding', 'Name, logo, colours and contact details.');
  const { data, isLoading, refetch } = useQuery({ queryKey: ['branding'], queryFn: brandingApi.get, staleTime: 0 });
  if (isLoading) return <Skeleton className="h-[720px]" />;
  if (!data) return <EmptyState icon={Brush} title="We couldn’t load the branding" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />;
  return <BrandingForm saved={data} />;
}

function BrandingForm({ saved }: { saved: BrandingData }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ tone: 'success' | 'info'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(saved) });
  const v = watch();
  const colors = {
    primary: isHexColor(v.colors.primary) ? v.colors.primary : saved.colors.primary,
    secondary: isHexColor(v.colors.secondary) ? v.colors.secondary : saved.colors.secondary,
    surface: isHexColor(v.colors.surface) ? v.colors.surface : saved.colors.surface,
    onPrimary: isHexColor(v.colors.onPrimary) ? v.colors.onPrimary : DEFAULT_BRAND_COLORS.onPrimary,
    onSecondary: isHexColor(v.colors.onSecondary) ? v.colors.onSecondary : DEFAULT_BRAND_COLORS.onSecondary,
  };
  const checks = useMemo(() => brandContrastChecks(colors), [colors.primary, colors.secondary, colors.surface, colors.onPrimary, colors.onSecondary]); // eslint-disable-line react-hooks/exhaustive-deps
  const failing = checks.filter((c) => !c.passes);

  const publish = handleSubmit(async (values) => {
    setNotice(null);
    const input: BrandingInput = {
      ...values,
      logoUrl: values.logoUrl || undefined,
      faviconUrl: values.faviconUrl || undefined,
      bannerUrl: values.bannerUrl || undefined,
      contact: { ...values.contact, instagram: values.contact.instagram || undefined, x: values.contact.x || undefined, facebook: values.contact.facebook || undefined, whatsapp: values.contact.whatsapp || undefined },
    };
    try {
      const next = await brandingApi.save(input);
      queryClient.setQueryData(['branding'], next); // BrandingProvider applies it across the app straight away
      reset(toValues(next));
      setNotice({ tone: 'success', text: 'Branding published. It’s live across the site, tickets and emails. Saved to the audit log.' });
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t publish the branding. Please try again.'), { id: 'branding' });
    }
  });

  const resetToDefaults = () => {
    reset(toValues(DEFAULT_BRANDING), { keepDefaultValues: true });
    setNotice({ tone: 'info', text: 'The default brand is loaded into the form. Nothing changes on the site until you publish.' });
  };

  const draft: BrandingData = {
    ...saved,
    name: v.name || saved.name,
    fullName: v.fullName,
    tagline: v.tagline,
    logoUrl: v.logoUrl,
    faviconUrl: v.faviconUrl,
    bannerUrl: v.bannerUrl,
    colors,
    contact: { ...saved.contact, ...v.contact },
  };

  return (
    <form noValidate onSubmit={publish}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate">
          {saved.updatedAt ? `Last published by ${saved.updatedBy ?? 'an admin'} on ${formatDate(saved.updatedAt, { day: 'numeric', month: 'short', year: 'numeric' })}, ${formatTime(saved.updatedAt)}.` : 'Using the built-in brand.'}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={resetToDefaults}><RotateCcw size={15} aria-hidden /> Reset to defaults</Button>
          <Button type="submit" disabled={!isDirty || isSubmitting}>{isSubmitting ? 'Publishing…' : 'Publish changes'}</Button>
        </div>
      </div>
      {notice && <Alert tone={notice.tone} className="mt-4">{notice.text}</Alert>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="min-w-0 space-y-5">
          <Card className="p-6">
            <h2 className="text-lg">Group identity</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Input label="Short name" hint="In the logo, page titles and messages." {...register('name')} error={errors.name?.message} />
              <Input label="Full name" {...register('fullName')} error={errors.fullName?.message} />
              <Input label="Tagline" className="sm:col-span-2" hint="Shown in the footer." {...register('tagline')} error={errors.tagline?.message} />
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <AssetField
                kind="logo"
                label="Logo"
                value={v.logoUrl}
                hint="SVG, PNG or WebP under 512 KB. Without one, the mountain mark and short name show."
                onChange={(url) => setValue('logoUrl', url, { shouldDirty: true })}
                preview={
                  <div className="flex h-16 items-center gap-3 rounded-lg bg-pine px-3" style={tokenStyle(colors)}>
                    <BrandingContext.Provider value={draft}><Logo dark /></BrandingContext.Provider>
                  </div>
                }
              />
              <AssetField
                kind="favicon"
                label="Favicon"
                value={v.faviconUrl}
                hint="SVG, PNG or ICO under 128 KB, square. Without one, the logo is used."
                onChange={(url) => setValue('faviconUrl', url, { shouldDirty: true })}
                preview={
                  <div className="flex h-16 items-center gap-2 rounded-lg bg-chip px-3">
                    <span className="flex h-8 min-w-0 max-w-full items-center gap-2 rounded-t-lg bg-white px-3 text-xs text-ink shadow-sm">
                      <img src={v.faviconUrl || v.logoUrl || '/favicon.svg'} alt="" className="size-4 object-contain" />
                      <span className="truncate">{draft.name} – {draft.fullName}</span>
                    </span>
                  </div>
                }
              />
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg">Colours</h2>
            <p className="mt-1 text-sm text-slate">Shades for backgrounds, borders and dark panels are worked out from the first three. The text colours are used for labels on primary and secondary buttons. Status colours (errors, warnings) don’t change.</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <ColorField label="Primary" hint="Buttons, links, sidebar" value={v.colors.primary} error={errors.colors?.primary?.message} field={register('colors.primary')} onPick={(c) => setValue('colors.primary', c, { shouldDirty: true, shouldValidate: true })} />
              <ColorField label="Secondary" hint="Accents, highlights" value={v.colors.secondary} error={errors.colors?.secondary?.message} field={register('colors.secondary')} onPick={(c) => setValue('colors.secondary', c, { shouldDirty: true, shouldValidate: true })} />
              <ColorField label="Surface" hint="Page background" value={v.colors.surface} error={errors.colors?.surface?.message} field={register('colors.surface')} onPick={(c) => setValue('colors.surface', c, { shouldDirty: true, shouldValidate: true })} />
              <ColorField label="Text on primary" hint="Button and tab labels" value={v.colors.onPrimary} error={errors.colors?.onPrimary?.message} field={register('colors.onPrimary')} onPick={(c) => setValue('colors.onPrimary', c, { shouldDirty: true, shouldValidate: true })} />
              <ColorField label="Text on secondary" hint="Accent button labels" value={v.colors.onSecondary} error={errors.colors?.onSecondary?.message} field={register('colors.onSecondary')} onPick={(c) => setValue('colors.onSecondary', c, { shouldDirty: true, shouldValidate: true })} />
            </div>
            <div className="mt-5" aria-live="polite">
              {failing.length > 0 ? (
                <Alert tone="warning" title={`${failing.length === 1 ? '1 colour pairing fails' : `${failing.length} colour pairings fail`} WCAG AA contrast`}>
                  <ul className="mt-1 space-y-1">
                    {failing.map((c) => (
                      <li key={c.id}>
                        <span className="font-semibold">{c.label}: {formatRatio(c.ratio)}</span> (needs {c.required}:1). Used for {c.usedFor.charAt(0).toLowerCase() + c.usedFor.slice(1)}.
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">Some hikers will struggle to read this text. Change the text colour for that background, or pick a darker or lighter brand colour. You can still publish.</p>
                </Alert>
              ) : (
                <Alert tone="success">All text pairings pass WCAG AA contrast (4.5:1).</Alert>
              )}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold text-forest">See every check</summary>
                <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                  {checks.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md text-sm font-bold" style={{ background: c.background, color: c.foreground }}>Aa</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{c.label}</span>
                        <span className="block text-xs text-slate">{c.usedFor}</span>
                      </span>
                      <span className="text-right text-xs tabular-nums text-slate">{formatRatio(c.ratio)}</span>
                      {c.passes ? <Badge tone="green"><Check size={12} aria-hidden className="mr-0.5" />Passes</Badge> : <Badge tone="amber"><TriangleAlert size={12} aria-hidden className="mr-0.5" />Fails</Badge>}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg">Homepage banner</h2>
            <div className="mt-4">
              <AssetField
                kind="banner"
                label="Banner photo"
                value={v.bannerUrl}
                hint="JPG, PNG or WebP under 8 MB, at least 1920 × 900. A dark overlay keeps the headline readable. Without one, a brand-colour gradient shows."
                onChange={(url) => setValue('bannerUrl', url, { shouldDirty: true })}
                preview={
                  <div className="relative h-28 overflow-hidden rounded-lg bg-gradient-to-b from-sun-soft to-sun" style={tokenStyle(colors)}>
                    {v.bannerUrl && <img src={v.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />}
                    <div className="absolute inset-0 bg-pine/55" />
                    <p className="relative p-4 text-lg font-extrabold leading-tight text-white">Find your trail.<br /><span className="text-sun-soft">Walk it together.</span></p>
                  </div>
                }
                wide
              />
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg">Contact details and social links</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Input label="Contact email" type="email" {...register('contact.email')} error={errors.contact?.email?.message} />
              <Input label="Contact phone" type="tel" {...register('contact.phone')} error={errors.contact?.phone?.message} />
              <Input label="Location" className="sm:col-span-2" {...register('contact.location')} error={errors.contact?.location?.message} />
              <Input label="Instagram (optional)" placeholder="https://instagram.com/…" {...register('contact.instagram')} error={errors.contact?.instagram?.message} />
              <Input label="WhatsApp community (optional)" placeholder="https://chat.whatsapp.com/…" {...register('contact.whatsapp')} error={errors.contact?.whatsapp?.message} />
              <Input label="X (optional)" placeholder="https://x.com/…" {...register('contact.x')} error={errors.contact?.x?.message} />
              <Input label="Facebook (optional)" placeholder="https://facebook.com/…" {...register('contact.facebook')} error={errors.contact?.facebook?.message} />
            </div>
          </Card>
        </div>

        <div className="min-w-0 xl:sticky xl:top-5 xl:self-start">
          <Card className="p-6">
            <h2 className="text-lg">Preview</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <ScaleToFit width={1100} label={`Preview of the homepage with the ${draft.name} brand`}>
                <SitePreview brand={draft} />
              </ScaleToFit>
            </div>
            <p className="mt-4 text-sm text-slate">Branding changes apply across the site, tickets and emails as soon as you publish. No code changes needed.</p>
          </Card>
        </div>
      </div>
    </form>
  );
}

/** The CSS variables for a set of brand colours, to scope a preview. */
const tokenStyle = (colors: BrandingData['colors']) => cssVariables(brandTokens(colors)) as CSSProperties;

function ColorField({ label, hint, value, error, field, onPick }: { label: string; hint: string; value: string; error?: string; field: UseFormRegisterReturn; onPick: (c: string) => void }) {
  const valid = isHexColor(value);
  return (
    <div>
      <label htmlFor={`color-${field.name}`} className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={valid ? value.toLowerCase() : '#000000'}
          onChange={(e) => onPick(e.target.value.toUpperCase())}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-xl border border-line bg-white p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
        />
        <input
          id={`color-${field.name}`}
          {...field}
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={`color-${field.name}-msg`}
          className={`h-11 w-full min-w-0 rounded-xl border bg-white px-3 font-mono text-[14px] uppercase text-ink focus:outline-none focus:ring-2 ${error ? 'border-danger focus:ring-danger/30' : 'border-line focus:border-forest focus:ring-forest/20'}`}
        />
      </div>
      <p id={`color-${field.name}-msg`} className={`mt-1.5 text-xs ${error ? 'text-danger' : 'text-slate'}`}>{error ?? hint}</p>
    </div>
  );
}

function AssetField({ kind, label, value, hint, onChange, preview, wide }: { kind: BrandAssetKind; label: string; value?: string; hint: string; onChange: (url: string | undefined) => void; preview: ReactNode; wide?: boolean }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const accept = kind === 'logo' ? 'image/svg+xml,image/png,image/webp' : kind === 'favicon' ? 'image/svg+xml,image/png,image/x-icon,.ico' : 'image/jpeg,image/png,image/webp';
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await brandingApi.upload(kind, file);
      onChange(url);
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t upload that file.'), { id: `brand-${kind}` });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  return (
    <div className={wide ? 'grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : undefined}>
      <div>
        <p className="label">{label}</p>
        {preview}
      </div>
      <div className={wide ? 'self-end' : 'mt-2'}>
        <p className="text-xs text-slate">{hint}</p>
        <div className="mt-1.5 flex gap-4 text-sm font-bold">
          <label className="cursor-pointer rounded text-forest hover:underline focus-within:ring-2 focus-within:ring-forest/40">
            <input ref={fileRef} type="file" accept={accept} className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} aria-label={`Upload ${label.toLowerCase()}`} />
            <ImagePlus size={15} aria-hidden className="mr-1 inline align-[-2px]" />
            {busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}
          </label>
          {value && <button type="button" className="text-slate hover:underline" onClick={() => onChange(undefined)}>Remove</button>}
        </div>
      </div>
    </div>
  );
}

/** A desktop homepage in the draft brand: hero with nav, an upcoming-hike card and the footer. */
function SitePreview({ brand }: { brand: BrandingData }) {
  return (
    <BrandingContext.Provider value={brand}>
      <div style={tokenStyle(brand.colors)} className="bg-canvas font-sans text-ink">
        <section className="relative overflow-hidden bg-gradient-to-b from-sun-soft to-sun">
          {brand.bannerUrl && <img src={brand.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />}
          <div className="absolute inset-0 bg-pine/55" />
          <div className="relative flex items-center justify-between px-12 py-6">
            <Logo dark />
            <div className="flex items-center gap-8 text-sm font-semibold text-white">
              <span>Events</span><span>About</span><span>Find my ticket</span>
              <span className={buttonClasses({ variant: 'light', size: 'sm' })}>Log in</span>
            </div>
          </div>
          <div className="relative px-12 pb-16 pt-14">
            <h1 className="text-6xl leading-[1.05] text-white">Find your trail.<br /><span className="text-sun-soft">Walk it together.</span></h1>
            <p className="mt-5 max-w-lg text-lg text-white/85">Weekly guided hikes around Abuja and beyond.</p>
            <div className="mt-7 flex gap-4">
              <span className={buttonClasses({ variant: 'accent', size: 'lg' })}>Browse hikes</span>
              <span className={buttonClasses({ variant: 'light', size: 'lg' })}>Create account</span>
            </div>
          </div>
        </section>
        <section className="px-12 py-10">
          <div className="flex items-end justify-between">
            <h2 className="text-3xl">Upcoming hikes</h2>
            <span className="font-semibold text-forest">View all events →</span>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-6">
            {['Zuma Rock Trail', 'Gurara Waterfalls', 'Jabi Lake Walk'].map((t, i) => (
              <div key={t} className="overflow-hidden rounded-2xl border border-line bg-white">
                <div className="h-24 bg-gradient-to-br from-moss to-forest" />
                <div className="p-4">
                  <Badge tone={i === 1 ? 'orange' : 'green'}>{i === 1 ? 'Few spots left' : 'Open'}</Badge>
                  <p className="mt-2 font-bold">{t}</p>
                  <p className="text-sm text-slate">Sat {17 + i * 7} Oct · from ₦15,000</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <footer className="flex items-start justify-between bg-pine px-12 py-8 text-sm text-mist">
          <div>
            <Logo dark />
            <p className="mt-2 max-w-xs">{brand.fullName}: {brand.tagline}</p>
          </div>
          <div className="text-right">
            <p>{brand.contact.email}</p>
            <p>{brand.contact.phone}</p>
            <p className="text-mist-dim">{brand.contact.location}</p>
          </div>
        </footer>
      </div>
    </BrandingContext.Provider>
  );
}
