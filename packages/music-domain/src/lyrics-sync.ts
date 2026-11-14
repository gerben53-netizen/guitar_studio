import { parseDocument, visit, isAlias, isNode } from 'yaml';
import { z } from 'zod';
import {
  importText,
  type ImportDocument,
  SynchronizationSchema,
} from './song-import-model.js';
export function parseLrc(raw: string) {
  importText.parse(raw);
  const warnings: string[] = [];
  const lines: NonNullable<ImportDocument['synchronization']>['lines'] = [];
  for (const [i, source] of raw.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const times = [
      ...source.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g),
    ];
    if (!times.length) {
      lines.push({ text: source, startMs: null, endMs: null, words: [] });
      if (source.trim())
        warnings.push(
          `LRC-regel ${i + 1}: geen geldige tijdstempel; bron behouden.`,
        );
      continue;
    }
    const text = source.replace(
      /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g,
      '',
    );
    for (const m of times)
      lines.push({
        text,
        startMs: +m[1]! * 60000 + +m[2]! * 1000 + +(m[3] ?? '').padEnd(3, '0'),
        endMs: null,
        words: [],
      });
  }
  return {
    synchronization: SynchronizationSchema.parse({
      kind: 'line',
      unit: 'milliseconds',
      lines,
      rawLrc: raw,
      rawLyricsfile: null,
    }),
    warnings,
  };
}
const timing = z
  .strictObject({
    text: z.string().max(10000),
    start_ms: z.number().int().nonnegative(),
    end_ms: z.number().int().nonnegative().optional(),
  })
  .refine((v) => v.end_ms === undefined || v.end_ms >= v.start_ms);
const lyricsfile = z.strictObject({
  version: z.literal('1.0'),
  metadata: z.strictObject({
    title: z.string().max(200),
    artist: z.string().max(200),
    album: z.string().max(300).optional(),
    duration_ms: z.number().int().nonnegative().optional(),
    offset_ms: z.number().int().optional(),
    language: z.string().max(20).optional(),
    instrumental: z.boolean().optional(),
  }),
  plain: importText.optional(),
  lines: z
    .array(
      timing.and(
        z.strictObject({
          text: z.string(),
          start_ms: z.number(),
          end_ms: z.number().optional(),
          words: z.array(timing).max(2000).optional(),
        }),
      ),
    )
    .max(5000)
    .optional(),
});
export function parseLyricsfile(raw: string, hasWordSync: boolean) {
  importText.parse(raw);
  const doc = parseDocument(raw, {
    schema: 'core',
    uniqueKeys: true,
    customTags: [],
  });
  if (doc.errors.length || doc.warnings.length)
    throw new Error('Ongeldig Lyricsfile YAML.');
  visit(doc, (_key, node, path) => {
    if (
      path.length > 20 ||
      isAlias(node) ||
      (isNode(node) && (('anchor' in node && node.anchor) || node.tag))
    )
      throw new Error(
        'YAML tags, ankers, aliassen of diepe nesting niet toegestaan.',
      );
  });
  const parsed = lyricsfile.parse(doc.toJS({ maxAliasCount: 0 }));
  if (parsed.metadata.instrumental && (parsed.plain || parsed.lines?.length))
    throw new Error('Instrumentaal bestand bevat lyrics.');
  const warnings: string[] = [];
  if (parsed.metadata.offset_ms)
    warnings.push(
      'Lyricsfile offset_ms behouden in bron; niet toegepast omdat semantiek niet vaststaat.',
    );
  const lines = (parsed.lines ?? []).map((l) => {
    if (l.words?.length && l.words.map((w) => w.text).join('') !== l.text)
      throw new Error('Woordtekst komt niet overeen met regel.');
    return {
      text: l.text,
      startMs: l.start_ms,
      endMs: l.end_ms ?? null,
      words: (l.words ?? []).map((w) => ({
        text: w.text,
        startMs: w.start_ms,
        endMs: w.end_ms ?? null,
      })),
    };
  });
  const word = lines.some((l) => l.words.length);
  if (word !== hasWordSync)
    warnings.push('Woordtimingvlag en gevalideerde inhoud verschillen.');
  return {
    plain: parsed.plain ?? '',
    synchronization: SynchronizationSchema.parse({
      kind: word ? 'word' : lines.length ? 'line' : 'plain',
      unit: 'milliseconds',
      lines,
      rawLrc: null,
      rawLyricsfile: raw,
    }),
    warnings,
  };
}
