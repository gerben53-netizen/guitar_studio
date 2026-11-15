import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { legacyFixture } from '../packages/music-domain/test-support/multitrack-fixtures';
import {
  toMultitrack,
  type MultitrackSong,
} from '../packages/music-domain/src/multitrack';
import { applyMultitrackMutation } from '../packages/music-domain/src/multitrack-operations';
import { uid } from '../packages/music-domain/src/workspace';

const output = process.env.WORKSPACE_EVIDENCE_DIR ?? 'test-results/sprint-2f';
function fixture() {
  let song = toMultitrack(legacyFixture(2));
  song.title = 'Langs het eigen water · ' + uid().slice(0, 6);
  let a = song.arrangements[0]!;
  a.tracks[0]!.name = 'Zangmelodie';
  a.tracks[0]!.role = 'vocal_melody';
  for (const [name, role] of [
    ['Gitaarbegeleiding', 'guitar_accompaniment'],
    ['Tweede gitaar', 'second_guitar'],
  ] as const) {
    song = applyMultitrackMutation(song, {
      op: 'duplicate-track',
      arrangementId: a.id,
      trackId: a.tracks[0]!.id,
    });
    a = song.arrangements[0]!;
    Object.assign(a.tracks.at(-1)!, { name, role });
  }
  for (let i = 0; i < 6; i++) {
    const id = uid();
    a.sections[0]!.measures.push({ id, timeSignature: a.timeSignature });
    for (const t of a.tracks)
      t.events.push(
        ...t.events
          .filter((e) => e.measureId === a.sections[0]!.measures[0]!.id)
          .map((e) => ({ ...structuredClone(e), id: uid(), measureId: id })),
      );
  }
  return song;
}
async function canonical(request: APIRequestContext, id: string) {
  const r = await request.get(`/api/v1/songs/${id}/multitrack`);
  expect(r.ok()).toBe(true);
  return (await r.json()) as { document: MultitrackSong; revision: number };
}
async function open(page: Page, song: { id: string; title: string }) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Songs', exact: true }).click();
  await page
    .locator(`article[data-song-id="${song.id}"]`)
    .getByRole('button', { name: song.title, exact: true })
    .click();
  await expect(page.locator('.gs-workspace-v3')).toBeVisible();
  await expect(page.locator('.workspace-header h1')).toHaveText(song.title);
}
async function saved(page: Page) {
  await expect(page.locator('.save')).toHaveText('Opgeslagen');
}
function position(
  page: Page,
  measure = 1,
  string = 3,
  start = '0/1',
  track = 'Zangmelodie',
) {
  return page.getByRole('button', {
    name: new RegExp(
      `^${track}, maat ${measure}, positie ${start}, snaar ${string},`,
    ),
  });
}
async function manager(page: Page) {
  await page
    .getByRole('button', { name: 'Sporen beheren', exact: true })
    .click();
}
async function close(page: Page) {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sluiten', exact: true })
    .last()
    .click();
}
let song: MultitrackSong;
let pageErrors: string[] = [];
test.beforeEach(async ({ request, page }) => {
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  song = fixture();
  expect((await request.post('/api/v1/songs', { data: song })).ok()).toBe(true);
  await open(page, song);
});
test.afterEach(async ({ request }) => {
  const r = await canonical(request, song.id);
  expect(
    (
      await request.delete(`/api/v1/songs/${song.id}?revision=${r.revision}`)
    ).ok(),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('01–07: opening, arrangements, safe text, chords, full-width aligned systems and layout', async ({
  page,
  request,
}) => {
  await test.step('01 Song opent in de enige v3-editor', async () => {
    await expect(page.getByLabel('Actief spoor', { exact: true })).toHaveValue(
      song.arrangements[0]!.activeTrackId,
    );
    await expect(page.getByText('Oude editor', { exact: true })).toHaveCount(0);
  });
  await test.step('02 Arrangement wisselen', async () => {
    await page
      .getByLabel('Arrangement', { exact: true })
      .selectOption(song.arrangements[1]!.id);
    await expect(page.getByLabel('Actief spoor', { exact: true })).toHaveValue(
      song.arrangements[1]!.activeTrackId,
    );
    await page
      .getByLabel('Arrangement', { exact: true })
      .selectOption(song.arrangements[0]!.id);
  });
  await test.step('03 Lyrics wijzigen behoudt noten', async () => {
    const before = structuredClone(song.arrangements[0]!.tracks);
    await page
      .getByRole('button', { name: 'Tekst bewerken', exact: true })
      .click();
    await page
      .getByLabel('Sectietekst')
      .fill('la la water\nEen eigen regel plus');
    await page
      .getByRole('button', { name: 'Lyrics opslaan', exact: true })
      .click();
    await saved(page);
    expect(
      (await canonical(request, song.id)).document.arrangements[0]!.tracks,
    ).toEqual(before);
  });
  await test.step('04 Akkoord boven een geselecteerd woord', async () => {
    await page.locator('.lyric-word').filter({ hasText: 'water' }).click();
    await page
      .getByRole('button', { name: 'Akkoord plaatsen', exact: true })
      .click();
    await page.getByLabel('Akkoordnaam').fill('Eigen C');
    await page
      .getByRole('button', { name: 'Op woord plaatsen', exact: true })
      .click();
    await expect(
      page.locator('.lyric-word').filter({ hasText: 'water' }),
    ).toContainText('Eigen C');
  });
  await test.step('05 Volle breedte met zes doorlopende snaren', async () => {
    expect(
      await page.locator('.tab-staff').first().locator('.string-line').count(),
    ).toBe(6);
    const score = await page.locator('.score-editor').boundingBox(),
      lyrics = await page.locator('.lyrics-editor').boundingBox();
    expect(score!.width).toBeCloseTo(lyrics!.width, 0);
    expect(score!.y).toBeGreaterThan(lyrics!.y + lyrics!.height);
  });
  await test.step('06 Twee, drie, vier en automatische maten per systeem', async () => {
    for (const count of [2, 3, 4]) {
      await page.getByLabel('Maten per regel').selectOption(String(count));
      await expect(
        page.locator('.measure-row').first().locator('.score-measure'),
      ).toHaveCount(count);
    }
    await page.getByLabel('Maten per regel').selectOption('0');
    expect(
      await page
        .locator('.measure-row')
        .first()
        .locator('.score-measure')
        .count(),
    ).toBeGreaterThanOrEqual(2);
  });
  await test.step('07 Meerdere systemen; maat vijf blijft bereikbaar', async () => {
    await page.getByLabel('Maten per regel').selectOption('2');
    await position(page, 5).click();
    await expect(page.locator('.score-status')).toContainText('maat 5');
  });
});

test('08–15: complete track management without cross-track edits', async ({
  page,
  request,
}) => {
  await manager(page);
  await test.step('08 Nieuw zangspoor', async () => {
    await page
      .getByLabel('Nieuw spoor', { exact: true })
      .fill('Eigen nieuwe partij');
    await page
      .getByRole('dialog')
      .getByLabel('Spoorrol', { exact: true })
      .selectOption('vocal_melody');
    await page.getByRole('button', { name: 'Nieuw spoor toevoegen' }).click();
    await expect(
      page.getByLabel('Naam Eigen nieuwe partij', { exact: true }),
    ).toBeVisible();
  });
  await test.step('09 Hernoemen', async () => {
    await page
      .getByLabel('Naam Eigen nieuwe partij', { exact: true })
      .fill('Nieuwe melodie');
    await page
      .getByLabel('Naam Eigen nieuwe partij', { exact: true })
      .press('Enter');
    await expect(
      page.getByLabel('Naam Nieuwe melodie', { exact: true }),
    ).toBeVisible();
  });
  await test.step('10 Duplicatie remapt alle eventidentiteiten', async () => {
    await page
      .getByRole('button', { name: 'Dupliceer Zangmelodie', exact: true })
      .click();
    await saved(page);
    const a = (await canonical(request, song.id)).document.arrangements[0]!,
      original = a.tracks[0]!,
      copy = a.tracks.at(-1)!;
    expect(copy.events).toHaveLength(original.events.length);
    expect(
      copy.events.every((e) => !original.events.some((o) => o.id === e.id)),
    ).toBe(true);
  });
  await test.step('11 Verwijderen noemt naam en aantal; annuleren behoudt spoor', async () => {
    await page
      .getByRole('button', { name: 'Verwijder Nieuwe melodie', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('Nieuwe melodie');
    await expect(page.getByRole('alert')).toContainText('0 events');
    await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
    await expect(
      page.getByLabel('Naam Nieuwe melodie', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Verwijder Nieuwe melodie', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Verwijderen bevestigen', exact: true })
      .click();
    await expect(
      page.getByLabel('Naam Nieuwe melodie', { exact: true }),
    ).toHaveCount(0);
  });
  await test.step('12 Verbergen en tonen', async () => {
    await page
      .getByRole('button', { name: 'Verberg Gitaarbegeleiding', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Toon Gitaarbegeleiding', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Toon Gitaarbegeleiding', exact: true })
      .click();
  });
  await test.step('13 Inklappen en uitklappen', async () => {
    await page
      .getByRole('button', { name: 'Inklappen Gitaarbegeleiding', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Uitklappen Gitaarbegeleiding',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Uitklappen Gitaarbegeleiding',
        exact: true,
      })
      .click();
  });
  await test.step('14 Spoorvolgorde', async () => {
    await page
      .getByRole('button', { name: 'Tweede gitaar omhoog', exact: true })
      .click();
    await saved(page);
    expect(
      (await canonical(request, song.id)).document.arrangements[0]!
        .trackOrder[1],
    ).toBe(song.arrangements[0]!.tracks[2]!.id);
  });
  await test.step('15 Actief spoor stuurt editor', async () => {
    await page
      .getByRole('button', { name: 'Actief: Gitaarbegeleiding', exact: true })
      .click();
    await close(page);
    await expect(page.getByLabel('Actief spoor', { exact: true })).toHaveValue(
      song.arrangements[0]!.tracks[1]!.id,
    );
    await expect(page.locator('.score-status')).toContainText(
      'Gitaarbegeleiding',
    );
    await saved(page);
    const expected = (await canonical(request, song.id)).document
      .arrangements[0]!.trackOrder;
    await page.getByRole('button', { name: '▷ Oefenen', exact: true }).click();
    expect(
      await page
        .locator('.score-system')
        .first()
        .locator('.notation-row')
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute('data-track-id')),
        ),
    ).toEqual(expected);
    await page
      .getByRole('button', { name: 'Terug naar editor', exact: true })
      .click();
  });
});

test('16–23, 33: explicit fret buffer, note/chord editing, selections, undo and independent vocal track', async ({
  page,
  request,
}) => {
  const a = song.arrangements[0]!,
    untouched = structuredClone(a.tracks.slice(1));
  const read = async () =>
    (await canonical(request, song.id)).document.arrangements[0]!;
  await test.step('16 Fysieke fret 12 op snaar drie', async () => {
    await position(page).click();
    await page.keyboard.type('12');
    await expect(page.locator('.score-status')).toContainText('invoer 12');
    await page.keyboard.press('Enter');
    await expect(position(page)).toHaveText('12');
  });
  await test.step('17 Wissen bewaart andere tonen', async () => {
    await page.keyboard.press('Delete');
    await expect(position(page)).toHaveText('·');
  });
  await test.step('18 Achtste noot', async () => {
    await page.getByLabel('Nootduur', { exact: true }).selectOption('8');
    await position(page).click();
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
    await saved(page);
    expect(
      (await read()).tracks[0]!.events.find((e) =>
        e.tones.some((t) => t.position?.string === 3),
      )!.duration,
    ).toEqual({ numerator: 1, denominator: 8 });
  });
  await test.step('19 Samenklank op hetzelfde tijdstip', async () => {
    await position(page, 1, 4).click();
    await page.keyboard.type('5');
    await page.keyboard.press('Enter');
    await saved(page);
    const e = (await read()).tracks[0]!.events.find((e) =>
      e.tones.some((t) => t.position?.string === 3),
    )!;
    expect(
      e.tones.some((t) => t.position?.string === 4 && t.position.fret === 5),
    ).toBe(true);
  });
  await test.step('20 Meerdere tonen met Ctrl', async () => {
    await position(page, 1, 3).click();
    await position(page, 1, 4).click({ modifiers: ['Control'] });
    await expect(page.locator('.score-status')).toContainText(
      '2 tonen geselecteerd',
    );
  });
  await test.step('21 Maten 1–3 met Shift', async () => {
    const heads = page.locator('.notation-row').first();
    await heads
      .getByRole('button', { name: 'Maat 1 · 4/4', exact: true })
      .click();
    await page
      .getByRole('region', { name: 'Zangmelodie maat 3', exact: true })
      .getByRole('button', { name: 'Maat 3 · 4/4', exact: true })
      .click({ modifiers: ['Shift'] });
    expect(await page.locator('.score-measure.is-range').count()).toBe(9);
  });
  await test.step('22 Undo en redo', async () => {
    await position(page, 1, 3).click();
    await page.keyboard.type('9');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+z');
    await expect(position(page, 1, 3)).toHaveText('12');
    await page.keyboard.press('Control+Shift+z');
    await expect(position(page, 1, 3)).toHaveText('9');
  });
  await test.step('23 Zangmelodie verandert begeleiding niet', async () => {
    await saved(page);
    expect((await read()).tracks.slice(1)).toEqual(untouched);
  });
  await test.step('33 Twee cijfers blijven onbevestigd tot Enter; Escape annuleert', async () => {
    await position(page, 1, 3).click();
    await page.keyboard.type('24');
    await page.waitForTimeout(1100);
    await expect(position(page, 1, 3)).toHaveText('9');
    await expect(page.getByLabel('Fysieke fret', { exact: true })).toHaveValue(
      '24',
    );
    await page.keyboard.press('Escape');
    await expect(position(page, 1, 3)).toHaveText('9');
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
    await expect(position(page, 1, 3)).toHaveText('12');
  });
});

test('24–30: explicit syllable linking, cross-bar melisma, replacement, unlinking and reciprocal highlight', async ({
  page,
  request,
}) => {
  const a = song.arrangements[0]!,
    word = song.lyrics[0]!.lines[0]!.tokens.find((w) => w.text === 'water')!;
  await test.step('24 Lyrics aan onder het zangspoor', async () => {
    await expect(
      page
        .getByRole('button', { name: 'Lyrics aan: Zangmelodie', exact: true })
        .first(),
    ).toHaveAttribute('aria-pressed', 'true');
  });
  await test.step('25 Woord aan een noot koppelen', async () => {
    await page
      .getByLabel('Lettergreep', { exact: true })
      .selectOption(word.syllables[0]!.id);
    await position(page, 1, 1).click();
    await page
      .getByRole('button', { name: 'Koppel selectie', exact: true })
      .click();
    await expect(page.locator('.lyric-anchor')).toContainText(['water']);
  });
  await test.step('26 Melisma over de maatgrens en aanhouden', async () => {
    await position(page, 2, 1).click({ modifiers: ['Control'] });
    await page
      .getByRole('checkbox', { name: 'Aanhouden', exact: true })
      .check();
    await page
      .getByRole('button', { name: 'Koppel selectie', exact: true })
      .click();
    await saved(page);
    const link = (await canonical(request, song.id)).document.arrangements[0]!
      .lyricsLinks[0]!;
    expect(link.eventIds).toHaveLength(2);
    expect(link.sustain).toBe(true);
    await expect(page.locator('.melisma-mark')).toHaveCount(2);
    await mkdir(output, { recursive: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: output + '/lyrics-melisma.jpg',
      type: 'jpeg',
      quality: 85,
      fullPage: true,
    });
  });
  await test.step('29 Noot selecteert het woord', async () => {
    await position(page, 2, 1).click();
    await expect(
      page.locator(`.lyric-word[data-word-id="${word.id}"]`),
    ).toHaveAttribute('aria-pressed', 'true');
  });
  await test.step('30 Woord markeert alle gekoppelde noten', async () => {
    await saved(page);
    await open(page, song);
    await page.locator(`.lyric-word[data-word-id="${word.id}"]`).click();
    await expect(page.getByLabel('Nootduur', { exact: true })).toHaveValue('8');
    expect(
      await page.locator('.tab-position.is-linked').count(),
    ).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.score-status')).toContainText(
      '4 tonen geselecteerd',
    );
  });
  await test.step('27 Koppeling expliciet vervangen', async () => {
    await position(page, 2, 1).click();
    await page
      .getByRole('button', { name: 'Vervang koppeling', exact: true })
      .click();
    await saved(page);
    expect(
      (await canonical(request, song.id)).document.arrangements[0]!
        .lyricsLinks[0]!.eventIds,
    ).toHaveLength(1);
  });
  await test.step('28 Ontkoppelen bewaart noten', async () => {
    await page.getByRole('button', { name: 'Ontkoppel', exact: true }).click();
    await saved(page);
    const after = (await canonical(request, song.id)).document.arrangements[0]!;
    expect(after.lyricsLinks).toHaveLength(0);
    expect(after.tracks).toEqual(a.tracks);
  });
});

test('31–32, 34–35, 37: neck states, physical insertion, Practice views and durable reopen', async ({
  page,
  request,
}) => {
  await test.step('31 Gitaarhals ingeklapt, compact en uitgebreid', async () => {
    await expect(
      page.locator('.fretboard button[aria-pressed=true]'),
    ).toHaveCount(3);
    await expect(
      page.getByRole('button', { name: 'Compact', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Ingeklapt', exact: true }).click();
    await expect(page.locator('.fretboard')).toHaveCount(0);
    await page.getByRole('button', { name: 'Uitgebreid', exact: true }).click();
    await expect(page.locator('.fretboard')).toBeVisible();
    await page.getByRole('button', { name: 'Compact', exact: true }).click();
  });
  await test.step('32 Halsinvoer op snaar vier, fysieke fret vijf, positie 1/8', async () => {
    await position(page, 1, 4, '1/8').click();
    await page.locator('[data-neck-string="4"][data-neck-fret="5"]').click();
    await expect(position(page, 1, 4, '1/8')).toHaveText('5');
    await saved(page);
  });
  await test.step('34 Practice Mode met gedeelde metronoom', async () => {
    await page.getByRole('button', { name: '▷ Oefenen', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Practice Mode' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Start', exact: true })
      .last()
      .click();
    await expect(
      page.getByText('Metronoom actief', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Pauze', exact: true }).click();
    await expect(page.getByText('Gepauzeerd', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
  });
  await test.step('35 Alle vijf oefenweergaven', async () => {
    for (const view of ['lyrics', 'vocal', 'guitar', 'all', 'linked']) {
      await page.getByLabel('Oefenweergave').selectOption(view);
      if (view === 'lyrics')
        await expect(page.locator('.score-editor')).toHaveCount(0);
      else {
        const count = await page.locator('.tab-staff').count();
        expect(count).toBe(
          view === 'linked'
            ? 0
            : view === 'vocal'
              ? 10
              : view === 'guitar'
                ? 20
                : 30,
        );
      }
    }
    await page
      .getByRole('button', { name: 'Terug naar editor', exact: true })
      .click();
    await expect(page.locator('.score-status')).toContainText('positie 1/8');
  });
  await test.step('37 Opslaan en opnieuw openen behoudt alle sporen', async () => {
    await saved(page);
    const before = await canonical(request, song.id);
    await open(page, song);
    expect((await canonical(request, song.id)).document).toEqual(
      before.document,
    );
    await expect(position(page, 1, 4, '1/8')).toHaveText('5');
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'JSON exporteren', exact: true })
      .click();
    expect(
      JSON.parse(await readFile((await (await download).path())!, 'utf8')).song,
    ).toEqual(before.document);
  });
});

test('38: existing version-one song converts safely with original source, physical frets and history intact', async ({
  page,
  request,
}) => {
  const source = legacyFixture(2);
  source.title = 'Eigen oorspronkelijke fixture ' + uid();
  expect((await request.post('/api/v1/songs', { data: source })).ok()).toBe(
    true,
  );
  try {
    await open(page, source);
    await position(page, 1, 1, '0/1', source.arrangements[0]!.name).count();
    const original = await canonical(request, source.id);
    await page
      .getByRole('button', { name: 'Songgegevens', exact: true })
      .click();
    await page
      .getByLabel('Artiest', { exact: true })
      .fill('Eigen gewijzigde auteur');
    await page
      .getByRole('button', { name: 'Gegevens opslaan', exact: true })
      .click();
    await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName(
      'Oorspronkelijke versie bewaren',
    );
    await page
      .getByRole('button', { name: 'Bewaren en opslaan', exact: true })
      .click();
    await saved(page);
    const after = await canonical(request, source.id);
    expect(after.document.source).toEqual(original.document.source);
    expect(after.document.arrangements).toEqual(original.document.arrangements);
    expect(
      after.document.arrangements[0]!.tracks[0]!.events[0]!.tones.map(
        (t) => t.position?.fret,
      ),
    ).toEqual([0, 1]);
    const history = await (
      await request.get(`/api/v1/songs/${source.id}/multitrack?view=history`)
    ).json();
    expect(
      history.entries.some(
        (e: { document: { schemaVersion: number } }) =>
          e.document.schemaVersion === 1,
      ),
    ).toBe(true);
  } finally {
    const r = await canonical(request, source.id);
    await request.delete(`/api/v1/songs/${source.id}?revision=${r.revision}`);
  }
});

test('manual syllables and explicit text-anchor review preserve every note', async ({
  page,
  request,
}) => {
  const word = song.lyrics[0]!.lines[0]!.tokens.find(
    (w) => w.text === 'water',
  )!;
  await page.locator(`.lyric-word[data-word-id="${word.id}"]`).click();
  await page
    .getByRole('button', { name: 'Lettergrepen bewerken', exact: true })
    .click();
  await page.getByLabel('Lettergreepverdeling').fill('wa|ter');
  await page
    .getByRole('button', { name: 'Lettergrepen opslaan', exact: true })
    .click();
  await saved(page);
  const before = (await canonical(request, song.id)).document;
  expect(
    before.lyrics[0]!.lines[0]!.tokens.find(
      (w) => w.id === word.id,
    )!.syllables.map((s) => s.text),
  ).toEqual(['wa', 'ter']);
  await page
    .getByRole('button', { name: 'Tekst bewerken', exact: true })
    .click();
  await page.getByLabel('Sectietekst').fill('Een volledig andere eigen regel');
  await expect(page.getByRole('region', { name: 'Ankerreview' })).toContainText(
    'handmatige lettergrepen',
  );
  await expect(
    page.getByRole('button', { name: 'Lyrics opslaan', exact: true }),
  ).toBeDisabled();
  expect((await canonical(request, song.id)).document).toEqual(before);
  await page.getByRole('checkbox', { name: /Ik bevestig/ }).check();
  await page
    .getByRole('button', { name: 'Lyrics opslaan', exact: true })
    .click();
  await saved(page);
  expect(
    (await canonical(request, song.id)).document.arrangements[0]!.tracks,
  ).toEqual(before.arrangements[0]!.tracks);
});

test('Practice Room receives the exact track/range/cursor snapshot and returns safely after source changes', async ({
  page,
  request,
}) => {
  await position(page, 1, 3, '1/8').click();
  await page.getByRole('button', { name: '▷ Oefenen', exact: true }).click();
  const posted = page.waitForResponse(
    (r) =>
      r.url().endsWith('/practice/origins') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Open Practice Room', exact: true })
    .click();
  const origin = await (await posted).json();
  const snap = await (
    await request.get('/api/v1/practice/origins/' + origin.id)
  ).json();
  expect(snap.status).toBe('available');
  expect(snap.selection.trackIds).toHaveLength(3);
  expect(snap.selection.returnCursor.position).toEqual({
    numerator: 1,
    denominator: 8,
  });
  await expect(page.getByRole('region', { name: 'Songpassage' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Terug naar songpassage', exact: true })
    .click();
  await expect(page.locator('.score-status')).toContainText('positie 1/8');
  await page.getByRole('button', { name: '▷ Oefenen', exact: true }).click();
  const postedAgain = page.waitForResponse(
    (r) =>
      r.url().endsWith('/practice/origins') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Open Practice Room', exact: true })
    .click();
  await postedAgain;
  const current = await canonical(request, song.id);
  current.document.arrangements[0]!.tracks[0]!.events = [];
  expect(
    (
      await request.put(`/api/v1/songs/${song.id}/multitrack`, {
        data: {
          revision: current.revision,
          document: current.document,
          confirmedDestructive: true,
        },
      })
    ).ok(),
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Terug naar songpassage', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Jouw songs, jouw versies.',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/oorspronkelijke oefensnapshot blijft bewaard/),
  ).toBeVisible();
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(
    '36: dark/light, keyboard, overflow and axe on seven surfaces at ' +
      viewport.width,
    async ({ page, browser }) => {
      test.setTimeout(240000);
      await page.setViewportSize(viewport);
      await mkdir(output, { recursive: true });
      const reports: object[] = [];
      async function audit(surface: string, theme: string) {
        if (
          !(await page.getByRole('dialog').count()) &&
          (await position(page, 1, 1).count())
        ) {
          const one = await position(page, 1, 1).boundingBox(),
            two = await position(page, 1, 2).boundingBox();
          if (one && two)
            expect(one.y + one.height).toBeLessThanOrEqual(two.y + 0.1);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          surface,
        ).toBe(true);
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        reports.push({
          surface,
          theme,
          viewport,
          browser: browser.version(),
          channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
          violations: result.violations,
        });
        await writeFile(
          `${output}/${viewport.width}-axe.json`,
          JSON.stringify(reports, null, 2),
        );
        expect(result.violations, surface + ' ' + theme).toEqual([]);
        await page.screenshot({
          path: `${output}/${viewport.width}-${theme}-${surface}.jpg`,
          type: 'jpeg',
          quality: 85,
          fullPage: true,
        });
      }
      for (const theme of ['dark', 'light']) {
        if ((await page.locator('html').getAttribute('data-theme')) !== theme)
          await page.getByRole('button', { name: 'Thema wisselen' }).click();
        await page.evaluate(() => scrollTo(0, 0));
        const active = page.locator('.tab-position[data-active=true]');
        await active.focus();
        await expect(active).toBeFocused();
        expect(
          await active.evaluate((e) => getComputedStyle(e).outlineStyle),
        ).toBe('solid');
        await audit('workspace', theme);
        await manager(page);
        await audit('manager', theme);
        await close(page);
        await page.locator('.lyric-word').filter({ hasText: 'water' }).click();
        await page
          .getByRole('button', { name: 'Lettergrepen bewerken', exact: true })
          .click();
        await audit('linking', theme);
        await page.keyboard.press('Escape');
        await page
          .getByRole('button', { name: 'Compact', exact: true })
          .click();
        await audit('neck-compact', theme);
        await page
          .getByRole('button', { name: 'Uitgebreid', exact: true })
          .click();
        await audit('neck-expanded', theme);
        await page
          .getByRole('button', { name: '▷ Oefenen', exact: true })
          .click();
        await audit('practice', theme);
        await page
          .getByRole('button', { name: 'Terug naar editor', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'Zoeken & importeren', exact: true })
          .click();
        await audit('import', theme);
        await page.keyboard.press('Escape');
      }
    },
  );
}
