import { expect, test } from '@playwright/test';
import { blur, dealList, open, press, rowCount, rows } from './helpers';

test('50,000 deals stay virtualised and the last row loads on jump', async ({ page }) => {
  await open(page);
  await press(page, 'a');
  await expect(dealList(page)).toHaveAttribute('aria-label', 'Deals, 50,000 rows');
  expect(await rows(page).count()).toBeLessThan(60);
  expect(await dealList(page).getByRole('option').count()).toBe(await rows(page).count());

  await dealList(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await blur(page);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const last = rows(page).last();
  await expect(last).not.toHaveAttribute('aria-label', 'Loading deal');
  expect(await rowCount(page)).toBe(50_000);
});
