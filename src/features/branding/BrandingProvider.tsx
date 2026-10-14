import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { brandingApi } from '@/api/endpoints';
import { applyBrandColors } from '@/lib/brandColors';
import { BrandingContext, DEFAULT_BRANDING } from './BrandingContext';
import { readCachedBranding, writeCachedBranding } from './brandingCache';

// Loads the brand at startup (GET /api/branding) and applies it: CSS colour variables, browser theme colour and the
// name/logo/contacts the screens read with useBranding(). The last brand is cached on this device so the next load
// starts with the right colours instead of flashing the defaults. If the request fails, the defaults stay.

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ['branding'],
    queryFn: brandingApi.get,
    staleTime: 5 * 60_000,
    networkMode: 'always',
    retry: 1,
    meta: { silentError: true }, // the defaults (or the cached brand) keep working
    placeholderData: () => readCachedBranding() ?? undefined,
  });
  const branding = data ?? DEFAULT_BRANDING;

  useEffect(() => {
    applyBrandColors(branding.colors);
    if (data) writeCachedBranding(data);
    // Pages without their own title show the group's name (admin pages set "Page · Name Admin" themselves).
    if (!document.title.includes(' · ')) document.title = `${branding.name} – ${branding.fullName}`;
  }, [branding.colors, branding.name, branding.fullName, data]);

  useEffect(() => {
    // Favicon: the uploaded one, else the logo, else the built-in mark.
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) return;
    const href = branding.faviconUrl ?? branding.logoUrl ?? '/favicon.svg';
    icon.href = href;
    icon.type = href.startsWith('data:image/svg') || href.endsWith('.svg') ? 'image/svg+xml' : '';
  }, [branding.faviconUrl, branding.logoUrl]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}
