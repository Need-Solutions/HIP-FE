import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import { DEFAULT_TOKENS, cssVariables, type ColorToken } from './src/lib/brandDefaults';

// Design tokens from the Figma "Design system" frame. Every colour is a CSS variable, so Admin / Branding can change
// the brand at runtime without a code change (SRS 2.3). Defaults live in src/lib/brandDefaults.ts and are written
// to :root below; features/branding sets the live values. `<alpha-value>` keeps modifiers like bg-forest/60 working.
const v = (token: ColorToken) => `rgb(var(--c-${token}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: v('forest'), 600: v('forest-600') },
        pine: { DEFAULT: v('pine'), line: v('pine-line') },
        moss: v('moss'),
        mint: v('mint'),
        mist: { DEFAULT: v('mist'), light: v('mist-light'), dim: v('mist-dim') },
        'on-primary': v('on-primary'),
        'on-secondary': v('on-secondary'),
        sun: { DEFAULT: v('sun'), light: v('sun-light'), dark: v('sun-dark'), soft: v('sun-soft') },
        sand: v('sand'),
        ink: v('ink'),
        slate: { DEFAULT: v('slate'), mute: v('slate-mute') },
        line: v('line'),
        chip: v('chip'),
        canvas: v('canvas'),
        danger: { DEFAULT: v('danger'), light: v('danger-light') },
        warn: { DEFAULT: v('warn'), light: v('warn-light') },
        info: { DEFAULT: v('info'), light: v('info-light') },
        // Check-in camera screens (phase 5).
        camera: { DEFAULT: v('camera'), mute: v('mist') },
        signal: { on: v('signal-on'), 'off-bg': v('signal-off-bg') },
        offline: { DEFAULT: v('offline'), text: v('offline-text') },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { xl: '10px', '2xl': '16px', '3xl': '24px' },
      maxWidth: { page: '1280px' },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ':root': cssVariables(DEFAULT_TOKENS) });
    }),
  ],
} satisfies Config;
