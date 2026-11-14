import {
  SourceSnapshotSchema,
  OriginInputSchema,
  type PracticeOrigin,
  type PracticeOriginInput,
  type OriginResolution,
} from './practice.js';
import type { StudioSong } from './workspace.js';
export function findPassage(song: StudioSong, input: PracticeOriginInput) {
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
  return { arrangement, section, measure };
}
export function sourceSnapshot(
  song: StudioSong,
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
  });
}
export function resolveOrigin(
  origin: PracticeOrigin,
  song: StudioSong | null,
): OriginResolution {
  const selection = {
    songId: origin.songId,
    arrangementId: origin.arrangementId,
    sectionId: origin.sectionId,
    measureId: origin.measureId,
    position: origin.position,
    stringSelection: origin.stringSelection,
    exerciseType: origin.exerciseType,
  };
  const reason = song ? findPassage(song, selection).reason : 'song';
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
