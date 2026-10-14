import { expect, test } from '@playwright/test';
import { PASSWORD, toasts } from './helpers';

// AUTH-009 (no hint whether the account exists) and AUTH-013 (lock after 5 wrong attempts for 15 minutes).

test('five wrong passwords lock the account, then even the right one is refused', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone').fill('adaeze@example.com');
  const password = page.getByLabel('Password', { exact: true });
  for (let i = 1; i <= 4; i++) {
    await password.fill(`wrong-${i}`);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(toasts(page).last()).toContainText(`${5 - i} attempt${5 - i === 1 ? '' : 's'} left`);
  }
  await password.fill('wrong-5');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(toasts(page).last()).toContainText('Too many attempts. Try again in 15 minutes');

  await password.fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(toasts(page).last()).toContainText('Too many attempts');
  await expect(page).toHaveURL(/\/login/);
});

test('an unknown email gets the same message as a wrong password', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone').fill('nobody@example.com');
  await page.getByLabel('Password', { exact: true }).fill('whatever-1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(toasts(page).last()).toContainText('Incorrect email or password');
});

test('the right password logs in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone').fill('adaeze@example.com');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/account/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Adaeze|Welcome|Hi/);
});
