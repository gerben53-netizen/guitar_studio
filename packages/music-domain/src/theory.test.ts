import { expect, it } from 'vitest';
import {
  scaleTones,
  scalePositions,
  tonePositions,
  intervalAt,
  progression,
  rhythmPreset,
  RhythmPatternSchema,
  sixteenthSeconds,
  type ScaleType,
} from './theory';
import { standardTuning, pitchAt, type InstrumentProfile } from './index';
import { fraction } from './workspace';
const oracle: Record<ScaleType, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  majorPent: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
};
it('calculates all 48 scales and correct I/III/V intervals, including pentatonic degrees', () => {
  for (let root = 0; root < 12; root++)
    for (const type of Object.keys(oracle) as ScaleType[]) {
      const tones = scaleTones(root, type);
      expect(tones.map((t) => t.pitchClass)).toEqual(
        oracle[type].map((n) => (root + n) % 12),
      );
      expect(tones.find((t) => t.roman === 'I')!.pitchClass).toBe(root);
      expect(tones.find((t) => t.roman === 'III')!.semitones).toBe(
        type.startsWith('minor') ? 3 : 4,
      );
      expect(tones.find((t) => t.roman === 'V')!.semitones).toBe(7);
    }
  expect(scaleTones(6, 'major').map((t) => t.name)).toContain('E♯');
  expect(intervalAt(9, 'minor', 60)?.roman).toBe('III');
  expect(intervalAt(0, 'major', 61)).toBeNull();
});
it('harmonizes all 36 progressions using triad intervals and diatonic note spelling', () => {
  const forms = {
    'I-IV-V': { offsets: [0, 5, 7], qualities: ['major', 'major', 'major'] },
    'I-V-vi-IV': {
      offsets: [0, 7, 9, 5],
      qualities: ['major', 'major', 'minor', 'major'],
    },
    'ii-V-I': { offsets: [2, 7, 0], qualities: ['minor', 'major', 'major'] },
  } as const;
  for (let root = 0; root < 12; root++)
    for (const form of Object.keys(forms) as (keyof typeof forms)[]) {
      const chords = progression(root, form);
      expect(chords.map((c) => c.root)).toEqual(
        forms[form].offsets.map((n) => (root + n) % 12),
      );
      expect(chords.map((c) => c.quality)).toEqual(forms[form].qualities);
      for (const chord of chords)
        expect(
          chord.pitchClasses.map((n) => (n - chord.root + 12) % 12),
        ).toEqual(chord.quality === 'major' ? [0, 4, 7] : [0, 3, 7]);
    }
  expect(progression(0, 'ii-V-I').map((c) => c.name)).toEqual(['Dm', 'G', 'C']);
  expect(() => progression(12, 'ii-V-I')).toThrow();
});
it('reuses physical pitch calculations over every string/fret for standard, Drop D and capo', () => {
  for (const pitches of [standardTuning.pitches, [64, 59, 55, 50, 45, 38]])
    for (const capo of [0, 2, 12]) {
      const p: InstrumentProfile = {
        id: 'test',
        type: 'electric',
        stringCount: 6,
        tuning: { name: 'test', pitches },
        capo,
        maxFret: 24,
        preferredInput: 'audio-interface',
      };
      const positions = scalePositions(p, 0, 'major');
      for (let string = 1; string <= 6; string++)
        for (let fret = capo; fret <= 24; fret++) {
          const pitch = pitchAt(p, { string, fret });
          expect(tonePositions(p, pitch)).toContainEqual({
            string,
            fret,
            absoluteFret: fret,
            relativeFret: fret - capo,
            pitch,
          });
          expect(
            positions.some(
              (n) => n.string === string && n.absoluteFret === fret,
            ),
          ).toBe([0, 2, 4, 5, 7, 9, 11].includes(pitch % 12));
        }
      expect(
        positions.every((n) => n.absoluteFret >= capo && n.absoluteFret <= 24),
      ).toBe(true);
    }
});
it('models meters, strokes, syncopations and rests with rational bounds independent of pixels', () => {
  for (const meter of [
    { beats: 2, beatUnit: 4 as const },
    { beats: 3, beatUnit: 4 as const },
    { beats: 4, beatUnit: 4 as const },
    { beats: 6, beatUnit: 8 as const },
  ])
    for (const name of [
      'quarters',
      'eighths',
      'sixteenths',
      'syncopated',
      'six',
    ] as const) {
      const pattern = rhythmPreset(name, meter);
      expect(RhythmPatternSchema.safeParse(pattern).success).toBe(true);
    }
  const p = rhythmPreset('syncopated');
  expect(p.events.some((e) => e.kind === 'rest')).toBe(true);
  expect(p.events.some((e) => e.stroke === 'up')).toBe(true);
  expect(() =>
    RhythmPatternSchema.parse({
      ...p,
      events: [
        { ...p.events[0]!, start: fraction(15, 16), duration: fraction(1, 4) },
      ],
    }),
  ).toThrow();
  expect(() =>
    RhythmPatternSchema.parse({
      ...p,
      events: [p.events[0], { ...p.events[0]!, id: 'overlap' }],
    }),
  ).toThrow();
  expect(sixteenthSeconds(60, { beats: 6, beatUnit: 8 })).toBeCloseTo(1 / 6);
  expect(sixteenthSeconds(120, { beats: 4, beatUnit: 4 })).toBeCloseTo(0.125);
});
