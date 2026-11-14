import { describe, it, expect } from 'vitest';
import { legacyFixture } from '../test-support/multitrack-fixtures.js';
import { uid, fraction, pitchName } from './workspace.js';
import {
  MultitrackSongSchema,
  toMultitrack,
  toLegacy,
  mergeLegacyWrite,
  cloneMultitrackSong,
  timeline,
} from './multitrack.js';
import {
  applyMultitrackMutation,
  emptyTrack,
  positionalEvents,
  groupedEvents,
  applyLyricsEdit,
  planLyricsEdit,
  splitWord,
  moveWord,
  attachImportTrack,
  physicalPitch,
} from './multitrack-operations.js';
import { parseSongImport } from './song-import.js';
import { sourceSnapshot, resolveOrigin } from './practice-origin.js';
function fixture() {
  const song = toMultitrack(legacyFixture(2)),
    a = song.arrangements[0]!,
    t = a.tracks[0]!,
    word = song.lyrics[0]!.lines[0]!.tokens.find((t) => t.text === 'water')!;
  const now = new Date().toISOString();
  a.lyricsLinks.push({
    id: uid(),
    syllableId: word.syllables[0]!.id,
    trackId: t.id,
    eventIds: [t.events[0]!.id, t.events[3]!.id],
    sustain: true,
    createdAt: now,
    updatedAt: now,
  });
  return { song: MultitrackSongSchema.parse(song), a, t, word };
}
describe('versioned multi-track domain and legacy adapters', () => {
  it.each([0, 1, 2, 3, 4, 5])(
    'losslessly round-trips representative legacy fixture %i, deterministic conversion and no source mutation',
    (i) => {
      const legacy = legacyFixture(i),
        before = structuredClone(legacy),
        song = toMultitrack(legacy);
      expect(song.schemaVersion).toBe(2);
      expect(toLegacy(song)).toEqual(legacy);
      expect(toMultitrack(legacy)).toEqual(song);
      expect(toMultitrack(song)).toEqual(song);
      expect(legacy).toEqual(before);
      expect(song.arrangements.every((a) => a.tracks.length === 1)).toBe(true);
    },
  );
  it('keeps independent simultaneous events and chord tones, rests/durations/techniques through position adapter', () => {
    const song = legacyFixture();
    for (const a of song.arrangements)
      for (const s of a.sections)
        for (const m of s.measures) {
          const expanded = m.events.flatMap(positionalEvents);
          expect(groupedEvents(expanded)).toEqual(m.events);
          expect(
            expanded.filter(
              (e) => e.kind === 'note' && e.start.numerator === 0,
            ),
          ).toHaveLength(3);
        }
    const e = song.arrangements[0]!.sections[0]!.measures[0]!.events[0]!;
    expect(() => groupedEvents(positionalEvents(e).slice(1))).toThrow();
  });
  it('clones all song, track, word, syllable and event references without sharing identities', () => {
    const { song } = fixture();
    const copy = cloneMultitrackSong(song);
    expect(copy.id).not.toBe(song.id);
    expect(copy.arrangements[0]!.tracks[0]!.id).not.toBe(
      song.arrangements[0]!.tracks[0]!.id,
    );
    expect(copy.lyrics[0]!.lines[0]!.tokens[0]!.id).not.toBe(
      song.lyrics[0]!.lines[0]!.tokens[0]!.id,
    );
    expect(
      copy.arrangements[0]!.lyricsLinks[0]!.eventIds.every((id) =>
        copy.arrangements[0]!.tracks[0]!.events.some((e) => e.id === id),
      ),
    ).toBe(true);
    expect(MultitrackSongSchema.safeParse(copy).success).toBe(true);
  });
  it('refuses unsupported legacy frets without modifying or truncating the source', () => {
    const legacy = legacyFixture(),
      a = legacy.arrangements[0]!;
    a.instrument.maxFret = 36;
    const tone = a.sections[0]!.measures[0]!.events[0]!.tones[0]!;
    tone.position!.fret = 25;
    tone.pitch = a.instrument.tuning.pitches[tone.position!.string - 1]! + 25;
    const before = structuredClone(legacy);
    expect(() => toMultitrack(legacy)).toThrow();
    expect(legacy).toEqual(before);
  });
  it('normalizes unreduced legacy fractions without changing musical value', () => {
    const old = legacyFixture();
    old.arrangements[0]!.sections[0]!.measures[0]!.events[0]!.duration = {
      numerator: 2,
      denominator: 16,
    };
    const converted = toMultitrack(old);
    expect(converted.arrangements[0]!.tracks[0]!.events[0]!.duration).toEqual(
      fraction(1, 8),
    );
    expect(
      old.arrangements[0]!.sections[0]!.measures[0]!.events[0]!.duration
        .numerator,
    ).toBe(2);
  });
  it('adds, updates, reorders, selects, hides and collapses independent tracks without content loss', () => {
    const { song: originalSong, a, t } = fixture();
    let song = originalSong;
    const extra = emptyTrack(song, a.id, 'Tweede gitaar', 'second_guitar');
    song = applyMultitrackMutation(song, {
      op: 'add-track',
      arrangementId: a.id,
      track: extra,
    });
    song = applyMultitrackMutation(song, {
      op: 'update-track',
      arrangementId: a.id,
      trackId: extra.id,
      patch: { name: 'Nieuwe naam', visible: false, collapsed: true },
    });
    song = applyMultitrackMutation(song, {
      op: 'reorder-tracks',
      arrangementId: a.id,
      trackIds: [extra.id, t.id],
    });
    song = applyMultitrackMutation(song, {
      op: 'select-track',
      arrangementId: a.id,
      trackId: extra.id,
    });
    const updated = song.arrangements[0]!;
    expect(updated.activeTrackId).toBe(extra.id);
    expect(updated.tracks.find((x) => x.id === t.id)!.events).toEqual(t.events);
    expect(updated.tracks.find((x) => x.id === extra.id)).toMatchObject({
      name: 'Nieuwe naam',
      visible: false,
      collapsed: true,
      order: 0,
    });
    expect(() =>
      applyMultitrackMutation(song, {
        op: 'reorder-tracks',
        arrangementId: a.id,
        trackIds: [t.id, t.id],
      }),
    ).toThrow();
  });
  it('duplicates every event/link ID and preserves original syllable targets and simultaneity', () => {
    const { song, a, t } = fixture(),
      copy = applyMultitrackMutation(song, {
        op: 'duplicate-track',
        arrangementId: a.id,
        trackId: t.id,
      }),
      newTrack = copy.arrangements[0]!.tracks[1]!;
    expect(newTrack.id).not.toBe(t.id);
    expect(
      newTrack.events
        .map((e) => e.id)
        .some((id) => t.events.some((e) => e.id === id)),
    ).toBe(false);
    expect(newTrack.events.map((e) => [e.start, e.duration, e.tones])).toEqual(
      t.events.map((e) => [e.start, e.duration, e.tones]),
    );
    const link = copy.arrangements[0]!.lyricsLinks[1]!;
    expect(link.syllableId).toBe(a.lyricsLinks[0]!.syllableId);
    expect(
      link.eventIds.every((id) => newTrack.events.some((e) => e.id === id)),
    ).toBe(true);
  });
  it('deletes only confirmed target track/events, prunes links and refuses last track', () => {
    const { song: originalSong, a, t } = fixture();
    let song = originalSong;
    expect(() =>
      applyMultitrackMutation(song, {
        op: 'delete-track',
        arrangementId: a.id,
        trackId: t.id,
        confirmed: true,
      }),
    ).toThrow('last');
    song = applyMultitrackMutation(song, {
      op: 'duplicate-track',
      arrangementId: a.id,
      trackId: t.id,
    });
    song = applyMultitrackMutation(song, {
      op: 'delete-event',
      arrangementId: a.id,
      trackId: t.id,
      eventId: t.events[0]!.id,
      confirmed: true,
    });
    expect(song.arrangements[0]!.lyricsLinks[0]!.eventIds).toHaveLength(1);
    song = applyMultitrackMutation(song, {
      op: 'delete-track',
      arrangementId: a.id,
      trackId: t.id,
      confirmed: true,
    });
    expect(song.arrangements[0]!.tracks).toHaveLength(1);
    expect(
      song.arrangements[0]!.lyricsLinks.every((l) => l.trackId !== t.id),
    ).toBe(true);
  });
  it.each([
    'negative',
    'zero',
    'overflow',
    'same-string',
    'fret',
    'pitch',
    'measure',
    'unreduced',
  ])('rejects invalid %s without mutating input', (kind) => {
    const { song, a, t } = fixture(),
      before = structuredClone(song),
      e = structuredClone(t.events[0]!);
    e.id = uid();
    if (kind === 'negative') e.start.numerator = -1;
    if (kind === 'zero') e.duration.numerator = 0;
    if (kind === 'overflow') e.start = fraction(1, 1);
    if (kind === 'fret') e.tones[0]!.position!.fret = 25;
    if (kind === 'pitch') e.tones[0]!.pitch = 2;
    if (kind === 'measure')
      e.measureId = song.arrangements[1]!.sections[0]!.measures[0]!.id;
    if (kind === 'unreduced') e.duration = { numerator: 2, denominator: 16 };
    expect(() =>
      applyMultitrackMutation(song, {
        op: 'put-event',
        arrangementId: a.id,
        trackId: t.id,
        event: e,
      }),
    ).toThrow();
    expect(song).toEqual(before);
  });
  it('validates 6/8, shared timing and safe meter/capo changes on every track', () => {
    const song = toMultitrack(legacyFixture(3)),
      a = song.arrangements[0]!,
      t = a.tracks[0]!;
    expect(timeline(a)[0]!.timeSignature).toEqual({ beats: 6, beatUnit: 8 });
    expect(() =>
      applyMultitrackMutation(song, {
        op: 'set-meter',
        arrangementId: a.id,
        measureIds: [
          a.sections[0]!.measures[0]!.id,
          a.sections[0]!.measures[0]!.id,
        ],
        meter: { beats: 6, beatUnit: 8 },
      }),
    ).toThrow('Duplicate measure');
    expect(() =>
      applyMultitrackMutation(song, {
        op: 'set-meter',
        arrangementId: a.id,
        measureIds: [a.sections[0]!.measures[0]!.id],
        meter: { beats: 1, beatUnit: 8 },
      }),
    ).toThrow();
    expect(() =>
      applyMultitrackMutation(song, {
        op: 'set-capo',
        arrangementId: a.id,
        capo: 5,
      }),
    ).toThrow();
    expect(physicalPitch(t, 6, t.instrument.capo)).toBe(
      t.instrument.tuning.pitches[5]! + t.instrument.capo,
    );
    expect(pitchName(64)).toBe('E4');
  });
  it('preserves invisible tracks in v1 saves and refuses hidden measure or linked word loss', () => {
    const { song, a, t } = fixture(),
      multi = applyMultitrackMutation(song, {
        op: 'duplicate-track',
        arrangementId: a.id,
        trackId: t.id,
      }),
      legacy = toLegacy(multi);
    legacy.favorite = true;
    expect(
      mergeLegacyWrite(multi, legacy).arrangements[0]!.tracks,
    ).toHaveLength(2);
    legacy.arrangements[0]!.sections[0]!.measures.shift();
    expect(() => mergeLegacyWrite(multi, legacy)).toThrow();
  });
});
describe('explicit syllable links and safe text editing', () => {
  it('splits words by hand, links one/multiple notes across measures with sustain and replaces/unlinks without deleting notes', () => {
    const { song: originalSong, a, t, word } = fixture();
    let song = originalSong;
    song = splitWord(
      song,
      word.id,
      [{ text: 'wa' }, { text: 'ter' }],
      true,
    ).song;
    const syllable = song.lyrics[0]!.lines[0]!.tokens.find(
        (w) => w.id === word.id,
      )!.syllables[0]!,
      now = new Date().toISOString();
    const link = {
      id: uid(),
      syllableId: syllable.id,
      trackId: t.id,
      eventIds: [t.events[0]!.id, t.events[3]!.id],
      sustain: true,
      createdAt: now,
      updatedAt: now,
    };
    song = applyMultitrackMutation(song, {
      op: 'put-link',
      arrangementId: a.id,
      link,
    });
    song = applyMultitrackMutation(song, {
      op: 'put-link',
      arrangementId: a.id,
      link: { ...link, eventIds: [t.events[0]!.id] },
    });
    expect(song.arrangements[0]!.lyricsLinks[0]!.eventIds).toHaveLength(1);
    song = applyMultitrackMutation(song, {
      op: 'delete-link',
      arrangementId: a.id,
      linkId: link.id,
      confirmed: true,
    });
    expect(song.arrangements[0]!.tracks[0]!.events).toEqual(t.events);
  });
  it.each(['syllable', 'track', 'event', 'cross-track', 'duplicate', 'rest'])(
    'rejects invalid link %s',
    (kind) => {
      const { song, a, t } = fixture(),
        link = structuredClone(a.lyricsLinks[0]!);
      if (kind === 'syllable') link.syllableId = 'missing';
      if (kind === 'track') link.trackId = 'missing';
      if (kind === 'event') link.eventIds = ['missing'];
      if (kind === 'cross-track')
        link.eventIds = [song.arrangements[1]!.tracks[0]!.events[0]!.id];
      if (kind === 'duplicate')
        link.eventIds = [t.events[0]!.id, t.events[0]!.id];
      if (kind === 'rest')
        link.eventIds = [t.events.find((e) => e.kind === 'rest')!.id];
      expect(() =>
        applyMultitrackMutation(song, {
          op: 'put-link',
          arrangementId: a.id,
          link,
        }),
      ).toThrow();
    },
  );
  it('keeps unambiguous word IDs, flags repeated tokens and requires confirmation before removing linked text', () => {
    const { song, a, t, word } = fixture(),
      plan = planLyricsEdit(
        song,
        song.lyrics[0]!.id,
        'la la water\nEen nieuwe regel',
      );
    expect(
      plan.song.lyrics[0]!.lines[0]!.tokens.find((t) => t.text === 'water')!.id,
    ).toBe(word.id);
    expect(plan.uncertainWordIds).toHaveLength(2);
    expect(plan.song.arrangements[0]!.lyricsLinks).toEqual(a.lyricsLinks);
    expect(() => applyLyricsEdit(song, song.lyrics[0]!.id, 'la la')).toThrow(
      'confirm',
    );
    const removed = applyLyricsEdit(song, song.lyrics[0]!.id, 'la la', true);
    expect(removed.affectedLinks).toHaveLength(1);
    expect(removed.song.arrangements[0]!.tracks[0]!.events).toEqual(t.events);
  });
  it('moves repeated words by explicit identity and preserves link targets', () => {
    const { song } = fixture(),
      s = song.lyrics[0]!,
      line = s.lines[0]!,
      words = line.tokens.filter((t) => t.text === 'la');
    const moved = moveWord(song, s.id, line.id, words[0]!.id, null);
    expect(moved.lyrics[0]!.lines[0]!.tokens.at(-1)!.id).toBe(words[0]!.id);
    expect(moved.arrangements[0]!.lyricsLinks).toEqual(
      song.arrangements[0]!.lyricsLinks,
    );
  });
  it('requires review before discarding unlinked manual syllable divisions', () => {
    const { song, word } = fixture();
    song.arrangements.forEach((a) => {
      a.lyricsLinks = [];
    });
    const divided = splitWord(song, word.id, [
      { text: 'wa' },
      { text: 'ter' },
    ]).song;
    const plan = planLyricsEdit(
      divided,
      divided.lyrics[0]!.id,
      'Een nieuwe tekst',
    );
    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.affectedSyllables).toHaveLength(2);
    expect(() =>
      applyLyricsEdit(divided, divided.lyrics[0]!.id, 'Een nieuwe tekst'),
    ).toThrow('confirm');
    expect(
      applyLyricsEdit(divided, divided.lyrics[0]!.id, 'Een nieuwe tekst', true)
        .song.arrangements[0]!.tracks,
    ).toEqual(divided.arrangements[0]!.tracks);
  });
  it('keeps existing syllable IDs only with explicit identical parts; deletion needs confirmation when linked', () => {
    const { song, word } = fixture();
    expect(() =>
      splitWord(song, word.id, [{ text: 'wa' }, { text: 'ter' }]),
    ).toThrow('Confirm');
    expect(
      splitWord(song, word.id, [{ id: word.syllables[0]!.id, text: 'water' }])
        .song,
    ).toEqual(song);
    expect(() =>
      splitWord(song, word.id, [{ id: word.syllables[0]!.id, text: 'wrong' }]),
    ).toThrow();
  });
});
describe('import and Practice seams reuse normalized contracts', () => {
  it('attaches untimed import source without fabricated events and requires confirmation for replacement', () => {
    const { song, a, t } = fixture();
    song.importDocuments = [
      parseSongImport({ title: 'Eigen import', text: '[Am]Eigen tekst' }),
    ];
    const imported = attachImportTrack(song, a.id, 0, [], []);
    expect(imported.arrangements[0]!.tracks[1]!.events).toEqual([]);
    expect(() => attachImportTrack(song, a.id, 0, [], [], t.id)).toThrow();
    song.importDocuments[0]!.source.storage = 'preview-only';
    expect(() => attachImportTrack(song, a.id, 0, [], [])).toThrow();
  });
  it('captures selected tracks/range/events/return cursor and falls back on deleted/changed sources', () => {
    const { song, a, t } = fixture(),
      section = a.sections[0]!,
      input = {
        songId: song.id,
        arrangementId: a.id,
        sectionId: section.id,
        measureId: section.measures[0]!.id,
        position: fraction(0, 1),
        stringSelection: [1],
        exerciseType: 'rhythm' as const,
        trackIds: [t.id],
        measureRange: {
          fromMeasureId: section.measures[0]!.id,
          toMeasureId: section.measures[1]!.id,
        },
        eventIds: [t.events[0]!.id, t.events[3]!.id],
        returnCursor: {
          trackId: t.id,
          measureId: section.measures[0]!.id,
          position: fraction(0, 1),
          string: 1,
        },
      },
      snapshot = sourceSnapshot(song, input, 3),
      origin = {
        ...input,
        id: uid(),
        ownerId: 'local',
        createdAt: new Date().toISOString(),
        sourceConfiguration: snapshot,
      };
    expect(snapshot.tracks![0]!.events).toHaveLength(2);
    expect(resolveOrigin(origin, song).status).toBe('available');
    const changed = structuredClone(song);
    changed.arrangements[0]!.tracks[0]!.events[0]!.duration = fraction(1, 16);
    expect(resolveOrigin(origin, changed)).toMatchObject({
      status: 'missing-source',
      reason: 'changed-source',
    });
    const missing = applyMultitrackMutation(song, {
      op: 'delete-event',
      arrangementId: a.id,
      trackId: t.id,
      eventId: t.events[0]!.id,
      confirmed: true,
    });
    expect(resolveOrigin(origin, missing)).toMatchObject({
      status: 'missing-source',
      reason: 'event',
    });
    expect(resolveOrigin(origin, null).status).toBe('missing-source');
  });
});
