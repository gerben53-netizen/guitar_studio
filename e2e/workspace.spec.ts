import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  newSong,
  type SongRecord,
} from '../packages/music-domain/src/workspace';
import {
  toMultitrack,
  type MultitrackSong,
} from '../packages/music-domain/src/multitrack';
async function record(request: APIRequestContext, id: string) {
  return (
    (await (await request.get('/api/v1/songs')).json()) as SongRecord[]
  ).find((r) => r.song.id === id);
}
async function clean(request: APIRequestContext, ids: string[]) {
  for (const id of ids) {
    const r = await record(request, id);
    if (r) await request.delete(`/api/v1/songs/${id}?revision=${r.revision}`);
  }
}
async function open(page: Page, song: { id: string; title: string }) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Songs', exact: true }).click();
  await page
    .locator(`article[data-song-id="${song.id}"]`)
    .getByRole('button', { name: song.title, exact: true })
    .click();
  await expect(page.locator('.gs-workspace-v3')).toBeVisible();
}
async function saved(page: Page) {
  await expect(page.locator('.save')).toHaveText('Opgeslagen');
}
test('integrated authoring, chords, sections, arrangements and complete JSON transfer', async ({
  page,
  request,
}) => {
  const ids: string[] = [];
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Nieuwe song', exact: true })
      .click();
    await page.getByLabel('Songtitel').fill('Eigen v3 volledige workflow');
    await page.getByLabel('Artiest', { exact: true }).fill('Eigen auteur');
    await page
      .getByLabel('Eigen lyrics (optioneel)')
      .fill('[Couplet]\nLangs het water\nEen eigen regel');
    await page.getByRole('button', { name: 'Verder →' }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Verder →' }).click();
    await page.getByRole('button', { name: 'Song aanmaken →' }).click();
    await expect(page.locator('.gs-workspace-v3')).toBeVisible();
    const rows = (await (
        await request.get('/api/v1/songs')
      ).json()) as SongRecord[],
      song = rows.find(
        (r) => r.song.title === 'Eigen v3 volledige workflow',
      )!.song;
    ids.push(song.id);
    await page.getByRole('button', { name: 'Langs', exact: true }).click();
    await page
      .getByRole('button', { name: 'Akkoord plaatsen', exact: true })
      .click();
    await page.getByLabel('Greep snaar 1', { exact: true }).selectOption('3');
    await page.getByLabel('Akkoordnaam').fill('Eigen greep');
    await page
      .getByRole('checkbox', { name: 'Ook bewaren in eigen grepen' })
      .check();
    await page
      .getByRole('button', { name: 'Op woord plaatsen', exact: true })
      .click();
    await expect(
      page.locator('.lyric-word').filter({ hasText: 'Langs' }),
    ).toContainText('Eigen greep');
    await page
      .getByRole('button', { name: 'Secties beheren', exact: true })
      .click();
    await page.getByLabel('Nieuwe sectienaam').fill('Bridge');
    await page.getByLabel('Lyrics voor deze sectie').fill('Eigen brug');
    await page
      .getByRole('button', { name: 'Sectie toevoegen', exact: true })
      .click();
    await page.keyboard.press('Escape');
    await expect(
      page
        .getByRole('navigation', { name: 'Lyricssecties' })
        .getByRole('button', { name: 'Bridge', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '+ Arrangement', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Arrangement dupliceren', exact: true })
      .click();
    await expect(
      page.getByLabel('Arrangement', { exact: true }).locator('option'),
    ).toHaveCount(2);
    await saved(page);
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'JSON exporteren', exact: true })
      .click();
    const path = await (await download).path();
    const exported = JSON.parse(await readFile(path!, 'utf8'));
    expect(exported.version).toBe(2);
    expect(exported.song.arrangements).toHaveLength(2);
    expect(exported.song.customChords).toHaveLength(1);
    await page.locator('input[type=file][hidden]').setInputFiles(path!);
    await expect(page.locator('.workspace-header h1')).toHaveText(
      song.title + ' · kopie',
    );
    const copy = (
      (await (await request.get('/api/v1/songs')).json()) as SongRecord[]
    ).find((r) => r.song.title === song.title + ' · kopie')!;
    ids.push(copy.song.id);
    expect(copy.song.id).not.toBe(song.id);
    expect(copy.song.arrangements).toHaveLength(2);
  } finally {
    await clean(request, ids);
  }
});
for (const width of [1440, 1024, 390])
  test(
    'responsive physical neck and score ' + width,
    async ({ page, request }) => {
      const song = toMultitrack(
        newSong('Eigen responsieve v3 ' + width, 'Eigen werk', 'Eigen tekst'),
      );
      expect((await request.post('/api/v1/songs', { data: song })).ok()).toBe(
        true,
      );
      try {
        await page.setViewportSize({ width, height: 844 });
        await open(page, song);
        await page
          .locator('[data-neck-string="1"][data-neck-fret="3"]')
          .click();
        await expect(
          page.locator('.tab-position[data-active=true]'),
        ).toHaveText('3');
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await saved(page);
      } finally {
        await clean(request, [song.id]);
      }
    },
  );
test('storage outage retains draft; stale revisions cannot overwrite; archive, history and deletion remain isolated', async ({
  page,
  request,
}) => {
  const song = toMultitrack(
      newSong('Eigen opslagcontrole v3', 'Eigen werk', 'Eigen tekst'),
    ),
    other = toMultitrack(newSong('Eigen andere song', 'Eigen werk', ''));
  for (const s of [song, other])
    expect((await request.post('/api/v1/songs', { data: s })).ok()).toBe(true);
  const url = `/api/v1/songs/${song.id}/multitrack`;
  try {
    await open(page, song);
    await page.route('**' + url, (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({
            status: 503,
            json: { error: { message: 'Test: opslag offline' } },
          })
        : route.continue(),
    );
    await page.locator('[data-neck-string="1"][data-neck-fret="3"]').click();
    await expect(page.locator('.save')).toHaveText('Niet opgeslagen');
    await expect(page.locator('.tab-position[data-active=true]')).toHaveText(
      '3',
    );
    const download = page.waitForEvent('download');
    await page
      .getByRole('alert')
      .getByRole('button', { name: 'JSON exporteren', exact: true })
      .click();
    const draft = JSON.parse(
      await readFile((await (await download).path())!, 'utf8'),
    );
    expect(
      draft.song.arrangements[0].tracks[0].events[0].tones[0].position.fret,
    ).toBe(3);
    await page.unroute('**' + url);
    await page.getByRole('button', { name: 'Opnieuw opslaan' }).click();
    await saved(page);
    const remote = (await (await request.get(url)).json()) as {
      document: MultitrackSong;
      revision: number;
    };
    remote.document.progress = 10;
    expect(
      (
        await request.put(url, {
          data: { document: remote.document, revision: remote.revision },
        })
      ).ok(),
    ).toBe(true);
    await page.locator('[data-neck-string="1"][data-neck-fret="4"]').click();
    await expect(page.locator('.save')).toHaveText('Niet opgeslagen');
    await expect(page.getByRole('alert')).toContainText(
      'Nieuwere serverrevision',
    );
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Serverversie laden' }).click();
    await saved(page);
    expect((await record(request, song.id))!.song.progress).toBe(10);
    await page
      .getByRole('button', { name: 'Historische versies', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toContainText('Revisie');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Songs', exact: true }).click();
    const card = page.locator(`article[data-song-id="${song.id}"]`);
    await card.getByRole('button', { name: 'Archiveren', exact: true }).click();
    await expect(card).toHaveCount(0);
    await page.getByRole('button', { name: 'Archief', exact: true }).click();
    await card.getByRole('button', { name: 'Herstellen', exact: true }).click();
    await page.getByRole('button', { name: 'Archief', exact: true }).click();
    page.once('dialog', (d) => d.accept());
    await card
      .getByRole('button', { name: 'Verwijderen', exact: true })
      .click();
    await expect(card).toHaveCount(0);
    expect(await record(request, other.id)).toBeTruthy();
  } finally {
    await clean(request, [song.id, other.id]);
  }
});
