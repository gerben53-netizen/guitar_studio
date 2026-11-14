import { test, expect, chromium, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildApp } from '../apps/api/src/app';
import { readConfig } from '../apps/api/src/config';
import { personalFixtureProvider } from '../apps/api/test-support/personal-lyrics-fixtures';
import { legacyFixture } from '../packages/music-domain/test-support/multitrack-fixtures';
import { toMultitrack } from '../packages/music-domain/src/multitrack';
const output =
  process.env.PERSONAL_IMPORT_EVIDENCE_DIR ?? 'test-results/lrclib-personal';
const owner = 'personal-browser-' + randomUUID();
let pool: pg.Pool, app: ReturnType<typeof buildApp>, apiBase: string;
test.beforeAll(async () => {
  pool = new pg.Pool({ connectionString: readConfig().databaseUrl });
  app = buildApp(
    () => pool.query('SELECT 1'),
    false,
    pool,
    { resolveOwner: () => owner },
    { providers: [personalFixtureProvider()] },
  );
  apiBase = await app.listen({ host: '127.0.0.1', port: 0 });
});
test.afterAll(async () => {
  await pool.query('DELETE FROM studio_songs WHERE owner_id=$1', [owner]);
  await app.close();
  await pool.end();
});
async function proxy(page: Page, loseFirstImport = false) {
  // Mock only the external HTTP boundary through an injected real LRCLIB adapter.
  // Real application routes, receipt signing, parser, transaction and PostgreSQL run here.
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    const res = await fetch(apiBase + u.pathname + u.search, {
      method: req.method(),
      headers: {
        ...(req.postData() ? { 'content-type': 'application/json' } : {}),
      },
      ...(req.postData() ? { body: req.postData()! } : {}),
    });
    if (
      loseFirstImport &&
      req.method() === 'POST' &&
      u.pathname === '/api/v1/imports' &&
      res.status === 201
    ) {
      loseFirstImport = false;
      await res.text();
      return route.fulfill({
        status: 503,
        json: {
          error: {
            message: 'Ontvangst onderbroken na opslag; probeer opnieuw.',
          },
        },
      });
    }
    await route.fulfill({
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
      },
      body: await res.text(),
    });
  });
}
async function api(path: string, method = 'GET', data?: unknown) {
  const res = await fetch(apiBase + '/api/v1' + path, {
    method,
    ...(data
      ? {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        }
      : {}),
  });
  expect(res.ok).toBe(true);
  return res.status === 204 ? null : res.json();
}
async function select(page: Page, id = '900001') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nieuwe song', exact: true }).click();
  await page.getByRole('button', { name: 'Zoeken', exact: true }).click();
  await page.getByLabel('Zoektitel').fill('Eigen');
  await page.getByLabel('Zoekartiest').fill('Eigen testauteur');
  await page
    .getByRole('button', { name: 'Online zoeken', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Selecteren: Eigen LRCLIB fixture ' + id,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('region', { name: 'Lyrics-preview' }),
  ).toBeVisible();
}
async function correct(page: Page, id = '900001') {
  await select(page, id);
  await page
    .getByRole('button', { name: 'Tekst controleren voor import', exact: true })
    .click();
  await page
    .getByLabel('Songtitel', { exact: true })
    .fill('Eigen persoonlijke browserfixture');
  await page
    .getByLabel('Lyrics controleren', { exact: true })
    .fill('Eigen gecorrigeerde tekst\nEen toegevoegde regel');
  await page.getByRole('checkbox', { name: /uitsluitend/ }).check();
  await page.getByRole('button', { name: 'Verder →', exact: true }).click();
  await expect(page.getByLabel('Bestemming', { exact: true })).toBeVisible();
}
test('personal search/correction/persistence/replay, source after edits, fresh browser process and safe destinations', async ({
  page,
  browserName,
  baseURL,
}) => {
  test.setTimeout(180000);
  expect(browserName).toBe('chromium');
  await proxy(page, true);
  await correct(page, '900003');
  let replayBody: unknown;
  const listener = (req: import('@playwright/test').Request) => {
    if (
      req.method() === 'POST' &&
      new URL(req.url()).pathname === '/api/v1/imports'
    )
      replayBody = req.postDataJSON();
  };
  page.on('request', listener);
  await page
    .getByRole('button', {
      name: 'Toevoegen aan mijn bibliotheek',
      exact: true,
    })
    .click();
  await expect(page.getByRole('alert')).toContainText('Ontvangst onderbroken');
  await page
    .getByRole('button', {
      name: 'Toevoegen aan mijn bibliotheek',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Eigen persoonlijke browserfixture',
      exact: true,
    }),
  ).toBeVisible();
  page.off('request', listener);
  expect(replayBody).toBeTruthy();
  const rows = await api('/songs');
  const row = rows.find(
    (r: { song: { title: string } }) =>
      r.song.title === 'Eigen persoonlijke browserfixture',
  );
  const firstId = row.song.id,
    doc = structuredClone(row.song.importDocuments[0]);
  expect(doc.synchronization.kind).toBe('word');
  expect(doc.synchronization.rawLrc).toContain('[00:01.00]');
  expect((await api('/imports', 'POST', replayBody)).song.id).toBe(firstId);
  expect((await api('/songs')).length).toBe(rows.length);
  await page
    .getByText('Importbron, akkoorden en ongetimede tablatuur', { exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'LRCLIB #900003', exact: true }),
  ).toHaveAttribute('href', 'https://lrclib.net/record/900003');
  await page
    .getByRole('button', { name: 'Lyrics bewerken', exact: true })
    .click();
  await page.getByLabel('Sectietekst').fill('Later bewerkte eigen lyrics');
  await page
    .getByRole('button', { name: 'Lyrics opslaan', exact: true })
    .click();
  await expect(page.locator('.save')).toContainText('Opgeslagen');
  await expect
    .poll(async () => {
      const r = (await api('/songs')).find(
        (r: { song: { id: string } }) => r.song.id === firstId,
      );
      return r.song.lyrics[0].tokens
        .map((t: { text: string }) => t.text)
        .join('');
    })
    .toBe('Later bewerkte eigen lyrics');
  expect(
    (await api('/songs')).find(
      (r: { song: { id: string } }) => r.song.id === firstId,
    ).song.importDocuments[0],
  ).toEqual(doc);
  const fresh = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHANNEL === 'chrome'
      ? { channel: 'chrome' }
      : {}),
    headless: true,
  });
  try {
    const freshContext = await fresh.newContext({
      baseURL: baseURL ?? 'http://localhost:5173',
    });
    const p = await freshContext.newPage();
    await proxy(p);
    await p.goto('/');
    await p.getByRole('button', { name: 'Songs', exact: true }).click();
    await p
      .getByRole('button', {
        name: 'Eigen persoonlijke browserfixture',
        exact: true,
      })
      .click();
    await expect(p.locator('.lyrics-content')).toContainText(
      'Later bewerkte eigen lyrics',
    );
    await p
      .getByText('Importbron, akkoorden en ongetimede tablatuur', {
        exact: true,
      })
      .click();
    await expect(
      p.getByRole('link', { name: 'LRCLIB #900003', exact: true }),
    ).toBeVisible();
    await freshContext.close();
  } finally {
    await fresh.close();
  }
  const source = toMultitrack(legacyFixture(2));
  await api('/songs', 'POST', source);
  await correct(page);
  await page
    .getByLabel('Bestemming', { exact: true })
    .selectOption('new-arrangement');
  await page
    .getByLabel('Bestaande song', { exact: true })
    .selectOption(source.id);
  await page
    .getByRole('button', {
      name: 'Toevoegen aan mijn bibliotheek',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: source.title, exact: true }),
  ).toBeVisible();
  let full = await api('/songs/' + source.id + '/multitrack');
  expect(full.document.arrangements[0]).toEqual(source.arrangements[0]);
  await correct(page);
  await page.getByLabel('Bestemming', { exact: true }).selectOption('append');
  await page
    .getByLabel('Bestaande song', { exact: true })
    .selectOption(source.id);
  await page
    .getByLabel('Bestaand arrangement', { exact: true })
    .selectOption(source.arrangements[0]!.id);
  await page
    .getByRole('button', {
      name: 'Toevoegen aan mijn bibliotheek',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: source.title, exact: true }),
  ).toBeVisible();
  full = await api('/songs/' + source.id + '/multitrack');
  expect(full.document.arrangements[0].tracks).toEqual(
    source.arrangements[0]!.tracks,
  );
  const count = (await api('/songs')).length;
  await select(page);
  await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
  expect((await api('/songs')).length).toBe(count);
  for (const id of ['900004', '900005', '900006']) {
    await select(page, id);
    await expect(
      page.getByRole('button', {
        name: 'Geen importeerbare songtekst',
        exact: true,
      }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
  }
  await select(page);
  await page
    .getByRole('button', { name: 'Tekst controleren voor import', exact: true })
    .click();
  await page.getByRole('button', { name: '← Terug', exact: true }).click();
  await page.getByRole('button', { name: 'Plakken', exact: true }).click();
  await expect(
    page.getByLabel('Eigen lyrics (optioneel)', { exact: true }),
  ).toHaveValue('');
  await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
])
  test(
    'personal import themes/keyboard/axe ' + viewport.width,
    async ({ page, browser }) => {
      test.setTimeout(180000);
      await proxy(page);
      await page.setViewportSize(viewport);
      await mkdir(output, { recursive: true });
      const scans: object[] = [];
      for (const theme of ['dark', 'light']) {
        await page.goto('/');
        if ((await page.locator('html').getAttribute('data-theme')) !== theme)
          await page
            .getByRole('button', { name: 'Thema wisselen', exact: true })
            .click();
        await correct(page, '900002');
        await page
          .getByRole('button', { name: '← Terug', exact: true })
          .click();
        await page.getByLabel('Lyrics controleren', { exact: true }).focus();
        await page.keyboard.press('Tab');
        await expect(
          page.getByLabel('Bronvermelding', { exact: true }),
        ).toBeFocused();
        for (const stage of ['correction', 'destination']) {
          if (stage === 'destination')
            await page
              .getByRole('button', { name: 'Verder →', exact: true })
              .click();
          const scan = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
          expect(scan.violations).toEqual([]);
          scans.push({ theme, viewport, stage, violations: scan.violations });
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page
            .getByRole('button', {
              name:
                stage === 'destination'
                  ? 'Toevoegen aan mijn bibliotheek'
                  : 'Verder →',
              exact: true,
            })
            .scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${output}/${viewport.width}-${theme}-${stage}.jpg`,
            fullPage: true,
            animations: 'disabled',
          });
        }
        await page
          .getByRole('button', { name: '← Terug', exact: true })
          .click();
        await page
          .getByRole('button', { name: '← Terug', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'Annuleren', exact: true })
          .click();
      }
      await writeFile(
        `${output}/${viewport.width}-axe.json`,
        JSON.stringify({ browser: browser.version(), scans }, null, 2),
      );
    },
  );
