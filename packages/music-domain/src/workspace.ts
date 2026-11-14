import { z } from 'zod';
import {
  InstrumentProfileSchema,
  NoteEventSchema,
  TimeSignatureSchema,
  standardTuning,
  validateMeasure,
  pitchAt,
  type Measure,
  type MusicalTime,
} from './index.js';

export const uid = (): string => globalThis.crypto.randomUUID();
const id = z.string().min(1).max(100);
export const TokenSchema = z.strictObject({
  id,
  text: z.string().min(1).max(10000),
});
export const GripSchema = z.strictObject({
  id,
  name: z.string().trim().min(1).max(60),
  frets: z.array(z.number().int().min(-1).max(24)).length(6),
});
export type Grip = z.infer<typeof GripSchema>;
const AnchorSchema = z.strictObject({
  id,
  tokenId: id.nullable(),
  originalText: z.string().max(1000),
  grip: GripSchema,
  measureId: id,
});
const measureSchema = z.strictObject({
  id,
  timeSignature: TimeSignatureSchema,
  events: z.array(NoteEventSchema).max(200),
});
const sectionSchema = z.strictObject({
  id,
  lyricsSectionId: id,
  measures: z.array(measureSchema).min(1).max(200),
  chords: z.array(AnchorSchema).max(500),
  practiced: z.boolean(),
});
export const ArrangementSchema = z.strictObject({
  id,
  name: z.string().trim().min(1).max(80),
  instrument: InstrumentProfileSchema,
  tempo: z.number().int().min(20).max(300),
  timeSignature: TimeSignatureSchema,
  sections: z.array(sectionSchema).min(1).max(100),
});
export type StudioArrangement = z.infer<typeof ArrangementSchema>;
export const SongSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id,
    title: z.string().trim().min(1).max(200),
    artist: z.string().max(200),
    status: z.enum(['In bewerking', 'Oefenen', 'Beheerst']),
    difficulty: z.enum(['Beginner', 'Gemiddeld', 'Gevorderd']),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    favorite: z.boolean(),
    archived: z.boolean(),
    progress: z.number().int().min(0).max(100),
    lastOpened: z.iso.datetime().nullable(),
    lastArrangementId: id.nullable(),
    source: z.strictObject({
      kind: z.enum(['manual', 'text-file']),
      attribution: z.string().max(300),
      storagePermission: z.literal('allowed'),
      confirmedAt: z.iso.datetime(),
    }),
    lyrics: z
      .array(
        z.strictObject({
          id,
          name: z.string().trim().min(1).max(100),
          tokens: z.array(TokenSchema).max(10000),
        }),
      )
      .min(1)
      .max(100),
    arrangements: z.array(ArrangementSchema).min(1).max(30),
    customChords: z.array(GripSchema).max(200),
  })
  .superRefine((song, ctx) => {
    try {
      const ids = new Set<string>();
      const unique = (value: string) => {
        if (ids.has(value)) throw new Error('Duplicate entity ID');
        ids.add(value);
      };
      const lyrics = new Map(song.lyrics.map((s) => [s.id, s]));
      for (const s of song.lyrics) {
        unique(s.id);
        for (const t of s.tokens) unique(t.id);
      }
      for (const a of song.arrangements) {
        unique(a.id);
        for (const s of a.sections) {
          unique(s.id);
          const text = lyrics.get(s.lyricsSectionId);
          if (!text) throw new Error('Unknown lyrics section');
          const tokenIds = new Set(text.tokens.map((t) => t.id));
          for (const m of s.measures) {
            unique(m.id);
            validateMeasure(m, a.instrument);
            for (const e of m.events) unique(e.id);
          }
          for (const c of s.chords) {
            unique(c.id);
            if (c.tokenId && !tokenIds.has(c.tokenId))
              throw new Error('Unknown text anchor');
            if (!s.measures.some((m) => m.id === c.measureId))
              throw new Error('Unknown chord measure');
          }
        }
      }
      if (
        song.lastArrangementId &&
        !song.arrangements.some((a) => a.id === song.lastArrangementId)
      )
        throw new Error('Unknown last arrangement');
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid song',
      });
    }
  });
