import { z } from 'zod';
const id = z.string().min(1);
const integer = z.number().int().nonnegative();
export const PitchSchema = z.number().int().min(0).max(127);
export type Pitch = z.infer<typeof PitchSchema>;
export const RationalSchema = z.strictObject({
  numerator: integer,
  denominator: z.number().int().positive(),
});
/** Whole-note fractions, independent of tempo and wall-clock time. */
export type MusicalTime = z.infer<typeof RationalSchema>;
export const TuningSchema = z.strictObject({
  name: id,
  pitches: z.array(PitchSchema).min(1),
});
export type GuitarTuning = z.infer<typeof TuningSchema>;
/** Index zero is string 1 (conventionally the highest string). */
export const standardTuning: GuitarTuning = {
  name: 'EADGBE',
  pitches: [64, 59, 55, 50, 45, 40],
};
export const InstrumentProfileSchema = z
  .strictObject({
    id,
    type: z.enum(['acoustic', 'electric']),
    stringCount: z.literal(6),
    tuning: TuningSchema,
    capo: integer,
    maxFret: z.number().int().min(1).max(36),
    preferredInput: z.enum([
      'builtin-microphone',
      'usb-microphone',
      'audio-interface',
      'direct-input',
      'amplifier-microphone',
    ]),
  })
  .superRefine((v, ctx) => {
    if (v.tuning.pitches.length !== v.stringCount)
      ctx.addIssue({
        code: 'custom',
        message: 'Tuning must match string count',
      });
    if (v.capo > v.maxFret)
      ctx.addIssue({ code: 'custom', message: 'Capo exceeds fret range' });
    if (v.tuning.pitches.some((p) => p + v.maxFret > 127))
      ctx.addIssue({ code: 'custom', message: 'Pitch range exceeded' });
  });
