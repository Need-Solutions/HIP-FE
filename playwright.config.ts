import { defineConfig, devices } from '@playwright/test';

// End-to-end tests (NFR-029) against the dev server with mocks on: the mock backend keeps its state in
// sessionStorage, so every test starts clean in its own browser context. Payments use the simulated dialog (no
// Paystack key). Runs in the installed Google Chrome by default; set PW_CHANNEL= (empty) to use Playwright's own
// Chromium after `npx playwright install chromium`.

const PORT = 5180;
const channel = process.env.PW_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: Number(process.env.PW_WORKERS) || 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: channel || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel: channel || undefined, viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_USE_MOCKS: 'true', VITE_PAYSTACK_PUBLIC_KEY: '' },
  },
});
