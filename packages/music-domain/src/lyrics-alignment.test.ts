import { describe, it, expect } from 'vitest';
import { alignmentFixture } from '../test-support/alignment-fixture.js';
import {
  startAlignment,
  alignmentAction,
  alignmentUndo,
  proposeAlignment,
  cancelAlignmentProposal,
  planAlignment,
  applyAlignment,
  currentAlignmentDraft,
  orderedAlignmentNotes,
  type AlignmentSession,
} from './lyrics-alignment.js';
const now = '2026-11-15T10:00:00.000Z';
function fixture(links = true) {
  const song = alignmentFixture(links),
    a = song.arrangements[0]!,
    scope = {
      arrangementId: a.id,
      trackId: a.activeTrackId,
      sectionId: a.sections[0]!.id,
      lineId: song.lyrics[0]!.lines[0]!.id,
    };
  return { song, a, scope, s: startAlignment(song, scope, 1) };
}
function resolveNew(s: AlignmentSession) {
  let next = s;
  for (const d of s.current.drafts)
    next = alignmentAction(next, {
      type: 'resolve',
      syllableId: d.syllableId,
      decision: 'new',
    });
  return next;
}
describe('production lyrics alignment', () => {
  it('clears explicit resolutions when their candidate changes or the user chooses unresolved', () => {
    let { s } = fixture(false);
    const first = s.syllables[0]!.id;
    s = alignmentAction(s, { type: 'bind' });
    s = alignmentAction(s, {
      type: 'resolve',
      syllableId: first,
      decision: 'new',
    });
    s = alignmentAction(s, { type: 'move-note', index: 0 });
    s = alignmentAction(s, { type: 'bind' });
    expect(s.current.resolutions[first]).toBeUndefined();
    s = alignmentAction(s, {
      type: 'resolve',
      syllableId: first,
      decision: 'keep',
    });
    s = alignmentAction(s, {
      type: 'resolve',
      syllableId: first,
      decision: '',
    });
    expect(s.current.resolutions[first]).toBeUndefined();
  });

  it('accepts a semantically identical JSONB source with reordered object keys', () => {
    const { song, s } = fixture(false);
    const reordered = JSON.parse(
      JSON.stringify(song),
      (_key, value: unknown) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
    ) as typeof song;
    const draft = alignmentAction(s, { type: 'bind' });
    expect(applyAlignment(reordered, draft, now, () => 'new-link')).toEqual(
      applyAlignment(song, draft, now, () => 'new-link'),
    );
  });

  it('orders reduced non-grid rationals exactly and uses deterministic independent-event ties', () => {
    const { s } = fixture();
    expect(s.notes).toHaveLength(8);
    expect(s.notes[0]!.tones).toHaveLength(2);
    expect(s.notes[0]!.id < s.notes[1]!.id).toBe(true);
    expect(s.notes[2]!.start).toEqual({ numerator: 1, denominator: 3 });
    expect(s.notes[3]!.start).toEqual({ numerator: 3, denominator: 4 });
  });
  it('deduplicates selected chord tones by event ID but keeps simultaneous events separate', () => {
    const { song, scope, s } = fixture();
    const next = startAlignment(
      song,
      {
        ...scope,
        selectedEventIds: [s.notes[0]!.id, s.notes[0]!.id, s.notes[1]!.id],
        selectedMeasureIds: [s.notes[7]!.measureId],
      },
      1,
    );
    expect(next.notes.map((n) => n.id)).toEqual(
      s.notes.slice(0, 2).map((n) => n.id),
    );
  });
  it('uses selected measures before whole-track fallback; excludes rests', () => {
    const { song, scope, s } = fixture();
    expect(
      orderedAlignmentNotes(song, {
        ...scope,
        selectedMeasureIds: [s.notes[0]!.measureId],
      }),
    ).toHaveLength(4);
    expect(s.notes.every((n) => n.kind === 'note')).toBe(true);
  });
  it('rejects foreign tracks, measures, sections and lyric lines', () => {
    const { song, scope } = fixture();
    for (const patch of [
      { trackId: 'foreign' },
      { sectionId: 'foreign' },
      { lineId: 'foreign' },
      { selectedEventIds: ['foreign'] },
      { selectedMeasureIds: ['foreign'] },
    ])
      expect(() => startAlignment(song, { ...scope, ...patch }, 1)).toThrow();
  });
  it('binds and advances both cursors without touching source data', () => {
    const { song, s } = fixture(false),
      before = structuredClone(song),
      next = alignmentAction(s, { type: 'bind' });
    expect(next.current.drafts[0]!.eventIds).toEqual([s.notes[0]!.id]);
    expect(next.current.noteIndex).toBe(1);
    expect(next.current.syllableIndex).toBe(1);
    expect(song).toEqual(before);
    expect(s.current.drafts).toEqual([]);
  });
  it('aligns a whole six-syllable line with six Enter-equivalent actions', () => {
    let { s } = fixture(false);
    for (let i = 0; i < 6; i++) s = alignmentAction(s, { type: 'bind' });
    expect(s.current.drafts).toHaveLength(6);
    expect(s.current.syllableIndex).toBe(6);
    expect(planAlignment(s, now).unresolved).toBe(0);
  });
  it('extends one syllable across bar boundaries without changing note durations', () => {
    let { s } = fixture(false);
    s = alignmentAction(s, { type: 'move-note', index: 3 });
    s = alignmentAction(s, { type: 'bind', melisma: true });
    s = alignmentAction(s, { type: 'bind', melisma: true });
    expect(s.current.syllableIndex).toBe(0);
    expect(s.current.drafts[0]!.eventIds).toHaveLength(2);
    expect(s.notes[3]!.measureId).not.toBe(s.notes[4]!.measureId);
  });
  it('corrects one melisma note and clears a syllable independently', () => {
    let { s } = fixture(false);
    s = alignmentAction(s, { type: 'bind', melisma: true });
    s = alignmentAction(s, { type: 'bind', melisma: true });
    s = alignmentAction(s, { type: 'move-note', index: 1 });
    s = alignmentAction(s, { type: 'remove-note' });
    expect(s.current.drafts[0]!.eventIds).toHaveLength(1);
    s = alignmentAction(s, { type: 'clear' });
    expect(s.current.drafts[0]!.eventIds).toEqual([]);
  });
  it('keeps sustain in link presentation only', () => {
    const { s } = fixture(false),
      before = structuredClone(s.notes);
    let next = alignmentAction(s, { type: 'bind', melisma: true });
    next = alignmentAction(next, { type: 'sustain', value: true });
    expect(next.current.drafts[0]!.sustain).toBe(true);
    expect(next.notes).toEqual(before);
  });
  it('skips without creating or deleting a stored link', () => {
    const { s } = fixture(),
      next = alignmentAction(s, { type: 'skip' });
    expect(next.current.skipped).toEqual([s.syllables[0]!.id]);
    expect(next.current.noteIndex).toBe(0);
    expect(planAlignment(next, now).links).toEqual(s.baseLinks);
  });
  it('undo/redo preserves cursors and clears a divergent redo branch', () => {
    const { s } = fixture(false),
      bound = alignmentAction(s, { type: 'bind' }),
      undo = alignmentUndo(bound),
      redo = alignmentUndo(undo, true);
    expect(undo.current).toEqual(s.current);
    expect(redo.current).toEqual(bound.current);
    expect(alignmentAction(undo, { type: 'skip' }).future).toEqual([]);
  });
  it('proposes equal counts one-to-one without inventing events or syllables', () => {
    const { song, scope, s } = fixture(false);
    const equal = startAlignment(
        song,
        { ...scope, lineId: song.lyrics[0]!.lines[1]!.id },
        1,
      ),
      p = proposeAlignment(equal);
    expect(p.proposal!.uncertain).toBe(false);
    expect(p.current.drafts).toHaveLength(8);
    expect(p.notes).toEqual(s.notes);
  });
  it('reports unequal counts and pairs only min(notes, syllables)', () => {
    const { s } = fixture(false),
      p = proposeAlignment(s);
    expect(p.current.drafts).toHaveLength(6);
    expect(p.proposal).toMatchObject({
      uncertain: true,
      unpairedNotes: 2,
      unpairedSyllables: 0,
    });
    const shorter = structuredClone(s);
    shorter.notes = shorter.notes.slice(0, 2);
    expect(proposeAlignment(shorter).proposal!.unpairedSyllables).toBe(4);
  });
  it('cancelled proposal restores an existing draft and both history stacks exactly', () => {
    const { s } = fixture(false);
    const prior = alignmentUndo(
      alignmentAction(alignmentAction(s, { type: 'bind' }), { type: 'skip' }),
    );
    let next = proposeAlignment(prior);
    next = alignmentAction(next, { type: 'clear' });
    const back = cancelAlignmentProposal(next);
    expect(back.current).toEqual(prior.current);
    expect(back.past).toEqual(prior.past);
    expect(back.future).toEqual(prior.future);
  });
  it('keeps unchanged links and their timestamps/identities', () => {
    const { s } = fixture();
    const next = alignmentAction(s, { type: 'bind' }),
      plan = planAlignment(next, now);
    expect(plan.rows[0]!.status).toBe('unchanged');
    expect(plan.links).toEqual(s.baseLinks);
  });
  it('blocks editing existing syllables until an explicit decision', () => {
    let { s } = fixture();
    s = alignmentAction(s, { type: 'move-note', index: 2 });
    s = alignmentAction(s, { type: 'bind' });
    expect(planAlignment(s, now).unresolved).toBe(1);
    expect(() => applyAlignment(fixture().song, s, now)).toThrow();
  });
  it('recognizes note ownership conflicts and keep preserves original links', () => {
    let { s } = fixture();
    s = alignmentAction(s, { type: 'move-syllable', index: 1 });
    s = alignmentAction(s, { type: 'bind' });
    expect(planAlignment(s, now).unresolved).toBe(1);
    s = alignmentAction(s, {
      type: 'resolve',
      syllableId: s.syllables[1]!.id,
      decision: 'keep',
    });
    expect(planAlignment(s, now).links).toEqual(s.baseLinks);
  });
  it('explicit replacement trims only the claimed note from another melisma', () => {
    let { s } = fixture();
    const base = s.baseLinks.find((l) => l.sustain)!;
    s = alignmentAction(s, { type: 'move-syllable', index: 1 });
    s = alignmentAction(s, { type: 'move-note', index: 3 });
    s = alignmentAction(s, { type: 'bind' });
    s = resolveNew(s);
    const plan = planAlignment(s, now);
    expect(plan.unresolved).toBe(0);
    expect(plan.links.find((l) => l.id === base.id)!.eventIds).toEqual([
      s.notes[4]!.id,
    ]);
  });
  it('a protected keep decision cannot be overridden by another replacement', () => {
    let { s } = fixture();
    s = alignmentAction(s, { type: 'move-syllable', index: 0 });
    s = alignmentAction(s, { type: 'move-note', index: 1 });
    s = alignmentAction(s, { type: 'bind' });
    s = alignmentAction(s, {
      type: 'resolve',
      syllableId: s.syllables[0]!.id,
      decision: 'keep',
    });
    s = alignmentAction(s, { type: 'move-syllable', index: 1 });
    s = alignmentAction(s, { type: 'move-note', index: 0 });
    s = alignmentAction(s, { type: 'bind' });
    s = alignmentAction(s, {
      type: 'resolve',
      syllableId: s.syllables[1]!.id,
      decision: 'new',
    });
    expect(planAlignment(s, now).unresolved).toBeGreaterThan(0);
  });
  it('duplicate concept claims remain blocked if injected into a plan', () => {
    const { s } = fixture(false);
    s.current.drafts = s.syllables.slice(0, 2).map((sy) => ({
      syllableId: sy.id,
      trackId: s.scope.trackId,
      eventIds: [s.notes[0]!.id],
      sustain: false,
    }));
    expect(planAlignment(s, now).unresolved).toBeGreaterThan(0);
  });
  it('validates missing/foreign syllables, events, duplicate IDs and track references', () => {
    const { s } = fixture(false);
    for (const patch of [
      { syllableId: 'missing' },
      { trackId: 'foreign' },
      { eventIds: ['missing'] },
      { eventIds: [s.notes[0]!.id, s.notes[0]!.id] },
    ]) {
      const bad = structuredClone(s);
      bad.current.drafts = [
        {
          syllableId: s.syllables[0]!.id,
          trackId: s.scope.trackId,
          eventIds: [s.notes[0]!.id],
          sustain: false,
          ...patch,
        },
      ];
      expect(() => planAlignment(bad, now)).toThrow();
    }
  });
  it('only writes intended lyricsLinks, preserving other tracks, imports, words, chords and notes', () => {
    const { song, s } = fixture(false);
    const next = applyAlignment(
      song,
      alignmentAction(s, { type: 'bind' }),
      now,
    );
    const expected = structuredClone(next);
    expected.arrangements[0]!.lyricsLinks = song.arrangements[0]!.lyricsLinks;
    expect(expected).toEqual(song);
    expect(next.arrangements[0]!.lyricsLinks[0]).toMatchObject({
      createdAt: now,
      updatedAt: now,
      sustain: false,
    });
  });
  it('rejects structural source changes and fabricated source snapshots', () => {
    const { song, s } = fixture(false);
    const changed = structuredClone(song);
    changed.arrangements[0]!.tracks[0]!.events.pop();
    expect(() => applyAlignment(changed, s, now)).toThrow();
    const bad = structuredClone(s);
    bad.notes[0]!.id = 'fabricated';
    expect(() => applyAlignment(song, bad, now)).toThrow();
  });
  it('distinguishes repeated word/syllable identities in read order', () => {
    const { song, scope } = fixture();
    const s = startAlignment(
      song,
      { ...scope, lineId: song.lyrics[0]!.lines[2]!.id },
      1,
    );
    expect(s.syllables[0]!.text).toBe('la');
    expect(s.syllables[1]!.text).toBe('la');
    expect(s.syllables[0]!.id).not.toBe(s.syllables[1]!.id);
  });
  it('can correct an existing cross-bar link in a smaller selected passage without discarding the other notes', () => {
    const { song, scope, s } = fixture();
    let narrow = startAlignment(
      song,
      { ...scope, selectedEventIds: [s.notes[3]!.id] },
      1,
    );
    narrow = alignmentAction(narrow, { type: 'move-syllable', index: 2 });
    expect(currentAlignmentDraft(narrow)!.eventIds).toHaveLength(2);
    narrow = alignmentAction(narrow, { type: 'remove-note' });
    narrow = resolveNew(narrow);
    expect(
      applyAlignment(song, narrow, now).arrangements[0]!.lyricsLinks.find(
        (l) => l.sustain && l.trackId === s.scope.trackId,
      )!.eventIds,
    ).toEqual([s.notes[4]!.id]);
  });
});
