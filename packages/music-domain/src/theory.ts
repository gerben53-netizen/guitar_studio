import { z } from 'zod';
import {
  InstrumentProfileSchema,
  PitchSchema,
  RationalSchema,
  TimeSignatureSchema,
  pitchAt,
  possiblePositions,
  type InstrumentProfile,
} from './index.js';
import { fraction } from './workspace.js';
export const PitchClassSchema = z.number().int().min(0).max(11);
export const ScaleTypeSchema = z.enum([
  'major',
  'minor',
  'majorPent',
  'minorPent',
]);
export type ScaleType = z.infer<typeof ScaleTypeSchema>;
const scales = {
  major: { intervals: [0, 2, 4, 5, 7, 9, 11], degrees: [1, 2, 3, 4, 5, 6, 7] },
  minor: { intervals: [0, 2, 3, 5, 7, 8, 10], degrees: [1, 2, 3, 4, 5, 6, 7] },
  majorPent: { intervals: [0, 2, 4, 7, 9], degrees: [1, 2, 3, 5, 6] },
  minorPent: { intervals: [0, 3, 5, 7, 10], degrees: [1, 3, 4, 5, 7] },
} as const;
const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;
const keyNames = [
  'C',
  'D♭',
  'D',
  'E♭',
  'E',
  'F',
  'F♯',
  'G',
  'A♭',
  'A',
  'B♭',
  'B',
];
const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  natural = [0, 2, 4, 5, 7, 9, 11];
export interface ScaleTone {
  pitchClass: number;
  degree: number;
  roman: string;
  semitones: number;
  name: string;
  anchor: boolean;
}
function spell(root: number, degree: number, pitchClass: number) {
  const letter = (letters.indexOf(keyNames[root]![0]!) + degree - 1) % 7;
  let alteration = (pitchClass - natural[letter]! + 12) % 12;
  if (alteration > 6) alteration -= 12;
  return (
    letters[letter]! +
    (alteration >= 0 ? '♯'.repeat(alteration) : '♭'.repeat(-alteration))
  );
}
export function scaleTones(root: number, type: ScaleType): ScaleTone[] {
  PitchClassSchema.parse(root);
  ScaleTypeSchema.parse(type);
  const scale = scales[type];
  return scale.intervals.map((n, i) => {
    const degree = scale.degrees[i]!,
      pitchClass = (root + n) % 12;
    return {
      pitchClass,
      degree,
      roman: romans[degree - 1]!,
      semitones: n,
      name: spell(root, degree, pitchClass),
      anchor: [1, 3, 5].includes(degree),
    };
  });
}
export function intervalAt(root: number, type: ScaleType, pitch: number) {
  PitchSchema.parse(pitch);
  const tone = scaleTones(root, type).find((t) => t.pitchClass === pitch % 12);
  return tone ?? null;
}
export function scalePositions(
  profile: InstrumentProfile,
  root: number,
  type: ScaleType,
  from = 0,
  to = 24,
) {
  InstrumentProfileSchema.parse(profile);
  z.number().int().min(0).max(24).parse(from);
  z.number().int().min(from).max(24).parse(to);
  const tones = scaleTones(root, type),
    result = [];
  for (let string = 1; string <= profile.stringCount; string++)
    for (
      let fret = Math.max(from, profile.capo);
      fret <= Math.min(to, profile.maxFret);
      fret++
    ) {
      const pitch = pitchAt(profile, { string, fret }),
        tone = tones.find((t) => t.pitchClass === pitch % 12);
      if (tone)
        result.push({
          string,
          absoluteFret: fret,
          relativeFret: fret - profile.capo,
          pitch,
          ...tone,
        });
    }
  return result;
}
export function tonePositions(profile: InstrumentProfile, pitch: number) {
  return possiblePositions(profile, pitch).map((p) => ({
    ...p,
    absoluteFret: p.fret,
    relativeFret: p.fret - profile.capo,
    pitch,
  }));
}
export const ProgressionSchema = z.enum(['I-IV-V', 'I-V-vi-IV', 'ii-V-I']);
export type ProgressionType = z.infer<typeof ProgressionSchema>;
export interface ChordSymbol {
  root: number;
  name: string;
  quality: 'major' | 'minor' | 'diminished';
  degree: string;
  pitchClasses: number[];
}
export function progression(
  root: number,
  form: ProgressionType,
): ChordSymbol[] {
  const scale = scaleTones(root, 'major');
  ProgressionSchema.parse(form);
  const sequence = {
    'I-IV-V': [0, 3, 4],
    'I-V-vi-IV': [0, 4, 5, 3],
    'ii-V-I': [1, 4, 0],
  }[form];
  return sequence.map((i) => {
    const tone = scale[i]!,
      pitchClasses = [i, i + 2, i + 4].map((n) => scale[n % 7]!.pitchClass),
      third = (pitchClasses[1]! - tone.pitchClass + 12) % 12,
      fifth = (pitchClasses[2]! - tone.pitchClass + 12) % 12;
    const quality =
      third === 4 && fifth === 7
        ? 'major'
        : third === 3 && fifth === 7
          ? 'minor'
          : 'diminished';
    const degree = quality === 'major' ? tone.roman : tone.roman.toLowerCase();
    return {
      root: tone.pitchClass,
      name: tone.name + { major: '', minor: 'm', diminished: '°' }[quality],
      quality,
      degree,
      pitchClasses,
    };
  });
}
export const PracticeMeterSchema = TimeSignatureSchema.refine(
  (m) =>
    [
      [2, 4],
      [3, 4],
      [4, 4],
      [6, 8],
    ].some(([b, u]) => m.beats === b && m.beatUnit === u),
  'Supported meters: 2/4, 3/4, 4/4, 6/8',
);
export const RhythmEventSchema = z
  .strictObject({
    id: z.string().min(1),
    start: RationalSchema,
    duration: RationalSchema.refine((d) => d.numerator > 0),
    kind: z.enum(['note', 'rest']),
    stroke: z.enum(['down', 'up']).nullable(),
    accent: z.boolean(),
  })
  .refine(
    (e) => e.kind !== 'rest' || (e.stroke === null && !e.accent),
    'A rest has no stroke/accent',
  );
