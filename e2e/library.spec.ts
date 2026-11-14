import { test, expect } from '@playwright/test';
import {
  newSong,
  type SongRecord,
} from '../packages/music-domain/src/workspace';
test('database-driven library metadata, favorite, filtering, list view, duplication and rejected JSON version', async ({
  page,
  request,
}) => {
  const song = newSong(
    'Bibliotheekacceptatie',
    'Eigen artiest',
    'Eigen lyrics',
  );
  song.tags = ['Fingerstyle'];
  song.difficulty = 'Gemiddeld';
  song.status = 'Oefenen';
  const ids = [song.id];
  await request.post('/api/v1/songs', { data: song });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Songs', exact: true }).click();
    await page.getByLabel('Zoeken op titel en artiest').fill('Eigen artiest');
    await page.getByLabel('Statusfilter').selectOption('Oefenen');
    await page.getByLabel('Moeilijkheidsfilter').selectOption('Gemiddeld');
    await page.getByLabel('Tagfilter').selectOption('Fingerstyle');
    await expect(page.locator('article')).toHaveCount(1);
    await page
      .getByRole('button', {
        name: 'Favoriet Bibliotheekacceptatie',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: '☆ Favorieten', exact: true })
      .click();
    await expect(page.locator('article')).toHaveCount(1);
    await page.getByRole('button', { name: 'Lijst', exact: true }).click();
    await expect(page.locator('.cards')).toHaveClass(/list/);
    await page.getByRole('button', { name: 'Kopie', exact: true }).click();
    await expect(page.locator('article')).toHaveCount(2);
    const all = (await (
      await request.get('/api/v1/songs')
    ).json()) as SongRecord[];
    const copy = all.find(
      (r) => r.song.title === 'Bibliotheekacceptatie · kopie',
    )!;
    ids.push(copy.song.id);
    expect(copy.song.arrangements[0]!.id).not.toBe(song.arrangements[0]!.id);
    await page.locator('input[type=file][hidden]').setInputFiles({
      name: 'unsupported.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ format: 'guitar-studio', version: 999, song }),
      ),
    });
    await expect(page.locator('.toast')).toContainText('Import geweigerd');
    expect(
      (
        (await (await request.get('/api/v1/songs')).json()) as SongRecord[]
      ).filter((r) => ids.includes(r.song.id)),
    ).toHaveLength(2);
  } finally {
    for (const id of ids) {
      const record = (
        (await (await request.get('/api/v1/songs')).json()) as SongRecord[]
      ).find((r) => r.song.id === id);
      if (record)
        await request.delete(
          '/api/v1/songs/' + id + '?revision=' + record.revision,
        );
    }
  }
});
