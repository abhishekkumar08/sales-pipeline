import { expect, type Locator, type Page } from '@playwright/test';

// ponytail: a short gap lets React commit the focus move before the next key reads it
const KEY_GAP_MS = 60;

export async function open(page: Page, { writeFailureRate = 0 } = {}): Promise<void> {
  await page.goto('/');
  await expect(dealList(page)).toBeVisible();
  await page.getByRole('button', { name: /Dev panel/ }).click();
  await page.getByLabel('Save latency min (ms)').fill('0');
  await page.getByLabel('Save latency max (ms)').fill('0');
  await setWriteFailureRate(page, writeFailureRate);
  await page.getByLabel('Pause teammates').setChecked(true);
  await blur(page);
}

export const setWriteFailureRate = (page: Page, rate: number): Promise<void> =>
  page.getByLabel(/^Write failure rate/).fill(String(rate));

export const setReadFailureRate = (page: Page, rate: number): Promise<void> =>
  page.getByLabel(/^Read failure rate/).fill(String(rate));

export const blur = (page: Page): Promise<void> =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

export const dealList = (page: Page): Locator => page.getByRole('listbox', { name: /^Deals, / });

export const rows = (page: Page): Locator => dealList(page).locator('.row');

export const focusedRow = (page: Page): Locator => page.locator('.row-active');

export async function rowCount(page: Page): Promise<number> {
  const name = (await dealList(page).getAttribute('aria-label')) ?? '';
  return Number(name.replace(/\D/g, ''));
}

export async function settledCount(page: Page): Promise<number> {
  let last = -1;
  await expect
    .poll(
      async () => {
        if (await page.getByText('Loading deals…').count()) return false;
        const now = await rowCount(page);
        const stable = now === last;
        last = now;
        return stable;
      },
      { intervals: [400] },
    )
    .toBe(true);
  return last;
}

const labelPart = async (row: Locator, i: number): Promise<string> =>
  ((await row.getAttribute('aria-label')) ?? '').split(', ')[i]!;
export const company = (row: Locator): Promise<string> => labelPart(row, 0);
export const stage = (row: Locator): Promise<string> => labelPart(row, 1);

export async function press(page: Page, ...keys: string[]): Promise<void> {
  for (const k of keys) {
    await page.keyboard.press(k);
    await page.waitForTimeout(KEY_GAP_MS);
  }
}
