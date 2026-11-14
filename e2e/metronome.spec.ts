import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
test('real Web Audio graph, single context, mute, pause, navigation and disposal without microphone', async ({
  page,
  browser,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    window.__audioContexts = [];
    Object.defineProperty(window, 'AudioContext', {
      value: class extends Original {
        constructor(options?: AudioContextOptions) {
          super(options);
          window.__audioContexts.push(this);
        }
      },
    });
  });
  await page.goto('/test-support/metronome.html');
  await page.getByRole('button', { name: 'Start test', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__metronomeTest.snapshot().status))
    .toBe('running');
  await page.getByRole('button', { name: 'Start test', exact: true }).click();
  expect(await page.evaluate(() => window.__audioContexts.length)).toBe(1);
  expect(await page.evaluate(() => window.__metronomeTest.isShared())).toBe(
    true,
  );
  const peak = await page.evaluate(async () => {
    let peak = 0;
    for (let i = 0; i < 200; i++) {
      peak = Math.max(peak, window.__metronomeTest.snapshot().peak);
      if (peak > 0.005) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    return peak;
  });
  expect(peak).toBeGreaterThan(0.005);
  await page.getByRole('button', { name: 'Mute test', exact: true }).click();
  await page.waitForTimeout(120);
  const muted = await page.evaluate(async () => {
    let peak = 0;
    for (let i = 0; i < 50; i++) {
      peak = Math.max(peak, window.__metronomeTest.snapshot().peak);
      await new Promise((r) => setTimeout(r, 10));
    }
    return peak;
  });
  expect(muted).toBeLessThan(0.0001);
  await page.getByRole('button', { name: 'Pause test', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__audioContexts[0]!.state))
    .toBe('suspended');
  const paused = await page.evaluate(
    () => window.__metronomeTest.snapshot().time,
  );
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() => window.__metronomeTest.snapshot().time),
  ).toBe(paused);
  await page.getByRole('button', { name: 'Resume test', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__metronomeTest.snapshot().time))
    .toBeGreaterThan(paused);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => page.evaluate(() => window.__metronomeTest.snapshot().status))
    .toBe('paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });
  await page.getByRole('button', { name: 'Resume test', exact: true }).click();
  await page.evaluate(() => dispatchEvent(new PopStateEvent('popstate')));
  await expect
    .poll(() => page.evaluate(() => window.__metronomeTest.snapshot().status))
    .toBe('stopped');
  await page.getByRole('button', { name: 'Start test', exact: true }).click();
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect
    .poll(() => page.evaluate(() => window.__audioContexts[0]!.state))
    .toBe('closed');
  const evidence = {
    browser: browser.version(),
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
    platform: process.platform,
    digitalPeak: peak,
    mutedPeak: muted,
    contextCount: await page.evaluate(() => window.__audioContexts.length),
    states: await page.evaluate(() =>
      window.__audioContexts.map((c) => c.state),
    ),
    pageErrors,
    engineErrors: await page.evaluate(
      () => window.__metronomeTest.snapshot().errors,
    ),
  };
  expect(evidence.pageErrors).toEqual([]);
  expect(evidence.engineErrors).toEqual([]);
  await mkdir('test-results/sprint-2a-evidence', { recursive: true });
  await writeFile(
    'test-results/sprint-2a-evidence/audio.json',
    JSON.stringify(evidence, null, 2),
  );
});
declare global {
  interface Window {
    __audioContexts: AudioContext[];
  }
}
