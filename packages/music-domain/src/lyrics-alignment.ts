import {
  MultitrackSongSchema,
  timeline,
  type LyricsLink,
  type MultitrackSong,
  type TrackEvent,
} from './multitrack.js';
import { uid } from './workspace.js';

export interface AlignmentScope {
  arrangementId: string;
  trackId: string;
  sectionId: string;
  lineId: string;
  selectedEventIds?: string[];
  selectedMeasureIds?: string[];
}
export interface AlignmentDraft {
  syllableId: string;
  trackId: string;
  eventIds: string[];
  sustain: boolean;
}
export type AlignmentResolution = 'keep' | 'new';
export interface AlignmentState {
  noteIndex: number;
  syllableIndex: number;
  drafts: AlignmentDraft[];
  skipped: string[];
  resolutions: Record<string, AlignmentResolution>;
}
interface Checkpoint {
  current: AlignmentState;
  past: AlignmentState[];
  future: AlignmentState[];
}
export interface AlignmentSession extends Checkpoint {
  songId: string;
  scope: AlignmentScope;
  startRevision: number;
  fingerprint: string;
  notes: TrackEvent[];
  allNotes: TrackEvent[];
  syllables: {
    id: string;
    text: string;
    wordId: string;
    word: string;
    wordIndex: number;
  }[];
  baseLinks: LyricsLink[];
  proposal:
    | (Checkpoint & {
        uncertain: boolean;
        unpairedNotes: number;
        unpairedSyllables: number;
      })
    | null;
}
export type AlignmentAction =
  | { type: 'bind'; melisma?: boolean }
  | { type: 'move-note'; index: number }
  | { type: 'move-syllable'; index: number }
  | { type: 'skip' | 'remove-note' | 'clear' }
  | { type: 'sustain'; value: boolean }
  | { type: 'resolve'; syllableId: string; decision: AlignmentResolution | '' };
