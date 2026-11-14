import {
  ImportDocumentSchema,
  type ImportDocument,
  type ParseImportInputSchema,
} from './song-import-model.js';
import { parseSongImport } from './song-import.js';
import type { z } from 'zod';

export function hasLyrics(doc: ImportDocument) {
  return doc.sections.some((s) => s.lines.some((l) => l.trim()));
}
export function canStoreImport(doc: ImportDocument) {
  return (
    (doc.source.origin === 'user' &&
      doc.source.storage === 'user-confirmation') ||
    (doc.source.origin === 'external' &&
      doc.source.provider === 'lrclib' &&
      doc.source.storage === 'personal-only' &&
      !!doc.source.personalImport)
  );
}
/** Verified preview is supplied by the server, never by an unsigned client document. */
export function personalLyricsDocument(
  original: ImportDocument,
  album: string,
  corrections: z.input<typeof ParseImportInputSchema>,
  importedAt: string,
) {
  const source = ImportDocumentSchema.parse(original);
  if (
    source.source.provider !== 'lrclib' ||
    source.source.storage !== 'preview-only' ||
    !hasLyrics(source)
  )
    throw new Error('No importable LRCLIB lyrics');
  const originalText = source.sections
    .map((s) => s.lines.join('\n'))
    .join('\n\n');
  const doc = parseSongImport({ ...corrections, format: 'lyrics' });
  if (!hasLyrics(doc)) throw new Error('No lyrics after correction');
  doc.rawText = source.rawText || originalText;
  doc.synchronization = structuredClone(source.synchronization);
  doc.source = {
    ...source.source,
    storage: 'personal-only',
    personalImport: {
      scope: 'personal',
      importedAt,
      method: 'lrclib-personal-import',
      title: source.title,
      artist: source.artist,
      album,
      timingFormat: source.synchronization?.kind ?? 'plain',
      textCorrected: corrections.text !== originalText,
      metadataCorrected:
        doc.title !== source.title || doc.artist !== source.artist,
    },
  };
  doc.warnings = [
    ...new Set([
      ...source.warnings,
      ...doc.warnings,
      ...(doc.source.personalImport!.textCorrected && doc.synchronization
        ? [
            'Timing hoort bij de oorspronkelijke LRCLIB-tekst; koppel correcties later handmatig.',
          ]
        : []),
    ]),
  ];
  if (!['invalid', 'correction-required'].includes(doc.status))
    doc.status = doc.warnings.length ? 'warnings' : 'valid';
  return ImportDocumentSchema.parse(doc);
}
