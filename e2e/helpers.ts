import { expect, type Page } from '@playwright/test';

/** Mock logins (api/mock/auth.ts): password Hiking123!, every one-time code 123456. */
export const PASSWORD = 'Hiking123!';

export async function staffLogin(page: Page, email: string) {
  await page.goto('/staff/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(PASSWORD);
  await page.getByRole('button', { name: /log in|sign in|continue/i }).first().click();
  await expect(page.getByText('Enter your code')).toBeVisible();
  await page.getByLabel('Digit 1 of 6').pressSequentially('123456');
  await page.waitForURL(/\/(admin|checkin)/);
}

export async function hikerLogin(page: Page, email = 'adaeze@example.com') {
  await page.goto('/login');
  await page.getByLabel('Email or phone').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** Text of the toasts on screen (errors are toasts, never inline; see CLAUDE.md). */
export const toasts = (page: Page) => page.locator('.Toastify__toast');
