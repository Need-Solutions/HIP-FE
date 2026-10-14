// The default brand: the only place the Figma colours and group details are written down. Tailwind maps every
// colour token to a CSS variable (tailwind.config.ts), these values fill the variables until the branding endpoint
// answers, and Admin / Branding changes them without a code change (SRS 2.3). Keep this file free of imports: it's
// read by tailwind.config.ts and vite.config.ts as well as the app.

/** Every colour token, as hex. Brand families are derived from three colours at runtime (lib/brandColors.ts). */
export const DEFAULT_TOKENS = {
  // Primary family (brand colour "primary")
  forest: '#1E4D3A',
  'forest-600': '#24493A',
  pine: '#0F2B21',
  moss: '#3F7D5C',
  mint: '#E3EFE7',
  // Text and lines on dark brand surfaces (footer, admin sidebar, landing CTA)
  mist: '#A9BDB2',
  'mist-light': '#C3D2CA',
  'mist-dim': '#7F978A',
  'pine-line': '#2A4A3C',
  // Check-in camera screens (derived from primary / secondary when rebranded)
  camera: '#1D2A25',
  'signal-on': '#9FE0B8',
  // Secondary family (brand colour "secondary")
  sun: '#E9833B',
  'sun-light': '#FCEBDD',
  'sun-dark': '#A85314',
  'sun-soft': '#F6C58B',
  'signal-off-bg': '#5A3A10',
  offline: '#3A2A0E',
  'offline-text': '#E8D3B0',
  // Text on the brand colours (brand settings "text on primary" / "text on secondary"). Ink on the orange passes
  // WCAG AA (6.2:1); white on it doesn't (2.7:1).
  'on-primary': '#FFFFFF',
  'on-secondary': '#14201B',
  // Surfaces (brand colour "surface")
  canvas: '#F7F8F6',
  sand: '#F6F2EA',
  // Neutrals and status colours: not brandable, so meaning stays the same (WCAG, status never colour-only)
  ink: '#14201B',
  slate: '#5B6660',
  // Figma had #8A948F (3.1:1 on white); darkened to pass AA for the small text it's used for.
  'slate-mute': '#656C68',
  line: '#E2E6E3',
  chip: '#ECEEED',
  danger: '#BB3838', // status colours darkened from Figma so badge text passes AA on their light fills
  'danger-light': '#FBE4E4',
  warn: '#93630A',
  'warn-light': '#FBF0D6',
  info: '#2C67C2',
  'info-light': '#E2ECFB',
} as const;

export type ColorToken = keyof typeof DEFAULT_TOKENS;

/** The three colours an admin picks on Admin / Branding. */
export interface BrandColors {
  primary: string;
  secondary: string;
  surface: string;
  /** Text and icons on the primary colour (buttons, active tabs). */
  onPrimary: string;
  /** Text and icons on the secondary colour (accent buttons). */
  onSecondary: string;
}

export const DEFAULT_BRAND_COLORS: BrandColors = {
  primary: DEFAULT_TOKENS.forest,
  secondary: DEFAULT_TOKENS.sun,
  surface: DEFAULT_TOKENS.canvas,
  onPrimary: DEFAULT_TOKENS['on-primary'],
  onSecondary: DEFAULT_TOKENS['on-secondary'],
};

/** Group details shown in the nav, footer, legal pages and copy. */
export interface BrandDetails {
  /** Short name used in copy and the logo ("HIP"). */
  name: string;
  /** Full name ("Hikers Integrated Platform"). */
  fullName: string;
  tagline: string;
  /** Custom logo image; the built-in mountain mark is used when empty. */
  logoUrl?: string;
  /** Browser tab icon; generated from the logo (or the built-in mark) when empty. */
  faviconUrl?: string;
  /** Homepage hero photo; the built-in gradient is used when empty. */
  bannerUrl?: string;
  contact: {
    email: string;
    phone: string;
    location: string;
    instagram?: string;
    x?: string;
    facebook?: string;
    /** WhatsApp community or chat link. */
    whatsapp?: string;
  };
}

export const DEFAULT_BRAND_DETAILS: BrandDetails = {
  name: 'HIP',
  fullName: 'Hikers Integrated Platform',
  tagline: 'weekly trails, good company, every tick counted.',
  contact: {
    email: 'hello@hip.ng',
    phone: '+234 801 234 5678',
    location: 'Abuja, Nigeria',
    instagram: 'https://instagram.com/',
    x: 'https://x.com/',
    whatsapp: 'https://wa.me/2348012345678',
  },
};

/** Refresh the previous default location while retaining all other brand settings. */
export function migrateDefaultBrandLocation<T extends BrandDetails>(details: T): T {
  if (details.contact.location === 'Lagos, Nigeria') {
    return { ...details, contact: { ...details.contact, location: DEFAULT_BRAND_DETAILS.contact.location } };
  }
  return details;
}

/** "#1E4D3A" → "30 77 58", the form the CSS variables use (so Tailwind's /opacity modifiers work). */
export function hexToChannels(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** The `:root` variables for a full token set. */
export function cssVariables(tokens: Record<ColorToken, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--c-${k}`, hexToChannels(v)]));
}
