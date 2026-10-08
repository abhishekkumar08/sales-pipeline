import { expect, test } from '@playwright/test';
import { blur, dealList, open, press, setWriteFailureRate, setReadFailureRate, settledCount } from './helpers';

test('rows that fail to load say so, and r loads them', async ({ page }) => {
  await open(page);
  await press(page, 'a');
  await settledCount(page);
  await setReadFailureRate(page, 1);
  await dealList(page).evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
  await blur(page);
  const failed = page.locator('.row-load-failed');
  const message = page.getByText("Couldn't load these rows.");
  await expect(message).toBeVisible({ timeout: 15_000 });
  await expect(message).toHaveCount(1);

  await setReadFailureRate(page, 0);
  await blur(page);
  await press(page, 'r');
  await expect(failed).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
});

test('a dropped live connection is shown, and "Show latest" appears when it is back', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Drop live connection/ }).click();
  const paused = page.getByText('Live updates paused — reconnecting…');
  await expect(paused).toBeVisible();
  await expect(paused).toBeHidden({ timeout: 10_000 });
  const pill = page.getByRole('button', { name: /Reconnected · Show latest/ });
  await expect(pill).toBeVisible();
  await blur(page);
  await press(page, '.');
  await expect(pill).toBeHidden();
});

test('a bulk move that cannot start changes nothing and keeps the selection', async ({ page }) => {
  await open(page, { writeFailureRate: 1 });
  await press(page, 'a');
  await settledCount(page);
  await press(page, 'x');
  await press(page, '7');
  await expect(page.locator('.toast')).toContainText('Nothing was changed');
  await expect(page.getByRole('region', { name: 'Selection' })).toContainText('1 selected');
});

test('a bulk undo that fails can be tried again with u', async ({ page }) => {
  await open(page);
  await press(page, 'a');
  await settledCount(page);
  await press(page, 'x', 'j', 'x', '7');
  const job = page.locator('.jobbar');
  await expect(job).toContainText('2 moved');

  await setWriteFailureRate(page, 1);
  await blur(page);
  await press(page, 'u');
  await expect(page.locator('.toast')).toContainText('press u to try again');

  await setWriteFailureRate(page, 0);
  await blur(page);
  await press(page, 'u');
  await expect(job).toContainText('Undo complete: 2 restored');
});
