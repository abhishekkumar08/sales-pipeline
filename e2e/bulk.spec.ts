import { expect, test } from '@playwright/test';
import { num } from '../src/ui/format';
import { blur, open, press, settledCount } from './helpers';

test('quarter-end: select all matching, move to Lost, then undo', async ({ page }) => {
  await open(page);
  await press(page, 'a');
  await page.getByRole('button', { name: /^Proposal Sent:/ }).click();
  await page.getByPlaceholder('days').fill('90');
  await blur(page);
  const total = await settledCount(page);
  expect(total).toBeGreaterThan(500);
  const shown = num(total);

  await press(page, 'Shift+A');
  await press(page, 'Shift+A');
  const selection = page.getByRole('region', { name: 'Selection' });
  await expect(selection).toContainText(`${shown} selected`);

  await press(page, '7');
  const job = page.locator('.jobbar');
  await expect(job).toContainText(`${shown} moved`, { timeout: 30_000 });
  await expect(job).toContainText('0 skipped');
  await expect(job).toContainText('0 failed');
  await expect(page.getByRole('button', { name: /^Proposal Sent:/ })).toHaveAttribute('aria-label', /: 0 deals/);

  await press(page, 'u');
  await expect(job).toContainText(`Undo complete: ${shown} restored`, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /^Proposal Sent:/ })).toHaveAttribute(
    'aria-label',
    `Proposal Sent: ${shown} deals`,
  );
});
