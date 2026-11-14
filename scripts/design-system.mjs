import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { format } from 'prettier';
const root = new URL('../', import.meta.url);
const base = new URL('apps/web/src/design-system/', root);
const tokens = JSON.parse(await readFile(new URL('tokens.json', base), 'utf8'));
const css =
  '@layer tokens { :root { color-scheme:dark;' +
  Object.entries(tokens)
    .map(([key, v]) => key + ':' + (v.dark ?? v.value) + ';')
    .join('') +
  '} :root[data-theme="light"] { color-scheme:light;' +
  Object.entries(tokens)
    .filter(([, v]) => v.light)
    .map(([key, v]) => key + ':' + v.light + ';')
    .join('') +
  '} }';
const generated = await format(css, { parser: 'css', singleQuote: true });
if (process.argv.includes('--write'))
  await writeFile(new URL('gs.tokens.css', base), generated);
assert.equal(
  await readFile(new URL('gs.tokens.css', base), 'utf8'),
  generated,
  'Regenerate with npm run design:tokens',
);
for (const name of await readdir(base))
  if (name.endsWith('.css') && name !== 'gs.tokens.css') {
    const text = await readFile(new URL(name, base), 'utf8');
    assert.ok(
      !/#[\da-f]{3,8}\b/i.test(text),
      'Color outside token registry: ' + name,
    );
    assert.ok(!text.includes('body.light'), 'Competing theme selector');
  }
const assetBase = new URL('apps/web/public/brand/', root);
const manifest = JSON.parse(
  await readFile(new URL('asset-manifest.json', assetBase), 'utf8'),
);
for (const [name, hash] of Object.entries(manifest))
  assert.equal(
    createHash('sha256')
      .update(await readFile(new URL(name, assetBase)))
      .digest('hex'),
    hash,
    name,
  );
const luminance = (hex) => {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)
    .map((n) => parseInt(n, 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const cases = JSON.parse(
  await readFile(new URL('scripts/design-contrast-cases.json', root), 'utf8'),
);
for (const { theme, foreground, background, minimum } of cases) {
  const a = luminance(tokens['--color-' + foreground][theme]),
    b = luminance(tokens['--color-' + background][theme]);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  assert.ok(ratio >= minimum, `${theme} ${foreground}/${background}: ${ratio}`);
}
console.log(
  `PASS: token generation, ${Object.keys(manifest).length} asset hashes, ${cases.length} contrast pairs and color centralization`,
);