export type StudioSong = z.infer<typeof SongSchema>;
export interface SongRecord {
  song: StudioSong;
  revision: number;
  updatedAt: string;
}
export const ExportSchema = z.strictObject({
  format: z.literal('guitar-studio'),
  version: z.literal(1),
  song: SongSchema,
});
export function tokens(text: string) {
  return (text.replace(/\r\n?/g, '\n').match(/\S+|[^\S\n]+|\n/gu) ?? []).map(
    (text) => ({ id: uid(), text }),
  );
}
export function sectionText(section: StudioSong['lyrics'][number]) {
  return section.tokens.map((t) => t.text).join('');
}
/** LCS preserves stable IDs; repeated words with changed multiplicity are ambiguous. */
export function reconcileTokens(
  old: z.infer<typeof TokenSchema>[],
  text: string,
) {
  const next = tokens(text);
  if (old.length * next.length > 4_000_000)
    throw new Error('Bewerk maximaal 2.000 woorden per sectie tegelijk.');
  const rows = Array.from(
    { length: old.length + 1 },
    () => new Uint16Array(next.length + 1),
  );
  for (let i = old.length - 1; i >= 0; i--)
    for (let j = next.length - 1; j >= 0; j--)
      rows[i]![j] =
        old[i]!.text === next[j]!.text
          ? rows[i + 1]![j + 1]! + 1
          : Math.max(rows[i + 1]![j]!, rows[i]![j + 1]!);
  const count = (list: typeof old, word: string) =>
    list.filter((t) => t.text === word).length;
  let i = 0,
    j = 0;
  while (i < old.length && j < next.length) {
    if (old[i]!.text === next[j]!.text) {
      const word = old[i]!.text;
      if (count(old, word) === count(next, word)) next[j]!.id = old[i]!.id;
      i++;
      j++;
    } else if (rows[i + 1]![j]! >= rows[i]![j + 1]!) i++;
    else j++;
  }
  return next;
}
export function editLyrics(song: StudioSong, sectionId: string, text: string) {
  const section = song.lyrics.find((s) => s.id === sectionId)!;
  section.tokens = reconcileTokens(section.tokens, text);
  const valid = new Set(section.tokens.map((t) => t.id));
  for (const a of song.arrangements)
    for (const s of a.sections.filter((s) => s.lyricsSectionId === sectionId))
      for (const c of s.chords)
        if (c.tokenId && !valid.has(c.tokenId)) c.tokenId = null;
}
export function parseLyrics(text: string) {
  const parts: { name: string; text: string }[] = [];
  let current = { name: 'Couplet 1', text: '' };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^\s*\[([^\]]{1,100})\]\s*$/.exec(line);
    if (match) {
      if (current.text.trim()) parts.push(current);
      current = { name: match[1]!, text: '' };
    } else current.text += (current.text ? '\n' : '') + line;
  }
  if (current.text.trim() || !parts.length) parts.push(current);
  return parts;
}
export function emptyMeasure(
  meter: StudioArrangement['timeSignature'],
): Measure {
  return { id: uid(), timeSignature: { ...meter }, events: [] };
}
export function newSong(
  title: string,
  artist: string,
  text: string,
  kind: 'manual' | 'text-file' = 'manual',
  attribution = 'Eigen tekst',
): StudioSong {
  const lyrics = parseLyrics(text).map((s) => ({
    id: uid(),
    name: s.name,
    tokens: tokens(s.text),
  }));
  const meter = { beats: 4, beatUnit: 4 as const };
  const arrangement: StudioArrangement = {
    id: uid(),
    name: 'Akoestisch · basis',
    tempo: 84,
    timeSignature: meter,
    instrument: {
      id: uid(),
      type: 'acoustic',
      stringCount: 6,
      tuning: structuredClone(standardTuning),
      capo: 0,
      maxFret: 24,
      preferredInput: 'builtin-microphone',
    },
    sections: lyrics.map((s) => ({
      id: uid(),
      lyricsSectionId: s.id,
      measures: [emptyMeasure(meter), emptyMeasure(meter)],
      chords: [],
      practiced: false,
    })),
  };
  return {
    schemaVersion: 1,
    id: uid(),
    title,
    artist,
    status: 'In bewerking',
    difficulty: 'Beginner',
    tags: [],
    favorite: false,
    archived: false,
    progress: 0,
    lastOpened: null,
    lastArrangementId: arrangement.id,
    source: {
      kind,
      attribution,
      storagePermission: 'allowed',
      confirmedAt: new Date().toISOString(),
    },
    lyrics,
    arrangements: [arrangement],
    customChords: [],
  };
}
export function cloneArrangement(a: StudioArrangement) {
  const copy = structuredClone(a);
  copy.id = uid();
  copy.instrument.id = uid();
  copy.name += ' · kopie';
  for (const s of copy.sections) {
    s.id = uid();
    const map = new Map<string, string>();
    for (const m of s.measures) {
      const original = m.id;
      m.id = uid();
      map.set(original, m.id);
      for (const e of m.events) e.id = uid();
    }
    for (const c of s.chords) {
      c.id = uid();
      c.measureId = map.get(c.measureId)!;
    }
  }
  return copy;
}
export function cloneSong(song: StudioSong) {
  const copy = structuredClone(song);
  copy.id = uid();
  copy.title += ' · kopie';
  copy.arrangements = copy.arrangements.map(cloneArrangement);
  copy.lastArrangementId = copy.arrangements[0]!.id;
  return copy;
}
export function fraction(numerator: number, denominator: number): MusicalTime {
  let a = numerator,
    b = denominator;
  while (b) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  const divisor = a || 1;
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}
export const timeValue = (t: MusicalTime) => t.numerator / t.denominator;
export const sameTime = (a: MusicalTime, b: MusicalTime) =>
  a.numerator * b.denominator === b.numerator * a.denominator;
