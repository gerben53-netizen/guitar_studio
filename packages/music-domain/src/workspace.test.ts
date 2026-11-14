import { expect, it } from 'vitest';
import {
  newSong,
  editLyrics,
  sectionText,
  presets,
  uid,
  SongSchema,
  fraction,
  putTone,
  cloneArrangement,
  cloneSong,
  ExportSchema,
  retune,
  parseLyrics,
} from './workspace';
it('preserves chord IDs through insertion and spelling edits, flags ambiguous anchors without deletion', () => {
  const s = newSong('Own', 'Player', 'The morning light\nA quiet song');
  const lyrics = s.lyrics[0]!,
    section = s.arrangements[0]!.sections[0]!;
  const token = lyrics.tokens.find((t) => t.text === 'light')!;
  section.chords.push({
    id: uid(),
    tokenId: token.id,
    originalText: 'light',
    grip: presets[0]!,
    measureId: section.measures[0]!.id,
  });
  editLyrics(s, lyrics.id, 'The warm morning light\nA quite song');
  expect(section.chords[0]!.tokenId).toBe(token.id);
  expect(sectionText(lyrics)).toContain('warm');
  editLyrics(s, lyrics.id, 'The warm morning\nA quite song');
  expect(section.chords).toHaveLength(1);
  expect(section.chords[0]!.tokenId).toBeNull();
  expect(SongSchema.safeParse(s).success).toBe(true);
});
it('does not create sections on blank lines and supports a song without lyrics', () => {
  expect(parseLyrics('one\n\ntwo')).toHaveLength(1);
  expect(parseLyrics('[Verse]\none\n[Chorus]\ntwo')).toHaveLength(2);
  expect(SongSchema.safeParse(newSong('Untitled', '', '')).success).toBe(true);
});
it('supports 6/8, sixteenths, triplets and simultaneous notes with measure bounds', () => {
  const s = newSong('Timing', '', ''),
    a = s.arrangements[0]!,
    m = a.sections[0]!.measures[0]!;
  m.timeSignature = { beats: 6, beatUnit: 8 };
  putTone(a, m, fraction(0, 1), fraction(1, 16), 1, 3);
  putTone(a, m, fraction(0, 1), fraction(1, 16), 2, 1);
  putTone(a, m, fraction(1, 12), fraction(1, 12), 3, 0);
  expect(m.events[0]!.tones).toHaveLength(2);
  expect(() => putTone(a, m, fraction(11, 16), fraction(1, 8), 4, 0)).toThrow();
});
it('clones arrangements with independent events and chord references and validates JSON version', () => {
  const s = newSong('Clone', '', 'word'),
    a = s.arrangements[0]!,
    m = a.sections[0]!.measures[0]!;
  putTone(a, m, fraction(0, 1), fraction(1, 8), 1, 3);
  a.sections[0]!.chords.push({
    id: uid(),
    tokenId: s.lyrics[0]!.tokens[0]!.id,
    originalText: 'word',
    grip: presets[0]!,
    measureId: m.id,
  });
  const b = cloneArrangement(a);
  s.arrangements.push(b);
  b.sections[0]!.measures[0]!.events[0]!.tones[0]!.position!.fret = 4;
  b.sections[0]!.measures[0]!.events[0]!.tones[0]!.pitch++;
  expect(m.events[0]!.tones[0]!.position!.fret).toBe(3);
  expect(SongSchema.safeParse(s).success).toBe(true);
  expect(
    ExportSchema.parse({
      format: 'guitar-studio',
      version: 1,
      song: cloneSong(s),
    }).song.arrangements,
  ).toHaveLength(2);
  expect(() =>
    ExportSchema.parse({ format: 'guitar-studio', version: 2, song: s }),
  ).toThrow();
});
it('preserves absolute frets when retuning and refuses notes below a capo', () => {
  const s = newSong('Tuning', '', ''),
    a = s.arrangements[0]!,
    m = a.sections[0]!.measures[0]!;
  putTone(a, m, fraction(0, 1), fraction(1, 8), 6, 3);
  retune(a, {
    ...a.instrument,
    tuning: { name: 'Drop D', pitches: [64, 59, 55, 50, 45, 38] },
    capo: 2,
  });
  expect(m.events[0]!.tones[0]!.position!.fret).toBe(3);
  expect(m.events[0]!.tones[0]!.pitch).toBe(41);
  expect(() => retune(a, { ...a.instrument, capo: 4 })).toThrow();
});
it('rejects corrupt references, collisions, unsupported profiles and duplicate IDs', () => {
  expect(
    SongSchema.safeParse({
      ...newSong('Strict', '', ''),
      unknownExtension: 'must not be silently discarded',
    }).success,
  ).toBe(false);
  const s = newSong('Validation', '', 'text');
  s.arrangements[0]!.sections[0]!.lyricsSectionId = 'missing';
  expect(SongSchema.safeParse(s).success).toBe(false);
  const good = newSong('Validation', '', 'text');
  good.arrangements.push(structuredClone(good.arrangements[0]!));
  expect(SongSchema.safeParse(good).success).toBe(false);
});
it('checks every supported duration against each explicit meter without quantization', () => {
  for (const meter of [
    { beats: 2, beatUnit: 4 as const },
    { beats: 3, beatUnit: 4 as const },
    { beats: 4, beatUnit: 4 as const },
    { beats: 6, beatUnit: 8 as const },
  ])
    for (const denominator of [1, 2, 4, 8, 16, 12]) {
      const song = newSong('Duration', '', ''),
        a = song.arrangements[0]!,
        m = a.sections[0]!.measures[0]!;
      m.timeSignature = meter;
      const write = () =>
        putTone(a, m, fraction(0, 1), fraction(1, denominator), 1, 0);
      if (1 / denominator <= meter.beats / meter.beatUnit)
        expect(write).not.toThrow();
      else expect(write).toThrow();
    }
});
