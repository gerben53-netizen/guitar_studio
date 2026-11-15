import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { toMultitrack } from '../packages/music-domain/src/multitrack';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  newSong,
  type SongRecord,
} from '../packages/music-domain/src/workspace';
const output =
  process.env.DESIGN_EVIDENCE_DIR ?? 'test-results/sprint-2b-design';
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(
    'v2 themes, landmarks, keyboard, axe and visual screens ' + viewport.width,
    async ({ page, request, browser }) => {
      test.setTimeout(240000);
      await page.setViewportSize(viewport);
      const song = newSong(
        'Design acceptance ' + viewport.width,
        'Eigen werk',
        '[Couplet]\nLangs het water klinkt mijn lied',
      );
      expect(
        (
          await request.post('/api/v1/songs', { data: toMultitrack(song) })
        ).ok(),
      ).toBeTruthy();
      const evidence: object[] = [];
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await mkdir(output, { recursive: true });
      async function audit(name: string, theme: string) {
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        evidence.push({
          name,
          theme,
          viewport,
          violations: results.violations,
        });
        await writeFile(
          output + '/' + viewport.width + '-axe.json',
          JSON.stringify(evidence, null, 2),
        );
        expect(results.violations, name + ' ' + theme).toEqual([]);
        await page.screenshot({
          path:
            output + '/' + viewport.width + '-' + theme + '-' + name + '.jpg',
          type: 'jpeg',
          quality: 80,
          fullPage: true,
        });
      }
      async function closeDialog() {
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).not.toBeVisible();
      }
      try {
        for (const theme of ['dark', 'light']) {
          await page.goto('/');
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          const current = await page.locator('html').getAttribute('data-theme');
          if (current !== theme)
            await page.getByRole('button', { name: 'Thema wisselen' }).click();
          await page.reload();
          await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            theme,
          );
          await expect(page.getByRole('banner')).toHaveCount(1);
          await expect(page.getByRole('main')).toHaveCount(1);
          await expect(
            page.getByRole('navigation', { name: 'Hoofdnavigatie' }),
          ).toHaveCount(1);
          await expect(page.locator('body')).not.toHaveClass(/light/);
          const colors = await page.evaluate(() => ({
            bg: getComputedStyle(document.body).backgroundColor,
            theme: localStorage.getItem('theme'),
            plate: getComputedStyle(document.querySelector('.gs-brand')!)
              .backgroundColor,
          }));
          expect(colors).toEqual({
            bg: theme === 'dark' ? 'rgb(6, 19, 33)' : 'rgb(237, 244, 249)',
            theme,
            plate: 'rgb(6, 19, 33)',
          });
          await audit('dashboard', theme);
          await page
            .getByRole('button', { name: 'Nieuwe song', exact: true })
            .click();
          await expect(page.getByRole('dialog')).toHaveAccessibleName(
            'Een nieuwe song',
          );
          await page.keyboard.press('Shift+Tab');
          expect(
            await page.evaluate(
              () => !!document.activeElement?.closest('dialog'),
            ),
          ).toBe(true);
          await audit('import', theme);
          await closeDialog();
          await expect(
            page.getByRole('button', { name: 'Nieuwe song', exact: true }),
          ).toBeFocused();
          await page
            .getByRole('button', { name: 'Songs', exact: true })
            .click();
          await audit('library', theme);
          await page
            .getByRole('button', { name: song.title, exact: true })
            .click();
          await expect(page.locator('.gs-workspace-v3')).toBeVisible();
          await audit('workspace', theme);
          await page
            .getByRole('button', { name: 'Tekst bewerken', exact: true })
            .click();
          await audit('lyrics', theme);
          await closeDialog();
          await page
            .getByRole('button', { name: 'Langs', exact: true })
            .click();
          await page
            .getByRole('button', { name: 'Akkoord plaatsen', exact: true })
            .click();
          await audit('chord', theme);
          await closeDialog();
          const active = page.locator('.tab-position[data-active=true]');
          await page.keyboard.press('Tab');
          await active.focus();
          await expect(active).toBeFocused();
          expect(
            await active.evaluate((el) => getComputedStyle(el).outlineStyle),
          ).toBe('solid');
          await page.keyboard.press('3');
          await page.keyboard.press('Enter');
          await expect(active).toHaveText('3');
          await audit('tab', theme);
          const fret = page.getByRole('button', {
            name: /^Hals snaar 1, fysieke fret 3,/,
          });
          await fret.focus();
          await page.keyboard.press('ArrowRight');
          await expect(
            page.getByRole('button', {
              name: /^Hals snaar 1, fysieke fret 4,/,
            }),
          ).toBeFocused();
          await audit('fretboard', theme);
          await page
            .getByRole('button', { name: '▷ Oefenen', exact: true })
            .click();
          await audit('practice', theme);
          await page
            .getByRole('button', { name: 'Terug naar editor', exact: true })
            .click();
          await expect(page.locator('.save')).toContainText('Opgeslagen');
        }
        expect(errors).toEqual([]);
        await writeFile(
          output + '/' + viewport.width + '-environment.json',
          JSON.stringify(
            {
              browser: browser.version(),
              channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
              viewport,
              errors,
            },
            null,
            2,
          ),
        );
      } finally {
        const rows = (await (
          await request.get('/api/v1/songs')
        ).json()) as SongRecord[];
        const record = rows.find((r) => r.song.id === song.id);
        if (record)
          await request.delete(
            '/api/v1/songs/' + song.id + '?revision=' + record.revision,
          );
      }
    },
  );
}

test('full-width score retains panels, dialog focus and internal fret scroll', async ({
  page,
  request,
}) => {
  const song = newSong(
    'Split and scroll acceptance',
    'Eigen werk',
    'Langs het water',
  );
  expect(
    (await request.post('/api/v1/songs', { data: toMultitrack(song) })).ok(),
  ).toBeTruthy();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Songs', exact: true }).click();
    await page.getByRole('button', { name: song.title, exact: true }).click();
    await expect(page.locator('.gs-workspace-v3')).toBeVisible();
    await expect(
      page.getByRole('separator', { name: 'Paneelbreedte' }),
    ).toHaveCount(0);
    const scroll = page.locator('.fret-scroll');
    await scroll.evaluate((el) => {
      el.scrollLeft = 300;
    });
    const before = await scroll.evaluate((el) => el.scrollLeft);
    expect(before).toBeGreaterThan(0);
    await page
      .getByRole('button', { name: 'Songgegevens', exact: true })
      .click();
    const first = page
      .getByRole('dialog')
      .getByRole('button', { name: 'Sluiten', exact: true });
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(
      page
        .getByRole('dialog')
        .getByRole('button', { name: 'Gegevens opslaan', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Songgegevens', exact: true }),
    ).toBeFocused();
    expect(await scroll.evaluate((el) => el.scrollLeft)).toBe(before);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
  } finally {
    const rows = (await (
      await request.get('/api/v1/songs')
    ).json()) as SongRecord[];
    const record = rows.find((r) => r.song.id === song.id);
    if (record)
      await request.delete(
        '/api/v1/songs/' + song.id + '?revision=' + record.revision,
      );
  }
});
