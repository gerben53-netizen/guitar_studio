import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { legacyFixture } from '../packages/music-domain/test-support/multitrack-fixtures';
import { type MultitrackSong } from '../packages/music-domain/src/multitrack';
import { uid } from '../packages/music-domain/src/workspace';
const output = process.env.MULTITRACK_EVIDENCE_DIR ?? 'test-results/sprint-2e';
async function canonical(request: APIRequestContext, id: string) {
  return (await (
    await request.get(`/api/v1/songs/${id}/multitrack`)
  ).json()) as { document: MultitrackSong; revision: number };
}
async function setup(request: APIRequestContext, index = 2) {
  const source = legacyFixture(index);
  source.title = 'Eigen foundation ' + uid();
  expect((await request.post('/api/v1/songs', { data: source })).ok()).toBe(
    true,
  );
  const url = `/api/v1/songs/${source.id}/multitrack`;
  expect(
    (
      await request.patch(url, {
        data: { revision: 1, mutation: { op: 'upgrade', confirmed: true } },
      })
    ).ok(),
  ).toBe(true);
  const initial = await canonical(request, source.id),
    a = initial.document.arrangements[0]!;
  expect(
    (
      await request.patch(url, {
        data: {
          revision: 2,
          mutation: {
            op: 'duplicate-track',
            arrangementId: a.id,
            trackId: a.tracks[0]!.id,
          },
        },
      })
    ).ok(),
  ).toBe(true);
  return { source, url };
}
async function open(page: Page, id: string, title: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Songs', exact: true }).click();
  await page
    .locator(`article[data-song-id="${id}"]`)
    .getByRole('button', { name: title, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.locator('.save')).toContainText('Opgeslagen');
}
async function cleanup(request: APIRequestContext, ids: string[]) {
  for (const id of ids) {
    const rows = await (await request.get('/api/v1/songs')).json();
    const row = rows.find((r: { song: { id: string } }) => r.song.id === id);
    if (row)
      await request.delete(`/api/v1/songs/${id}?revision=${row.revision}`);
  }
}
test('converted legacy editor saves, undo/redo and complete multi-track JSON transfer preserve hidden tracks and links', async ({
  page,
  request,
}) => {
  const { source, url } = await setup(request),
    ids = [source.id],
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    let record = await canonical(request, source.id);
    const a = record.document.arrangements[0]!,
      extra = a.tracks[1]!,
      word = record.document.lyrics[0]!.lines[0]!.tokens.find(
        (w) => w.text === 'water',
      )!,
      now = new Date().toISOString();
    record.document.arrangements[0]!.tracks[1]!.visible = false;
    record.document.arrangements[0]!.tracks[1]!.collapsed = true;
    record.document.arrangements[0]!.lyricsLinks.push({
      id: uid(),
      syllableId: word.syllables[0]!.id,
      trackId: extra.id,
      eventIds: [extra.events[0]!.id, extra.events[3]!.id],
      sustain: true,
      createdAt: now,
      updatedAt: now,
    });
    expect(
      (
        await request.put(url, {
          data: { revision: record.revision, document: record.document },
        })
      ).ok(),
    ).toBe(true);
    const hidden = structuredClone(record.document.arrangements[0]!.tracks[1]);
    await open(page, source.id, source.title);
    await page
      .getByRole('button', { name: 'Lyrics bewerken', exact: true })
      .click();
    await page
      .getByLabel('Sectietekst')
      .fill('la la water\nEen eigen regel plus');
    await page
      .getByRole('button', { name: 'Lyrics opslaan', exact: true })
      .click();
    await expect
      .poll(async () =>
        (await canonical(request, source.id)).document.lyrics[0]!.lines.map(
          (l) => l.tokens.map((t) => t.text).join(''),
        ).join('\n'),
      )
      .toContain('plus');
    await page.locator('.tabcell[data-active=true]').focus();
    await page.keyboard.press('4');
    await expect
      .poll(async () =>
        (
          await canonical(request, source.id)
        ).document.arrangements[0]!.tracks[0]!.events[0]!.tones.some(
          (t) => t.position?.string === 1 && t.position.fret === 4,
        ),
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('.save')).toContainText('Opgeslagen');
    record = await canonical(request, source.id);
    expect(record.document.arrangements[0]!.tracks[1]).toEqual(hidden);
    expect(record.document.arrangements[0]!.lyricsLinks[0]!.eventIds).toEqual([
      extra.events[0]!.id,
      extra.events[3]!.id,
    ]);
    await page.reload();
    await page.getByRole('button', { name: 'Songs', exact: true }).click();
    await page
      .locator(`article[data-song-id="${source.id}"]`)
      .getByRole('button', { name: source.title, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: source.title, exact: true }),
    ).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'JSON exporteren', exact: true })
      .click();
    const file = (await downloadPromise).path();
    const path = await file;
    expect(path).toBeTruthy();
    const exported = JSON.parse(await readFile(path!, 'utf8'));
    expect(exported.version).toBe(2);
    expect(exported.song.arrangements[0].tracks).toHaveLength(2);
    expect(exported.song.arrangements[0].lyricsLinks).toHaveLength(1);
    await page.locator('input[type=file][hidden]').setInputFiles(path!);
    await expect(
      page.getByRole('heading', {
        name: source.title + ' · kopie',
        exact: true,
      }),
    ).toBeVisible();
    const rows = await (await request.get('/api/v1/songs')).json(),
      copy = rows.find(
        (r: { song: { title: string } }) =>
          r.song.title === source.title + ' · kopie',
      );
    ids.push(copy.song.id);
    const cloned = (await canonical(request, copy.song.id)).document;
    expect(cloned.arrangements[0]!.tracks).toHaveLength(2);
    expect(cloned.arrangements[0]!.tracks[1]!.id).not.toBe(extra.id);
    expect(
      cloned.arrangements[0]!.lyricsLinks[0]!.eventIds.every((id) =>
        cloned.arrangements[0]!.tracks[1]!.events.some((e) => e.id === id),
      ),
    ).toBe(true);
    await open(page, source.id, source.title);
    const protectedState = await canonical(request, source.id);
    await page
      .getByRole('button', { name: 'Lyrics bewerken', exact: true })
      .click();
    await page
      .getByLabel('Sectietekst')
      .fill('Een vervangende regel zonder gekoppeld woord');
    await page
      .getByRole('button', { name: 'Lyrics opslaan', exact: true })
      .click();
    await expect(page.locator('.save')).toContainText('Niet opgeslagen');
    expect((await canonical(request, source.id)).document).toEqual(
      protectedState.document,
    );
    const recoveryDownload = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'JSON exporteren', exact: true })
      .click();
    const recoveryPath = await (await recoveryDownload).path();
    const recovery = JSON.parse(await readFile(recoveryPath!, 'utf8'));
    expect(recovery.format).toBe('guitar-studio-recovery');
    expect(recovery.canonicalBase.arrangements[0].tracks[1]).toEqual(hidden);
    expect(recovery.canonicalBase.arrangements[0].lyricsLinks).toHaveLength(1);
    expect(
      recovery.legacyDraft.lyrics[0].tokens
        .map((t: { text: string }) => t.text)
        .join(''),
    ).toContain('Een vervangende regel');
    expect(errors).toEqual([]);
  } finally {
    await cleanup(request, ids);
  }
});
for (const [index, viewport] of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
].entries())
  test(
    'converted Workspace compatibility, themes, keyboard and axe ' +
      viewport.width,
    async ({ page, request, browser }) => {
      test.setTimeout(180000);
      await page.setViewportSize(viewport);
      const { source } = await setup(request, index);
      const evidence: object[] = [];
      await mkdir(output, { recursive: true });
      try {
        for (const theme of ['dark', 'light']) {
          await open(page, source.id, source.title);
          if ((await page.locator('html').getAttribute('data-theme')) !== theme)
            await page
              .getByRole('button', { name: 'Thema wisselen', exact: true })
              .click();
          await expect(
            page.getByLabel('Arrangement', { exact: true }),
          ).toBeVisible();
          if (viewport.width === 390)
            await page
              .locator('.mobiletabs')
              .getByRole('button', { name: 'Tablatuur', exact: true })
              .click();
          await page.locator('.tabcell[data-active=true]').focus();
          await page.keyboard.press('ArrowRight');
          await expect(
            page.locator('.tabcell[data-active=true]'),
          ).toBeFocused();
          const scan = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
          evidence.push({ theme, viewport, violations: scan.violations });
          expect(scan.violations).toEqual([]);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: `${output}/${viewport.width}-${theme}-legacy-converted.jpg`,
            fullPage: true,
            animations: 'disabled',
            timeout: 45000,
          });
        }
        expect(
          (await canonical(request, source.id)).document.arrangements[0]!
            .tracks,
        ).toHaveLength(2);
        await writeFile(
          `${output}/${viewport.width}-axe.json`,
          JSON.stringify({ browser: browser.version(), evidence }, null, 2),
        );
      } finally {
        await cleanup(request, [source.id]);
      }
    },
  );
