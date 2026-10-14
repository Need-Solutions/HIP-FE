import { expect, test } from '@playwright/test';
import { hikerLogin, staffLogin } from './helpers';

// Role-based access (ADM-002/003, SRCH-008, NFR-008 on the UI side): each role reaches its screens and is turned
// away from the rest. Signed in, the dev guard bypass no longer applies.

test('hiker: account area only', async ({ page }) => {
  await hikerLogin(page);
  await page.waitForURL(/\/account/);
  for (const path of ['/admin', '/checkin']) {
    await page.goto(path);
    await expect(page).not.toHaveURL(new RegExp(`^[^?]*${path}`));
  }
});

test('check-in staff: scanner, not admin', async ({ page }) => {
  await staffLogin(page, 'tola@hip.ng');
  await expect(page).toHaveURL(/\/checkin/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/checkin/);
});

test('admin: everything but staff management', async ({ page }) => {
  await staffLogin(page, 'ife@hip.ng');
  await page.goto('/admin/staff');
  await expect(page.getByText('Only a super admin can change staff and roles.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite staff' })).toHaveCount(0);
  await page.goto('/admin/audit-log');
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
});

test('super admin: can manage staff', async ({ page }) => {
  await staffLogin(page, 'kunle@hip.ng');
  await page.goto('/admin/staff');
  await expect(page.getByRole('button', { name: 'Invite staff' })).toBeVisible();
  await expect(page.getByLabel('Role for Tola Bakare')).toBeVisible();
});

test('advertiser: own campaigns only, everything else redirects to Ads', async ({ page }) => {
  await staffLogin(page, 'ads@outdoorhub.ng');
  await expect(page).toHaveURL(/\/admin\/ads$/);
  await expect(page.getByRole('navigation', { name: 'Admin' }).getByRole('link')).toHaveText(['Ads']);
  await expect(page.getByRole('link', { name: 'HydroPack 2L' })).toHaveCount(0);
  for (const path of ['/admin', '/admin/hikers', '/admin/branding', '/admin/audit-log', '/admin/tickets/HIP-7Q4K-2291']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/ads$/);
  }
  await page.goto('/checkin');
  await expect(page).not.toHaveURL(/\/checkin/);
});
