import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { alignmentFixture } from '../packages/music-domain/test-support/alignment-fixture';
import {
  MultitrackSongSchema,
  type MultitrackSong,
} from '../packages/music-domain/src/multitrack';

const output = process.env.ALIGNMENT_EVIDENCE_DIR ?? 'test-results/issue-76';
let song: MultitrackSong;
let errors: string[];
const panel = (page: Page) => page.locator('.alignment-panel');
const command = (page: Page, name: string) =>
  panel(page).getByRole('button', { name, exact: true });
const active = (page: Page) =>
  panel(page).locator('.syllable-chip[aria-pressed="true"] strong');
const current = (page: Page) => panel(page).locator('.alignment-current');
const preview = (page: Page) =>
  page.getByRole('dialog', { name: 'Controleer je koppelingen' });
async function canonical(request: APIRequestContext) {
  const r = await request.get(`/api/v1/songs/${song.id}/multitrack`);
  expect(r.ok()).toBe(true);
  const result = await r.json();
  return {
    ...result,
    document: MultitrackSongSchema.parse(result.document),
  } as { document: MultitrackSong; revision: number };
}
async function history(request: APIRequestContext) {
  return (
    await (
      await request.get(`/api/v1/songs/${song.id}/multitrack?view=history`)
    ).json()
  ).entries;
}
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Songs', exact: true }).click();
  await page
    .locator(`article[data-song-id="${song.id}"]`)
    .getByRole('button', { name: song.title, exact: true })
    .click();
  await expect(page.locator('.workspace-header h1')).toHaveText(song.title);
}
async function start(page: Page) {
  await page
    .getByRole('button', { name: 'Lyrics uitlijnen', exact: true })
    .click();
  await expect(panel(page)).toBeVisible();
}
async function corrections(page: Page) {
  await panel(page).locator('summary').click();
}
async function discard(page: Page) {
  await command(page, 'Annuleren uitlijnen').click();
  const dialog = page.getByRole('dialog');
  if (await dialog.count())
    await dialog
      .getByRole('button', { name: 'Concept verwerpen', exact: true })
      .click();
  await expect(panel(page)).toHaveCount(0);
}
async function six(page: Page) {
  for (let i = 0; i < 6; i++) await page.keyboard.press('Enter');
  await expect(panel(page).locator('.alignment-counts')).toContainText(
    '6 concept · 0 resterend',
  );
}
async function commit(page: Page) {
  await command(page, 'Controleer concept').click();
  await preview(page)
    .getByRole('button', { name: 'Bevestigen & opslaan', exact: true })
    .click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('.save')).toHaveText('Opgeslagen');
}
test.beforeEach(async ({ page, request }) => {
  song = alignmentFixture(false);
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  expect((await request.post('/api/v1/songs', { data: song })).ok()).toBe(true);
  await mkdir(output, { recursive: true });
  await open(page);
});
test.afterEach(async ({ request }) => {
  const saved = await canonical(request);
  expect(
    (
      await request.delete(
        `/api/v1/songs/${song.id}?revision=${saved.revision}`,
      )
    ).ok(),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('01–15, 27–31, 35: real full-line keyboard workflow, navigation, draft history, atomic commit and reopen', async ({
  page,
  request,
}) => {
  await test.step('01–03 workspace, arrangement and vocal track', async () => {
    await page
      .getByLabel('Arrangement', { exact: true })
      .selectOption(song.arrangements[1]!.id);
    await page
      .getByLabel('Arrangement', { exact: true })
      .selectOption(song.arrangements[0]!.id);
    await page
      .getByLabel('Actief spoor', { exact: true })
      .selectOption(song.arrangements[0]!.tracks[1]!.id);
    await page
      .getByLabel('Actief spoor', { exact: true })
      .selectOption(song.arrangements[0]!.tracks[0]!.id);
    await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
    await expect(page.locator('.save')).toHaveText('Opgeslagen');
    await expect(page.getByLabel('Arrangement', { exact: true })).toHaveValue(
      song.arrangements[0]!.id,
    );
    await expect(page.getByLabel('Actief spoor', { exact: true })).toHaveValue(
      song.arrangements[0]!.activeTrackId,
    );
  });
  const before = await canonical(request),
    versions = await history(request);
  await test.step('04–09 context, line, first event, binding and simultaneous separate event', async () => {
    await start(page);
    await expect(panel(page)).toContainText('8 bestaande noten');
    await expect(active(page)).toHaveText('Langs');
    await expect(current(page)).toContainText('M1 · 0/1 · snaar 1');
    await page.keyboard.press('Enter');
    await expect(active(page)).toHaveText('het');
    await expect(current(page)).toContainText('snaar 6');
    await expect(panel(page).locator('.alignment-counts')).toContainText(
      '1 concept · 5 resterend',
    );
  });
  await test.step('11–15 note/syllable navigation and skip', async () => {
    await corrections(page);
    await command(page, 'Vorige noot').click();
    await expect(current(page)).toContainText('snaar 1');
    await command(page, 'Volgende noot').click();
    await expect(current(page)).toContainText('snaar 6');
    await command(page, 'Vorige lettergreep').click();
    await expect(active(page)).toHaveText('Langs');
    await command(page, 'Volgende lettergreep').click();
    await expect(active(page)).toHaveText('het');
    await command(page, 'Overslaan').click();
    await expect(panel(page).locator('.syllable-chip').nth(1)).toContainText(
      'overgeslagen',
    );
  });
  await test.step('27–29 separate draft Undo/Redo and cancellation without writes', async () => {
    await command(page, 'Concept-Undo').click();
    await expect(active(page)).toHaveText('het');
    await command(page, 'Concept-Redo').click();
    await expect(active(page)).toHaveText('wa');
    expect(await canonical(request)).toEqual(before);
    expect(await history(request)).toEqual(versions);
    await discard(page);
    expect(await canonical(request)).toEqual(before);
    expect(await history(request)).toEqual(versions);
  });
  await test.step('10/30 full line through consecutive Enter, only explicit confirmation writes', async () => {
    await start(page);
    await six(page);
    await page.screenshot({ path: output + '/fast-line.png' });
    expect(await canonical(request)).toEqual(before);
    await commit(page);
    await page.screenshot({ path: output + '/confirmed.png' });
    const saved = await canonical(request);
    expect(saved.revision).toBe(before.revision + 1);
    expect((await history(request)).length).toBe(versions.length + 1);
    expect(saved.document.arrangements[0]!.lyricsLinks).toHaveLength(6);
    const comparison = structuredClone(saved.document);
    comparison.arrangements[0]!.lyricsLinks = [];
    expect(comparison).toEqual(before.document);
  });
  await test.step('31 reload retrieves canonical saved links', async () => {
    await open(page);
    await start(page);
    await expect(panel(page).locator('.syllable-chip small')).toHaveText(
      Array(6).fill('● bestaand'),
    );
    await discard(page);
  });
});

test('04–05 selected passage and lyrics-line entries; multi-tone event deduplication and line selection', async ({
  page,
  request,
}) => {
  const a = song.arrangements[0]!,
    event = a.tracks[0]!.events[0]!;
  const tones = page.locator(
    `[data-track-id="${a.activeTrackId}"] [data-event-id="${event.id}"]`,
  );
  await tones.first().click();
  await tones.nth(1).click({ modifiers: ['Control'] });
  await page
    .getByRole('button', {
      name: 'Geselecteerde passage uitlijnen',
      exact: true,
    })
    .click();
  await expect(panel(page)).toContainText('1 bestaande noten');
  await discard(page);
  await page
    .getByRole('button', { name: 'Deze regel uitlijnen 2', exact: true })
    .click();
  await expect(active(page)).toHaveText('Een');
  await expect(
    panel(page).getByLabel('Lyricsregel', { exact: true }),
  ).toHaveValue(song.lyrics[0]!.lines[1]!.id);
  await panel(page)
    .getByLabel('Lyricsregel', { exact: true })
    .selectOption(song.lyrics[0]!.lines[2]!.id);
  await expect(panel(page).locator('.syllable-chip strong')).toHaveText([
    'la',
    'la',
    'klinkt',
    'opnieuw',
  ]);
  await expect(
    panel(page).locator('.syllable-word-context').first(),
  ).toHaveText('woord 1');
  await expect(panel(page).locator('.syllable-word-context').nth(1)).toHaveText(
    'woord 2',
  );
  expect((await canonical(request)).revision).toBe(1);
});

test('16–18, 23–28: cross-bar melisma, correction, sustain and proposal checkpoint restoration', async ({
  page,
  request,
}) => {
  await start(page);
  await command(page, 'Verdeling voorstellen').click();
  await preview(page)
    .getByRole('button', { name: 'Voorstel annuleren', exact: true })
    .click();
  await expect(command(page, 'Concept-Undo')).toBeDisabled();
  await expect(command(page, 'Concept-Redo')).toBeDisabled();
  await corrections(page);
  for (let i = 0; i < 3; i++) await command(page, 'Volgende noot').click();
  await command(page, 'Zelfde lettergreep, volgende noot').click();
  await expect(current(page)).toContainText('M2 · 0/1');
  await page.keyboard.press('Shift+Enter');
  await expect(active(page)).toHaveText('Langs');
  await expect(panel(page)).toContainText('2 concept nootkoppelingen');
  await page.screenshot({ path: output + '/melisma.png' });
  await command(page, 'Vorige noot').click();
  await command(page, 'Deze noot losmaken').click();
  await expect(panel(page)).toContainText('1 concept nootkoppelingen');
  await panel(page).getByLabel('Aanhouden', { exact: true }).check();
  await expect(
    panel(page).getByLabel('Aanhouden', { exact: true }),
  ).toBeChecked();
  await panel(page).getByLabel('Aanhouden', { exact: true }).uncheck();
  await command(page, 'Concept-Undo').click();
  const before = await panel(page).locator('.alignment-counts').textContent();
  await command(page, 'Verdeling voorstellen').click();
  await expect(preview(page)).toContainText(
    'Aantal verschilt: 6 lettergrepen en 8 noten',
  );
  await page.screenshot({ path: output + '/proposal.png' });
  await preview(page)
    .getByRole('button', { name: 'Voorstel annuleren', exact: true })
    .click();
  await expect(panel(page).locator('.alignment-counts')).toHaveText(before!);
  await expect(
    panel(page).getByLabel('Aanhouden', { exact: true }),
  ).toBeChecked();
  await command(page, 'Concept-Redo').click();
  await expect(
    panel(page).getByLabel('Aanhouden', { exact: true }),
  ).not.toBeChecked();
  await command(page, 'Verdeling voorstellen').click();
  await preview(page)
    .getByRole('button', { name: 'Voorstel aanpassen', exact: true })
    .click();
  await panel(page).locator('.syllable-chip').nth(2).click();
  await command(page, 'Lettergreep leegmaken').click();
  await expect(panel(page).locator('.alignment-counts')).toContainText(
    '5 concept',
  );
  expect((await canonical(request)).revision).toBe(1);
  await discard(page);
  // Eight original words and eight real events: equal proposal, explicit commit.
  await start(page);
  await panel(page)
    .getByLabel('Lyricsregel', { exact: true })
    .selectOption(song.lyrics[0]!.lines[1]!.id);
  await command(page, 'Verdeling voorstellen').click();
  await expect(preview(page)).toContainText('Evenveel lettergrepen als noten');
  await preview(page)
    .getByRole('button', { name: 'Bevestigen & opslaan', exact: true })
    .click();
  await expect(panel(page)).toHaveCount(0);
  expect(
    (await canonical(request)).document.arrangements[0]!.lyricsLinks,
  ).toHaveLength(8);
});

test('19–22: existing links, blocked conflict, explicit keep/new, preserving other melisma notes', async ({
  page,
  request,
}) => {
  const linked = alignmentFixture(true);
  // Replace only this test-owned fixture, preserving its library identity.
  linked.id = song.id;
  for (const a of linked.arrangements) a.songId = linked.id;
  linked.title = song.title;
  song = linked;
  expect(
    (
      await request.put(`/api/v1/songs/${song.id}/multitrack`, {
        data: { revision: 1, document: song, confirmedDestructive: true },
      })
    ).ok(),
  ).toBe(true);
  await open(page);
  const before = await canonical(request);
  await start(page);
  await corrections(page);
  await panel(page).locator('.syllable-chip').nth(5).click();
  await expect(panel(page)).toContainText('1 bestaande nootkoppelingen');
  await panel(page).locator('.syllable-chip').nth(1).click();
  for (let i = 0; i < 3; i++) await command(page, 'Volgende noot').click();
  await command(page, 'Koppel en volgende ↵').click();
  await command(page, 'Controleer concept').click();
  await expect(
    preview(page).locator('[data-preview-status="conflict"]'),
  ).toHaveCount(1);
  await expect(
    preview(page).getByRole('button', { name: 'Bevestigen & opslaan' }),
  ).toBeDisabled();
  await preview(page)
    .getByLabel('Keuze woord 2', { exact: true })
    .selectOption('keep');
  await expect(
    preview(page).getByRole('button', { name: 'Bevestigen & opslaan' }),
  ).toBeEnabled();
  await preview(page)
    .getByLabel('Keuze woord 2', { exact: true })
    .selectOption('new');
  expect(await canonical(request)).toEqual(before);
  await preview(page)
    .getByRole('button', { name: 'Bevestigen & opslaan' })
    .click();
  await expect(panel(page)).toHaveCount(0);
  const saved = await canonical(request),
    a = saved.document.arrangements[0]!;
  const original = before.document.arrangements[0]!;
  const wa = original.lyricsLinks.find(
    (l) => l.trackId === a.activeTrackId && l.eventIds.length === 2,
  )!;
  expect(a.lyricsLinks.find((l) => l.id === wa.id)!.eventIds).toEqual([
    wa.eventIds[1],
  ]);
  expect(a.tracks).toEqual(original.tracks);
  expect(a.lyricsLinks.filter((l) => l.trackId !== a.activeTrackId)).toEqual(
    original.lyricsLinks.filter((l) => l.trackId !== a.activeTrackId),
  );
});

test('32–35: saved selection in both directions, safe track choices, native keyboard and focus', async ({
  page,
  request,
}) => {
  await start(page);
  await six(page);
  await commit(page);
  await page
    .locator('.lyrics-line .lyric-word')
    .filter({ hasText: 'licht' })
    .first()
    .click();
  await expect(
    page.locator(
      '.tab-position.is-linked[data-event-id="' +
        song.arrangements[0]!.tracks[0]!.events[5]!.id +
        '"]',
    ),
  ).toBeVisible();
  const event = song.arrangements[0]!.tracks[0]!.events[1]!;
  await page
    .locator(
      `[data-track-id="${song.arrangements[0]!.activeTrackId}"] [data-event-id="${event.id}"]`,
    )
    .first()
    .click();
  await expect(
    page.locator('.lyrics-line .lyric-word.is-selected'),
  ).toContainText('het');
  const entry = page.getByRole('button', {
    name: 'Deze regel uitlijnen 1',
    exact: true,
  });
  await entry.click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(active(page)).toHaveText('het');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(active(page)).toHaveText('Langs');
  const select = panel(page).getByLabel('Lyricsregel', { exact: true });
  await select.focus();
  await page.keyboard.press('s');
  await expect(panel(page).locator('.alignment-counts')).toContainText(
    '0 concept · 6 resterend',
  );
  await command(page, 'Koppel en volgende ↵').focus();
  await page.keyboard.press('s');
  await expect(panel(page).locator('.syllable-chip').first()).toContainText(
    'overgeslagen',
  );
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+z');
  await expect(panel(page).locator('.alignment-counts')).toContainText(
    '0 concept',
  );
  await page.keyboard.press('Control+Shift+z');
  await expect(panel(page).locator('.alignment-counts')).toContainText(
    '1 concept',
  );
  await page.keyboard.press('7');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Lyrics uitlijnen verlaten' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(panel(page).locator('.alignment-counts')).toContainText(
    '1 concept',
  );
  const guitar = page
    .getByRole('navigation', { name: 'Sporen', exact: true })
    .getByRole('button', { name: 'Gitaarbegeleiding', exact: true });
  await guitar.click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Doorgaan met uitlijnen', exact: true })
    .click();
  await expect(panel(page).locator('h3')).toHaveText('Zangmelodie');
  await guitar.click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Eerst controleren', exact: true })
    .click();
  await expect(preview(page)).toBeVisible();
  await preview(page)
    .getByRole('button', { name: 'Terug naar uitlijnen', exact: true })
    .click();
  await guitar.click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Concept verwerpen en wisselen', exact: true })
    .click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByLabel('Actief spoor', { exact: true })).toHaveValue(
    song.arrangements[0]!.tracks[1]!.id,
  );
  await expect(entry).toBeFocused();
  const saved = await canonical(request);
  expect(saved.document.arrangements[0]!.tracks).toEqual(
    song.arrangements[0]!.tracks,
  );
  expect(
    saved.document.arrangements[0]!.lyricsLinks.filter(
      (l) => l.trackId === song.arrangements[0]!.tracks[1]!.id,
    ),
  ).toHaveLength(0);
});

test('real 409 from second session and retry after server error retain draft; ordinary Undo reverts one commit', async ({
  page,
  request,
  browser,
}) => {
  await start(page);
  await six(page);
  const second = await browser.newContext();
  try {
    const tab = await second.newPage();
    await open(tab);
    await tab.getByLabel('BPM', { exact: true }).fill('93');
    await tab.getByRole('button', { name: 'Opslaan', exact: true }).click();
    await expect(tab.locator('.save')).toHaveText('Opgeslagen');
    expect((await canonical(request)).revision).toBe(2);
    await command(page, 'Controleer concept').click();
    await preview(page)
      .getByRole('button', { name: 'Bevestigen & opslaan' })
      .click();
    await expect(preview(page).getByRole('alert')).toContainText(
      'concept is behouden',
    );
    expect(
      (await canonical(request)).document.arrangements[0]!.lyricsLinks,
    ).toHaveLength(0);
  } finally {
    await second.close();
  }
  await preview(page)
    .getByRole('button', { name: 'Terug naar uitlijnen', exact: true })
    .click();
  await discard(page);
  await open(page);
  await start(page);
  await six(page);
  let fail = true,
    puts = 0;
  await page.route(`**/api/v1/songs/${song.id}/multitrack`, async (route) => {
    if (route.request().method() === 'PUT') {
      puts++;
      if (fail) {
        fail = false;
        return route.fulfill({
          status: 503,
          json: { error: 'Tijdelijke teststoring' },
        });
      }
    }
    await route.continue();
  });
  await command(page, 'Controleer concept').click();
  await preview(page)
    .getByRole('button', { name: 'Bevestigen & opslaan' })
    .click();
  await expect(preview(page).getByRole('alert')).toContainText(
    'concept is behouden',
  );
  expect((await canonical(request)).revision).toBe(2);
  await preview(page)
    .getByRole('button', { name: 'Bevestigen & opslaan' })
    .click();
  await expect(panel(page)).toHaveCount(0);
  expect(puts).toBe(2);
  expect((await canonical(request)).revision).toBe(3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(page.locator('.save')).toHaveText('Opgeslagen');
  expect(
    (await canonical(request)).document.arrangements[0]!.lyricsLinks,
  ).toHaveLength(0);
});

test('production edge: explicit measure passage includes pitch-only notes, collapsed active track remains reachable, locked edits stay outside draft', async ({
  page,
  request,
}) => {
  const a = song.arrangements[0]!,
    t = a.tracks[0]!;
  t.collapsed = true;
  for (const tone of t.events[0]!.tones) delete tone.position;
  expect(
    (
      await request.put(`/api/v1/songs/${song.id}/multitrack`, {
        data: { revision: 1, document: song, confirmedDestructive: true },
      })
    ).ok(),
  ).toBe(true);
  await open(page);
  // The collapsed track is expanded only for presentation during alignment.
  await start(page);
  const pitch = page.locator('.unpositioned-alignment-note').first();
  await expect(pitch).toBeVisible();
  await expect(pitch).toHaveAttribute('data-alignment-current', 'true');
  await expect(current(page)).toContainText('MIDI 64 (zonder snaarpositie)');
  await pitch.click();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Songs', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Nieuwe song', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('8');
  await page.keyboard.press('Delete');
  expect((await canonical(request)).revision).toBe(2);
  await discard(page);
  await page
    .getByRole('button', { name: 'Uitklappen: Zangmelodie', exact: true })
    .first()
    .click();
  await page
    .locator(`[data-track-id="${t.id}"] .measure-heading`)
    .first()
    .click();
  await start(page);
  await expect(panel(page)).toContainText('4 bestaande noten');
  await expect(current(page)).toContainText('MIDI 64 (zonder snaarpositie)');
  await discard(page);
  // An ordinary pending edit is flushed once before the fixed session revision.
  await page.getByLabel('BPM', { exact: true }).fill('95');
  await start(page);
  const before = await canonical(request);
  await expect(panel(page)).toContainText('startrevisie ' + before.revision);
  expect(before.document.arrangements[0]!.tempo).toBe(95);
  await page.keyboard.press('Enter');
  expect(await canonical(request)).toEqual(before);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`36–38: themes, responsive visibility, axe toolbar/preview/exit and screenshots ${viewport.width}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(240000);
    await mkdir(output, { recursive: true });
    await page.setViewportSize(viewport);
    const arrangement = song.arrangements[0]!;
    arrangement.lyricsLinks.push({
      id: 'alignment-existing',
      trackId: arrangement.activeTrackId,
      syllableId: song.lyrics[0]!.lines[0]!.tokens[0]!.syllables[0]!.id,
      eventIds: [arrangement.tracks[0]!.events[0]!.id],
      sustain: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(
      (
        await request.put(`/api/v1/songs/${song.id}/multitrack`, {
          data: { revision: 1, document: song, confirmedDestructive: true },
        })
      ).ok(),
    ).toBe(true);
    await open(page);
    const audits: object[] = [];
    for (const theme of ['dark', 'light']) {
      const root = page.locator('html');
      if ((await root.getAttribute('data-theme')) !== theme)
        await page.getByRole('button', { name: /Thema|Theme/ }).click();
      await start(page);
      await panel(page).locator('.syllable-chip').nth(1).click();
      await page.keyboard.press('Enter');
      async function audit(state: string) {
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        audits.push({ theme, state, viewport, violations: result.violations });
        expect(result.violations).toEqual([]);
        await page.screenshot({
          path: `${output}/${viewport.width}-${theme}-${state}.png`,
        });
      }
      await audit('active');
      await page
        .getByRole('button', { name: 'Thema wisselen', exact: true })
        .click();
      await expect(panel(page).locator('.alignment-counts')).toContainText(
        '1 concept',
      );
      await page
        .getByRole('button', { name: 'Thema wisselen', exact: true })
        .click();
      await expect(root).toHaveAttribute('data-theme', theme);
      await expect(
        panel(page).locator('.syllable-chip[aria-pressed="true"]'),
      ).toBeInViewport();
      await expect(
        page.locator('[data-alignment-current="true"]').first(),
      ).toBeInViewport();
      await command(page, 'Controleer concept').click();
      await expect(
        preview(page).locator('[data-preview-status="conflict"]'),
      ).toHaveCount(1);
      await expect(
        preview(page).getByRole('button', { name: 'Bevestigen & opslaan' }),
      ).toBeDisabled();
      await audit('conflict-preview');
      await preview(page)
        .getByRole('button', { name: 'Terug naar uitlijnen', exact: true })
        .click();
      await command(page, 'Annuleren uitlijnen').click();
      await audit('exit');
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Concept verwerpen', exact: true })
        .click();
    }
    expect((await canonical(request)).revision).toBe(2);
    await writeFile(
      `${output}/${viewport.width}-axe.json`,
      JSON.stringify(audits, null, 2),
    );
  });
}
