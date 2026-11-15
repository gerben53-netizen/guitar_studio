import { describe, it, expect } from 'vitest';
import { legacyFixture } from '../test-support/multitrack-fixtures.js';
import { toMultitrack, timeline, MultitrackSongSchema } from './multitrack.js';
import { applyMultitrackMutation } from './multitrack-operations.js';
import { fraction, uid } from './workspace.js';
import {
  writeFret,
  putRest,
  deleteTones,
  inputBuffer,
  moveCursor,
  measureColumns,
  scoreSystems,
  positionPercent,
  duplicateArrangement,
  practiceTracks,
  setDurations,
  trackProjection,
  pushHistory,
  stepHistory,
  type EditorCursor,
} from './workspace-editor.js';
function fixture(index = 2) {
  const song = toMultitrack(legacyFixture(index)),
    a = song.arrangements[0]!,
    t = a.tracks[0]!;
  const c: EditorCursor = {
    trackId: t.id,
    measureId: a.sections[0]!.measures[0]!.id,
    start: fraction(0, 1),
    string: 3,
  };
  return { song, a, t, c };
}
describe('production Workspace v3 editing and score layout', () => {
  it('lays out all measures in section systems, with shared rational positions independent of text/track lengths', () => {
    const { a } = fixture();
    for (const count of [2, 3, 4])
      expect(
        scoreSystems(a, count)
          .flatMap((s) => s.measures)
          .map((m) => m.id),
      ).toEqual(timeline(a).map((m) => m.id));
    expect([500, 1000, 1400].map((w) => measureColumns(w, 0))).toEqual([
      2, 3, 4,
    ]);
    expect(measureColumns(500, 4)).toBe(4);
    expect(
      positionPercent(fraction(1, 8), { beats: 6, beatUnit: 8 }),
    ).toBeCloseTo(100 / 6);
    expect(positionPercent(fraction(1, 4), { beats: 4, beatUnit: 4 })).toBe(25);
  });
  it('keeps an explicit 12/24 buffer without a timeout or document mutation until commit', () => {
    const { song, a, c } = fixture(),
      before = structuredClone(song);
    let raw = inputBuffer('', '1');
    raw = inputBuffer(raw, '2');
    expect(raw).toBe('12');
    expect(song).toEqual(before);
    const next = writeFret(song, a.id, c, Number(raw), fraction(1, 8));
    expect(
      next.arrangements[0]!.tracks[0]!.events[0]!.tones.some(
        (t) => t.position?.string === 3 && t.position.fret === 12,
      ),
    ).toBe(true);
    expect(inputBuffer('2', '4')).toBe('24');
    for (const invalid of ['5', '9'])
      expect(() => inputBuffer('2', invalid)).toThrow();
    expect(() => inputBuffer('12', '1')).toThrow();
  });
  it('preserves chord groups and independent polyphony, technique metadata and other tracks', () => {
    const { song, a, t, c } = fixture();
    const multi = applyMultitrackMutation(song, {
      op: 'duplicate-track',
      arrangementId: a.id,
      trackId: t.id,
    });
    const hidden = structuredClone(multi.arrangements[0]!.tracks[1]);
    const next = writeFret(multi, a.id, c, 12, fraction(1, 8));
    expect(next.arrangements[0]!.tracks[0]!.events[0]!.tones).toHaveLength(3);
    expect(next.arrangements[0]!.tracks[0]!.events[0]!.technique).toBe(
      'vibrato',
    );
    expect(next.arrangements[0]!.tracks[0]!.events[1]!.duration).toEqual(
      fraction(1, 4),
    );
    expect(next.arrangements[0]!.tracks[1]).toEqual(hidden);
    expect(multi.arrangements[0]!.tracks[0]!.events).toEqual(t.events);
  });
  it('deletes a selected chord tone while retaining other tones and valid group links', () => {
    const { song, a, t, c } = fixture();
    const next = writeFret(song, a.id, c, 12, fraction(1, 8));
    const event = next.arrangements[0]!.tracks[0]!.events[0]!;
    const now = new Date().toISOString();
    next.arrangements[0]!.lyricsLinks.push({
      id: uid(),
      trackId: t.id,
      syllableId: next.lyrics[0]!.lines[0]!.tokens.find(
        (w) => w.text === 'water',
      )!.syllables[0]!.id,
      eventIds: [event.id],
      sustain: true,
      createdAt: now,
      updatedAt: now,
    });
    const removed = deleteTones(next, a.id, t.id, [
      { eventId: event.id, string: 3 },
    ]);
    expect(removed.arrangements[0]!.tracks[0]!.events[0]!.tones).toHaveLength(
      2,
    );
    expect(removed.arrangements[0]!.lyricsLinks).toHaveLength(1);
    const all = deleteTones(removed, a.id, t.id, [
      { eventId: event.id, string: 1 },
      { eventId: event.id, string: 2 },
    ]);
    expect(all.arrangements[0]!.lyricsLinks).toHaveLength(0);
  });
  it('uses physical frets with capo and Drop D, refusing under-capo or out-of-range inputs', () => {
    const { song, a, c } = fixture(3);
    const next = writeFret(song, a.id, { ...c, string: 6 }, 5, fraction(1, 4));
    expect(next.arrangements[0]!.tracks[0]!.events[1]!.tones[0]!.pitch).toBe(
      43,
    );
    for (const fret of [-1, 0, 1, 25, 1.5])
      expect(() => writeFret(song, a.id, c, fret, fraction(1, 8))).toThrow();
    expect(
      trackProjection(next, a.id, c.trackId).instrument.tuning.pitches[5],
    ).toBe(38);
  });
  it('refuses boundary/overlap/duration errors without partial changes', () => {
    const { song, a, t, c } = fixture(),
      before = structuredClone(song);
    expect(() =>
      writeFret(
        song,
        a.id,
        { ...c, start: fraction(7, 8) },
        12,
        fraction(1, 4),
      ),
    ).toThrow();
    expect(() =>
      setDurations(song, a.id, t.id, [t.events[0]!.id], fraction(0, 1)),
    ).toThrow();
    expect(() =>
      writeFret(
        song,
        a.id,
        { ...c, string: 6, start: fraction(1, 8) },
        2,
        fraction(1, 8),
      ),
    ).toThrow();
    expect(song).toEqual(before);
  });
  it('navigates strings and measure boundaries exactly, and handles the first/last measure', () => {
    const { a, c } = fixture();
    expect(moveCursor(a, c, -1, -10, fraction(1, 4)).start).toEqual(
      fraction(0, 1),
    );
    expect(
      moveCursor(a, { ...c, start: fraction(3, 4) }, 1, 9, fraction(1, 4)),
    ).toMatchObject({
      measureId: a.sections[0]!.measures[1]!.id,
      start: fraction(0, 1),
      string: 6,
    });
    expect(
      moveCursor(
        a,
        { ...c, measureId: a.sections[0]!.measures[1]!.id },
        -1,
        0,
        fraction(1, 4),
      ).start,
    ).toEqual(fraction(3, 4));
  });
  it('duplicates an arrangement with independent tracks/events/links and keeps shared lyric identities', () => {
    const { song, a, t } = fixture();
    const now = new Date().toISOString();
    a.lyricsLinks.push({
      id: uid(),
      trackId: t.id,
      syllableId: song.lyrics[0]!.lines[0]!.tokens.find(
        (w) => w.text === 'water',
      )!.syllables[0]!.id,
      eventIds: [t.events[0]!.id, t.events[3]!.id],
      sustain: true,
      createdAt: now,
      updatedAt: now,
    });
    const copy = duplicateArrangement(song, a.id),
      n = copy.arrangements.at(-1)!;
    expect(n.id).not.toBe(a.id);
    expect(n.tracks[0]!.events[0]!.id).not.toBe(t.events[0]!.id);
    expect(n.lyricsLinks[0]!.syllableId).toBe(a.lyricsLinks[0]!.syllableId);
    expect(
      n.lyricsLinks[0]!.eventIds.every((id) =>
        n.tracks[0]!.events.some((e) => e.id === id),
      ),
    ).toBe(true);
    expect(MultitrackSongSchema.safeParse(copy).success).toBe(true);
    const empty = duplicateArrangement(song, a.id, true).arrangements.at(-1)!;
    expect(empty.tracks[0]!.events).toEqual([]);
    expect(empty.lyricsLinks).toEqual([]);
  });
  it('inserts rests and prunes only replaced links, never other-track notes', () => {
    const { song, a, c } = fixture();
    const next = putRest(song, a.id, c, fraction(1, 4));
    const notes = next.arrangements[0]!.tracks[0]!.events.filter(
      (e) => e.measureId === c.measureId && e.start.numerator === 0,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]!.kind).toBe('rest');
  });
  it('undo/redo restores full track/link documents and clears the redo branch after a new edit', () => {
    const { song, a, c } = fixture();
    const next = writeFret(song, a.id, c, 12, fraction(1, 8)),
      history = pushHistory({ past: [], future: [] }, song),
      undo = stepHistory(history, next)!;
    expect(undo.document).toEqual(song);
    const redo = stepHistory(undo.history, undo.document, true)!;
    expect(redo.document).toEqual(next);
    expect(pushHistory(undo.history, undo.document).future).toEqual([]);
    expect(stepHistory({ past: [], future: [] }, song)).toBeNull();
  });
  it('filters Practice roles and linked tracks without changing musical content', () => {
    const { a } = fixture();
    a.tracks[0]!.role = 'vocal_melody';
    expect(practiceTracks(a, 'lyrics')).toHaveLength(0);
    expect(practiceTracks(a, 'vocal')).toHaveLength(1);
    expect(practiceTracks(a, 'guitar')).toHaveLength(0);
    expect(practiceTracks(a, 'all')).toHaveLength(1);
  });
  it('keeps independent articulations when adding a simultaneous tone or editing an existing fret', () => {
    const { song, a, c } = fixture();
    const original = structuredClone(a.tracks[0]!.events[0]!);
    const next = writeFret(song, a.id, c, 12, fraction(1, 8), 'slide');
    const events = next.arrangements[0]!.tracks[0]!.events;
    expect(events.find((e) => e.id === original.id)).toEqual(original);
    const added = events.find((e) =>
      e.tones.some((t) => t.position?.string === 3),
    )!;
    expect(added.id).not.toBe(original.id);
    expect(added.technique).toBe('slide');
    const edited = writeFret(
      song,
      a.id,
      { ...c, string: 1 },
      5,
      original.duration,
      'normal',
    );
    expect(edited.arrangements[0]!.tracks[0]!.events[0]!.technique).toBe(
      original.technique,
    );
    expect(song.arrangements[0]!.tracks[0]!.events[0]).toEqual(original);
  });
  it('respects the canonical track order in Practice without sorting the stored track array', () => {
    const { song, a } = fixture();
    const duplicate = applyMultitrackMutation(song, {
      op: 'duplicate-track',
      arrangementId: a.id,
      trackId: a.tracks[0]!.id,
    });
    const current = duplicate.arrangements[0]!;
    const order = [...current.trackOrder].reverse();
    const reordered = applyMultitrackMutation(duplicate, {
      op: 'reorder-tracks',
      arrangementId: a.id,
      trackIds: order,
    }).arrangements[0]!;
    const before = structuredClone(reordered);
    expect(practiceTracks(reordered, 'all').map((t) => t.id)).toEqual(order);
    expect(reordered).toEqual(before);
  });
});