export function putTone(
  a: StudioArrangement,
  m: Measure,
  start: MusicalTime,
  duration: MusicalTime,
  string: number,
  relativeFret: number,
) {
  const position = { string, fret: relativeFret + a.instrument.capo };
  const pitch = pitchAt(a.instrument, position);
  let event = m.events.find((e) => sameTime(e.start, start));
  if (!event) {
    event = {
      id: uid(),
      kind: 'note',
      start: { ...start },
      duration: { ...duration },
      tones: [],
    };
    m.events.push(event);
  }
  event.kind = 'note';
  event.tones = event.tones.filter((t) => t.position?.string !== string);
  event.tones.push({ pitch, position });
  validateMeasure(m, a.instrument);
}
export function retune(
  a: StudioArrangement,
  profile: StudioArrangement['instrument'],
) {
  InstrumentProfileSchema.parse(profile);
  for (const s of a.sections)
    for (const m of s.measures)
      for (const e of m.events)
        for (const t of e.tones)
          if (t.position) t.pitch = pitchAt(profile, t.position);
  a.instrument = profile;
}
/** Returns a capo-relative display label; storage always remains absolute. */
export function fretLabel(fret: number, capo: number) {
  return fret - capo;
}
export const pitchName = (pitch: number) =>
  ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][
    pitch % 12
  ] + String(Math.floor(pitch / 12) - 1);
export const presets: Grip[] = [
  ['Am', [0, 1, 2, 2, 0, -1]],
  ['C', [0, 1, 0, 2, 3, -1]],
  ['G', [3, 0, 0, 0, 2, 3]],
  ['D', [2, 3, 2, 0, -1, -1]],
  ['Em', [0, 0, 0, 2, 2, 0]],
  ['F', [1, 1, 2, 3, 3, 1]],
].map(([name, frets]) => ({
  id: String(name),
  name: String(name),
  frets: frets as number[],
}));
