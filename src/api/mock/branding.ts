import { ApiError } from '../client';
import { mockStaff } from './data';
import { pushAudit, update, type MockState } from './store';
import { DEFAULT_BRAND_COLORS, DEFAULT_BRAND_DETAILS, migrateDefaultBrandLocation } from '@/lib/brandDefaults';
import { isHexColor } from '@/lib/brandColors';
import { can } from '@/lib/permissions';
import type { BrandAssetKind, Branding, BrandingInput } from '../endpoints';

// Mock branding store (Admin / Branding, SRS 2.3). Rules the backend must keep: only admins change it, every field
// is validated again, and each change is audit-logged with the fields that changed.

const defaults = (): Branding => ({ ...DEFAULT_BRAND_DETAILS, contact: { ...DEFAULT_BRAND_DETAILS.contact }, colors: { ...DEFAULT_BRAND_COLORS } });

const seed = (s: MockState) => (s.branding = migrateDefaultBrandLocation(s.branding ?? defaults()));

export const mockBranding = (): Branding => update(seed);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 ()-]{6,18}$/;
const URL_OK = (v?: string) => !v || /^https:\/\/\S+$/i.test(v);
const ASSET_OK = (v?: string) => !v || v.startsWith('data:image/') || /^https:\/\/\S+$/i.test(v);

const FIELD_LABEL: Record<string, string> = {
  name: 'group name',
  fullName: 'full name',
  tagline: 'tagline',
  logoUrl: 'logo',
  faviconUrl: 'favicon',
  bannerUrl: 'homepage banner',
  'colors.primary': 'primary colour',
  'colors.secondary': 'secondary colour',
  'colors.surface': 'surface colour',
  'colors.onPrimary': 'text on primary',
  'colors.onSecondary': 'text on secondary',
  'contact.email': 'contact email',
  'contact.phone': 'contact phone',
  'contact.location': 'location',
  'contact.instagram': 'Instagram',
  'contact.x': 'X',
  'contact.facebook': 'Facebook',
  'contact.whatsapp': 'WhatsApp link',
};

function flat(b: BrandingInput): Record<string, string> {
  return {
    name: b.name,
    fullName: b.fullName,
    tagline: b.tagline,
    logoUrl: b.logoUrl ?? '',
    faviconUrl: b.faviconUrl ?? '',
    bannerUrl: b.bannerUrl ?? '',
    'colors.primary': b.colors.primary.toUpperCase(),
    'colors.secondary': b.colors.secondary.toUpperCase(),
    'colors.surface': b.colors.surface.toUpperCase(),
    'colors.onPrimary': (b.colors.onPrimary ?? DEFAULT_BRAND_COLORS.onPrimary).toUpperCase(),
    'colors.onSecondary': (b.colors.onSecondary ?? DEFAULT_BRAND_COLORS.onSecondary).toUpperCase(),
    ...Object.fromEntries(Object.entries(b.contact).map(([k, v]) => [`contact.${k}`, v ?? ''])),
  };
}

export const mockBrandingAdmin = {
  save: (input: BrandingInput): Branding =>
    update((s) => {
      const me = s.sessionUser ?? mockStaff[0];
      if (!can(me, 'manage_settings')) throw new ApiError(403, 'Only admins can change branding.');
      const fail = (m: string) => {
        throw new ApiError(400, m);
      };
      if (!input.name.trim() || input.name.length > 24) fail('The group name must be 1–24 characters.');
      if (!input.fullName.trim() || input.fullName.length > 60) fail('The full name must be 1–60 characters.');
      if (input.tagline.length > 120) fail('Keep the tagline under 120 characters.');
      for (const c of ['primary', 'secondary', 'surface', 'onPrimary', 'onSecondary'] as const) if (!isHexColor(input.colors[c])) fail(`Each colour must be a hex value like #1E4D3A (${c}).`);
      if (!EMAIL.test(input.contact.email)) fail('Enter a contact email.');
      if (!PHONE.test(input.contact.phone)) fail('Enter a contact phone number.');
      for (const k of ['instagram', 'x', 'facebook', 'whatsapp'] as const) if (!URL_OK(input.contact[k])) fail('Social links must be full https:// links.');
      if (![input.logoUrl, input.faviconUrl, input.bannerUrl].every(ASSET_OK)) fail('Upload the image again.');
      const before = flat(seed(s));
      const clean: Branding = {
        name: input.name.trim(),
        fullName: input.fullName.trim(),
        tagline: input.tagline.trim(),
        logoUrl: input.logoUrl || undefined,
        faviconUrl: input.faviconUrl || undefined,
        bannerUrl: input.bannerUrl || undefined,
        colors: { primary: input.colors.primary.toUpperCase(), secondary: input.colors.secondary.toUpperCase(), surface: input.colors.surface.toUpperCase(), onPrimary: input.colors.onPrimary.toUpperCase(), onSecondary: input.colors.onSecondary.toUpperCase() },
        contact: Object.fromEntries(Object.entries(input.contact).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || undefined : v])) as Branding['contact'],
        updatedAt: new Date().toISOString(),
        updatedBy: me.fullName,
      };
      const after = flat(clean);
      const changed = Object.keys(FIELD_LABEL).filter((k) => (before[k] ?? '') !== (after[k] ?? ''));
      if (!changed.length) return seed(s);
      const colourText = (k: string) => (k.startsWith('colors.') ? ` (${before[k]} → ${after[k]})` : '');
      pushAudit(s, { action: 'branding.updated', recordType: 'settings', recordId: 'branding', details: `Changed ${changed.map((k) => FIELD_LABEL[k] + colourText(k)).join(', ')}` });
      return (s.branding = clean);
    }),
};

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new ApiError(400, 'We couldn’t read that file.'));
    r.readAsDataURL(file);
  });

const RULES: Record<BrandAssetKind, { types: string[]; maxBytes: number; hint: string }> = {
  logo: { types: ['image/svg+xml', 'image/png', 'image/webp'], maxBytes: 512 * 1024, hint: 'an SVG, PNG or WebP under 512 KB' },
  favicon: { types: ['image/svg+xml', 'image/png', 'image/x-icon', 'image/vnd.microsoft.icon'], maxBytes: 128 * 1024, hint: 'an SVG, PNG or ICO under 128 KB' },
  banner: { types: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 8 * 1024 * 1024, hint: 'a JPG, PNG or WebP under 8 MB' },
};

/** Stand-in for POST /api/admin/branding/assets/:kind. Logos and favicons keep transparency; banners are resized. */
export async function mockBrandAsset(kind: BrandAssetKind, file: File): Promise<{ url: string }> {
  const rule = RULES[kind];
  if (!rule.types.includes(file.type) || file.size > rule.maxBytes) throw new ApiError(400, `Choose ${rule.hint}.`);
  if (kind === 'banner') {
    const { shrinkImage } = await import('@/lib/images');
    return { url: await shrinkImage(file, 1920, 900, 0.8) };
  }
  return { url: await readAsDataUrl(file) };
}
