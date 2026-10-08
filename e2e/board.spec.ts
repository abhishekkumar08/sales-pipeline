import { expect, test } from '@playwright/test';
import { STAGES, STAGE_LABEL } from '../src/api/contract';
import { open, press } from './helpers';

const LABELS = STAGES.map((s) => STAGE_LABEL[s]);

test('board: a moved card is marked in place, counts are live, selection stays in the list', async ({ page }) => {
  await open(page);
  await press(page, 'a', 'B');
  for (const label of LABELS) await expect(page.getByRole('listbox', { name: `${label} deals` })).toBeVisible();

  for (const label of LABELS) {
    const strip = await page.getByRole('button', { name: new RegExp(`^${label}:`) }).getAttribute('aria-label');
    const count = strip!.match(/: ([\d,]+) deals/)![1]!;
    await expect(page.getByRole('region', { name: label }).locator('h3')).toContainText(count);
  }

  const card = page.locator('.col-active .row-active');
  await expect(card).toBeVisible();
  await press(page, '2');
  await expect(card).toContainText('→ Contacted · by you');

  await press(page, 'x');
  await expect(page.locator('.toast')).toContainText('list view');
});
