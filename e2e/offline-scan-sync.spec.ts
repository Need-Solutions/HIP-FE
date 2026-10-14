import { expect, test } from '@playwright/test';

// Offline check-in (CLAUDE.md "Offline check-in"): download the list, lose signal, scan (signature checked on the
// phone), get signal back, sync. Uses the mock "Test scan" panel to feed real signed QR payloads.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('scan with no signal, then sync when it returns', async ({ page, context }) => {
  await page.goto('/checkin/evt_1/offline');
  await page.getByRole('button', { name: /^Download/ }).click();
  await expect(page.getByText('Saved on this phone')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: 'Start scanning' }).click();
  await expect(page).toHaveURL(/\/scan$/);

  await context.setOffline(true);
  await page.getByRole('button', { name: /Test scan/ }).click();
  await page.getByRole('button', { name: /^Valid/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Checked in (offline)');
  await expect(sheet).toContainText('Saved on this phone · will sync later');
  await page.keyboard.press('Escape');

  // A forged payload is rejected on the phone, offline too.
  const forged = page.getByRole('button', { name: /Forged/i });
  await expect(page.getByRole('dialog')).toBeHidden();
  if (!(await forged.isVisible())) await page.getByRole('button', { name: /Test scan/ }).click();
  await forged.click();
  await expect(page.getByRole('dialog')).not.toContainText('Checked in');
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: /Waiting to sync/ }).click();
  await expect(page).toHaveURL(/\/sync$/);
  await expect(page.getByText(/waiting/)).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const syncNow = page.getByRole('button', { name: 'Sync now' });
  if (await syncNow.isVisible().catch(() => false)) await syncNow.click();
  await expect(page.getByText('nothing waiting')).toBeVisible({ timeout: 25_000 });
});
