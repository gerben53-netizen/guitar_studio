import { z } from 'zod';
import {
  PracticeTransportOptionsSchema,
  defaultTransportOptions,
} from './practice-transport.js';
import {
  InstrumentProfileSchema,
  RationalSchema,
  NoteEventSchema,
  TimeSignatureSchema,
} from './index.js';
import {
  PracticeMeterSchema,
  RhythmPatternSchema,
  ScaleTypeSchema,
  PitchClassSchema,
} from './theory.js';
export const LabSchema = z.enum(['rhythm', 'scale', 'chord', 'technique']);
export const LevelSchema = z.enum([
  'Basis',
  'Ontwikkeling',
  'Toepassing',
  'Verdieping',
]);
export const ExerciseIdSchema = z.string().min(1).max(100);
export const SpecificSchema = z.discriminatedUnion('lab', [
  z.strictObject({ lab: z.literal('rhythm'), pattern: RhythmPatternSchema }),
  z.strictObject({
    lab: z.literal('scale'),
    root: PitchClassSchema,
    scale: ScaleTypeSchema,
    direction: z.enum(['up', 'down']),
  }),
  z.strictObject({
    lab: z.literal('chord'),
    sequence: z
      .array(
        z.strictObject({
          root: PitchClassSchema,
          quality: z.enum(['major', 'minor', 'diminished']),
        }),
      )
      .min(2)
      .max(16),
  }),
  z.strictObject({
    lab: z.literal('technique'),
    patternId: z.string().min(1).max(80),
    steps: z
      .array(
        z.strictObject({
          id: z.string().min(1),
          string: z.number().int().min(1).max(6),
          fret: z.number().int().min(0).max(24),
          finger: z.string().max(10),
          technique: z.enum(['none', 'hammer-on', 'pull-off']),
        }),
      )
      .min(1)
      .max(256),
  }),
]);
export const ConfigurationSchema = z
  .strictObject({
    exerciseId: ExerciseIdSchema,
    exerciseVersion: z.number().int().positive(),
    instrument: InstrumentProfileSchema,
    bpm: z.number().int().min(20).max(300),
    transport: PracticeTransportOptionsSchema.optional(),
    meter: PracticeMeterSchema,
    difficulty: LevelSchema,
    position: z
      .strictObject({
        from: z.number().int().min(0).max(24),
        to: z.number().int().min(0).max(24),
      })
      .refine((v) => v.from <= v.to, 'Position range reversed'),
    specific: SpecificSchema,
  })
  .superRefine((c, ctx) => {
    if (c.position.to > c.instrument.maxFret)
      ctx.addIssue({
        code: 'custom',
        message: 'Position exceeds instrument fret range',
      });
    if (
      c.specific.lab === 'technique' &&
      c.specific.steps.some(
        (step) =>
          step.fret < c.instrument.capo || step.fret > c.instrument.maxFret,
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Unplayable technique position',
      });
    if (c.position.to < c.instrument.capo)
      ctx.addIssue({ code: 'custom', message: 'Position is below capo' });
    if (
      c.specific.lab === 'rhythm' &&
      (c.specific.pattern.meter.beats !== c.meter.beats ||
        c.specific.pattern.meter.beatUnit !== c.meter.beatUnit)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Rhythm/configuration meter mismatch',
      });
  });
export type ExerciseConfiguration = z.infer<typeof ConfigurationSchema>;
export const ExerciseSchema = z
  .strictObject({
    id: ExerciseIdSchema,
    version: z.number().int().positive(),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    lab: LabSchema,
    category: z.string().min(1).max(100),
    level: LevelSchema,
    goal: z.string().min(1).max(2000),
    instructions: z.array(z.string().min(1).max(4000)).min(1),
    startBpm: z.number().int().min(20).max(300),
    targetBpm: z.number().int().min(20).max(300),
    estimatedSeconds: z.number().int().positive().max(86400),
    compatibleInstruments: z.array(z.enum(['acoustic', 'electric'])).min(1),
    defaultConfiguration: ConfigurationSchema,
    content: SpecificSchema,
  })
  .superRefine((e, ctx) => {
    if (
      e.id !== e.defaultConfiguration.exerciseId ||
      e.version !== e.defaultConfiguration.exerciseVersion ||
      e.lab !== e.content.lab ||
      e.lab !== e.defaultConfiguration.specific.lab
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Exercise identity/lab mismatch',
      });
  });
