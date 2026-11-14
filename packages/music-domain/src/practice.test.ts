import { expect, it } from 'vitest';
import { practiceCatalog } from './practice-catalog';
import {
  configurationIdentity,
  ConfigurationSchema,
  SessionInputSchema,
  MasteryInputSchema,
  type PracticeOrigin,
} from './practice';
import { findPassage, sourceSnapshot, resolveOrigin } from './practice-origin';
import { newSong, emptyMeasure, fraction, putTone } from './workspace';
it('keeps 18 original versioned exercises and omits fictional prototype achievements', () => {
  expect(practiceCatalog).toHaveLength(18);
  expect(new Set(practiceCatalog.map((e) => e.id)).size).toBe(18);
  expect(
    practiceCatalog.map((e) => e.lab).filter((l) => l === 'technique'),
  ).toHaveLength(6);
  for (const e of practiceCatalog) {
    expect(e.version).toBe(1);
    expect(e.compatibleInstruments).toEqual(['acoustic', 'electric']);
    expect(e.instructions.length).toBeGreaterThan(0);
  }
});
it('uses semantic configuration identities, independent of IDs/key order and separated by tempo/position/key/version', () => {
  const config = structuredClone(
    practiceCatalog.find((e) => e.id === 's3')!.defaultConfiguration,
  );
  const equivalent = structuredClone(config);
  equivalent.instrument.id = 'another-display-id';
  equivalent.instrument.tuning.name = 'Other label';
  expect(configurationIdentity(config)).toBe(configurationIdentity(equivalent));
  for (const patch of [
    { bpm: 80 },
    { position: { from: 5, to: 9 } },
    { exerciseVersion: 2 },
  ])
    expect(configurationIdentity({ ...config, ...patch })).not.toBe(
      configurationIdentity(config),
    );
  if (equivalent.specific.lab === 'scale') equivalent.specific.root = 0;
  expect(configurationIdentity(equivalent)).not.toBe(
    configurationIdentity(config),
  );
});
it('requires explicit mastery confirmation and valid session time snapshots', () => {
  const config = practiceCatalog[0]!.defaultConfiguration;
  const body = {
    id: crypto.randomUUID(),
    exerciseId: config.exerciseId,
    configurationKey: 'a'.repeat(64),
    startedAt: '2026-11-14T10:00:00Z',
    endedAt: '2026-11-14T10:01:00Z',
    durationSeconds: 60,
    repetitions: 8,
    rating: 4,
    notes: 'Eigen reflectie',
    result: 'Beheerst',
    masteryConfirmed: false,
    snapshot: config,
  };
  expect(SessionInputSchema.safeParse(body).success).toBe(false);
  expect(
    SessionInputSchema.safeParse({ ...body, masteryConfirmed: true }).success,
  ).toBe(true);
  expect(
    SessionInputSchema.safeParse({
      ...body,
      masteryConfirmed: true,
      durationSeconds: 90,
    }).success,
  ).toBe(false);
  expect(
    MasteryInputSchema.safeParse({
      exerciseId: 's3',
      exerciseVersion: 1,
      scope: 'configuration',
      configurationKey: 'a'.repeat(64),
      mastered: true,
      confirmed: false,
    }).success,
  ).toBe(false);
});
it('restores stable song IDs across reordering and preserves full passage data and a clear deletion fallback', () => {
  const song = newSong('Origin', '', 'Eigen tekst'),
    a = song.arrangements[0]!,
    s = a.sections[0]!,
    m = s.measures[0]!;
  putTone(a, m, fraction(1, 4), fraction(1, 16), 1, 3);
  const input = {
    songId: song.id,
    arrangementId: a.id,
    sectionId: s.id,
    measureId: m.id,
    position: fraction(1, 4),
    stringSelection: [1],
    exerciseType: 'technique' as const,
  };
  const snapshot = sourceSnapshot(song, input, 2);
  const origin: PracticeOrigin = {
    ...input,
    id: crypto.randomUUID(),
    ownerId: 'local',
    sourceConfiguration: snapshot,
    createdAt: '2026-11-14T10:00:00Z',
  };
  s.measures.unshift(emptyMeasure(a.timeSignature));
  expect(findPassage(song, input).measure?.id).toBe(m.id);
  expect(resolveOrigin(origin, song).status).toBe('available');
  expect(resolveOrigin(origin, { ...song, id: 'another-song' })).toMatchObject({
    status: 'missing-source',
    reason: 'song',
  });
  m.timeSignature = { beats: 5, beatUnit: 4 };
  expect(sourceSnapshot(song, input, 2).meter).toEqual({
    beats: 5,
    beatUnit: 4,
  });
  expect(snapshot.events[0]!.duration).toEqual(fraction(1, 16));
  snapshot.tempo = 150;
  expect(a.tempo).toBe(84);
  s.measures = s.measures.filter((x) => x.id !== m.id);
  expect(resolveOrigin(origin, song).status).toBe('missing-source');
  expect(resolveOrigin(origin, null)).toMatchObject({
    status: 'missing-source',
    reason: 'song',
    fallback: 'library',
  });
});

it('rejects unplayable exercise ranges and technique steps for the selected instrument', () => {
  const c = structuredClone(
    practiceCatalog.find((e) => e.lab === 'technique')!.defaultConfiguration,
  );
  c.instrument.capo = 2;
  expect(ConfigurationSchema.safeParse(c).success).toBe(false);
  const scale = structuredClone(
    practiceCatalog.find((e) => e.id === 's3')!.defaultConfiguration,
  );
  scale.instrument.maxFret = 3;
  scale.position = { from: 0, to: 5 };
  expect(ConfigurationSchema.safeParse(scale).success).toBe(false);
});
