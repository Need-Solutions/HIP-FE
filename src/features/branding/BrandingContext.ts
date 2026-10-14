import { createContext, useContext } from 'react';
import { DEFAULT_BRAND_COLORS, DEFAULT_BRAND_DETAILS } from '@/lib/brandDefaults';
import type { Branding } from '@/api/endpoints';

// The group's brand for the whole app (name, logo, contact details, colours). Provider: BrandingProvider.tsx.

export const DEFAULT_BRANDING: Branding = { ...DEFAULT_BRAND_DETAILS, colors: DEFAULT_BRAND_COLORS };

export const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

export const useBranding = () => useContext(BrandingContext);
