import { expect, test, type Page } from '@playwright/test';
import { num } from '../src/ui/format';
import { dealList, open, press, settledCount } from './helpers';

async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { perf: { frames: number[]; tasks: number[]; run: boolean } };
    w.perf = { frames: [], tasks: [], run: true };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.perf.tasks.push(e.duration))).observe({
      type: 'longtask',
    });
    let last = performance.now();
    const tick = (t: number): void => {
      w.perf.frames.push(t - last);
      last = t;
      if (w.perf.run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopRecording(page: Page): Promise<{ worstFrameMs: number; longestTaskMs: number; frames: number }> {
  return page.evaluate(() => {
    const w = window as unknown as { perf: { frames: number[]; tasks: number[]; run: boolean } };
    w.perf.run = false;
    return {
      worstFrameMs: Math.round(Math.max(...w.perf.frames)),
      longestTaskMs: Math.round(Math.max(0, ...w.perf.tasks)),
      frames: w.perf.frames.length,
    };
  });
}

test('perf: scrolling 50k rows and a ~12k-deal bulk move stay responsive', async ({ page }) => {
  await open(page);
  await press(page, 'a');
  await expect(dealList(page)).toHaveAttribute('aria-label', 'Deals, 50,000 rows');

  await startRecording(page);
  const box = (await dealList(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(16);
  }
  await dealList(page).evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
  await page.waitForTimeout(500);
  await dealList(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(800);
  const scroll = await stopRecording(page);

  await page.getByRole('button', { name: /^New Lead:/ }).click();
  const total = await settledCount(page);
  await press(page, 'Shift+A', 'Shift+A');
  await startRecording(page);
  const started = Date.now();
  await press(page, '7');
  await expect(page.locator('.jobbar')).toContainText(`${num(total)} moved`, { timeout: 60_000 });
  const bulkMs = Date.now() - started;
  const bulk = await stopRecording(page);

  const report = { scroll, bulk: { deals: total, ms: bulkMs, ...bulk } };
  test.info().annotations.push({ type: 'perf', description: JSON.stringify(report) });
  console.log('PERF', JSON.stringify(report));

  expect(scroll.worstFrameMs).toBeLessThan(100);
  expect(bulk.worstFrameMs).toBeLessThan(150);
  expect(bulkMs).toBeLessThan(20_000);
});
