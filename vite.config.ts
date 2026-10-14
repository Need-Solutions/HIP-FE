import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { DEFAULT_BRAND_DETAILS, DEFAULT_TOKENS } from './src/lib/brandDefaults';

/** `npm run dev:phone`: after start-up, print the HTTPS address to open on a phone on the same Wi-Fi. */
function phoneUrlHint(): Plugin {
  return {
    name: 'hip-phone-url',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address();
        const port = typeof address === 'object' && address ? address.port : 5173;
        const ips = Object.values(networkInterfaces())
          .flat()
          .filter((i) => i && i.family === 'IPv4' && !i.internal)
          .map((i) => i!.address);
        const lines = ips.length
          ? ips.map((ip) => `    https://${ip}:${port}/checkin`)
          : ['    (no network address found: is this computer on Wi-Fi?)'];
        setTimeout(() => {
          console.log(
            [
              '',
              '  \x1b[1m\x1b[32mTest on a phone\x1b[0m (same Wi-Fi as this computer). Open:',
              ...lines,
              '  Accept the certificate warning (it is a local, self-signed certificate), then allow the camera.',
              '',
            ].join('\n'),
          );
        }, 100);
      });
    },
  };
}

/**
 * Fills the brand defaults into index.html at build time (theme colour, title), so no colour is written twice.
 * The live brand from Admin / Branding replaces them at runtime (features/branding).
 */
function brandDefaultsInHtml(): Plugin {
  return {
    name: 'hip-brand-defaults',
    transformIndexHtml: (html) =>
      html
        .replace(/%HIP_THEME_COLOR%/g, DEFAULT_TOKENS.forest)
        .replace(/%HIP_TITLE%/g, `${DEFAULT_BRAND_DETAILS.name} – ${DEFAULT_BRAND_DETAILS.fullName}`)
        .replace(/%HIP_DESCRIPTION%/g, `${DEFAULT_BRAND_DETAILS.fullName}: ${DEFAULT_BRAND_DETAILS.tagline} Find guided hikes, buy tickets and check in with a QR code.`),
  };
}

// PWA is enabled so the check-in scanner keeps working without signal.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    brandDefaultsInHtml(),
    // Phones only allow the camera on HTTPS, so the phone mode serves a self-signed certificate. Dev only.
    ...(mode === 'phone' ? [basicSsl(), phoneUrlHint()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      // Fonts too, so the check-in app keeps Inter with no signal.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
      includeAssets: ['favicon.svg'],
      manifest: {
        // Install metadata is fixed at build time; it uses the default brand.
        name: `${DEFAULT_BRAND_DETAILS.name} – ${DEFAULT_BRAND_DETAILS.fullName}`,
        short_name: DEFAULT_BRAND_DETAILS.name,
        theme_color: DEFAULT_TOKENS.forest,
        background_color: DEFAULT_TOKENS.canvas,
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      // The mock backend (src/api/mock) only runs behind `USE_MOCKS`. Declaring it free of side effects lets the
      // bundler drop it entirely when VITE_USE_MOCKS=false, so no sample data or test key ships in a release.
      treeshake: { moduleSideEffects: (id) => !id.includes('/src/api/mock/') },
      output: { manualChunks: vendorChunk },
    },
  },
}));

/**
 * Vendor code in a few long-lived chunks, so an app update doesn't re-download React and friends. Charts and the
 * camera scanner stay in their own chunks and load only on the screens that use them.
 */
function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) return 'vendor-react';
  if (id.includes('@tanstack')) return 'vendor-query';
  if (/node_modules\/(react-hook-form|@hookform|zod)\//.test(id)) return 'vendor-forms';
  if (/node_modules\/(recharts|d3-[a-z-]+|victory-vendor|recharts-scale|decimal\.js-light|internmap)\//.test(id)) return 'vendor-charts';
  if (id.includes('html5-qrcode')) return 'vendor-scanner';
  if (/node_modules\/(react-toastify|clsx|tailwind-merge)\//.test(id)) return 'vendor-ui';
  return undefined;
}
