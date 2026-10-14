import { expect, test } from '@playwright/test';

// SRS gaps closed in phase 9: TKT-020, EVT-008, ADS-016, NOT-009, NFR-035, and the footer links.

test('TKT-020: ticket detail from participants, transactions and search', async ({ page }) => {
  await page.goto('/admin/events/evt_1/participants?q=HIP-7Q4K-2291');
  await page.getByRole('link', { name: 'HIP-7Q4K-2291' }).click();
  await expect(page).toHaveURL(/\/admin\/tickets\/HIP-7Q4K-2291$/);
  await expect(page.getByRole('heading', { name: 'HIP-7Q4K-2291' })).toBeVisible();
  for (const h of ['Ticket', 'Holder', 'Payment', 'Check-in', 'Status history']) await expect(page.getByRole('heading', { name: h, exact: true, level: 3 })).toBeVisible();
  await expect(page.getByText(/ticket issued/i)).toBeVisible();

  await page.getByRole('combobox', { name: /Search/ }).first().fill('HIP-7Q4K');
  await page.getByRole('option', { name: /HIP-7Q4K-2291/ }).click();
  await expect(page).toHaveURL(/\/admin\/tickets\/HIP-7Q4K-2291$/);

  await page.goto('/admin/tickets/HIP-NOPE-0000');
  await expect(page.getByText('Ticket not found')).toBeVisible();
});

test('EVT-008: moving a published event asks before notifying ticket holders', async ({ page }) => {
  await page.goto('/admin/events/evt_1/edit');
  const meeting = page.getByLabel(/Meeting point/);
  await expect(meeting).not.toHaveValue(''); // wait for the saved event to load into the form
  await meeting.fill('Wuse Market Gate, Abuja');
  await page.getByRole('button', { name: 'Save changes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Notify ticket holders?' });
  await expect(dialog).toContainText(/Tell \d+ ticket holders about this change/);
  await expect(dialog).toContainText('Wuse Market Gate, Abuja');
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: /^Save and notify \d+/ }).click();
  await expect(page.getByText(/ticket holders are being told about the change by email/)).toBeVisible();
});

test('ADS-016: performance follows the chosen period, and so does the CSV', async ({ page }) => {
  await page.goto('/admin/ads/ad_1');
  const impressions = () => page.locator('main').getByText('Impressions', { exact: true }).first().locator('xpath=following-sibling::p[1]').innerText();
  const whole = await impressions();
  await page.getByLabel('Period').selectOption('last_7');
  await expect(page.getByText(/· 7 days$/)).toBeVisible();
  await expect.poll(impressions).not.toBe(whole);
  await expect(page).toHaveURL(/period=last_7/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const csv = await (await download).createReadStream().then(async (s) => { let t = ''; for await (const c of s!) t += c; return t; });
  expect(csv).toContain('Last 7 days:');
});

test('NOT-009: delivery log with filters', async ({ page }) => {
  await page.goto('/admin/notifications');
  await page.getByRole('tab', { name: 'Delivery log' }).click();
  await expect(page).toHaveURL(/tab=log/);
  const rows = page.getByRole('row');
  await expect(rows.nth(1)).toBeVisible();
  await page.getByLabel('Status').selectOption('failed');
  await expect(page.locator('tbody tr').first()).toContainText('Failed');
  for (const row of await page.locator('tbody tr').all()) await expect(row).toContainText('Failed');
  await page.getByLabel('Channel').selectOption('whatsapp');
  await expect(page.getByText('No messages match')).toBeVisible();
});

test('NFR-035: hikers can download their data as JSON', async ({ page }) => {
  await page.goto('/account/profile');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^my-hiking-data-\d{4}-\d{2}-\d{2}\.json$/);
  let text = '';
  for await (const chunk of (await file.createReadStream())!) text += chunk;
  const data = JSON.parse(text);
  expect(data.profile.user.email).toMatch(/@/);
  expect(data.profile.user.fullName).toBeTruthy();
  expect(data.tickets.length).toBeGreaterThan(0);
  expect(data.hikingHistory.some((h: { outcome: string }) => h.outcome === 'attended')).toBe(true);
  expect(text).not.toMatch(/"qrPayload"|data:image/);
  await expect(page.getByText(/^Downloaded my-hiking-data-/)).toBeVisible();
});

test('footer: Past hikes goes to past events; no Gallery or FAQs', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await footer.getByRole('link', { name: 'Past hikes' }).click();
  await expect(page).toHaveURL(/\/events\?status=past/);
  await expect(footer.getByText(/Gallery|FAQs/)).toHaveCount(0);
});