export type InstrumentProfile = z.infer<typeof InstrumentProfileSchema>;
/** Absolute fret: the capo fret is the open playing position. */
export interface PhysicalPosition {
  string: number;
  fret: number;
}
export function pitchAt(
  profile: InstrumentProfile,
  position: PhysicalPosition,
): Pitch {
  InstrumentProfileSchema.parse(profile);
  const { string, fret } = position;
  if (
    !Number.isInteger(string) ||
    string < 1 ||
    string > profile.stringCount ||
    !Number.isInteger(fret) ||
    fret < profile.capo ||
    fret > profile.maxFret
  )
    throw new RangeError('Unplayable position');
  return PitchSchema.parse(profile.tuning.pitches[string - 1]! + fret);
}
export function possiblePositions(
  profile: InstrumentProfile,
  pitch: Pitch,
): PhysicalPosition[] {
  InstrumentProfileSchema.parse(profile);
  PitchSchema.parse(pitch);
  return profile.tuning.pitches.flatMap((open, i) => {
    const fret = pitch - open;
    return fret >= profile.capo && fret <= profile.maxFret
      ? [{ string: i + 1, fret }]
      : [];
  });
}
const PositionSchema = z.strictObject({
  string: z.number().int().positive(),
  fret: integer,
});
export const NoteEventSchema = z
  .strictObject({
    id,
    kind: z.enum(['note', 'rest']),
    start: RationalSchema,
    duration: RationalSchema.refine(
      (v) => v.numerator > 0,
      'Duration must be positive',
    ),
    tones: z.array(
      z.strictObject({
        pitch: PitchSchema,
        position: PositionSchema.optional(),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    if (
      (v.kind === 'rest' && v.tones.length !== 0) ||
      (v.kind === 'note' && v.tones.length === 0)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Rests have no tones; notes require tones',
      });
    const strings = v.tones.flatMap((t) =>
      t.position ? [t.position.string] : [],
    );
    if (new Set(strings).size !== strings.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Simultaneous tones cannot share a string',
      });
  });
export type NoteEvent = z.infer<typeof NoteEventSchema>;
export const TimeSignatureSchema = z.strictObject({
  beats: z.number().int().positive().max(32),
  beatUnit: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(4),
    z.literal(8),
    z.literal(16),
    z.literal(32),
  ]),
});
export interface Measure {
  id: string;
  timeSignature: z.infer<typeof TimeSignatureSchema>;
  events: NoteEvent[];
}
function beforeEnd(start: MusicalTime, other: NoteEvent): boolean {
  const end =
    BigInt(other.start.numerator) * BigInt(other.duration.denominator) +
    BigInt(other.duration.numerator) * BigInt(other.start.denominator);
  return (
    BigInt(start.numerator) *
      BigInt(other.start.denominator) *
      BigInt(other.duration.denominator) <
    end * BigInt(start.denominator)
  );
}
export function validateMeasure(
  measure: Measure,
  profile: InstrumentProfile,
): void {
  InstrumentProfileSchema.parse(profile);
  TimeSignatureSchema.parse(measure.timeSignature);
  for (const event of measure.events) {
    NoteEventSchema.parse(event);
    const end =
      BigInt(event.start.numerator) * BigInt(event.duration.denominator) +
      BigInt(event.duration.numerator) * BigInt(event.start.denominator);
    if (
      end * BigInt(measure.timeSignature.beatUnit) >
      BigInt(measure.timeSignature.beats) *
        BigInt(event.start.denominator) *
        BigInt(event.duration.denominator)
    )
      throw new RangeError('Event exceeds measure');
    for (const tone of event.tones)
      if (tone.position && pitchAt(profile, tone.position) !== tone.pitch)
        throw new RangeError('Position and pitch disagree');
  }
  for (let i = 0; i < measure.events.length; i++)
    for (let j = i + 1; j < measure.events.length; j++) {
      const a = measure.events[i]!,
        b = measure.events[j]!;
      if (
        beforeEnd(a.start, b) &&
        beforeEnd(b.start, a) &&
        a.tones.some(
          (t) =>
            t.position &&
            b.tones.some((u) => u.position?.string === t.position!.string),
        )
      )
        throw new RangeError('Overlapping events on one string');
    }
}
export interface LyricsSource {
  kind: 'manual' | 'text-file' | 'licensed-provider';
  provider?: string;
  sourceUrl?: string;
  attribution?: string;
  license?: string;
  storagePermission: 'unknown' | 'allowed' | 'forbidden';
  termsUrl?: string;
  retrievedAt?: string;
}
export interface Lyrics {
  id: string;
  text: string;
  source: LyricsSource;
}
export interface Song {
  id: string;
  title: string;
  artist?: string;
  lyrics?: Lyrics;
  arrangements: Arrangement[];
}
export interface Arrangement {
  id: string;
  name: string;
  instrument: InstrumentProfile;
  sections: MusicSection[];
  chords: ChordPlacement[];
}
export interface MusicSection {
  id: string;
  name: string;
  tracks: TabTrack[];
  lyricsLinks: LyricsLink[];
}
/** Unicode code-point offsets, half-open interval. */
export interface LyricsLink {
  lyricsId: string;
  startOffset: number;
  endOffset: number;
  measureId: string;
  position: MusicalTime;
}
export interface TabTrack {
  id: string;
  name: string;
  measures: Measure[];
}
export interface Chord {
  id: string;
  name: string;
  pitches: Pitch[];
}
export interface ChordFingering {
  chordId: string;
  positions: PhysicalPosition[];
  mutedStrings: number[];
}
export interface ChordPlacement {
  chordId: string;
  measureId: string;
  position: MusicalTime;
  fingering?: ChordFingering;
  lyricsLink?: LyricsLink;
}
/** Exercise sessions supersede the unused Sprint 0 placeholder. */
export type { PracticeSession } from './practice.js';
/** Derived view only; displayFret is relative to capo. */
export interface TabDisplayCell {
  eventId: string;
  string: number;
  displayFret: number;
  column: number;
}
