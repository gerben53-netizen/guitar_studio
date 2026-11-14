import { test, expect, chromium, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  newSong,
  type SongRecord,
} from '../packages/music-domain/src/workspace';
const output = process.env.PRACTICE_EVIDENCE_DIR ?? 'test-results/sprint-2c';
async function enter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Oefenen', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Jouw Practice Room.' }),
  ).toBeVisible();
}
async function lab(page: Page) {
  await page.getByRole('button', { name: 'Rhythm Lab', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '▷ Start', exact: true }),
  ).toBeVisible();
}

test('Practice Room real audio, rhythm editing, sessions, explicit mastery, goals and persistent resume', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  page.on('dialog', (d) => d.accept());
  const marker = 'practice-accept-' + randomUUID(),
    prefix = '/api/v1/practice',
    notes = [marker + '-uitgevoerd', marker + '-beheerst'];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  const all = await (await request.get(prefix + '/exercises')).json();
  expect(all).toHaveLength(18);
  const original = await (
    await request.get(prefix + '/exercises/r1/settings')
  ).json();
  const defaults = structuredClone(
    all.find((e: { id: string }) => e.id === 'r1').defaultConfiguration,
  );
  defaults.bpm = 240;
  defaults.transport = {
    subdivision: 'eighth',
    volume: 0.2,
    mute: false,
    ramp: { enabled: true, start: 240, target: 250, step: 5, everyBars: 1 },
  };
  expect(
    (
      await request.put(prefix + '/exercises/r1/settings', {
        data: { configuration: defaults, revision: original.revision },
      })
    ).ok(),
  ).toBeTruthy();
  const prefs = await (await request.get(prefix + '/preferences')).json();
  await request.put(prefix + '/preferences', {
    data: { ...prefs, lastExerciseId: 'r1' },
  });
  const before = await (
      await request.get(prefix + '/sessions?exerciseId=r1')
    ).json(),
    beforeProgress = await (await request.get(prefix + '/progress/r1')).json();
  const song = newSong(marker, 'Eigen werk', 'Eigen tekst');
  expect(
    (await request.post('/api/v1/songs', { data: song })).ok(),
  ).toBeTruthy();
  try {
    await enter(page);
    await lab(page);
    await page.getByRole('button', { name: '▷ Start', exact: true }).click();
    await expect(
      page.getByText('Metronoom actief', { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => window.__audioContexts.length)).toBe(1);
    await expect
      .poll(() => page.getByLabel('Actueel tempo', { exact: true }).innerText())
      .toMatch(/24[5-9]|250/);
    await page
      .getByRole('button', { name: 'BPM verhogen', exact: true })
      .click();
    await expect(page.getByLabel('BPM', { exact: true })).toHaveValue('245');
    await page
      .getByRole('button', { name: 'BPM verlagen', exact: true })
      .click();
    for (let i = 0; i < 3; i++) {
      await page
        .getByRole('button', { name: 'Tap tempo', exact: true })
        .click();
      await page.waitForTimeout(300);
    }
    const tapped = Number(
      await page.getByLabel('BPM', { exact: true }).inputValue(),
    );
    expect(tapped).toBeGreaterThan(100);
    expect(tapped).toBeLessThan(260);
    await page.getByRole('button', { name: 'Ⅱ Pauze', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__audioContexts[0]!.state))
      .toBe('suspended');
    const paused = await page
      .getByLabel('Oefentijd', { exact: true })
      .innerText();
    await page.waitForTimeout(1100);
    expect(
      await page.getByLabel('Oefentijd', { exact: true }).innerText(),
    ).toBe(paused);
    await page
      .getByRole('button', { name: '▷ Hervatten', exact: true })
      .click();
    await expect(
      page.getByText('Metronoom actief', { exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByText('Gepauzeerd', { exact: true })).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page
      .getByRole('button', { name: '▷ Hervatten', exact: true })
      .click();
    await expect(
      page.getByText('Metronoom actief', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Geluid aan', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Geluid uit', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '■ Stop', exact: true }).click();
    await expect(page.getByText('Gestopt', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: '✓ Sessie afronden', exact: true })
      .click();
    await page.getByLabel('Notities', { exact: true }).fill(notes[0]!);
    await page
      .getByRole('dialog')
      .getByRole('combobox', { name: 'Instrument', exact: true })
      .selectOption('electric');
    let lost = false;
    await page.route('**/api/v1/practice/sessions', async (route) => {
      if (route.request().method() === 'POST' && !lost) {
        lost = true;
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await page
      .getByRole('button', { name: 'Sessie opslaan', exact: true })
      .evaluate((el: HTMLButtonElement) => {
        el.click();
        el.click();
      });
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(
      page.getByText('Sessie opgeslagen. Je vindt deze terug in Voortgang.'),
    ).toBeVisible();
    await page.unroute('**/api/v1/practice/sessions');
    const first = await (
      await request.get(prefix + '/sessions?exerciseId=r1')
    ).json();
    expect(first.total).toBe(before.total + 1);
    expect(first.items[0]).toMatchObject({
      notes: notes[0],
      result: 'Uitgevoerd',
      instrument: { type: 'electric' },
    });
    expect(
      (await (await request.get(prefix + '/progress/r1')).json())
        .masteredConfigurations,
    ).toBe(beforeProgress.masteredConfigurations);
    await page
      .getByRole('combobox', { name: 'Patroon', exact: true })
      .selectOption('empty');
    for (const denominator of ['1', '2', '4']) {
      await page
        .getByRole('combobox', { name: 'Duur', exact: true })
        .selectOption(denominator);
      await page
        .getByRole('button', { name: 'Plaats / wijzig event', exact: true })
        .click();
      await expect(
        page.getByRole('button', {
          name: new RegExp('^Tijdpositie 0/1, neerslag, duur 1/' + denominator),
        }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Undo patroon', exact: true })
        .click();
    }
    await page
      .getByRole('combobox', { name: 'Patroon', exact: true })
      .selectOption('syncopated');
    await expect(
      page.getByRole('button', { name: /^Tijdpositie .*opslag/ }).first(),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Maatsoort', exact: true })
      .selectOption('6/8');
    await expect(page.locator('.rhythm-pulse')).toHaveCount(2);
    await expect(page.locator('.gs-rhythm-cell')).toHaveCount(12);
    await expect(page.locator('.rhythm-position')).toContainText(
      'BPM = gepunte kwart',
    );
    await page
      .getByRole('combobox', { name: 'Duur', exact: true })
      .selectOption('1');
    await page
      .getByRole('button', { name: 'Plaats / wijzig event', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('buiten de maat');
    await expect(page.getByRole('alert')).toBeInViewport();
    await page
      .getByRole('button', { name: 'Melding sluiten', exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Duur', exact: true })
      .selectOption('8');
    await page
      .getByRole('combobox', { name: 'Slag', exact: true })
      .selectOption('up');
    await page.getByLabel('Accent', { exact: true }).check();
    await page
      .getByRole('button', { name: 'Plaats / wijzig event', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: /^Tijdpositie 0\/1, opslag, duur 1\/8, accent/,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Tijdpositie 1\/8$/ }).click();
    await page
      .getByRole('combobox', { name: 'Slag', exact: true })
      .selectOption('rest');
    await page
      .getByRole('button', { name: 'Plaats / wijzig event', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: /^Tijdpositie 1\/8, rust, duur 1\/8/ }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Undo patroon', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: /^Tijdpositie 1\/8$/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('combobox', { name: 'Slag', exact: true })
      .selectOption('rest');
    await page
      .getByRole('button', { name: 'Plaats / wijzig event', exact: true })
      .click();
    await page.getByText('Tempo opbouwen · optioneel', { exact: true }).click();
    await page.getByLabel('Tempo-opbouw aan', { exact: true }).uncheck();
    await page.getByText('Tempo opbouwen · optioneel', { exact: true }).click();
    await page.getByLabel('BPM', { exact: true }).fill('240');
    await page
      .getByRole('button', { name: 'Instellingen opslaan', exact: true })
      .click();
    await page.getByRole('button', { name: '▷ Start', exact: true }).click();
    await page.waitForTimeout(1100);
    const beforeMastery = await (
      await request.get(prefix + '/exercises/r1/settings')
    ).json();
    await page
      .getByRole('button', { name: '✓ Sessie afronden', exact: true })
      .click();
    await page.getByLabel('Notities', { exact: true }).fill(notes[1]!);
    await page
      .getByRole('combobox', { name: 'Resultaat', exact: true })
      .selectOption('Beheerst');
    await page
      .getByRole('checkbox', {
        name: /Ik bevestig dat ik deze configuratie beheers/,
      })
      .check();
    await page
      .getByRole('button', { name: 'Sessie opslaan', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const second = await (
      await request.get(prefix + '/sessions?exerciseId=r1')
    ).json();
    expect(second.total).toBe(before.total + 2);
    expect(second.items[0]).toMatchObject({
      notes: notes[1],
      result: 'Beheerst',
      masteryConfirmed: true,
      snapshot: { meter: { beats: 6, beatUnit: 8 } },
    });
    const p = await (await request.get(prefix + '/progress/r1')).json();
    expect(p.mastered).toBe(beforeProgress.mastered);
    expect(p.masteredConfigurations).toBe(
      beforeProgress.masteredConfigurations +
        (beforeMastery.mastery.configuration ? 0 : 1),
    );
    expect(p.highestBpm).toBeGreaterThanOrEqual(245);
    await page.getByRole('button', { name: 'Voortgang', exact: true }).click();
    await expect(page.getByText(notes[1]!, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Overzicht', exact: true }).click();
    await page
      .getByLabel('Persoonlijke leerdoelen (maximaal 5, één per regel)')
      .fill('x'.repeat(201));
    await page
      .getByRole('button', { name: 'Leerdoelen opslaan', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('maximaal 200 tekens');
    await page
      .getByLabel('Persoonlijke leerdoelen (maximaal 5, één per regel)')
      .fill(marker + ' rustig ritme');
    await page
      .getByRole('button', { name: 'Leerdoelen opslaan', exact: true })
      .click();
    await expect(
      page.getByText('Je leerdoelen zijn opgeslagen.', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Oefenen', exact: true }).click();
    await expect(
      page.getByLabel('Persoonlijke leerdoelen (maximaal 5, één per regel)'),
    ).toHaveValue(marker + ' rustig ritme');
    await lab(page);
    await expect(
      page.getByRole('combobox', { name: 'Maatsoort', exact: true }),
    ).toHaveValue('6/8');
    await expect(
      page.getByRole('button', { name: /^Tijdpositie 1\/8, rust/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: '▷ Start', exact: true }).click();
    await expect(
      page.getByText('Metronoom actief', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Overzicht', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__audioContexts[0]!.state))
      .toBe('suspended');
    await page.getByRole('button', { name: 'Songs', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Jouw songs, jouw versies.' }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__audioContexts[0]!.state))
      .toBe('suspended');
    expect(await page.evaluate(() => window.__audioContexts.length)).toBe(1);
    const relaunched = await chromium.launch(
      process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? { channel: 'chrome' } : {},
    );
    try {
      const fresh = await relaunched.newContext({
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
      });
      const restored = await fresh.newPage();
      await enter(restored);
      await expect(
        restored.getByLabel(
          'Persoonlijke leerdoelen (maximaal 5, één per regel)',
        ),
      ).toHaveValue(marker + ' rustig ritme');
      await lab(restored);
      await expect(
        restored.getByRole('combobox', { name: 'Maatsoort', exact: true }),
      ).toHaveValue('6/8');
      await expect(
        restored.getByRole('button', { name: /^Tijdpositie 1\/8, rust/ }),
      ).toBeVisible();
    } finally {
      await relaunched.close();
    }
    const songs = (await (
      await request.get('/api/v1/songs')
    ).json()) as SongRecord[];
    expect(
      songs.find((r) => r.song.id === song.id)!.song.arrangements[0]!.tempo,
    ).toBe(84);
    expect(errors).toEqual([]);
    await mkdir(output, { recursive: true });
    await writeFile(
      output + '/functional.json',
      JSON.stringify(
        {
          browser: browser.version(),
          channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
          notes,
          sessionIds: second.items
            .filter((s: { notes: string }) => notes.includes(s.notes))
            .map((s: { id: string }) => s.id),
          duplicateProtected: true,
          contextCount: await page.evaluate(
            () => window.__audioContexts.length,
          ),
          contextStates: await page.evaluate(() =>
            window.__audioContexts.map((c) => c.state),
          ),
          rampObservedAtBarBoundary: true,
          visibilityPauseVerified: true,
          browserRestartVerified: true,
          lostResponseRecovered: lost,
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    const rows = (await (
        await request.get('/api/v1/songs')
      ).json()) as SongRecord[],
      r = rows.find((r) => r.song.id === song.id);
    if (r)
      await request.delete(
        '/api/v1/songs/' + song.id + '?revision=' + r.revision,
      );
  }
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(
    'Practice Room semantic dark/light screens and responsive layout ' +
      viewport.width,
    async ({ page, request, browser }) => {
      test.setTimeout(180000);
      page.setDefaultTimeout(15000);
      await page.setViewportSize(viewport);
      page.on('dialog', (d) => d.accept());
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const records: object[] = [];
      await mkdir(output, { recursive: true });
      async function capture(name: string, theme: string) {
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const scan = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        records.push({ name, theme, viewport, violations: scan.violations });
        await writeFile(
          output + '/' + viewport.width + '-axe.json',
          JSON.stringify(records, null, 2),
        );
        expect(scan.violations, name + ' ' + theme).toEqual([]);
        await page.screenshot({
          path:
            output + '/' + viewport.width + '-' + theme + '-' + name + '.jpg',
          type: 'jpeg',
          timeout: 45000,
          animations: 'disabled',
          quality: 80,
          fullPage: true,
        });
      }
      const catalog = await (
        await request.get('/api/v1/practice/exercises')
      ).json();
      for (const theme of ['dark', 'light']) {
        await enter(page);
        if ((await page.locator('html').getAttribute('data-theme')) !== theme)
          await page
            .getByRole('button', { name: 'Thema wisselen', exact: true })
            .click();
        await capture('home', theme);
        await page
          .getByRole('button', { name: 'Oefenbibliotheek', exact: true })
          .click();
        await expect(page.locator('[data-exercise-id]')).toHaveCount(18);
        expect(
          await page
            .locator('[data-exercise-id]')
            .filter({ hasText: 'Binnenkort beschikbaar' })
            .count(),
        ).toBe(14);
        await page
          .getByRole('combobox', { name: 'Labfilter', exact: true })
          .selectOption('technique');
        await expect(page.locator('[data-exercise-id]')).toHaveCount(6);
        await page
          .getByRole('combobox', { name: 'Labfilter', exact: true })
          .selectOption('');
        const sample = catalog[0];
        await page
          .getByLabel('Zoek oefening', { exact: true })
          .fill(sample.title);
        await expect(page.locator('[data-exercise-id]')).toHaveCount(1);
        await page.getByLabel('Zoek oefening', { exact: true }).fill('');
        await page
          .getByRole('combobox', { name: 'Niveaufilter', exact: true })
          .selectOption(sample.level);
        await expect(page.locator('[data-exercise-id]')).toHaveCount(
          catalog.filter((e: { level: string }) => e.level === sample.level)
            .length,
        );
        await page
          .getByRole('combobox', { name: 'Niveaufilter', exact: true })
          .selectOption('');
        await page
          .getByRole('combobox', { name: 'Categoriefilter', exact: true })
          .selectOption(sample.category);
        await expect(page.locator('[data-exercise-id]')).toHaveCount(
          catalog.filter(
            (e: { category: string }) => e.category === sample.category,
          ).length,
        );
        await page
          .getByRole('combobox', { name: 'Categoriefilter', exact: true })
          .selectOption('');
        await capture('library', theme);
        await page
          .getByRole('button', { name: 'Leerpad', exact: true })
          .click();
        await expect(page.locator('.practice-level')).toHaveCount(4);
        await expect(page.locator('[data-exercise-id]')).toHaveCount(18);
        await capture('path', theme);
        await page
          .getByRole('button', { name: 'Voortgang', exact: true })
          .click();
        await capture('progress', theme);
        await lab(page);
        await page
          .getByRole('combobox', { name: 'Ritmische oefening', exact: true })
          .selectOption('r2');
        await expect(
          page.getByRole('combobox', {
            name: 'Ritmische oefening',
            exact: true,
          }),
        ).toHaveValue('r2');
        await capture('rhythm', theme);
        const cells = page.locator('.rhythm-scroll');
        expect(
          await cells.evaluate((el) => el.scrollWidth >= el.clientWidth),
        ).toBe(true);
        const first = page.locator('.gs-rhythm-cell').first();
        await first.focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('.gs-rhythm-cell').nth(1)).toBeFocused();
        expect(
          await page
            .locator('.gs-rhythm-cell')
            .nth(1)
            .evaluate((el) => getComputedStyle(el).outlineStyle),
        ).toBe('solid');
        if (viewport.width >= 1280) {
          const transport = await page
              .getByRole('region', { name: 'Oefenbediening' })
              .boundingBox(),
            editor = await page
              .locator('.rhythm-editor-controls')
              .boundingBox();
          expect(transport!.y).toBeGreaterThanOrEqual(
            editor!.y + editor!.height,
          );
        }
        await page
          .getByRole('button', { name: '✓ Sessie afronden', exact: true })
          .click();
        await expect(page.getByRole('dialog')).toHaveAccessibleName(
          'Oefensessie afronden',
        );
        await capture('session', theme);
        await page
          .getByRole('button', { name: 'Sluiten', exact: true })
          .focus();
        await page.keyboard.press('Shift+Tab');
        await expect(
          page.getByRole('button', { name: 'Sessie opslaan', exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(
          page.getByRole('button', { name: 'Sluiten', exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).not.toBeVisible();
        await expect(
          page.getByRole('button', { name: '✓ Sessie afronden', exact: true }),
        ).toBeFocused();
      }
      expect(errors).toEqual([]);
      await writeFile(
        output + '/' + viewport.width + '-environment.json',
        JSON.stringify(
          {
            browser: browser.version(),
            channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
            viewport,
            errors,
          },
          null,
          2,
        ),
      );
    },
  );
}

test('Practice API retry and rejected AudioContext leave recoverable UI with no orphan context', async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  let unavailable = true;
  await page.route('**/api/v1/practice/exercises', (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { message: 'Tijdelijk niet bereikbaar' },
          }),
        })
      : route.continue(),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Oefenen', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Tijdelijk niet bereikbaar',
  );
  unavailable = false;
  await page
    .getByRole('button', { name: 'Opnieuw laden', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Jouw Practice Room.' }),
  ).toBeVisible();
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    window.__audioContexts = [];
    Object.defineProperty(window, 'AudioContext', {
      value: class extends Original {
        constructor(options?: AudioContextOptions) {
          super(options);
          window.__audioContexts.push(this);
        }
        override resume() {
          return Promise.reject(new Error('Audio test denied'));
        }
      },
    });
  });
  await enter(page);
  await lab(page);
  await page.getByRole('button', { name: '▷ Start', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Audio test denied' }).first(),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__audioContexts.map((c) => c.state)))
    .toEqual(['closed']);
});

test('Stop cancels a start waiting for settings persistence, including navigation before its response', async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  page.on('dialog', (d) => d.accept());
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
  await enter(page);
  await lab(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waiting = false;
  await page.route('**/api/v1/practice/exercises/*/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      waiting = true;
      await gate;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: '▷ Start', exact: true }).click();
  await expect.poll(() => waiting).toBe(true);
  await page.getByRole('button', { name: '■ Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Songs', exact: true }).click();
  release();
  await expect(
    page.getByRole('heading', { name: 'Jouw songs, jouw versies.' }),
  ).toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__audioContexts.length)).toBe(0);
});