export type Exercise = z.infer<typeof ExerciseSchema>;
/** Stable semantic serialization. Labels, IDs and key order do not create new mastery scopes. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => JSON.stringify(key) + ':' + canonical(v))
      .join(',') +
    '}'
  );
}
export function configurationIdentity(input: ExerciseConfiguration) {
  const c = ConfigurationSchema.parse(input);
  const { transport, ...base } = c;
  const { id: _id, tuning, ...profile } = c.instrument;
  void _id;
  const specific = structuredClone(c.specific);
  if (specific.lab === 'rhythm') {
    specific.pattern.events = specific.pattern.events
      .sort((a, b) => {
        const d =
          BigInt(a.start.numerator) * BigInt(b.start.denominator) -
          BigInt(b.start.numerator) * BigInt(a.start.denominator);
        return d < 0n ? -1 : d > 0n ? 1 : 0;
      })
      .map((event, i) => ({
        ...event,
        id: 'event-' + i,
        start: reduce(event.start),
        duration: reduce(event.duration),
      }));
  }
  if (specific.lab === 'technique')
    specific.steps = specific.steps.map((step, i) => ({
      ...step,
      id: 'step-' + i,
    }));
  return (
    'practice-configuration:v1:' +
    canonical({
      ...base,
      ...(transport &&
      canonical(transport) !== canonical(defaultTransportOptions)
        ? { transport }
        : {}),
      instrument: { ...profile, tuning: { pitches: tuning.pitches } },
      specific,
    })
  );
}
function reduce(time: { numerator: number; denominator: number }) {
  let a = time.numerator,
    b = time.denominator;
  while (b) {
    const n = a % b;
    a = b;
    b = n;
  }
  const d = a || 1;
  return { numerator: time.numerator / d, denominator: time.denominator / d };
}
export const ConfigurationKeySchema = z.string().regex(/^[a-f0-9]{64}$/);
export const SessionInputSchema = z
  .strictObject({
    id: z.uuid(),
    exerciseId: ExerciseIdSchema,
    configurationKey: ConfigurationKeySchema,
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    durationSeconds: z.number().int().nonnegative().max(86400),
    repetitions: z.number().int().nonnegative().max(100000),
    rating: z.number().int().min(1).max(5),
    notes: z.string().max(4000),
    result: z.enum(['Uitgevoerd', 'Beheerst']),
    masteryConfirmed: z.boolean(),
    snapshot: ConfigurationSchema,
  })
  .superRefine((s, ctx) => {
    const elapsed = (Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000;
    if (elapsed < 0 || s.durationSeconds > elapsed + 1)
      ctx.addIssue({ code: 'custom', message: 'Invalid session duration' });
    if (s.exerciseId !== s.snapshot.exerciseId)
      ctx.addIssue({ code: 'custom', message: 'Session exercise mismatch' });
    if (s.result === 'Beheerst' && !s.masteryConfirmed)
      ctx.addIssue({
        code: 'custom',
        message: 'Mastery requires explicit confirmation',
      });
    if (s.result === 'Uitgevoerd' && s.masteryConfirmed)
      ctx.addIssue({ code: 'custom', message: 'Conflicting mastery decision' });
  });
export type PracticeSessionInput = z.infer<typeof SessionInputSchema>;
export interface PracticeSession extends PracticeSessionInput {
  ownerId: string;
  createdAt: string;
  bpm: number;
  instrument: ExerciseConfiguration['instrument'];
}
export const MasteryInputSchema = z
  .strictObject({
    exerciseId: ExerciseIdSchema,
    exerciseVersion: z.number().int().positive(),
    scope: z.enum(['configuration', 'exercise']),
    configurationKey: ConfigurationKeySchema.nullable(),
    mastered: z.boolean(),
    confirmed: z.literal(true),
  })
  .refine(
    (m) =>
      m.scope === 'configuration'
        ? m.configurationKey !== null
        : m.configurationKey === null,
    'Mastery scope/key mismatch',
  );
export type PracticeMastery = z.infer<typeof MasteryInputSchema> & {
  ownerId: string;
  updatedAt: string;
};
export const ProgressStatusSchema = z.enum([
  'Nog niet begonnen',
  'Aan het oefenen',
  'Uitgevoerd',
  'Beheerst',
]);
export interface PracticeProgress {
  exerciseId: string;
  ownerId: string;
  lastPracticed: string | null;
  sessionCount: number;
  highestBpm: number | null;
  status: z.infer<typeof ProgressStatusSchema>;
  lastRating: number | null;
  mastered: boolean;
  masteredConfigurations: number;
}
export const OriginInputSchema = z.strictObject({
  songId: z.string().min(1),
  arrangementId: z.string().min(1),
  sectionId: z.string().min(1),
  measureId: z.string().min(1),
  position: RationalSchema,
  stringSelection: z.array(z.number().int().min(1).max(6)).max(6),
  exerciseType: LabSchema,
});
export type PracticeOriginInput = z.infer<typeof OriginInputSchema>;
export const SourceSnapshotSchema = z.strictObject({
  instrument: InstrumentProfileSchema,
  tempo: z.number().int().positive(),
  meter: TimeSignatureSchema,
  events: z.array(NoteEventSchema),
  songRevision: z.number().int().positive(),
});
export interface PracticeOrigin extends PracticeOriginInput {
  id: string;
  ownerId: string;
  sourceConfiguration: z.infer<typeof SourceSnapshotSchema>;
  createdAt: string;
}
export type OriginResolution =
  | {
      status: 'available';
      origin: PracticeOrigin;
      selection: PracticeOriginInput;
    }
  | {
      status: 'missing-source';
      origin: PracticeOrigin;
      reason: 'song' | 'arrangement' | 'section' | 'measure' | 'position';
      fallback: 'library';
      snapshot: z.infer<typeof SourceSnapshotSchema>;
    };
/** Future UI consumes these contracts and existing editors; no placeholder React files. */
export interface PracticeRoomService {
  listExercises(filters: {
    lab?: z.infer<typeof LabSchema>;
    level?: z.infer<typeof LevelSchema>;
    category?: string;
    search?: string;
  }): Promise<Exercise[]>;
  getSettings(exerciseId: string): Promise<{
    configuration: ExerciseConfiguration;
    key: string;
    revision: number;
  }>;
  saveSession(session: PracticeSessionInput): Promise<PracticeSession>;
  resolveOrigin(id: string): Promise<OriginResolution>;
}
