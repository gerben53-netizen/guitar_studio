import { test, expect } from '@playwright/test';
import type { SongRecord } from '../packages/music-domain/src/workspace';
test('file import, explicit rights, retained/ambiguous chords, meter, profiles, physical fret input and canonical history recovery', async ({
  page,
  request,
}) => {
  let id = '';
  page.on('dialog', (dialog) => dialog.accept());
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Nieuwe song', exact: true })
      .click();
    await page.getByLabel('Songtitel').fill('Bestandacceptatie');
    await page
      .getByRole('button', { name: 'Tekstbestand', exact: true })
      .click();
    await page.getByLabel('Lokaal UTF-8 tekstbestand').setInputFiles({
      name: 'eigen-lied.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        '[Couplet]\nEen eigen tekst\n\nEen tweede regel\n[Refrein]\nMijn eigen lied',
      ),
    });
    await page.getByRole('button', { name: 'Verder →' }).click();
    await page.getByRole('button', { name: 'Verder →' }).click();
    await expect(page.getByRole('alert')).toContainText('Bevestig');
    await expect(page.getByRole('checkbox')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Verder →' }).click();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/v1/imports') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Song aanmaken →' }).click();
    id = ((await (await response).json()) as SongRecord).song.id;
    await expect(page.locator('.gs-workspace-v3')).toBeVisible();
    await page.getByRole('button', { name: 'tekst', exact: true }).click();
    await page
      .getByRole('button', { name: 'Akkoord plaatsen', exact: true })
      .click();
    await page.getByRole('button', { name: 'G', exact: true }).click();
    await page
      .getByRole('button', { name: 'Op woord plaatsen', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Tekst bewerken', exact: true })
      .click();
    await page
      .getByLabel('Sectietekst')
      .fill('Een eigen verhaal\n\nEen tweede regel');
    await expect(
      page.getByRole('region', { name: 'Ankerreview' }),
    ).toContainText('tekstankers');
    await expect(
      page.getByRole('button', { name: 'Lyrics opslaan', exact: true }),
    ).toBeDisabled();
    await page.getByRole('checkbox', { name: /Ik bevestig/ }).check();
    await page
      .getByRole('button', { name: 'Lyrics opslaan', exact: true })
      .click();
    await page.getByRole('button', { name: 'verhaal', exact: true }).click();
    await page
      .getByRole('button', { name: 'Akkoord plaatsen', exact: true })
      .click();
    await page.getByRole('button', { name: 'G', exact: true }).click();
    await page
      .getByRole('button', { name: 'Op woord plaatsen', exact: true })
      .click();
    await expect(
      page.locator('.lyric-word').filter({ hasText: 'verhaal' }),
    ).toContainText('G');
    await page.getByLabel('Maatsoort', { exact: true }).selectOption('6/8');
    await page.getByLabel('Nootduur', { exact: true }).selectOption('16');
    await page.locator('.tab-position[data-active=true]').focus();
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
    await expect(page.locator('.tab-position[data-active=true]')).toHaveText(
      '12',
    );
    await page.locator('[data-neck-string="6"][data-neck-fret="3"]').click();
    await page.getByLabel('Stemming', { exact: true }).selectOption('dropd');
    await expect(
      page.locator('.score-measure').first().locator('.string-name').last(),
    ).toHaveText('D');
    await page.getByLabel('Capo', { exact: true }).fill('2');
    await page.getByLabel('Capo', { exact: true }).press('Tab');
    await page
      .getByLabel('Instrument', { exact: true })
      .selectOption('electric');
    await page.getByLabel('BPM', { exact: true }).fill('120');
    await page.getByLabel('BPM', { exact: true }).press('Tab');
    await expect(
      page.locator('[data-neck-string="6"][data-neck-fret="3"]'),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '+ Maat', exact: true }).click();
    await expect(page.locator('.save')).toHaveText('Opgeslagen');
    const before = (
      (await (await request.get('/api/v1/songs')).json()) as SongRecord[]
    ).find((r) => r.song.id === id)!;
    expect(before.song.source.kind).toBe('text-file');
    expect(before.song.source.attribution).toBe('eigen-lied.txt');
    const a = before.song.arrangements[0]!;
    expect(a.timeSignature).toEqual({ beats: 6, beatUnit: 8 });
    expect(a.instrument.type).toBe('electric');
    expect(a.instrument.tuning.name).toBe('Drop D');
    expect(a.instrument.capo).toBe(2);
    expect(a.tempo).toBe(120);
    await page
      .getByRole('button', { name: 'Historische versies', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Revisie 1 herstellen', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.save')).toHaveText('Opgeslagen');
    await expect(page.getByLabel('Maatsoort', { exact: true })).toHaveValue(
      '4/4',
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('Maatsoort', { exact: true })).toHaveValue(
      '6/8',
    );
    await expect(page.locator('.save')).toHaveText('Opgeslagen');
  } finally {
    if (id) {
      const row = (
        (await (await request.get('/api/v1/songs')).json()) as SongRecord[]
      ).find((r) => r.song.id === id);
      if (row)
        await request.delete(
          '/api/v1/songs/' + id + '?revision=' + row.revision,
        );
    }
  }
});
