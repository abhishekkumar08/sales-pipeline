import { expect, test } from '@playwright/test';
import { company, dealList, focusedRow, open, press, stage } from './helpers';

test('the whole flow works without a mouse', async ({ page }) => {
  await open(page);
  const first = await company(focusedRow(page));
  await press(page, 'j');
  const second = await company(focusedRow(page));
  const originalStage = await stage(focusedRow(page));
  expect(second).not.toBe(first);
  await expect(dealList(page)).toHaveAttribute('aria-activedescendant', /^deal-/);

  await press(page, 's');
  await expect(page.getByRole('dialog', { name: 'Change stage' })).toBeVisible();
  await press(page, '2');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(focusedRow(page)).toHaveAttribute('aria-label', new RegExp(`^${second}, Contacted`));
  await expect(focusedRow(page)).not.toContainText('Saving');
  await press(page, 'u');
  await expect(focusedRow(page)).toHaveAttribute('aria-label', new RegExp(`^${second}, ${originalStage}`));
  await expect(focusedRow(page)).not.toContainText('Saving');

  await press(page, '?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText('Undo last action');
  await press(page, 'Escape');
  await press(page, 'Meta+k');
  await expect(page.getByRole('dialog', { name: 'Command menu' })).toBeVisible();
  await press(page, 'Escape');

  await press(page, '/', 'a', 'c', 'm', 'e');
  await expect(page.getByRole('searchbox')).toHaveValue('acme');
  await expect(page.getByRole('tab', { name: /Today/ })).toHaveAttribute('aria-selected', 'true');
  await press(page, 'Escape', 'u');
  await expect(page.locator('.toast')).toContainText('Nothing to undo');
});
