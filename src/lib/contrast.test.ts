import { describe, expect, it } from 'vitest';
import { brandContrastChecks, contrastRatio, formatRatio } from './contrast';
import { DEFAULT_BRAND_COLORS } from './brandDefaults';

// Admin / Branding contrast warnings (WCAG 2.2 SC 1.4.3, 4.5:1 for body text).

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5));
  it('is 1:1 for the same colour', () => expect(contrastRatio('#E9833B', '#E9833B')).toBeCloseTo(1, 5));
  it('doesn’t care about order', () => expect(contrastRatio('#1E4D3A', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#1E4D3A'), 10));
  it('white on the brand orange fails AA (why accent buttons use ink)', () => expect(contrastRatio('#FFFFFF', '#E9833B')).toBeLessThan(3));
});

describe('brandContrastChecks', () => {
  it('passes every check with the default brand', () => expect(brandContrastChecks(DEFAULT_BRAND_COLORS).filter((c) => !c.passes)).toEqual([]));
  it('flags white text on the orange', () => {
    const failing = brandContrastChecks({ ...DEFAULT_BRAND_COLORS, onSecondary: '#FFFFFF' }).filter((c) => !c.passes);
    expect(failing.map((c) => c.id)).toEqual(['on-secondary']);
  });
  it('flags a pale primary for both its text and its links', () => {
    const failing = brandContrastChecks({ ...DEFAULT_BRAND_COLORS, primary: '#9FE0B8' }).filter((c) => !c.passes).map((c) => c.id);
    expect(failing).toContain('on-primary');
    expect(failing).toContain('primary-on-surface');
  });
});

describe('formatRatio', () => {
  it('rounds down so a pass is never overstated', () => expect(formatRatio(4.499)).toBe('4.49:1'));
});
