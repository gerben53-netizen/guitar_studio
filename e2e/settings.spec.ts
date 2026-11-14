import { test, expect } from '@playwright/test';
import type { SongRecord } from '../packages/music-domain/src/workspace';
test('file import, explicit rights, retained/ambiguous chords, meter, profiles, multi-measure copy and recovery', async ({
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
    await page.getByRole('button', { name: 'tekst', exact: true }).click();
    await page.getByRole('button', { name: '+ Akkoord', exact: true }).click();
    await page.getByRole('button', { name: 'C', exact: true }).click();
    await page.getByRole('button', { name: 'Op woord plaatsen' }).click();
    await page.locator('.word').filter({ hasText: 'tekst' }).click();
    await page.getByRole('button', { name: 'G', exact: true }).click();
    await page.getByRole('button', { name: 'Op woord plaatsen' }).click();
    await page.getByRole('button', { name: 'Lyrics bewerken' }).click();
    await page
      .getByLabel('Sectietekst')
      .fill('Een eigen verhaal\n\nEen tweede regel');
    await page.getByRole('button', { name: 'Lyrics opslaan' }).click();
    await expect(
      page.locator('.notice').filter({ hasText: 'geen zeker tekstanker' }),
    ).toContainText('G');
    await page.getByRole('button', { name: 'Opnieuw positioneren' }).click();
    await page.getByRole('button', { name: 'verhaal', exact: true }).click();
    await expect(
      page.locator('.word').filter({ hasText: 'verhaal' }),
    ).toContainText('G');
    await page.getByLabel('Maatsoort').selectOption('6/8');
    await page.getByLabel('Ritmeraster').selectOption('16');
    await page.getByLabel('Nootduur').selectOption('16');
    await page.locator('.tabcell[data-active=true]').focus();
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await expect(page.locator('.tabcell[data-active=true]')).toHaveText('12');
    await page.getByRole('button', { name: /^Hals snaar 6, fret 3,/ }).click();
    await page.getByLabel('Stemming').selectOption('Drop D');
    await page.getByLabel('Capo', { exact: true }).fill('2');
    await page
      .getByLabel('Instrument', { exact: true })
      .selectOption('electric');
    await page.getByLabel('Tempo').fill('120');
    await expect(
      page.getByRole('button', {
        name: 'Hals snaar 6, fret 1, F2',
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('button', { name: 'Selecteer maat 1', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Selecteer maat 2', exact: true })
      .click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'Kopieer', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'gekopieerd' }),
    ).toContainText('2 maat');
    await page.getByRole('button', { name: 'Plak', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Selecteer maat 4', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.save')).toHaveText('● Opgeslagen');
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
    expect(a.sections[0]!.measures).toHaveLength(4);
    await page.getByRole('button', { name: 'Herstelversies' }).click();
    const rows = page.locator('.history-version');
    await expect(rows).not.toHaveCount(0);
    await rows
      .last()
      .getByRole('button', { name: 'Herstellen', exact: true })
      .click();
    await expect(page.locator('.save')).toHaveText('● Opgeslagen');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('Maatsoort')).toHaveValue('6/8');
    await expect(page.locator('.save')).toHaveText('● Opgeslagen');
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
