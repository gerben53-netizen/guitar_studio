import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fromPrototype } from './prototype-import';
it('migrates original prototype data without losing notes, arrangements or shared text', () => {
  const data = JSON.parse(
    readFileSync(
      new URL(
        '../../../apps/api/fixtures/prototype-demo-songs.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  for (const value of data) {
    const song = fromPrototype(value);
    const oldCount = value.arrangements
      .flatMap((a: { sections: { bars: { notes: object }[][] }[] }) =>
        a.sections.flatMap((s) => s.bars.flat()),
      )
      .reduce(
        (n: number, e: { notes: object }) => n + Object.keys(e.notes).length,
        0,
      );
    const newCount = song.arrangements
      .flatMap((a) =>
        a.sections.flatMap((s) => s.measures.flatMap((m) => m.events)),
      )
      .reduce((n, e) => n + e.tones.length, 0);
    expect(newCount).toBe(oldCount);
    expect(song.arrangements).toHaveLength(value.arrangements.length);
    expect(song.lyrics.length).toBeGreaterThan(0);
  }
});
