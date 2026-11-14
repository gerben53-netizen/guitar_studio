import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import {
  newSong,
  type SongRecord,
} from '../packages/music-domain/src/workspace';
const screenshots =
  process.env.PLAYWRIGHT_SCREENSHOT_DIR ?? 'docs/qa/screenshots/sprint-1';
const text =
  '[Couplet 1]\nLangs het water wordt de ochtend licht\nIk zoek de zon in een open gezicht\n\n[Refrein]\nHier begint mijn eigen lied';
async function shot(page: Page, name: string) {
  const dismiss = page.getByRole('button', { name: 'Melding sluiten' });
  if (await dismiss.isVisible()) await dismiss.click();
  if (await page.locator('.save').isVisible()) await saved(page);
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({
    path: screenshots + '/' + name + '.png',
    fullPage: true,
  });
}
async function saved(page: Page) {
  await expect(page.locator('.save')).toContainText('Opgeslagen');
  await expect(page.locator('.save')).not.toContainText('Niet opgeslagen');
}
async function getRecord(request: APIRequestContext, id: string) {
  return (
    (await (await request.get('/api/v1/songs')).json()) as SongRecord[]
  ).find((r) => r.song.id === id)!;
}
async function cleanup(request: APIRequestContext, ids: string[]) {
  for (const id of ids) {
    const record = await getRecord(request, id);
    if (record)
      await request.delete(
        '/api/v1/songs/' + id + '?revision=' + record.revision,
      );
  }
}
test('integrated authoring, persistence, safe anchors, keyboard, chords, arrangements, practice and JSON transfer', async ({
  page,
  request,
}) => {
  const ids: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Nieuwe song', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Songtitel').fill('Waar de morgen begint');
    await page
      .getByLabel('Artiest', { exact: true })
      .fill('Noor & de Noorderwind');
    await page.getByLabel('Eigen lyrics (optioneel)').fill(text);
    await shot(page, '03-lyricsimport');
    await page.getByRole('button', { name: 'Verder →' }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Verder →' }).click();
    await page.getByRole('button', { name: 'Song aanmaken →' }).click();
    await expect(
      page.getByRole('heading', { name: 'Waar de morgen begint' }),
    ).toBeVisible();
    const all = (await (
      await request.get('/api/v1/songs')
    ).json()) as SongRecord[];
    const record = all.find(
      (r) =>
        r.song.title === 'Waar de morgen begint' &&
        r.song.artist === 'Noor & de Noorderwind' &&
        !r.song.id.startsWith('original-demo-'),
    )!;
    ids.push(record.song.id);
    await page.getByRole('button', { name: 'Langs', exact: true }).click();
    await page.getByRole('button', { name: '+ Akkoord', exact: true }).click();
    await page.getByLabel('Greep snaar 1', { exact: true }).selectOption('3');
    await page.getByLabel('Akkoordnaam').fill('Am eigen');
    await page
      .getByRole('checkbox', { name: 'Ook bewaren in eigen grepen' })
      .check();
    await shot(page, '07-akkoordeditor');
    await page.getByRole('button', { name: 'Op woord plaatsen' }).click();
    await expect(
      page.locator('.word').filter({ hasText: 'Langs' }),
    ).toContainText('Am eigen');
    await page.getByRole('button', { name: 'Lyrics bewerken' }).click();
    await page
      .getByLabel('Sectietekst')
      .fill(
        'Langs het stille water wordt de ochtend licht\nIk zoek de zon in een open gezicht',
      );
    await page.getByRole('button', { name: 'Lyrics opslaan' }).click();
    await expect(
      page.locator('.word').filter({ hasText: 'Langs' }),
    ).toContainText('Am eigen');
    await page.locator('.word').filter({ hasText: 'Langs' }).click();
    await page.getByRole('button', { name: 'Greep → tab' }).click();
    await expect(
      page.getByRole('button', {
        name: 'Maat 1, positie 0/1, snaar 1, fret 3',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Secties indelen' }).click();
    await page.getByLabel('Nieuwe sectienaam').fill('Bridge');
    await page.getByLabel('Lyrics voor deze sectie').fill('Een nieuwe weg');
    await page.getByRole('button', { name: 'Sectie toevoegen' }).click();
    await page.getByRole('button', { name: 'Secties indelen' }).click();
    await page.getByRole('button', { name: 'Bridge omhoog' }).click();
    await page.getByRole('button', { name: 'Sluiten', exact: true }).click();
    await page
      .getByRole('button', { name: 'Selecteer maat 2', exact: true })
      .click();
    await page.getByRole('button', { name: /^Hals snaar 1, fret 3,/ }).click();
    await page.getByRole('button', { name: /^Hals snaar 2, fret 1,/ }).click();
    await expect(
      page.locator('.fretboard button[aria-pressed=true]'),
    ).toHaveCount(2);
    await shot(page, '06-gitaarhals');
    const active = page.locator('.tabcell[data-active=true]');
    await active.focus();
    await page.keyboard.press('4');
    await expect(active).toHaveText('4');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.tabcell[data-active=true]')).toHaveText('1');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('.tabcell[data-active=true]')).toHaveText('4');
    await page
      .getByRole('button', { name: 'Dupliceer maat', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Selecteer maat 3', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Selecteer maat 2', exact: true })
      .click();
    await page.locator('.tabcell[data-active=true]').focus();
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect(
      page.getByRole('button', { name: 'Selecteer maat 4', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Selecteer maat 4', exact: true })
      .click();
    await page.getByRole('button', { name: '+ Maat', exact: true }).click();
    await page
      .getByRole('button', { name: 'Selecteer maat 5', exact: true })
      .click();
    await page.locator('.tabcell[data-active=true]').focus();
    for (const fret of ['0', '2', '3', '2', '0', '2', '3', '2']) {
      await page.keyboard.press(fret);
      await page.keyboard.press('ArrowRight');
    }
    await shot(page, '04-workspace-gecombineerd');
    await page
      .getByRole('button', { name: 'Tablatuur', exact: true })
      .first()
      .click();
    await shot(page, '05-tablatuureditor');
    await page
      .getByRole('button', { name: 'Gecombineerd', exact: true })
      .click();
    await page.getByRole('button', { name: 'Arrangement dupliceren' }).click();
    await expect(page.getByLabel('Arrangement', { exact: true })).toContainText(
      'kopie',
    );
    await page.getByRole('button', { name: '▷ Oefenen' }).click();
    await page.getByRole('button', { name: 'Volledig scherm' }).click();
    await expect
      .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(true);
    await page.getByRole('button', { name: 'Volledig scherm' }).click();
    await expect
      .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(false);
    await page.getByLabel('Oefenvoortgang').fill('75');
    await page.getByRole('button', { name: 'Sectie geoefend' }).click();
    await shot(page, '08-practice-mode');
    await page.getByRole('button', { name: '← Terug naar editor' }).click();
    await saved(page);
    const persisted = await getRecord(request, record.song.id);
    expect(persisted.song.arrangements).toHaveLength(2);
    expect(persisted.song.customChords[0]!.name).toBe('Am eigen');
    expect(persisted.song.progress).toBe(75);
    await page.reload();
    await page.getByRole('button', { name: 'Songs', exact: true }).click();
    await shot(page, '02-songbibliotheek');
    await page
      .locator('article[data-song-id="' + record.song.id + '"]')
      .getByRole('button', { name: 'Waar de morgen begint', exact: true })
      .click();
    await expect(page.getByLabel('Arrangement', { exact: true })).toHaveValue(
      persisted.song.lastArrangementId!,
    );
    await expect(
      page.locator('.word').filter({ hasText: 'Langs' }),
    ).toContainText('Am eigen');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON exporteren' }).click();
    const download = await downloadPromise;
    const file = await download.path();
    expect(file).toBeTruthy();
    await page.locator('input[type=file][hidden]').setInputFiles(file!);
    await expect(
      page.getByRole('heading', {
        name: 'Waar de morgen begint · kopie',
        exact: true,
      }),
    ).toBeVisible();
    const imported = (
      (await (await request.get('/api/v1/songs')).json()) as SongRecord[]
    ).find((r) => r.song.title === 'Waar de morgen begint · kopie')!;
    ids.push(imported.song.id);
    expect(
      imported.song.arrangements[0]!.sections[0]!.chords[0]!.grip.name,
    ).toBe('Am eigen');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await shot(page, '01-dashboard');
    expect(errors).toEqual([]);
  } finally {
    await cleanup(request, ids);
  }
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
])
  test(
    'responsive linked workspace ' + viewport.width,
    async ({ page, request }) => {
      await page.setViewportSize(viewport);
      const song = newSong('Responsive ' + viewport.width, 'Eigen werk', text);
      const res = await request.post('/api/v1/songs', { data: song });
      expect(res.ok()).toBeTruthy();
      try {
        await page.goto('/');
        await page.getByRole('button', { name: 'Songs', exact: true }).click();
        await page
          .getByRole('button', { name: song.title, exact: true })
          .click();
        if (viewport.width === 390)
          await page
            .getByRole('button', { name: 'Gitaarhals', exact: true })
            .click();
        await page
          .getByRole('button', { name: /^Hals snaar 1, fret 3,/ })
          .click();
        if (viewport.width === 390) {
          await expect(page.locator('.mobile-context')).toContainText(
            'snaar 1',
          );
          await page
            .getByRole('button', { name: 'Tablatuur', exact: true })
            .last()
            .click();
        }
        await expect(
          page.getByRole('button', {
            name: 'Maat 1, positie 0/1, snaar 1, fret 3',
            exact: true,
          }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBeTruthy();
        await shot(
          page,
          viewport.width === 390
            ? '09-mobiele-workspace'
            : viewport.width === 1024
              ? '11-tablet-workspace'
              : '12-desktop-workspace',
        );
        if (viewport.width === 1440) {
          const accessibility = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
          expect(accessibility.violations).toEqual([]);
          await page.getByRole('button', { name: 'Thema wisselen' }).click();
          await shot(page, '10-light-mode');
        }
        await saved(page);
      } finally {
        await cleanup(request, [song.id]);
      }
    },
  );
test('storage outage retains draft and retry, stale revision cannot overwrite, archive and deletion are isolated', async ({
  page,
  request,
}) => {
  const song = newSong('Opslagcontrole', 'Eigen werk', 'Eigen tekst'),
    other = newSong('Andere song', 'Eigen werk', '');
  await request.post('/api/v1/songs', { data: song });
  await request.post('/api/v1/songs', { data: other });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Songs', exact: true }).click();
    await page
      .getByRole('button', { name: 'Opslagcontrole', exact: true })
      .click();
    await saved(page);
    await page.route('**/api/v1/songs/' + song.id, (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { message: 'Test: opslag offline' },
            }),
          })
        : route.continue(),
    );
    await page.getByRole('button', { name: /^Hals snaar 1, fret 3,/ }).click();
    await expect(page.locator('.save')).toContainText('Niet opgeslagen');
    await expect(
      page.getByRole('button', {
        name: 'Maat 1, positie 0/1, snaar 1, fret 3',
        exact: true,
      }),
    ).toBeVisible();
    await page.unroute('**/api/v1/songs/' + song.id);
    await page.getByRole('button', { name: 'Opnieuw opslaan' }).click();
    await saved(page);
    expect(
      (await getRecord(request, song.id)).song.arrangements[0]!.sections[0]!
        .measures[0]!.events,
    ).toHaveLength(1);
    const remote = await getRecord(request, song.id);
    remote.song.progress = 10;
    expect(
      (
        await request.put('/api/v1/songs/' + song.id, {
          data: { song: remote.song, revision: remote.revision },
        })
      ).ok(),
    ).toBeTruthy();
    await page.getByRole('button', { name: /^Hals snaar 1, fret 4,/ }).click();
    await expect(page.locator('.save')).toContainText('Niet opgeslagen');
    await expect(page.getByRole('alert')).toContainText('Nieuwere versie');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Serverversie laden' }).click();
    await saved(page);
    expect((await getRecord(request, song.id)).song.progress).toBe(10);
    await page.getByRole('button', { name: 'Herstelversies' }).click();
    await expect(page.getByRole('dialog')).toContainText('Versie');
    await page.getByRole('button', { name: 'Sluiten', exact: true }).click();
    await page.getByRole('button', { name: 'Songs', exact: true }).click();
    const card = page.locator('article').filter({ hasText: 'Opslagcontrole' });
    await card.getByRole('button', { name: 'Archiveren', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Opslagcontrole', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Archief', exact: true }).click();
    await page
      .locator('article')
      .filter({ hasText: 'Opslagcontrole' })
      .getByRole('button', { name: 'Herstellen', exact: true })
      .click();
    await page.getByRole('button', { name: 'Archief', exact: true }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .locator('article')
      .filter({ hasText: 'Opslagcontrole' })
      .getByRole('button', { name: 'Verwijderen', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Opslagcontrole', exact: true }),
    ).toHaveCount(0);
    expect(await getRecord(request, other.id)).toBeTruthy();
  } finally {
    await cleanup(request, [song.id, other.id]);
  }
});
