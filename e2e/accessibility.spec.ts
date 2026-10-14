import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// WCAG 2.2 AA (NFR-025): axe-core on every route at desktop and phone width. Signed out in dev, admin and check-in
// screens act as the sample super admin and hiker screens show Adaeze's sample data.

const ROUTES = [
  '/', '/events', '/events/zuma-rock-trail', '/about', '/find-ticket', '/terms', '/privacy',
  '/checkout/evt_1?items=tt_1:2', '/tickets/HIP-7Q4K-2291',
  '/signup', '/login', '/forgot-password', '/reset-password?token=demo', '/welcome', '/staff/login',
  '/account', '/account/tickets', '/account/tickets/HIP-7Q4K-2291', '/account/history', '/account/profile',
  '/checkin', '/checkin/evt_1/offline', '/checkin/evt_1/scan', '/checkin/evt_1/search', '/checkin/evt_1/sync', '/checkin/evt_1/close',
  '/admin', '/admin/events', '/admin/events/new', '/admin/events/evt_1/edit', '/admin/events/evt_1/participants', '/admin/tickets/HIP-7Q4K-2291',
  '/admin/checkin', '/admin/checkin/evt_1/sync', '/admin/analytics', '/admin/transactions', '/admin/hikers', '/admin/hikers/usr_00412', '/admin/staff',
  '/admin/ads', '/admin/ads/new', '/admin/ads/ad_1', '/admin/ads/ad_1?period=custom&from=2026-10-01&to=2026-10-07', '/admin/ads/ad_1/edit',
  '/admin/notifications', '/admin/notifications?tab=log', '/admin/branding', '/admin/audit-log',
];

for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]] as const) {
  test.describe(`axe at ${label} width`, () => {
    test.use({ viewport });
    for (const route of ROUTES) {
      test(route, async ({ page }) => {
        await page.goto(route, { waitUntil: 'networkidle' });
        // Scan the loaded page, not the lazy-load placeholder or skeletons.
        await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
        await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 15_000 });
        await page.waitForTimeout(300);
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
        expect(violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
      });
    }
  });
}
