import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseSongImport } from '../packages/music-domain/src/song-import';
import type { SongRecord } from '../packages/music-domain/src/workspace';
import type { DiscoveryResult } from '../packages/shared/src/discovery';
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});
const tab = [
  'e|--0-10--|--12---|',
  'B|--1-----|--13---|',
  'G|--------|-------|',
  'D|--------|-------|',
  'A|--------|-------|',
  'E|--------|-------|',
].join('\n');
const source =
  '{t: Eigen importtest}\n{artist: Eigen auteur}\n{tempo: 96}\n{time: 6/8}\n{soc}\n[Am]Hé eigen [C]woorden\n\nNog een regel\n{eoc}\n{unknown: behouden}\n' +
  tab;
const output = process.env.IMPORT_EVIDENCE_DIR ?? 'test-results/sprint-2d';
async function wizard(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nieuwe song', exact: true }).click();
}
async function preview(page: Page) {
  await page.getByRole('button', { name: 'Verder →' }).click();
  await expect(
    page.getByRole('region', { name: 'Importpreview' }),
  ).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Verder →' }).click();
}
async function rows(request: APIRequestContext) {
  return (await (await request.get('/api/v1/songs')).json()) as SongRecord[];
}
async function remove(request: APIRequestContext, ids: string[]) {
  for (const r of await rows(request))
    if (ids.includes(r.song.id))
      await request.delete(`/api/v1/songs/${r.song.id}?revision=${r.revision}`);
}
const summary = (id = '123'): DiscoveryResult => ({
  provider: 'lrclib',
  id,
  title: 'Eigen providerfixture ' + id,
  artist: 'Testauteur',
  album: 'Testalbum',
  duration: 120,
  instrumental: id === '124',
  hasWordSync: id === '125',
  hasPlainLyrics: true,
  hasSyncedLyrics: true,
  hasLyricsfile: false,
  sourceUrl: 'https://lrclib.net/record/' + id,
  availability: 'preview',
  storage: 'preview-only',
});
async function mockSearch(page: Page) {
  await page.route('**/api/v1/discovery/search?**', async (route) => {
    const url = new URL(route.request().url()),
      q = url.searchParams.get('q');
    if (q === 'rate')
      return route.fulfill({
        status: 429,
        json: {
          error: { message: 'LRCLIB vraagt een pauze. Probeer later opnieuw.' },
        },
        headers: { 'Retry-After': '60' },
      });
    if (q === 'slow') await new Promise((resolve) => setTimeout(resolve, 300));
    return route.fulfill({
      json: {
        apiVersion: 'v2',
        pagination: false,
        results:
          q === 'empty' || url.searchParams.get('contentType') === 'chords'
            ? []
            : [summary(), summary('124'), summary('125')],
      },
    });
  });
  await page.route('**/api/v1/discovery/results/lrclib/*', async (route) => {
    const id = route.request().url().split('/').at(-1)!,
      doc = parseSongImport({
        title: 'Eigen providerfixture ' + id,
        text: id === '124' ? '' : 'Eigen testwoorden',
      });
    doc.source = {
      origin: 'external',
      provider: 'lrclib',
      recordId: id,
      name: 'LRCLIB',
      url: 'https://lrclib.net/record/' + id,
      method: 'provider',
      storage: 'preview-only',
    };
    if (id !== '124')
      doc.synchronization = {
        kind: id === '125' ? 'word' : 'line',
        unit: 'milliseconds',
        rawLrc: '[00:01.20]Eigen testwoorden',
        rawLyricsfile: null,
        lines: [
          {
            text: 'Eigen testwoorden',
            startMs: 1200,
            endMs: null,
            words:
              id === '125'
                ? [
                    { text: 'Eigen ', startMs: 1200, endMs: null },
                    { text: 'testwoorden', startMs: 1400, endMs: null },
                  ]
                : [],
          },
        ],
      };
    return route.fulfill({
      json: {
        result: summary(id),
        document: doc,
        instrumental: id === '124',
        storageReason:
          'Geen permanente opslag: rechten niet vastgesteld. Gebruik eigen tekst voor import.',
      },
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
test('import formats, manual correction, loss-response recovery, safe destinations and persistence', async ({
  page,
  request,
  browser,
}) => {
  const ids: string[] = [];
  const title = 'Eigen 2D ' + Date.now();
  try {
    await wizard(page);
    await page.getByLabel('Songtitel').fill(title);
    await page
      .getByLabel('Eigen lyrics (optioneel)')
      .fill('Am    C\nEigen testwoorden');
    await preview(page);
    let lost = false;
    await page.route('**/api/v1/imports', async (route) => {
      if (!lost) {
        lost = true;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Song aanmaken →' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Song aanmaken →' }).click();
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    let record = (await rows(request)).find((r) => r.song.title === title)!;
    ids.push(record.song.id);
    expect(
      (await rows(request)).filter((r) => r.song.title === title),
    ).toHaveLength(1);
    expect(record.song.arrangements[0]!.sections[0]!.chords).toHaveLength(2);
    const original = structuredClone(record.song.arrangements[0]);
    await page.unroute('**/api/v1/imports');
    await wizard(page);
    await page
      .getByRole('button', { name: 'Tekstbestand', exact: true })
      .click();
    await page.getByLabel('Lokaal UTF-8 tekstbestand').setInputFiles({
      name: 'own.cho',
      mimeType: 'text/plain',
      buffer: Buffer.from(source),
    });
    await preview(page);
    await expect(
      page.getByRole('region', { name: 'Importpreview' }),
    ).toContainText('ritme onzeker');
    await expect(
      page.getByRole('region', { name: 'Importpreview' }),
    ).toContainText('Onbekende');
    await page
      .getByLabel('Bestemming', { exact: true })
      .selectOption('new-arrangement');
    await page
      .getByLabel('Bestaande song', { exact: true })
      .selectOption(record.song.id);
    await page.getByRole('button', { name: 'Import bevestigen →' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    record = (await rows(request)).find((r) => r.song.id === record.song.id)!;
    expect(record.song.arrangements).toHaveLength(2);
    expect(record.song.arrangements[0]).toEqual(original);
    expect(
      record.song.importDocuments![1]!.tabBlocks[0]!.notes.some(
        (n) => n.fret === 10,
      ),
    ).toBe(true);
    await page
      .getByText('Importbron, akkoorden en ongetimede tablatuur', {
        exact: true,
      })
      .click();
    await expect(page.locator('.workspace-import-source')).toContainText(
      'own.cho',
    );
    await wizard(page);
    await page.getByLabel('Songtitel').fill('Aanvulling');
    await page.getByLabel('Eigen lyrics (optioneel)').fill('[G]Eigen bijlage');
    await preview(page);
    await page.getByLabel('Bestemming', { exact: true }).selectOption('append');
    await page
      .getByLabel('Bestaande song', { exact: true })
      .selectOption(record.song.id);
    await page
      .getByLabel('Bestaand arrangement', { exact: true })
      .selectOption(original!.id);
    await page.getByRole('button', { name: 'Import bevestigen →' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const after = (await rows(request)).find(
      (r) => r.song.id === record.song.id,
    )!;
    expect(after.song.arrangements[0]!.sections[0]).toEqual(
      original!.sections[0],
    );
    expect(after.song.arrangements[0]!.sections).toHaveLength(2);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Nieuwe song', exact: true }),
    ).toBeVisible();
    const fresh = await browser.newContext();
    try {
      const p = await fresh.newPage();
      await p.goto(page.url());
      expect(
        (
          (await (await p.request.get('/api/v1/songs')).json()) as SongRecord[]
        ).find((r) => r.song.id === record.song.id)?.song.importDocuments,
      ).toHaveLength(3);
    } finally {
      await fresh.close();
    }
  } finally {
    await remove(request, ids);
  }
});
test('real discovery UI supports metadata, selection, formats, instrumental, errors, cancellation and rights restrictions', async ({
  page,
  request,
}) => {
  const before = (await rows(request)).length;
  let unavailable = true;
  await page.route('**/api/v1/discovery/providers', (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          json: { error: { message: 'Temporary provider load failure' } },
        })
      : route.continue(),
  );
  await mockSearch(page);
  await wizard(page);
  await page.getByRole('button', { name: 'Zoeken', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Providers niet bereikbaar',
  );
  await page.getByLabel('Zoektitel').fill('Eigen');
  await expect(page.getByRole('alert')).toContainText(
    'Providers niet bereikbaar',
  );
  unavailable = false;
  await page.getByRole('button', { name: 'Providers opnieuw laden' }).click();
  await expect(page.getByLabel('Provider', { exact: true })).toHaveValue(
    'lrclib',
  );
  await page.getByLabel('Zoektitel').fill('Eigen');
  await page.getByLabel('Zoekartiest').fill('Testauteur');
  await page
    .getByRole('button', { name: 'Online zoeken', exact: true })
    .click();
  await expect(page.getByText('3 resultaten · v2')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Externe bron' }).first(),
  ).toHaveAttribute('href', 'https://lrclib.net/record/123');
  await page
    .getByRole('button', { name: 'Selecteren: Eigen providerfixture 123' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Lyrics-preview' }),
  ).toContainText('LRC-regeltiming');
  await expect(
    page.getByRole('region', { name: 'Lyrics-preview' }),
  ).toContainText('Eigen testwoorden');
  await expect(
    page.getByRole('button', { name: 'Permanente import niet toegestaan' }),
  ).toBeDisabled();
  await page
    .getByText('Synchronisatiegegevens (milliseconden)', { exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Lyrics-preview' }),
  ).toContainText('1200');
  await page
    .getByRole('button', { name: 'Selecteren: Eigen providerfixture 124' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Lyrics-preview' }),
  ).toContainText('Instrumentaal nummer');
  await page
    .getByRole('button', { name: 'Selecteren: Eigen providerfixture 125' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Lyrics-preview' }),
  ).toContainText('Woordtiming');
  await page.getByLabel('Vrij zoeken').fill('empty');
  await page
    .getByRole('button', { name: 'Online zoeken', exact: true })
    .click();
  await expect(page.getByText(/Geen resultaten voor/)).toBeVisible();
  await page.getByLabel('Vrij zoeken').fill('rate');
  await page
    .getByRole('button', { name: 'Online zoeken', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('pauze');
  await page.getByLabel('Vrij zoeken').fill('slow');
  await page
    .getByRole('button', { name: 'Online zoeken', exact: true })
    .click();
  await page.getByLabel('Vrij zoeken').fill('empty');
  await page
    .getByRole('button', { name: 'Online zoeken', exact: true })
    .click();
  await expect(page.getByText(/Geen resultaten voor/)).toBeVisible();
  await page.waitForTimeout(350);
  await expect(page.getByText('3 resultaten · v2')).toHaveCount(0);
  await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
  expect((await rows(request)).length).toBe(before);
});
test('content validation, correction and supported UTF-8 file extensions without cancel writes', async ({
  page,
  request,
}) => {
  const before = (await rows(request)).length;
  for (const extension of ['txt', 'cho', 'chordpro', 'pro']) {
    await wizard(page);
    await page
      .getByRole('button', { name: 'Tekstbestand', exact: true })
      .click();
    await page.getByLabel('Lokaal UTF-8 tekstbestand').setInputFiles({
      name: 'own.' + extension,
      mimeType: 'text/plain',
      buffer: Buffer.from(source),
    });
    await page.getByRole('button', { name: 'Verder →' }).click();
    await expect(
      page.getByRole('region', { name: 'Importpreview' }),
    ).toContainText('Eigen');
    await page
      .getByLabel('Lyrics controleren')
      .fill(source.replace('Eigen', 'Aangepaste'));
    await page.getByRole('button', { name: 'Sluiten', exact: true }).click();
  }
  await wizard(page);
  await page.getByRole('button', { name: 'Tekstbestand', exact: true }).click();
  await page.getByLabel('Lokaal UTF-8 tekstbestand').setInputFiles({
    name: 'bad.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from([0xff, 0x00]),
  });
  await expect(page.getByRole('alert')).toContainText('UTF-8');
  await page.getByRole('button', { name: 'Plakken', exact: true }).click();
  await page.getByLabel('Songtitel').fill('Correction');
  await page
    .getByLabel('Eigen lyrics (optioneel)')
    .fill(tab.replace('10', '25'));
  await page.getByRole('button', { name: 'Verder →' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Verder →' }).click();
  await expect(page.getByRole('alert')).toContainText('Handmatige correctie');
  await page.getByLabel('Lyrics controleren').fill(tab);
  await page.getByRole('button', { name: 'Verder →' }).click();
  await expect(page.getByLabel('Bestemming', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sluiten', exact: true }).click();
  expect((await rows(request)).length).toBe(before);
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
])
  test(
    'import/discovery responsive themes, keyboard and axe ' + viewport.width,
    async ({ page, browserName }) => {
      test.setTimeout(180000);
      await page.setViewportSize(viewport);
      await mkdir(output, { recursive: true });
      const evidence: object[] = [];
      await mockSearch(page);
      for (const theme of ['dark', 'light']) {
        await page.goto('/');
        await page.evaluate((t) => {
          localStorage.setItem('theme', t);
        }, theme);
        await page.reload();
        await page
          .getByRole('button', { name: 'Nieuwe song', exact: true })
          .click();
        async function audit(name: string) {
          const result = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
          evidence.push({
            name,
            theme,
            viewport,
            violations: result.violations,
          });
          expect(result.violations).toEqual([]);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: `${output}/${viewport.width}-${theme}-${name}.jpg`,
            fullPage: false,
            animations: 'disabled',
            timeout: 45000,
          });
        }
        await page.getByLabel('Songtitel').fill('Eigen preview');
        await page.getByLabel('Eigen lyrics (optioneel)').fill(source);
        await page.getByRole('button', { name: 'Verder →' }).click();
        await audit('preview');
        await page.locator('.import-tab-source').scrollIntoViewIfNeeded();
        await audit('tab');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Nieuwe song', exact: true }),
        ).toBeFocused();
        await page
          .getByRole('button', { name: 'Nieuwe song', exact: true })
          .click();
        await page.getByRole('button', { name: 'Zoeken', exact: true }).click();
        await page.getByLabel('Vrij zoeken').fill('Own');
        await page
          .getByRole('button', { name: 'Online zoeken', exact: true })
          .click();
        await expect(page.getByText('3 resultaten · v2')).toBeVisible();
        await audit('search');
        await page
          .getByRole('button', {
            name: 'Selecteren: Eigen providerfixture 125',
          })
          .click();
        await expect(
          page.getByRole('region', { name: 'Lyrics-preview' }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Permanente import niet toegestaan' })
          .scrollIntoViewIfNeeded();
        await audit('lyrics');
        await page
          .getByRole('button', { name: 'Annuleren', exact: true })
          .focus();
        await page.keyboard.press('Tab');
        await expect(
          page.getByRole('button', { name: 'Sluiten', exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Escape');
      }
      await writeFile(
        `${output}/${viewport.width}-axe.json`,
        JSON.stringify({ browserName, evidence }, null, 2),
      );
    },
  );
