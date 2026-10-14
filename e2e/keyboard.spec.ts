import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Keyboard-only use (WCAG 2.1.1, 2.4.1, 2.4.3): skip link, dialogs keep focus inside, Escape closes, focus returns.

const describeFocus = (page: Page) =>
  page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    // Past the last control of a native modal, the browser briefly focuses the document itself: that's not a leak.
    if (!e || e === document.body || e === document.documentElement) return { name: '', inDialog: false };
    return { name: e?.getAttribute('aria-label') || e?.textContent?.trim().slice(0, 50) || '', inDialog: !!e?.closest('dialog[open],[role=dialog]') };
  });

async function tabTo(page: Page, name: RegExp, max = 150) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (name.test((await describeFocus(page)).name)) return;
  }
  throw new Error(`Tab never reached ${name}`);
}

async function expectTrappedAndEscapes(page: Page, trigger: RegExp) {
  await expect(page.locator('dialog[open], [role=dialog]')).toBeVisible();
  expect((await describeFocus(page)).inDialog).toBe(true);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    const f = await describeFocus(page);
    if (f.name) expect(f.inDialog, `Tab left the dialog to "${f.name}"`).toBe(true);
  }
  const { violations } = await new AxeBuilder({ page }).include('dialog[open], [role=dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open], [role=dialog]')).toHaveCount(0);
  expect((await describeFocus(page)).name).toMatch(trigger);
}

test('skip link is the first Tab stop and moves focus to the main content', async ({ page }) => {
  await page.goto('/events');
  await page.keyboard.press('Tab');
  expect((await describeFocus(page)).name).toBe('Skip to main content');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
});

for (const [path, trigger, label] of [
  ['/admin/transactions?status=refund_requested', /^Review$/, 'refund review'],
  ['/admin/hikers/usr_00412', /Suspend/, 'suspend hiker'],
  ['/admin/staff', /Invite staff/, 'invite staff'],
  ['/admin/ads/ad_2', /End campaign/, 'end campaign'],
  ['/admin/notifications', /Configure/, 'configure provider'],
  ['/admin/events/evt_1/participants', /^Edit check-in for /, 'attendance correction'],
] as const) {
  test(`${label} dialog: focus trapped, Escape closes, focus returns`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'networkidle' });
    await tabTo(page, trigger);
    await page.keyboard.press('Enter');
    await expectTrappedAndEscapes(page, trigger);
  });
}

test('row menu works with arrow keys and Escape', async ({ page }) => {
  await page.goto('/admin/ads?tab=pending_approval', { waitUntil: 'networkidle' });
  await tabTo(page, /^Actions for /);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  expect((await describeFocus(page)).name).toBe('View performance');
  await page.keyboard.press('ArrowDown');
  expect((await describeFocus(page)).name).toBe('Edit');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect((await describeFocus(page)).name).toMatch(/^Actions for /);
});

test('scanner result sheet keeps focus inside and hands it back', async ({ page }) => {
  await page.goto('/checkin/evt_1/scan', { waitUntil: 'networkidle' });
  await tabTo(page, /Test scan/);
  await page.keyboard.press('Enter');
  await tabTo(page, /^Already used/i, 30);
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  expect((await describeFocus(page)).name).toBe('Scan next');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect((await describeFocus(page)).inDialog).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});
