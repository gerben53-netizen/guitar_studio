import { z } from 'zod';
export const importText = z
  .string()
  .max(60000)
  .refine(
    (v) =>
      ![...v].some(
        (c) => c.charCodeAt(0) < 32 && !['\t', '\r', '\n'].includes(c),
      ),
    'Alleen leesbare tekst',
  );
const position = z.number().int().nonnegative().max(60000);
export const ContentTypeSchema = z.enum([
  'lyrics',
  'chords',
  'tablature',
  'mixed',
]);
export const ImportFormatSchema = z.enum([
  'auto',
  'lyrics',
  'chordpro',
  'ascii',
]);
export const ImportSourceSchema = z
  .strictObject({
    origin: z.enum(['user', 'external']),
    provider: z.string().max(80).nullable(),
    recordId: z.string().max(100).nullable(),
    name: z.string().max(300),
    url: z
      .url()
      .max(2000)
      .refine((v) => v.startsWith('https://'))
      .nullable(),
    method: z.enum(['paste', 'file', 'provider']),
    storage: z.enum(['user-confirmation', 'preview-only', 'personal-only']),
    personalImport: z
      .strictObject({
        scope: z.literal('personal'),
        importedAt: z.iso.datetime(),
        method: z.literal('lrclib-personal-import'),
        title: z.string().max(200),
        artist: z.string().max(200),
        album: z.string().max(300),
        timingFormat: z.enum(['plain', 'line', 'word']),
        textCorrected: z.boolean(),
        metadataCorrected: z.boolean(),
      })
      .optional(),
  })
  .refine(
    (s) =>
      s.storage === 'personal-only'
        ? s.origin === 'external' &&
          s.provider === 'lrclib' &&
          !!s.recordId &&
          /^[1-9]\d{0,14}$/.test(s.recordId) &&
          s.url === `https://lrclib.net/record/${s.recordId}` &&
          s.method === 'provider' &&
          !!s.personalImport
        : !s.personalImport,
    'Invalid personal source policy',
  );
export const SyncWordSchema = z
  .strictObject({
    text: z.string().max(10000),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative().nullable(),
  })
  .refine((v) => v.endMs === null || v.endMs >= v.startMs);
export const SyncLineSchema = z
  .strictObject({
    text: z.string().max(10000),
    startMs: z.number().int().nonnegative().nullable(),
    endMs: z.number().int().nonnegative().nullable(),
    words: z.array(SyncWordSchema).max(2000),
  })
  .refine(
    (v) => v.endMs === null || (v.startMs !== null && v.endMs >= v.startMs),
  );
export const SynchronizationSchema = z.strictObject({
  kind: z.enum(['plain', 'line', 'word']),
  unit: z.literal('milliseconds'),
  lines: z.array(SyncLineSchema).max(5000),
  rawLrc: importText.nullable(),
  rawLyricsfile: importText.nullable(),
});
export const ImportDocumentSchema = z.strictObject({
  version: z.literal(1),
  title: z.string().max(200),
  artist: z.string().max(200),
  contentType: ContentTypeSchema,
  format: ImportFormatSchema,
  rawText: importText,
  sections: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(100),
        lines: z.array(z.string().max(10000)).max(10000),
        chords: z
          .array(
            z.strictObject({
              line: position,
              column: position,
              symbol: z.string().max(60),
              root: z.number().int().min(0).max(11),
              bass: z.number().int().min(0).max(11).nullable(),
            }),
          )
          .max(500),
      }),
    )
    .min(1)
    .max(100),
  tabBlocks: z
    .array(
      z.strictObject({
        sourceLine: position,
        sectionIndex: position,
        raw: importText,
        stringOrder: z.tuple([
          z.literal('e'),
          z.literal('B'),
          z.literal('G'),
          z.literal('D'),
          z.literal('A'),
          z.literal('E'),
        ]),
        tuning: z.literal('EADGBE'),
        rhythmicUncertainty: z.literal(true),
        barColumns: z.array(position).max(500),
        repeatMarkers: z.array(position).max(500),
        notes: z
          .array(
            z.strictObject({
              string: z.number().int().min(1).max(6),
              fret: z.number().int().min(0).max(24),
              column: position,
              measureIndex: position,
            }),
          )
          .max(10000),
      }),
    )
    .max(100),
  metadata: z.strictObject({
    key: z.string().max(60).nullable(),
    bpm: z.number().int().min(20).max(300).nullable(),
    meter: z
      .strictObject({
        beats: z.number().int().min(1).max(12),
        beatUnit: z.union([
          z.literal(2),
          z.literal(4),
          z.literal(8),
          z.literal(16),
        ]),
      })
      .nullable(),
    capo: z.number().int().min(0).max(24).nullable(),
    tuning: z.string().max(100).nullable(),
  }),
  source: ImportSourceSchema,
  synchronization: SynchronizationSchema.nullable(),
  warnings: z.array(z.string().max(500)).max(500),
  unrecognized: z
    .array(z.strictObject({ line: position, text: z.string().max(10000) }))
    .max(1000),
  status: z.enum(['valid', 'warnings', 'invalid', 'correction-required']),
});
export type ImportDocument = z.infer<typeof ImportDocumentSchema>;
export const ParseImportInputSchema = z.strictObject({
  text: importText,
  format: ImportFormatSchema.default('auto'),
  title: z.string().max(200).default(''),
  artist: z.string().max(200).default(''),
  sourceName: z.string().max(300).default('Eigen tekst'),
  method: z.enum(['paste', 'file']).default('paste'),
});
export const ImportRequestInputSchema = ParseImportInputSchema.extend({
  personalReceipt: z.string().min(1).max(1_500_000).optional(),
});
export const ImportCommitSchema = z
  .strictObject({
    requestId: z.uuid(),
    confirmed: z.literal(true),
    rightsConfirmed: z.literal(true),
    personalUseConfirmed: z.boolean().default(false),
    input: ImportRequestInputSchema,
    target: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('new-song') }),
      z.strictObject({
        kind: z.literal('new-arrangement'),
        songId: z.string().min(1).max(100),
        revision: z.number().int().positive(),
      }),
      z.strictObject({
        kind: z.literal('append'),
        songId: z.string().min(1).max(100),
        arrangementId: z.string().min(1).max(100),
        revision: z.number().int().positive(),
      }),
    ]),
  })
  .refine(
    (v) => !v.input.personalReceipt || v.personalUseConfirmed,
    'Confirm personal library use',
  );
export type ImportCommit = z.infer<typeof ImportCommitSchema>;
