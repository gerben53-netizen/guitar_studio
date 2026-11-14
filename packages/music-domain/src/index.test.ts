import { expect, it } from 'vitest';
import {
  InstrumentProfileSchema,
  NoteEventSchema,
  pitchAt,
  possiblePositions,
  standardTuning,
  validateMeasure,
  type InstrumentProfile,
  type NoteEvent,
} from './index';
const profile: InstrumentProfile = {
  id: 'guitar',
  type: 'acoustic',
  stringCount: 6,
  tuning: standardTuning,
  capo: 0,
  maxFret: 24,
  preferredInput: 'builtin-microphone',
};
const note: NoteEvent = {
  id: 'n',
  kind: 'note',
  start: { numerator: 0, denominator: 1 },
  duration: { numerator: 1, denominator: 4 },
  tones: [{ pitch: 64, position: { string: 1, fret: 0 } }],
};
it('maps standard tuning, alternate tuning and capo', () => {
  expect(pitchAt(profile, { string: 6, fret: 0 })).toBe(40);
  expect(
    pitchAt(
      {
        ...profile,
        tuning: { name: 'Drop D', pitches: [64, 59, 55, 50, 45, 38] },
      },
      { string: 6, fret: 0 },
    ),
  ).toBe(38);
  expect(pitchAt({ ...profile, capo: 2 }, { string: 1, fret: 2 })).toBe(66);
  expect(() =>
    pitchAt({ ...profile, capo: 2 }, { string: 1, fret: 0 }),
  ).toThrow();
  expect(possiblePositions(profile, 64)).toContainEqual({ string: 2, fret: 5 });
});
it('validates both instrument types, tuning length and capo bounds', () => {
  expect(
    InstrumentProfileSchema.safeParse({
      ...profile,
      type: 'electric',
      preferredInput: 'audio-interface',
    }).success,
  ).toBe(true);
  for (const patch of [
    { stringCount: 7 },
    { capo: 25 },
    { tuning: { name: 'bad', pitches: [64] } },
  ])
    expect(
      InstrumentProfileSchema.safeParse({ ...profile, ...patch }).success,
    ).toBe(false);
});
it('supports simultaneous tones and rests; rejects invalid timing and string collisions', () => {
  expect(
    NoteEventSchema.safeParse({
      ...note,
      tones: [...note.tones, { pitch: 59, position: { string: 2, fret: 0 } }],
    }).success,
  ).toBe(true);
  expect(
    NoteEventSchema.safeParse({ ...note, kind: 'rest', tones: [] }).success,
  ).toBe(true);
  for (const patch of [
    { kind: 'rest' },
    { tones: [] },
    { duration: { numerator: 0, denominator: 4 } },
    { start: { numerator: 0, denominator: 0 } },
    { tones: [...note.tones, ...note.tones] },
  ])
    expect(NoteEventSchema.safeParse({ ...note, ...patch }).success).toBe(
      false,
    );
});
it('checks measure capacity, pitch agreement and overlapping string use', () => {
  const measure = {
    id: 'm',
    timeSignature: { beats: 4, beatUnit: 4 as const },
    events: [note],
  };
  expect(() => validateMeasure(measure, profile)).not.toThrow();
  expect(() =>
    validateMeasure(
      {
        ...measure,
        events: [{ ...note, start: { numerator: 1, denominator: 1 } }],
      },
      profile,
    ),
  ).toThrow();
  expect(() =>
    validateMeasure(
      {
        ...measure,
        events: [
          { ...note, tones: [{ pitch: 65, position: { string: 1, fret: 0 } }] },
        ],
      },
      profile,
    ),
  ).toThrow();
  expect(() =>
    validateMeasure(
      { ...measure, events: [note, { ...note, id: 'other' }] },
      profile,
    ),
  ).toThrow();
});
