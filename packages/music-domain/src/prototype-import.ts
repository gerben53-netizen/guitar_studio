import { z } from 'zod';
import {
  fraction,
  newSong,
  SongSchema,
  tokens,
  uid,
  type StudioArrangement,
  type StudioSong,
} from './workspace.js';
const legacy = z.object({
  title: z.string(),
  artist: z.string(),
  status: z.enum(['Nieuw', 'In bewerking', 'Oefenen', 'Beheerst']),
  difficulty: z.enum(['Beginner', 'Gemiddeld', 'Gevorderd']),
  tags: z.string(),
  favorite: z.boolean(),
  progress: z.number(),
  source: z.string(),
  arrangements: z.array(
    z.object({
      name: z.string(),
      capo: z.number().int().min(0).max(12),
      tempo: z.number(),
      meter: z.number().int().positive(),
      sections: z.array(
        z.object({
          name: z.string(),
          lines: z.array(z.string()),
          chords: z.array(
            z.object({
              line: z.number().int(),
              word: z.number().int(),
              name: z.string(),
              grip: z.array(z.number().int()).length(6),
            }),
          ),
          bars: z.array(
            z.array(
              z.object({
                tick: z.number().int().nonnegative(),
                duration: z.number().int().positive(),
                notes: z.record(z.string(), z.number().int()),
                rest: z.boolean(),
              }),
            ),
          ),
        }),
      ),
    }),
  ),
});
/** Explicit opt-in conversion: caller must verify rights before persisting. */
export function fromPrototype(value: unknown): StudioSong {
  const old = legacy.parse(value),
    song = newSong(old.title, old.artist, '', 'manual', old.source);
  song.status = old.status === 'Nieuw' ? 'In bewerking' : old.status;
  song.difficulty = old.difficulty;
  song.tags = old.tags
    .split(/[,·]/)
    .map((t) => t.trim())
    .filter(Boolean);
  song.favorite = old.favorite;
  song.progress = old.progress;
  song.lyrics = [];
  song.arrangements = [];
  for (const original of old.arrangements) {
    const a = newSong(old.title, old.artist, '').arrangements[0]!;
    a.name = original.name;
    a.tempo = original.tempo;
    a.instrument.capo = original.capo;
    a.instrument.maxFret = Math.min(36, 24 + original.capo);
    a.timeSignature = { beats: original.meter / 2, beatUnit: 4 };
    a.sections = [];
    for (const section of original.sections) {
      const content = section.lines.join('\n');
      let lyrics = song.lyrics.find(
        (l) =>
          l.name === section.name &&
          l.tokens.map((t) => t.text).join('') === content,
      );
      if (!lyrics) {
        lyrics = { id: uid(), name: section.name, tokens: tokens(content) };
        song.lyrics.push(lyrics);
      }
      const measures = section.bars.map((bar) => ({
        id: uid(),
        timeSignature: { ...a.timeSignature },
        events: bar.map((event) => ({
          id: uid(),
          kind: event.rest ? ('rest' as const) : ('note' as const),
          start: fraction(event.tick, 8),
          duration: fraction(event.duration, 8),
          tones: event.rest
            ? []
            : Object.entries(event.notes).map(([s, f]) => ({
                pitch:
                  a.instrument.tuning.pitches[Number(s)]! + f + original.capo,
                position: { string: Number(s) + 1, fret: f + original.capo },
              })),
        })),
      }));
      if (!measures.length)
        measures.push({
          id: uid(),
          timeSignature: { ...a.timeSignature },
          events: [],
        });
      const words: (typeof lyrics.tokens)[] = [[]];
      for (const token of lyrics.tokens) {
        if (token.text === '\n') words.push([]);
        else if (!/^\s+$/.test(token.text)) words.at(-1)!.push(token);
      }
      const s: StudioArrangement['sections'][number] = {
        id: uid(),
        lyricsSectionId: lyrics.id,
        measures,
        practiced: false,
        chords: section.chords.map((chord) => ({
          id: uid(),
          tokenId: words[chord.line]?.[chord.word]?.id ?? null,
          originalText:
            words[chord.line]?.[chord.word]?.text ?? 'Onbekend woord',
          grip: { id: uid(), name: chord.name, frets: chord.grip },
          measureId: measures[Math.min(chord.line, measures.length - 1)]!.id,
        })),
      };
      a.sections.push(s);
    }
    song.arrangements.push(a);
  }
  song.lastArrangementId = song.arrangements[0]?.id ?? null;
  return SongSchema.parse(song);
}
