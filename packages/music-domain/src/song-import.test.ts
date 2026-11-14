import { describe, expect, it } from 'vitest';
import { parseSongImport, recognizeChord } from './song-import.js';
import { parseLrc, parseLyricsfile } from './lyrics-sync.js';
import { importToSong, mergeImport } from './import-to-song.js';
import { newSong, sectionText } from './workspace.js';
export const ownTab = [
  'e|--0-10--|--12---|',
  'B|--1-----|--13---|',
  'G|--------|-------|',
  'D|--------|-------|',
  'A|--------|-------|',
  'E|--------|-------|',
].join('\n');
describe('loss-aware user import', () => {
  it('preserves original Unicode, CRLF, blank lines and repetition text with metadata/sections', () => {
    const text =
      'Titel: Één lied\r\nArtiest: Zoë\r\n[Refrein]\r\nHé wereld\r\n\r\nHé wereld x2';
    const d = parseSongImport({ text });
    expect(d.rawText).toBe(text);
    expect(d.title).toBe('Één lied');
    expect(d.artist).toBe('Zoë');
    expect(d.sections[0]!.lines).toEqual(['Hé wereld', '', 'Hé wereld x2']);
    expect(sectionText(importToSong(d).lyrics[0]!)).toBe(
      'Hé wereld\n\nHé wereld x2',
    );
  });
  it('recognizes transposeable accidentals/slash chords without inventing fingerings', () => {
    expect(recognizeChord('F#m7/C#')).toMatchObject({
      root: 6,
      bass: 1,
      grip: null,
    });
    expect(recognizeChord('hello')).toBeNull();
    const d = parseSongImport({
      title: 'Own',
      text: 'Am    C\nHello world\n[Dm]mid[G]word',
    });
    expect(
      d.sections[0]!.chords.map((c) => [c.symbol, c.line, c.column]),
    ).toEqual([
      ['Am', 0, 0],
      ['C', 0, 6],
      ['Dm', 1, 0],
      ['G', 1, 3],
    ]);
    expect(d.sections[0]!.lines).toEqual(['Hello world', 'midword']);
    expect(importToSong(d).arrangements[0]!.sections[0]!.chords).toHaveLength(
      3,
    );
  });
  it('handles ChordPro aliases, sections, metadata and keeps unknown/invalid directives', () => {
    const d = parseSongImport({
      text: '{t: My own}\n{artist: Me}\n{key: Am}\n{tempo: 96}\n{time: 6/8}\n{capo: 2}\n{soc}\n[Am]Words\n{eoc}\n{unknown: retain}\n{tempo: 999}',
    });
    expect(d.title).toBe('My own');
    expect(d.metadata).toMatchObject({
      key: 'Am',
      bpm: 96,
      meter: { beats: 6, beatUnit: 8 },
      capo: 2,
    });
    expect(d.sections[0]!.name).toBe('Refrein');
    expect(d.unrecognized).toHaveLength(2);
    expect(d.rawText).toContain('{unknown: retain}');
  });
  it('parses simultaneous open/double-digit frets, multiple blocks and bar columns without timing', () => {
    const d = parseSongImport({
      title: 'Tab',
      text: ownTab + '\n\n' + ownTab,
      format: 'ascii',
    });
    expect(d.tabBlocks).toHaveLength(2);
    expect(d.tabBlocks[0]!.notes.map((n) => n.fret)).toEqual([
      0, 10, 12, 1, 13,
    ]);
    expect(d.tabBlocks[0]!.notes[0]!.column).toBe(
      d.tabBlocks[0]!.notes[3]!.column,
    );
    expect(d.tabBlocks[0]!.barColumns).toEqual([8, 16]);
    expect(d.tabBlocks[0]!.rhythmicUncertainty).toBe(true);
    expect(
      importToSong(d).arrangements[0]!.sections[0]!.measures[0]!.events,
    ).toEqual([]);
  });
  it('preserves techniques and ambiguous rests/repeats, requires correction for fret/order/alignment', () => {
    const d = parseSongImport({
      title: 'T',
      text: ownTab.replace('--0-10--', '0h2/3~~~'),
    });
    expect(d.unrecognized.length).toBeGreaterThan(0);
    expect(
      parseSongImport({ text: ownTab + '\nB|--------|-------|' }).status,
    ).toBe('correction-required');
    expect(d.warnings.join()).toContain('Techniek');
    expect(parseSongImport({ text: ownTab.replace('10', '25') }).status).toBe(
      'correction-required',
    );
    expect(
      parseSongImport({ text: ownTab.replace('B|', 'E|'), format: 'ascii' })
        .status,
    ).toBe('invalid');
    expect(
      parseSongImport({
        text: ownTab.replace('--1-----', '--1----'),
        format: 'ascii',
      }).status,
    ).toBe('correction-required');
  });
  it('appends only new entities and preserves original arrangements, rejects conflicting metadata', () => {
    const song = newSong('Existing', '', 'Original'),
      before = structuredClone(song.arrangements),
      incoming = importToSong(
        parseSongImport({ title: 'New', text: '[Am]Own' }),
      );
    expect(mergeImport(song, incoming).arrangements[0]).toEqual(before[0]);
    expect(song.arrangements).toEqual(before);
    expect(
      mergeImport(song, incoming, song.arrangements[0]!.id).arrangements[0]!
        .sections,
    ).toHaveLength(2);
    incoming.importDocuments![0]!.metadata.bpm = 120;
    expect(() =>
      mergeImport(song, incoming, song.arrangements[0]!.id),
    ).toThrow();
  });
  it('rejects binary, overlarge and malformed input contracts', () => {
    for (const text of ['x\0y', 'x'.repeat(60001)])
      expect(() => parseSongImport({ text })).toThrow();
    expect(() =>
      parseSongImport({ text: 'x', source: { origin: 'external' } }),
    ).toThrow();
  });
});
describe('real-time lyrics synchronization remains separate from musical events', () => {
  it('keeps repeated stamps, fractions, blank/unmarked/invalid lines and original LRC', () => {
    const raw = '[01:02.3][01:03.045]Hé\n\n[00:99]bad\nNo stamp';
    const p = parseLrc(raw);
    expect(p.synchronization.lines.map((l) => l.startMs)).toEqual([
      62300,
      63045,
      null,
      null,
      null,
    ]);
    expect(p.synchronization.rawLrc).toBe(raw);
    expect(p.warnings).toHaveLength(2);
  });
  it('safely parses Lyricsfile word timing without inferred end times', () => {
    const raw =
      "version: '1.0'\nmetadata: {title: Own, artist: Me}\nlines:\n  - text: 'Hello world'\n    start_ms: 1200\n    words:\n      - {text: 'Hello ', start_ms: 1200, end_ms: 1900}\n      - {text: world, start_ms: 1900}\n";
    const p = parseLyricsfile(raw, true);
    expect(p.synchronization.kind).toBe('word');
    expect(p.synchronization.lines[0]!.words[1]!.endMs).toBeNull();
    expect(p.synchronization.rawLyricsfile).toBe(raw);
  });
  it.each([
    "version: '1.0'\nmetadata: &x {title: T, artist: A}\nplain: *x",
    "version: '1.0'\nversion: '1.0'",
    '!!js/function bad',
    "version: '9.0'\nmetadata: {title: T, artist: A}",
    "version: '1.0'\nmetadata: {title: T, artist: A}\nlines: [{text: x, start_ms: 20, end_ms: 10}]",
    "version: '1.0'\nmetadata: {title: T, artist: A}\nlines: [{text: x, start_ms: 20, words: [{text: y, start_ms: 20}]}]",
  ])('rejects unsafe/invalid YAML: %s', (raw) => {
    expect(() => parseLyricsfile(raw, true)).toThrow();
  });
});
