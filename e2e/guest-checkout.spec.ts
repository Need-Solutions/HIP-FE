import { expect, test } from '@playwright/test';

// Business rules 2, 3 and 9: a guest buys two tickets (one attendee per ticket), the fee is shown on top, and the
// ticket appears only after the (simulated) payment is verified.

test('guest buys two tickets and gets a QR ticket', async ({ page }) => {
  await page.goto('/events/zuma-rock-trail');
  await page.getByRole('button', { name: 'More tickets' }).first().click();
  await page.getByRole('button', { name: 'Get tickets' }).first().click();
  await page.waitForURL(/\/checkout\/evt_1/);

  await expect(page.getByRole('radio', { name: 'Continue as guest' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Paystack processing fee')).toBeVisible();

  // Errors show under each field (NFR-024).
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page.getByText('Enter a full name').first()).toBeVisible();

  await page.getByLabel('Full name', { exact: true }).first().fill('Bisi Ade');
  await page.getByLabel('Phone number').fill('08031234567');
  await page.getByLabel('Email for ticket').fill('bisi@example.com');
  await page.getByLabel('Emergency contact name').fill('Tunde Ade');
  await page.getByLabel('Emergency contact phone').fill('08039876543');
  for (const field of await page.getByLabel('Full name', { exact: true }).all()) if (!(await field.inputValue())) await field.fill('Kemi Ade');
  await page.getByLabel(/fitness and age/).check();
  await page.getByRole('button', { name: 'Continue to payment' }).click();

  const pay = page.getByRole('button', { name: /^Pay ₦/ });
  await expect(pay).toBeVisible();
  await pay.click();
  await page.getByRole('button', { name: 'Simulate successful payment' }).click();

  await expect(page.getByText(/Payment confirmed/)).toBeVisible({ timeout: 15_000 });
  const codes = await page.locator('main').getByText(/^HIP-[A-Z0-9]{4}-[A-Z0-9]{4}$/).allInnerTexts();
  expect(codes.length).toBeGreaterThanOrEqual(1);
  await expect(page.getByText('Bisi Ade · Standard')).toBeVisible();
  await expect(page.getByText('Kemi Ade · Standard')).toBeVisible();
});

test('cancelling the payment keeps the seats and returns focus to Pay', async ({ page }) => {
  await page.goto('/checkout/evt_1?items=tt_1:1');
  await page.getByLabel('Full name', { exact: true }).first().fill('Bisi Ade');
  await page.getByLabel('Phone number').fill('08031234567');
  await page.getByLabel('Email for ticket').fill('bisi@example.com');
  await page.getByLabel('Emergency contact name').fill('Tunde Ade');
  await page.getByLabel('Emergency contact phone').fill('08039876543');
  await page.getByLabel(/fitness and age/).check();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  const pay = page.getByRole('button', { name: /^Pay ₦/ });
  await pay.click();
  await expect(page.getByRole('button', { name: 'Simulate successful payment' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/Payment cancelled. Your seats are still held/)).toBeVisible();
  await expect(pay).toBeFocused();
});
