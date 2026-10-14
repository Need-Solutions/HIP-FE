import { brandTokens } from './brandColors';
import type { BrandColors } from './brandDefaults';

// WCAG 2.2 contrast checks for Admin / Branding (SC 1.4.3). Each check is a real pairing the app uses, measured on
// the tokens the chosen colours produce, so the warning matches what hikers will actually see.

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two #RRGGBB colours, 1–21. */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastCheck {
  id: string;
  /** "White text on the primary colour" */
  label: string;
  /** Where hikers see it. */
  usedFor: string;
  foreground: string;
  background: string;
  ratio: number;
  /** 4.5 for body text (AA). */
  required: number;
  passes: boolean;
}

export function brandContrastChecks(colors: BrandColors): ContrastCheck[] {
  const t = brandTokens(colors);
  const checks: Omit<ContrastCheck, 'ratio' | 'passes'>[] = [
    { id: 'on-primary', label: 'Text on the primary colour', usedFor: 'Buttons, active tabs and filters', foreground: t['on-primary'], background: t.forest, required: 4.5 },
    { id: 'on-secondary', label: 'Text on the secondary colour', usedFor: '“Browse hikes” and other accent buttons', foreground: t['on-secondary'], background: t.sun, required: 4.5 },
    { id: 'on-dark', label: 'White text on the dark brand panels', usedFor: 'Admin sidebar, footer, check-in screens', foreground: '#FFFFFF', background: t.pine, required: 4.5 },
    { id: 'primary-on-surface', label: 'Primary colour as text on the surface', usedFor: 'Links and highlighted text', foreground: t.forest, background: t.canvas, required: 4.5 },
    { id: 'body-on-surface', label: 'Body text on the surface', usedFor: 'Page text', foreground: t.ink, background: t.canvas, required: 4.5 },
    { id: 'muted-on-surface', label: 'Secondary text on the surface', usedFor: 'Hints, dates and captions', foreground: t.slate, background: t.canvas, required: 4.5 },
  ];
  return checks.map((c) => {
    const ratio = contrastRatio(c.foreground, c.background);
    return { ...c, ratio, passes: ratio >= c.required };
  });
}

/** "4.52:1", rounded down so a pass is never overstated. */
export const formatRatio = (r: number) => `${(Math.floor(r * 100) / 100).toFixed(2)}:1`;
