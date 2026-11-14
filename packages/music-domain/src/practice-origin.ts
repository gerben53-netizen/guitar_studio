import {
  SourceSnapshotSchema,
  OriginInputSchema,
  type PracticeOrigin,
  type PracticeOriginInput,
  type OriginResolution,
} from './practice.js';
import {
  legacyView,
  toMultitrack,
  timeline,
  type MultitrackSong,
} from './multitrack.js';
import { canonical } from './practice.js';
import type { StudioSong } from './workspace.js';
export function findPassage(
  stored: StudioSong | MultitrackSong,
  input: PracticeOriginInput,
) {
  const song = legacyView(stored);
  OriginInputSchema.parse(input);
  if (song.id !== input.songId) return { reason: 'song' as const };
  const arrangement = song.arrangements.find(
    (a) => a.id === input.arrangementId,
  );
  if (!arrangement) return { reason: 'arrangement' as const };
  const section = arrangement.sections.find((s) => s.id === input.sectionId);
  if (!section) return { reason: 'section' as const };
  const measure = section.measures.find((m) => m.id === input.measureId);
  if (!measure) return { reason: 'measure' as const };
  if (
    BigInt(input.position.numerator) * BigInt(measure.timeSignature.beatUnit) >=
    BigInt(measure.timeSignature.beats) * BigInt(input.position.denominator)
  )
    return { reason: 'position' as const };
  if (
    input.trackIds ||
    input.measureRange ||
    input.eventIds ||
    input.returnCursor
  ) {
    const multi = toMultitrack(stored).arrangements.find(
      (a) => a.id === input.arrangementId,
    )!;
    if (
      !input.trackIds ||
      new Set(input.trackIds).size !== input.trackIds.length ||
      input.trackIds.some((id) => !multi.tracks.some((t) => t.id === id))
    )
      return { reason: 'track' as const };
    const measures = timeline(multi);
    const from = input.measureRange
      ? measures.findIndex((m) => m.id === input.measureRange!.fromMeasureId)
      : measures.findIndex((m) => m.id === input.measureId);
    const to = input.measureRange
      ? measures.findIndex((m) => m.id === input.measureRange!.toMeasureId)
      : from;
    if (from < 0 || to < from) return { reason: 'range' as const };
    const allowedMeasures = new Set(
      measures.slice(from, to + 1).map((m) => m.id),
    );
    const tracks = multi.tracks.filter((t) => input.trackIds!.includes(t.id));
    if (
      input.eventIds &&
      (new Set(input.eventIds).size !== input.eventIds.length ||
        input.eventIds.some(
          (id) =>
            !tracks.some((t) =>
              t.events.some(
                (e) => e.id === id && allowedMeasures.has(e.measureId),
              ),
            ),
        ))
    )
      return { reason: 'event' as const };
    if (input.returnCursor) {
      const c = input.returnCursor,
        m = measures.find((m) => m.id === c.measureId);
      if (
        !input.trackIds.includes(c.trackId) ||
        !m ||
        BigInt(c.position.numerator) * BigInt(m.timeSignature.beatUnit) >=
          BigInt(m.timeSignature.beats) * BigInt(c.position.denominator)
      )
        return { reason: 'return-cursor' as const };
    }
    return {
      arrangement,
      section,
      measure,
      tracks: tracks.map((t) => ({
        id: t.id,
        instrument: t.instrument,
        events: t.events.filter(
          (e) =>
            allowedMeasures.has(e.measureId) &&
            (!input.eventIds || input.eventIds.includes(e.id)),
        ),
      })),
      timeline: measures,
    };
  }
  return { arrangement, section, measure };
}
export function sourceSnapshot(
  song: StudioSong | MultitrackSong,
  input: PracticeOriginInput,
  revision: number,
) {
  const passage = findPassage(song, input);
  if ('reason' in passage) throw new Error('Missing source ' + passage.reason);
  return SourceSnapshotSchema.parse({
    instrument: structuredClone(passage.arrangement.instrument),
    tempo: passage.arrangement.tempo,
    meter: passage.measure.timeSignature,
    events: structuredClone(passage.measure.events),
    songRevision: revision,
    ...('tracks' in passage
      ? { tracks: passage.tracks, timeline: passage.timeline }
      : {}),
  });
}
export function resolveOrigin(
  origin: PracticeOrigin,
  song: StudioSong | MultitrackSong | null,
): OriginResolution {
  const selection = {
    songId: origin.songId,
    arrangementId: origin.arrangementId,
    sectionId: origin.sectionId,
    measureId: origin.measureId,
    position: origin.position,
    stringSelection: origin.stringSelection,
    exerciseType: origin.exerciseType,
    ...(origin.trackIds ? { trackIds: origin.trackIds } : {}),
    ...(origin.measureRange ? { measureRange: origin.measureRange } : {}),
    ...(origin.eventIds ? { eventIds: origin.eventIds } : {}),
    ...(origin.returnCursor ? { returnCursor: origin.returnCursor } : {}),
  };
  let reason:
    | Extract<OriginResolution, { status: 'missing-source' }>['reason']
    | undefined = song
    ? findPassage(song, selection).reason
    : ('song' as const);
  if (!reason && song && origin.trackIds) {
    const current = sourceSnapshot(
      song,
      selection,
      origin.sourceConfiguration.songRevision,
    );
    if (
      canonical({ tracks: current.tracks, timeline: current.timeline }) !==
      canonical({
        tracks: origin.sourceConfiguration.tracks,
        timeline: origin.sourceConfiguration.timeline,
      })
    )
      reason = 'changed-source';
  }
  if (reason)
    return {
      status: 'missing-source',
      origin,
      reason,
      fallback: 'library',
      snapshot: origin.sourceConfiguration,
    };
  return { status: 'available', origin, selection };
}