export interface AlignmentRow {
  draft: AlignmentDraft;
  existing: LyricsLink[];
  competing: LyricsLink[];
  status: 'new' | 'unchanged' | 'replace' | 'kept' | 'conflict';
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const sameIds = (a: string[], b: string[]) =>
  equal([...a].sort(), [...b].sort());
export const equivalentLink = (a: AlignmentDraft, b: AlignmentDraft) =>
  a.syllableId === b.syllableId &&
  a.trackId === b.trackId &&
  a.sustain === b.sustain &&
  sameIds(a.eventIds, b.eventIds);
export function orderedAlignmentNotes(
  song: MultitrackSong,
  scope: AlignmentScope,
) {
  const a = song.arrangements.find((a) => a.id === scope.arrangementId);
  const t = a?.tracks.find((t) => t.id === scope.trackId);
  if (!a || !t || !a.sections.some((s) => s.id === scope.sectionId))
    throw Error('Onbekende alignmentcontext.');
  const measures = timeline(a),
    order = new Map(measures.map((m, i) => [m.id, i]));
  const selected = [...new Set(scope.selectedEventIds ?? [])];
  if (
    selected.some(
      (id) => !t.events.some((e) => e.id === id && e.kind === 'note'),
    )
  )
    throw Error('Geselecteerde noot bestaat niet op dit spoor.');
  if (scope.selectedMeasureIds?.some((id) => !order.has(id)))
    throw Error('Onbekende maat in de passage.');
  return structuredClone(
    t.events
      .filter(
        (e) =>
          e.kind === 'note' &&
          (selected.length
            ? selected.includes(e.id)
            : scope.selectedMeasureIds?.length
              ? scope.selectedMeasureIds.includes(e.measureId)
              : true),
      )
      .sort((x, y) => {
        const bar = order.get(x.measureId)! - order.get(y.measureId)!;
        if (bar) return bar;
        const cross =
          BigInt(x.start.numerator) * BigInt(y.start.denominator) -
          BigInt(y.start.numerator) * BigInt(x.start.denominator);
        return cross < 0n
          ? -1
          : cross > 0n
            ? 1
            : x.id < y.id
              ? -1
              : x.id > y.id
                ? 1
                : 0;
      }),
  );
}
export function startAlignment(
  input: MultitrackSong,
  scope: AlignmentScope,
  revision: number,
): AlignmentSession {
  const song = MultitrackSongSchema.parse(input),
    a = song.arrangements.find((a) => a.id === scope.arrangementId);
  if (!Number.isInteger(revision) || revision < 1)
    throw Error('Ongeldige startrevisie.');
  const section = a?.sections.find((s) => s.id === scope.sectionId),
    lyrics = song.lyrics.find((l) => l.id === section?.lyricsSectionId),
    line = lyrics?.lines.find((l) => l.id === scope.lineId);
  if (!line) throw Error('Deze lyricsregel hoort niet bij de gekozen sectie.');
  return {
    songId: song.id,
    scope: structuredClone(scope),
    startRevision: revision,
    fingerprint: JSON.stringify(song),
    notes: orderedAlignmentNotes(song, scope),
    allNotes: orderedAlignmentNotes(song, {
      ...scope,
      selectedEventIds: [],
      selectedMeasureIds: [],
    }),
    syllables: line.tokens
      .filter((w) => w.syllables.length)
      .flatMap((w, i) =>
        w.syllables.map((s) => ({
          ...s,
          wordId: w.id,
          word: w.text,
          wordIndex: i + 1,
        })),
      ),
    baseLinks: structuredClone(a!.lyricsLinks),
    current: {
      noteIndex: 0,
      syllableIndex: 0,
      drafts: [],
      skipped: [],
      resolutions: {},
    },
    past: [],
    future: [],
    proposal: null,
  };
}
export function currentAlignmentDraft(s: AlignmentSession) {
  const id = s.syllables[s.current.syllableIndex]?.id;
  if (!id) return null;
  const previous = s.baseLinks.filter(
    (l) => l.trackId === s.scope.trackId && l.syllableId === id,
  );
  return structuredClone(
    s.current.drafts.find((d) => d.syllableId === id) ?? {
      syllableId: id,
      trackId: s.scope.trackId,
      eventIds: [...new Set(previous.flatMap((l) => l.eventIds))],
      sustain: previous.some((l) => l.sustain),
    },
  );
}
export function alignmentAction(
  input: AlignmentSession,
  action: AlignmentAction,
): AlignmentSession {
  const s = structuredClone(input),
    c = s.current;
  if (action.type === 'move-note') {
    c.noteIndex = Math.max(0, Math.min(s.notes.length - 1, action.index));
    return s;
  }
  if (action.type === 'move-syllable') {
    c.syllableIndex = Math.max(
      0,
      Math.min(s.syllables.length - 1, action.index),
    );
    return s;
  }
  const before = structuredClone(c),
    d = currentAlignmentDraft(s),
    note = s.notes[c.noteIndex];
  if (action.type === 'resolve') {
    if (!s.syllables.some((x) => x.id === action.syllableId))
      throw Error('Onbekende lettergreep.');
    if (action.decision) c.resolutions[action.syllableId] = action.decision;
    else delete c.resolutions[action.syllableId];
  } else if (d) {
    if (action.type === 'skip') {
      c.skipped = [...new Set([...c.skipped, d.syllableId])];
      c.syllableIndex = Math.min(s.syllables.length, c.syllableIndex + 1);
    } else {
      if (action.type === 'bind') {
        if (!note) return input;
        if (
          !action.melisma &&
          !c.drafts.some((x) => x.syllableId === d.syllableId)
        )
          d.eventIds = [];
        c.drafts = c.drafts.map((other) => {
          if (
            other.syllableId === d.syllableId ||
            !other.eventIds.includes(note.id)
          )
            return other;
          // Re-review an earlier replacement choice when its candidate changes.
          delete c.resolutions[other.syllableId];
          return {
            ...other,
            eventIds: other.eventIds.filter((id) => id !== note.id),
          };
        });
        d.eventIds = [...new Set([...d.eventIds, note.id])];
        c.noteIndex = Math.min(s.notes.length, c.noteIndex + 1);
        if (!action.melisma)
          c.syllableIndex = Math.min(s.syllables.length, c.syllableIndex + 1);
        c.skipped = c.skipped.filter((id) => id !== d.syllableId);
      }
      if (action.type === 'remove-note')
        d.eventIds = d.eventIds.filter((id) => id !== note?.id);
      if (action.type === 'clear') d.eventIds = [];
      if (action.type === 'sustain') d.sustain = action.value;
      c.drafts = c.drafts.filter((x) => x.syllableId !== d.syllableId);
      c.drafts.push(d);
      delete c.resolutions[d.syllableId];
    }
  }
  if (!equal(before, c)) {
    s.past.push(before);
    s.past = s.past.slice(-200);
    s.future = [];
  }
  return s;
}
export function alignmentUndo(input: AlignmentSession, redo = false) {
  const s = structuredClone(input),
    from = redo ? s.future : s.past,
    to = redo ? s.past : s.future,
    previous = from.pop();
  if (previous) {
    to.push(s.current);
    s.current = previous;
  }
  return s;
}
export function proposeAlignment(input: AlignmentSession) {
  const s = structuredClone(input);
  if (s.proposal)
    throw Error('Controleer of annuleer eerst het huidige voorstel.');
  s.proposal = {
    current: structuredClone(s.current),
    past: structuredClone(s.past),
    future: structuredClone(s.future),
    uncertain: s.notes.length !== s.syllables.length,
    unpairedNotes: Math.max(0, s.notes.length - s.syllables.length),
    unpairedSyllables: Math.max(0, s.syllables.length - s.notes.length),
  };
  s.past.push(structuredClone(s.current));
  s.future = [];
  s.current = {
    noteIndex: 0,
    syllableIndex: 0,
    drafts: s.syllables.slice(0, s.notes.length).map((sy, i) => ({
      syllableId: sy.id,
      trackId: s.scope.trackId,
      eventIds: [s.notes[i]!.id],
      sustain: false,
    })),
    skipped: [],
    resolutions: {},
  };
  return s;
}
export function cancelAlignmentProposal(input: AlignmentSession) {
  const s = structuredClone(input);
  if (s.proposal) {
    s.current = s.proposal.current;
    s.past = s.proposal.past;
    s.future = s.proposal.future;
    s.proposal = null;
  }
  return s;
}
export function planAlignment(
  s: AlignmentSession,
  now: string,
  idFactory: () => string = uid,
) {
  const drafts = s.current.drafts,
    trackId = s.scope.trackId,
    base = s.baseLinks;
  if (new Set(drafts.map((d) => d.syllableId)).size !== drafts.length)
    throw Error('Dubbele conceptlettergreep.');
  for (const d of drafts)
    if (
      d.trackId !== trackId ||
      !s.syllables.some((sy) => sy.id === d.syllableId) ||
      new Set(d.eventIds).size !== d.eventIds.length ||
      d.eventIds.some(
        (id) =>
          !s.notes.some((e) => e.id === id && e.kind === 'note') &&
          !base.some(
            (l) =>
              l.trackId === trackId &&
              l.syllableId === d.syllableId &&
              l.eventIds.includes(id),
          ),
      )
    )
      throw Error('Ongeldige lyricsverwijzing in het concept.');
  const rows: AlignmentRow[] = drafts.map((d) => {
    const existing = base.filter(
        (l) => l.trackId === trackId && l.syllableId === d.syllableId,
      ),
      competing = base.filter(
        (l) =>
          l.trackId === trackId &&
          l.syllableId !== d.syllableId &&
          l.eventIds.some((id) => d.eventIds.includes(id)),
      );
    const same =
      (!d.eventIds.length && !existing.length) ||
      (existing.length === 1 &&
        equivalentLink(existing[0]!, d) &&
        !competing.length &&
        !drafts.some(
          (other) =>
            other !== d && other.eventIds.some((id) => d.eventIds.includes(id)),
        ));
    const conflict =
      !!existing.length ||
      !!competing.length ||
      drafts.some(
        (other) =>
          other !== d && other.eventIds.some((id) => d.eventIds.includes(id)),
      );
    const decision = s.current.resolutions[d.syllableId];
    return {
      draft: structuredClone(d),
      existing: structuredClone(existing),
      competing: structuredClone(competing),
      status: same
        ? 'unchanged'
        : decision === 'keep'
          ? 'kept'
          : conflict
            ? decision === 'new'
              ? 'replace'
              : 'conflict'
            : 'new',
    };
  });
  let links = structuredClone(base);
  for (const row of rows) {
    if (!['new', 'replace'].includes(row.status)) continue;
    const d = row.draft;
    links = links.filter(
      (l) => !(l.trackId === trackId && l.syllableId === d.syllableId),
    );
    if (row.status === 'replace')
      links = links.flatMap((l) => {
        if (
          l.trackId !== trackId ||
          !l.eventIds.some((id) => d.eventIds.includes(id))
        )
          return [l];
        const eventIds = l.eventIds.filter((id) => !d.eventIds.includes(id));
        return eventIds.length ? [{ ...l, eventIds, updatedAt: now }] : [];
      });
    if (d.eventIds.length)
      links.push({
        ...d,
        id: row.existing[0]?.id ?? idFactory(),
        createdAt: row.existing[0]?.createdAt ?? now,
        updatedAt: now,
      });
  }
  for (const keeper of rows.filter((r) => r.status === 'kept'))
    for (const protectedLink of [...keeper.existing, ...keeper.competing])
      if (!links.some((l) => equivalentLink(l, protectedLink)))
        for (const row of rows)
          if (
            ['new', 'replace'].includes(row.status) &&
            (row.draft.syllableId === protectedLink.syllableId ||
              row.draft.eventIds.some((id) =>
                protectedLink.eventIds.includes(id),
              ))
          )
            row.status = 'conflict';
  for (const row of rows.filter((r) => ['new', 'replace'].includes(r.status)))
    if (
      rows.some(
        (other) =>
          other !== row &&
          ['new', 'replace'].includes(other.status) &&
          row.draft.eventIds.some((id) => other.draft.eventIds.includes(id)),
      )
    )
      row.status = 'conflict';
  return {
    rows,
    links,
    unresolved: rows.filter((r) => r.status === 'conflict').length,
    changed: !equal(base, links),
  };
}
export function applyAlignment(
  song: MultitrackSong,
  s: AlignmentSession,
  now: string,
  idFactory?: () => string,
) {
  song = MultitrackSongSchema.parse(song);
  if (song.id !== s.songId || JSON.stringify(song) !== s.fingerprint)
    throw Error(
      'De bron is gewijzigd. Je concept blijft beschikbaar; controleer de nieuwste versie.',
    );
  // Revalidate every source reference at the document boundary.
  const fresh = startAlignment(song, s.scope, s.startRevision);
  if (
    !equal(fresh.notes, s.notes) ||
    !equal(fresh.syllables, s.syllables) ||
    !equal(fresh.baseLinks, s.baseLinks)
  )
    throw Error('Noten of lyrics zijn gewijzigd.');
  const plan = planAlignment(s, now, idFactory);
  if (plan.unresolved) throw Error('Los eerst alle conflicten op.');
  const next = structuredClone(song);
  next.arrangements.find((a) => a.id === s.scope.arrangementId)!.lyricsLinks =
    plan.links;
  return MultitrackSongSchema.parse(next);
}
