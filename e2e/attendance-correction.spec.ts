import { expect, test } from '@playwright/test';

// ATT-017/018: an admin checks someone in by hand; a reason is required and the change lands in the audit log with
// the old and new state. Signed out in dev, admin screens act as the sample super admin.

test('correcting attendance needs a reason and is audit-logged', async ({ page }) => {
  await page.goto('/admin/events/evt_1/participants?filter=out');
  const button = page.getByRole('button', { name: /^Check in / }).first();
  const name = (await button.getAttribute('aria-label'))!.replace(/^Check in /, '');
  await button.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Checked in', { exact: true })).toBeVisible(); // not checked in → checked in

  await dialog.getByRole('button', { name: 'Save correction' }).click();
  await expect(dialog.getByText(/reason/i).last()).toBeVisible();

  await dialog.getByLabel('Reason (required)').fill('Scanner phone died at the gate; the trail lead confirmed.');
  await dialog.getByRole('button', { name: 'Save correction' }).click();
  await expect(dialog).toBeHidden();
  // The "not checked in" filter now hides the row; the full list shows the new check-in.
  await page.goto(`/admin/events/evt_1/participants?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole('button', { name: `Edit check-in for ${name}` })).toBeVisible();

  await page.goto(`/admin/audit-log?q=${encodeURIComponent('Scanner phone died at the gate')}&period=today`);
  const row = page.getByRole('row').filter({ hasText: 'Attendance corrected' }).first();
  await expect(row).toContainText(new RegExp(`${name}.*Not checked in → Checked in .*\\(Manual\\)`));
  await expect(row).toContainText('Scanner phone died at the gate');
});
