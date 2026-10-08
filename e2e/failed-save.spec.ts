import { expect, test } from '@playwright/test';
import { company, focusedRow, open, press, setWriteFailureRate } from './helpers';

test('a save that keeps failing stays put, is listed as unsaved, and r saves it', async ({ page }) => {
  await open(page, { writeFailureRate: 1 });
  const name = await company(focusedRow(page));
  await press(page, '4');

  const row = page.getByRole('option', { name: new RegExp(`^${name}, Proposal Sent`) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Not saved');
  const unsaved = page.getByRole('region', { name: 'Unsaved changes' });
  await expect(unsaved).toContainText('Unsaved (1)');
  await expect(unsaved).toContainText(name);
  await expect(page.getByRole('button', { name: '1 unsaved' })).toBeVisible();

  await setWriteFailureRate(page, 0);
  await press(page, 'r');
  await expect(row).not.toContainText('Not saved');
  await expect(row).toHaveAttribute('aria-label', new RegExp(`^${name}, Proposal Sent`));
  await expect(unsaved).toContainText('Unsaved (0)');
});
