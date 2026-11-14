import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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
        (await request.post('/api/v1/songs', { data: song })).ok(),
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
      async function mobile(name: string) {
        if (viewport.width === 390)
          await page.getByRole('button', { name, exact: true }).last().click();
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
          await audit('workspace', theme);
          await mobile('Lyrics');
          await page
            .getByRole('button', { name: 'Lyrics bewerken', exact: true })
            .click();
          await audit('lyrics', theme);
          await closeDialog();
          await page
            .getByRole('button', { name: 'Langs', exact: true })
            .click();
          await page
            .getByRole('button', { name: '+ Akkoord', exact: true })
            .click();
          await audit('chord', theme);
          await closeDialog();
          await mobile('Tablatuur');
          const active = page.locator('.tabcell[data-active=true]');
          await page.keyboard.press('Tab');
          await active.focus();
          await expect(active).toBeFocused();
          expect(
            await active.evaluate((el) => getComputedStyle(el).outlineStyle),
          ).toBe('solid');
          await page.keyboard.press('3');
          await expect(active).toHaveText('3');
          await audit('tab', theme);
          await mobile('Gitaarhals');
          const fret = page.getByRole('button', {
            name: /^Hals snaar 1, fret 3,/,
          });
          await fret.focus();
          await page.keyboard.press('ArrowRight');
          await expect(
            page.getByRole('button', { name: /^Hals snaar 1, fret 4,/ }),
          ).toBeFocused();
          await audit('fretboard', theme);
          await page
            .getByRole('button', { name: '▷ Oefenen', exact: true })
            .click();
          await audit('practice', theme);
          await page
            .getByRole('button', { name: '← Terug naar editor', exact: true })
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

test('split keyboard and pointer retain panels, dialog focus and internal fret scroll', async ({
  page,
  request,
}) => {
  const song = newSong(
    'Split and scroll acceptance',
    'Eigen werk',
    'Langs het water',
  );
  expect(
    (await request.post('/api/v1/songs', { data: song })).ok(),
  ).toBeTruthy();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Songs', exact: true }).click();
    await page.getByRole('button', { name: song.title, exact: true }).click();
    const splitter = page.getByRole('separator', { name: 'Paneelbreedte' });
    await splitter.focus();
    await page.keyboard.press('ArrowRight');
    await expect(splitter).toHaveAttribute('aria-valuenow', '45');
    await page.keyboard.press('ArrowLeft');
    await expect(splitter).toHaveAttribute('aria-valuenow', '42');
    const box = await splitter.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 30);
    await page.mouse.down();
    await page.mouse.move(box!.x + 50, box!.y + 30);
    await page.mouse.up();
    const split = await splitter.getAttribute('aria-valuenow');
    expect(Number(split)).toBeGreaterThan(42);
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
        .getByRole('button', { name: 'Opslaan', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Songgegevens', exact: true }),
    ).toBeFocused();
    expect(await scroll.evaluate((el) => el.scrollLeft)).toBe(before);
    await expect(splitter).toHaveAttribute('aria-valuenow', split!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Gitaarhals', exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
    for (const name of ['Lyrics', 'Tablatuur', 'Gitaarhals'])
      await expect(
        page.getByRole('button', { name, exact: true }).last(),
      ).toHaveCSS('min-height', '44px');
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
