import { DEFAULT_BRAND_COLORS, DEFAULT_TOKENS, cssVariables, type BrandColors, type ColorToken } from './brandDefaults';

// Turns the three brand colours from Admin / Branding into every colour token. A family whose colour is unchanged
// keeps the exact Figma values; a changed one is derived by mixing with white or black, so the shades keep the
// same roles (tints for backgrounds, shades for text and dark surfaces). Neutrals and status colours never change.

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (v: string | undefined) => !!v && HEX.test(v);

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Mix `hex` towards `other` by `amount` (0 = hex, 1 = other). */
function mix(hex: string, other: string, amount: number) {
  const a = toRgb(hex);
  const b = toRgb(other);
  return toHex(a.map((c, i) => c + (b[i] - c) * amount));
}

const WHITE = '#FFFFFF';
const BLACK = '#000000';
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function brandTokens(colors: BrandColors): Record<ColorToken, string> {
  const tokens: Record<ColorToken, string> = { ...DEFAULT_TOKENS };
  const p = isHexColor(colors.primary) ? colors.primary : DEFAULT_BRAND_COLORS.primary;
  const s = isHexColor(colors.secondary) ? colors.secondary : DEFAULT_BRAND_COLORS.secondary;
  const surface = isHexColor(colors.surface) ? colors.surface : DEFAULT_BRAND_COLORS.surface;

  if (!same(p, DEFAULT_BRAND_COLORS.primary)) {
    Object.assign(tokens, {
      forest: p.toUpperCase(),
      'forest-600': mix(p, BLACK, 0.06),
      pine: mix(p, BLACK, 0.48),
      moss: mix(p, WHITE, 0.22),
      mint: mix(p, WHITE, 0.88),
      mist: mix(mix(p, BLACK, 0.48), WHITE, 0.62),
      'mist-light': mix(mix(p, BLACK, 0.48), WHITE, 0.74),
      'mist-dim': mix(mix(p, BLACK, 0.48), WHITE, 0.45),
      'pine-line': mix(mix(p, BLACK, 0.48), WHITE, 0.12),
      camera: mix(p, BLACK, 0.6),
      'signal-on': mix(p, WHITE, 0.6),
    });
  }
  if (!same(s, DEFAULT_BRAND_COLORS.secondary)) {
    Object.assign(tokens, {
      sun: s.toUpperCase(),
      'sun-light': mix(s, WHITE, 0.84),
      'sun-dark': mix(s, BLACK, 0.32),
      'sun-soft': mix(s, WHITE, 0.4),
      'signal-off-bg': mix(s, BLACK, 0.62),
      offline: mix(s, BLACK, 0.76),
      'offline-text': mix(s, WHITE, 0.7),
    });
  }
  // Older saved brands have no text colours; they get the defaults.
  tokens['on-primary'] = isHexColor(colors.onPrimary) ? colors.onPrimary.toUpperCase() : DEFAULT_BRAND_COLORS.onPrimary;
  tokens['on-secondary'] = isHexColor(colors.onSecondary) ? colors.onSecondary.toUpperCase() : DEFAULT_BRAND_COLORS.onSecondary;
  if (!same(surface, DEFAULT_BRAND_COLORS.surface)) {
    Object.assign(tokens, { canvas: surface.toUpperCase(), sand: mix(surface, s, 0.05) });
  }
  return tokens;
}

/** Writes the brand's CSS variables onto <html> (and the browser theme colour). */
export function applyBrandColors(colors: BrandColors) {
  const tokens = brandTokens(colors);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(cssVariables(tokens))) root.style.setProperty(name, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.forest);
}
