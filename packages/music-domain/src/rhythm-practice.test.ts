import { expect, it } from 'vitest';
import { editRhythm, eraseRhythm, PracticeRun } from './rhythm-practice';
import { rhythmPreset, type RhythmPattern } from './theory';
import { ConfigurationSchema, configurationIdentity } from './practice';
import { practiceCatalog } from './practice-catalog';
import {
  defaultTransportOptions,
  PracticePreferencesInputSchema,
} from './practice-transport';
const empty = (beats = 4, beatUnit: 4 | 8 = 4): RhythmPattern => ({
  meter: { beats, beatUnit },
  events: [],
});
it('places every required duration with rational whole-note values and exact measure boundaries', () => {
  for (const d of [1, 2, 4, 8, 16]) {
    const p = editRhythm(empty(), 0, d, 'note', 'down', true);
    expect(p.events[0]!.duration).toEqual({ numerator: 1, denominator: d });
    expect(p.events[0]!.accent).toBe(true);
  }
  expect(
    editRhythm(empty(), 15, 16, 'note', 'up', false).events[0]!.start,
  ).toEqual({ numerator: 15, denominator: 16 });
});
it('rejects overlap without mutation and replaces only the chosen event while preserving identity', () => {
  const original = rhythmPreset('quarters'),
    before = structuredClone(original);
  expect(() => editRhythm(original, 1, 4, 'note', 'up', true)).toThrow(
    'overlapt',
  );
  expect(original).toEqual(before);
  const replaced = editRhythm(original, 0, 8, 'rest', 'up', true);
  expect(replaced.events.at(-1)).toMatchObject({
    id: original.events[0]!.id,
    kind: 'rest',
    stroke: null,
    accent: false,
  });
  expect(eraseRhythm(replaced, 0).events).toHaveLength(3);
});
it('rejects invalid duration/grid and events beyond all supported meters without changing meter', () => {
  for (const p of [empty(2), empty(3), empty(6, 8)])
    expect(() => editRhythm(p, 0, 1, 'note', 'down', false)).toThrow();
  expect(() => editRhythm(empty(), -1, 4, 'note', 'down', false)).toThrow();
  expect(() => editRhythm(empty(), 0, 3, 'note', 'down', false)).toThrow();
  expect(editRhythm(empty(6, 8), 10, 8, 'note', 'up', true).meter).toEqual({
    beats: 6,
    beatUnit: 8,
  });
  expect(() => editRhythm(empty(6, 8), 11, 8, 'note', 'up', true)).toThrow();
});
it('supports an offbeat syncopated accented stroke and explicit silence', () => {
  const p = editRhythm(empty(), 2, 4, 'note', 'up', true);
  expect(p.events[0]).toMatchObject({
    start: { numerator: 1, denominator: 8 },
    duration: { numerator: 1, denominator: 4 },
    stroke: 'up',
    accent: true,
  });
  expect(editRhythm(p, 8, 2, 'rest', 'down', true).events.at(-1)).toMatchObject(
    { kind: 'rest', stroke: null, accent: false },
  );
});
it('accounts only active audio time and completed bars across pause, stop and resume', () => {
  const run = new PracticeRun();
  run.observe('running', 10, { bar: 0, bpm: 60 });
  run.observe('running', 12, { bar: 1, bpm: 65 });
  run.observe('paused', 12, { bar: 1, bpm: 65 });
  run.observe('paused', 1000, { bar: 1, bpm: 65 });
  run.observe('running', 1000, { bar: 1, bpm: 65 });
  run.observe('running', 1001, { bar: 1, bpm: 65 });
  expect(run.seconds).toBe(3);
  expect(run.bars).toBe(1);
  run.observe('stopped', 1001, null);
  run.observe('running', 1001, { bar: 0, bpm: 70 });
  run.observe('running', 1003, { bar: 1, bpm: 80 });
  expect(run.seconds).toBe(5);
  expect(run.bars).toBe(2);
  expect(run.maxBpm).toBe(80);
  run.reset();
  expect(run.seconds + run.bars + run.maxBpm).toBe(0);
});
it('accepts optional persisted transport without altering legacy catalog and validates goals and ramp', () => {
  const c = practiceCatalog[0]!.defaultConfiguration;
  expect(ConfigurationSchema.parse(c)).not.toHaveProperty('transport');
  expect(
    ConfigurationSchema.parse({ ...c, transport: defaultTransportOptions })
      .transport,
  ).toEqual(defaultTransportOptions);
  expect(
    ConfigurationSchema.safeParse({
      ...c,
      transport: {
        ...defaultTransportOptions,
        ramp: { ...defaultTransportOptions.ramp, start: 120, target: 60 },
      },
    }).success,
  ).toBe(false);
  expect(
    PracticePreferencesInputSchema.safeParse({
      goals: ['  Rustige kwartslagen '],
      revision: 0,
      lastExerciseId: 'r1',
    }).data?.goals,
  ).toEqual(['Rustige kwartslagen']);
  expect(
    PracticePreferencesInputSchema.safeParse({
      goals: Array(6).fill('doel'),
      revision: 0,
      lastExerciseId: null,
    }).success,
  ).toBe(false);
});

it('preserves legacy configuration hashes when the new playback options are only defaults', () => {
  const c = practiceCatalog[0]!.defaultConfiguration;
  expect(
    configurationIdentity({ ...c, transport: defaultTransportOptions }),
  ).toBe(configurationIdentity(c));
  expect(
    configurationIdentity({
      ...c,
      transport: { ...defaultTransportOptions, volume: 0.2 },
    }),
  ).not.toBe(configurationIdentity(c));
});