export const RhythmPatternSchema = z
  .strictObject({
    meter: PracticeMeterSchema,
    events: z.array(RhythmEventSchema).max(256),
  })
  .superRefine((pattern, ctx) => {
    try {
      validateRhythm(pattern);
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: String(error) });
    }
  });
export type RhythmPattern = {
  meter: z.infer<typeof PracticeMeterSchema>;
  events: z.infer<typeof RhythmEventSchema>[];
};
function compare(
  a: { numerator: number | bigint; denominator: number | bigint },
  b: { numerator: number | bigint; denominator: number | bigint },
) {
  const d =
    BigInt(a.numerator) * BigInt(b.denominator) -
    BigInt(b.numerator) * BigInt(a.denominator);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}
function end(e: RhythmPattern['events'][number]) {
  return {
    numerator:
      BigInt(e.start.numerator) * BigInt(e.duration.denominator) +
      BigInt(e.duration.numerator) * BigInt(e.start.denominator),
    denominator: BigInt(e.start.denominator) * BigInt(e.duration.denominator),
  };
}
export function validateRhythm(pattern: RhythmPattern) {
  const seen = new Set<string>();
  const ordered = [...pattern.events].sort((a, b) => compare(a.start, b.start));
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i]!;
    RhythmEventSchema.parse(e);
    if (seen.has(e.id)) throw new Error('Duplicate rhythm event ID');
    seen.add(e.id);
    if (
      compare(end(e), fraction(pattern.meter.beats, pattern.meter.beatUnit)) > 0
    )
      throw new Error('Rhythm exceeds measure');
    if (i && compare(e.start, end(ordered[i - 1]!)) < 0)
      throw new Error('Overlapping rhythm events');
  }
}
export function rhythmPreset(
  name: 'quarters' | 'eighths' | 'sixteenths' | 'syncopated' | 'six',
  meter: z.infer<typeof PracticeMeterSchema> = { beats: 4, beatUnit: 4 },
): RhythmPattern {
  PracticeMeterSchema.parse(meter);
  const slots = (meter.beats * 16) / meter.beatUnit;
  const len = name === 'sixteenths' ? 1 : name === 'quarters' ? 4 : 2;
  const events = Array.from({ length: slots / len }, (_, i) => {
    const rest = name === 'syncopated' && [1, 4].includes(i);
    return {
      id: 'rhythm-' + i,
      start: fraction(i * len, 16),
      duration: fraction(len, 16),
      kind: rest ? ('rest' as const) : ('note' as const),
      stroke: rest
        ? null
        : i % 2 && len < 4
          ? ('up' as const)
          : ('down' as const),
      accent: !rest && (i === 0 || (meter.beatUnit === 8 && i === 3)),
    };
  });
  return RhythmPatternSchema.parse({ meter, events });
}
/** A quarter in simple meters, a dotted quarter in 6/8. */
export function beatSeconds(bpm: number) {
  z.number().min(20).max(300).parse(bpm);
  return 60 / bpm;
}
export function sixteenthSeconds(
  bpm: number,
  meter: z.infer<typeof PracticeMeterSchema>,
) {
  PracticeMeterSchema.parse(meter);
  return beatSeconds(bpm) / (meter.beatUnit === 8 ? 6 : 4);
}
