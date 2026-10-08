import { expect, test } from '@playwright/test';
import { blur, company, focusedRow, open, press, settledCount } from './helpers';

const BURST_EDITS_PER_MIN = '60000';
const BURST_MS = 4000;
const FEED_SETTLE_MS = 600;

test('teammate edits never move my rows; "." applies them and keeps my focus', async ({ page }) => {
  await open(page);
  await press(page, 'a');
  await page.getByRole('button', { name: /^Negotiation:/ }).click();
  await settledCount(page);
  await press(page, 'j', 'j', 'j');
  const focused = await company(focusedRow(page));
  const order = async (): Promise<string[]> =>
    page.getByRole('option').evaluateAll((rows) => rows.slice(0, 10).map((r) => r.id));
  const before = await order();

  await page.getByLabel('Teammate edits / min').fill(BURST_EDITS_PER_MIN);
  await page.getByLabel('Pause teammates').setChecked(false);
  await page.waitForTimeout(BURST_MS);
  await page.getByLabel('Pause teammates').setChecked(true);
  await blur(page);
  await page.waitForTimeout(FEED_SETTLE_MS);

  expect(await order()).toEqual(before);
  expect(await company(focusedRow(page))).toBe(focused);
  const pill = page.getByRole('button', { name: /updates? · Show/ });
  await expect(pill).toBeVisible();

  const focusedLeft = await focusedRow(page).evaluate((el) => el.classList.contains('row-ghost'));
  await press(page, '.');
  await expect(pill).toBeHidden();
  if (!focusedLeft) await expect(focusedRow(page)).toHaveAttribute('aria-label', new RegExp(`^${focused},`));
});
