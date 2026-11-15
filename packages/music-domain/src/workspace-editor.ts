import { pitchAt, type MusicalTime } from './index.js';
import {
  fraction,
  sameTime,
  uid,
  type StudioArrangement,
} from './workspace.js';
import {
  MultitrackSongSchema,
  timeline,
  toLegacy,
  type MultitrackSong,
  type MultitrackArrangement,
  type TrackEvent,
} from './multitrack.js';
import { applyMultitrackMutation } from './multitrack-operations.js';
export interface EditorCursor {
  trackId: string;
  measureId: string;
  start: MusicalTime;
  string: number;
}
export interface ToneSelection {
  eventId: string;
  string: number | null;
}
export const roleNames = {
  vocal_melody: 'Zangmelodie',
  guitar_accompaniment: 'Gitaarbegeleiding',
  second_guitar: 'Tweede gitaar',
  custom: 'Eigen spoor',
};
export const value = (t: MusicalTime) => t.numerator / t.denominator;
export const add = (a: MusicalTime, b: MusicalTime) =>
  fraction(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
export function measureColumns(width: number, choice: number) {
  return choice || (width >= 1280 ? 4 : width >= 980 ? 3 : 2);
}
export function scoreSystems(a: MultitrackArrangement, columns: number) {
  return a.sections.flatMap((s) =>
    Array.from({ length: Math.ceil(s.measures.length / columns) }, (_, i) => ({
      section: s,
      measures: s.measures.slice(i * columns, (i + 1) * columns),
    })),
  );
}
export function positionPercent(
  start: MusicalTime,
  meter: { beats: number; beatUnit: number },
) {
  return (value(start) / (meter.beats / meter.beatUnit)) * 100;
}
export function inputBuffer(previous: string, digit: string) {
  const next = previous + digit;
  if (!/^\d{1,2}$/.test(next) || Number(next) > 24)
    throw new Error('Voer een fysieke fret van 0 tot 24 in; Escape annuleert.');
  return next;
}
export function writeFret(
  input: MultitrackSong,
  arrangementId: string,
  c: EditorCursor,
  fret: number,
  duration: MusicalTime,
  technique?: TrackEvent['technique'],
) {
  const song = structuredClone(input),
    a = song.arrangements.find((a) => a.id === arrangementId),
    t = a?.tracks.find((t) => t.id === c.trackId);
  if (
    !a ||
    !t ||
    !Number.isInteger(fret) ||
    fret < t.instrument.capo ||
    fret > 24
  )
    throw new Error('Fysieke fret moet tussen de capo en fret 24 liggen.');
  const tone = {
    pitch: pitchAt(t.instrument, { string: c.string, fret }),
    position: { string: c.string, fret },
  };
  const matches = t.events.filter(
    (e) => e.measureId === c.measureId && sameTime(e.start, c.start),
  );
  const onString = matches.find((e) =>
    e.tones.some((t) => t.position?.string === c.string),
  );
  if (onString) {
    onString.tones = onString.tones.map((p) =>
      p.position?.string === c.string ? tone : p,
    );
    onString.duration = structuredClone(duration);
  } else {
    const group = matches.find(
      (e) =>
        e.kind === 'note' &&
        sameTime(e.duration, duration) &&
        (!technique || (e.technique ?? 'normal') === technique),
    );
    if (group) group.tones.push(tone);
    else
      t.events.push({
        id: uid(),
        measureId: c.measureId,
        kind: 'note',
        start: structuredClone(c.start),
        duration: structuredClone(duration),
        ...(technique ? { technique } : {}),
        tones: [tone],
      });
  }
  const rests = matches.filter((e) => e.kind === 'rest').map((e) => e.id);
  t.events = t.events.filter((e) => !rests.includes(e.id));
  return MultitrackSongSchema.parse(song);
}
export function deleteTones(
  input: MultitrackSong,
  arrangementId: string,
  trackId: string,
  selection: ToneSelection[],
) {
  let song = structuredClone(input);
  const t = song.arrangements
    .find((a) => a.id === arrangementId)
    ?.tracks.find((t) => t.id === trackId);
  if (!t) throw new Error('Onbekend spoor');
  const removed: string[] = [];
  for (const e of t.events) {
    const selected = selection.filter((s) => s.eventId === e.id);
    if (!selected.length) continue;
    if (e.kind === 'rest') removed.push(e.id);
    else {
      const tones = e.tones.filter(
        (p) => !selected.some((s) => s.string === p.position?.string),
      );
      if (!tones.length) removed.push(e.id);
      else e.tones = tones;
    }
  }
  for (const id of removed)
    song = applyMultitrackMutation(song, {
      op: 'delete-event',
      arrangementId,
      trackId,
      eventId: id,
      confirmed: true,
    });
  return MultitrackSongSchema.parse(song);
}
export function putRest(
  input: MultitrackSong,
  arrangementId: string,
  c: EditorCursor,
  duration: MusicalTime,
) {
  let song = structuredClone(input);
  const t = song.arrangements
    .find((a) => a.id === arrangementId)!
    .tracks.find((t) => t.id === c.trackId)!;
  const current = t.events.filter(
    (e) => e.measureId === c.measureId && sameTime(e.start, c.start),
  );
  for (const e of current)
    song = applyMultitrackMutation(song, {
      op: 'delete-event',
      arrangementId,
      trackId: c.trackId,
      eventId: e.id,
      confirmed: true,
    });
  return applyMultitrackMutation(song, {
    op: 'put-event',
    arrangementId,
    trackId: c.trackId,
    event: {
      id: uid(),
      measureId: c.measureId,
      start: c.start,
      duration,
      kind: 'rest',
      tones: [],
    },
  });
}
export function moveCursor(
  a: MultitrackArrangement,
  c: EditorCursor,
  horizontal: number,
  vertical: number,
  duration: MusicalTime,
): EditorCursor {
  const measures = timeline(a);
  let index = measures.findIndex((m) => m.id === c.measureId);
  if (index < 0) index = 0;
  let start =
    horizontal < 0
      ? add(c.start, {
          numerator: -duration.numerator,
          denominator: duration.denominator,
        })
      : horizontal > 0
        ? add(c.start, duration)
        : c.start;
  if (value(start) < 0) {
    if (index > 0) {
      index--;
      const m = measures[index]!;
      start = add(fraction(m.timeSignature.beats, m.timeSignature.beatUnit), {
        numerator: -duration.numerator,
        denominator: duration.denominator,
      });
    } else start = fraction(0, 1);
  }
  if (
    value(start) >=
    measures[index]!.timeSignature.beats /
      measures[index]!.timeSignature.beatUnit
  ) {
    if (index < measures.length - 1) {
      index++;
      start = fraction(0, 1);
    } else start = c.start;
  }
  return {
    ...c,
    measureId: measures[index]!.id,
    start,
    string: Math.max(1, Math.min(6, c.string + vertical)),
  };
}
export function trackProjection(
  song: MultitrackSong,
  arrangementId: string,
  trackId: string,
): StudioArrangement {
  const copy = structuredClone(song);
  copy.arrangements.find((a) => a.id === arrangementId)!.legacyTrackId =
    trackId;
  return toLegacy(copy).arrangements.find((a) => a.id === arrangementId)!;
}
export function duplicateArrangement(
  input: MultitrackSong,
  arrangementId: string,
  empty = false,
) {
  const song = structuredClone(input),
    source = song.arrangements.find((a) => a.id === arrangementId)!;
  const a = structuredClone(source),
    map = new Map<string, string>();
  const collect = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) v.forEach(collect);
    else {
      const o = v as Record<string, unknown>;
      if (typeof o.id === 'string') map.set(o.id, uid());
      Object.values(o).forEach(collect);
    }
  };
  collect(a);
  const refs = new Set([
    'id',
    'arrangementId',
    'measureId',
    'sectionId',
    'trackId',
    'activeTrackId',
    'legacyTrackId',
  ]);
  const remap = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(remap)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v).map(([k, x]) => [
              k,
              Array.isArray(x) && ['trackOrder', 'eventIds'].includes(k)
                ? x.map((y) => map.get(y as string) ?? y)
                : typeof x === 'string' && refs.has(k)
                  ? (map.get(x) ?? x)
                  : remap(x),
            ]),
          )
        : v;
  const copy = remap(a) as MultitrackArrangement;
  copy.name = source.name.slice(0, 60) + (empty ? ' · nieuw' : ' · kopie');
  copy.songId = song.id;
  if (empty) {
    copy.tracks = [copy.tracks[0]!];
    copy.tracks[0]!.events = [];
    copy.tracks[0]!.order = 0;
    copy.trackOrder = [copy.tracks[0]!.id];
    copy.legacyTrackId = copy.activeTrackId = copy.tracks[0]!.id;
    copy.chordAnchors = [];
    copy.lyricsLinks = [];
  }
  song.arrangements.push(copy);
  song.lastArrangementId = copy.id;
  return MultitrackSongSchema.parse(song);
}
export function selectedRange(
  a: MultitrackArrangement,
  first: string,
  last: string,
) {
  const m = timeline(a),
    x = m.findIndex((m) => m.id === first),
    y = m.findIndex((m) => m.id === last);
  return m.slice(Math.min(x, y), Math.max(x, y) + 1).map((m) => m.id);
}
export function practiceTracks(a: MultitrackArrangement, view: string) {
  return a.tracks
    .filter(
      (t) =>
        t.visible &&
        (view === 'vocal'
          ? t.role === 'vocal_melody'
          : view === 'guitar'
            ? ['guitar_accompaniment', 'second_guitar'].includes(t.role)
            : view === 'linked'
              ? a.lyricsLinks.some((l) => l.trackId === t.id)
              : view !== 'lyrics'),
    )
    .sort((x, y) => a.trackOrder.indexOf(x.id) - a.trackOrder.indexOf(y.id));
}
export function setDurations(
  input: MultitrackSong,
  arrangementId: string,
  trackId: string,
  ids: string[],
  duration: MusicalTime,
) {
  const song = structuredClone(input),
    t = song.arrangements
      .find((a) => a.id === arrangementId)!
      .tracks.find((t) => t.id === trackId)!;
  for (const e of t.events)
    if (ids.includes(e.id)) e.duration = structuredClone(duration);
  return MultitrackSongSchema.parse(song);
}
export function currentEvents(
  a: MultitrackArrangement,
  c: EditorCursor,
): TrackEvent[] {
  return (
    a.tracks
      .find((t) => t.id === c.trackId)
      ?.events.filter(
        (e) => e.measureId === c.measureId && sameTime(e.start, c.start),
      ) ?? []
  );
}

export interface DocumentHistory {
  past: MultitrackSong[];
  future: MultitrackSong[];
}
export function pushHistory(
  history: DocumentHistory,
  current: MultitrackSong,
): DocumentHistory {
  return { past: [...history.past.slice(-99), current], future: [] };
}
export function stepHistory(
  history: DocumentHistory,
  current: MultitrackSong,
  redo = false,
) {
  const source = redo ? history.future : history.past,
    next = source.at(-1);
  if (!next) return null;
  return {
    document: next,
    history: redo
      ? { past: [...history.past, current], future: source.slice(0, -1) }
      : { past: source.slice(0, -1), future: [...history.future, current] },
  };
}
