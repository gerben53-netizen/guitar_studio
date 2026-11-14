import {
  newSong,
  tokens,
  uid,
  emptyMeasure,
  presets,
  SongSchema,
  type StudioSong,
} from './workspace.js';
import type { ImportDocument } from './song-import-model.js';
/** Preserve uncertain source positions separately; never manufacture tab timing/grips. */
export function importToSong(doc: ImportDocument) {
  const song = newSong(
    doc.title.trim(),
    doc.artist,
    '',
    doc.source.method === 'file' ? 'text-file' : 'manual',
    doc.source.name,
  );
  song.lyrics = doc.sections.map((s) => ({
    id: uid(),
    name: s.name,
    tokens: tokens(s.lines.join('\n')),
  }));
  const a = song.arrangements[0]!;
  a.name = 'Geïmporteerd arrangement';
  a.tempo = doc.metadata.bpm ?? a.tempo;
  a.timeSignature = doc.metadata.meter ?? a.timeSignature;
  a.instrument.capo = doc.metadata.capo ?? 0;
  a.sections = song.lyrics.map((lyrics, index) => {
    const measures = [
      emptyMeasure(a.timeSignature),
      emptyMeasure(a.timeSignature),
    ];
    const text = doc.sections[index]!.lines.join('\n');
    const anchors = doc.sections[index]!.chords.flatMap((c) => {
      const grip = presets.find((g) => g.name === c.symbol);
      if (!grip) return [];
      const lineOffset = doc.sections[index]!.lines.slice(0, c.line).reduce(
        (n, l) => n + l.length + 1,
        0,
      );
      const column = Math.min(
        c.column,
        doc.sections[index]!.lines[c.line]?.length ?? 0,
      );
      const offset = lineOffset + column;
      let start = 0;
      const token = lyrics.tokens.find((t) => {
        const end = start + t.text.length,
          match = end > offset && /\S/.test(t.text);
        start = end;
        return match;
      });
      return [
        {
          id: uid(),
          tokenId: token?.id ?? null,
          originalText: text.slice(offset, offset + 1000),
          grip: { ...structuredClone(grip), id: uid() },
          measureId: measures[0]!.id,
        },
      ];
    });
    return {
      id: uid(),
      lyricsSectionId: lyrics.id,
      measures,
      chords: anchors,
      practiced: false,
    };
  });
  song.importDocuments = [doc];
  return SongSchema.parse(song);
}
export function mergeImport(
  existing: StudioSong,
  imported: StudioSong,
  arrangementId?: string,
): StudioSong {
  const song = structuredClone(existing),
    a = imported.arrangements[0]!;
  song.lyrics.push(...imported.lyrics);
  if (arrangementId) {
    const target = song.arrangements.find((a) => a.id === arrangementId);
    if (!target) throw new Error('Arrangement niet gevonden.');
    // Append is safe only when source metadata cannot silently retune/re-time the target.
    const metadata = imported.importDocuments![0]!.metadata;
    if (
      (metadata.bpm !== null && metadata.bpm !== target.tempo) ||
      (metadata.capo !== null && metadata.capo !== target.instrument.capo) ||
      (metadata.meter &&
        JSON.stringify(metadata.meter) !== JSON.stringify(target.timeSignature))
    )
      throw new Error(
        'Muzikale metadata verschilt. Kies een nieuw arrangement.',
      );
    for (const section of a.sections)
      for (const measure of section.measures)
        measure.timeSignature = structuredClone(target.timeSignature);
    target.sections.push(...a.sections);
    song.lastArrangementId = target.id;
  } else {
    song.arrangements.push(a);
    song.lastArrangementId = a.id;
  }
  song.importDocuments = [
    ...(song.importDocuments ?? []),
    ...imported.importDocuments!,
  ];
  return SongSchema.parse(song);
}
