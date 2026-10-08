import { expect, test } from '@playwright/test';
import { open } from './helpers';

test('the fake API recovers after the browser stops its service worker', async ({ page, context }) => {
  await open(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');

  const api = (): Promise<string | null> =>
    page.evaluate(async () => (await fetch('/api/stage-counts?preset=all')).headers.get('content-type'));
  await expect.poll(api, { timeout: 10_000, intervals: [500] }).toContain('json');
  await expect(page.getByText('Could not load deals')).toHaveCount(0);
});
