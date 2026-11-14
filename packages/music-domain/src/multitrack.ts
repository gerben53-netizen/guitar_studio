import { z } from 'zod';
import {
  InstrumentProfileSchema,
  NoteEventSchema,
  RationalSchema,
  TimeSignatureSchema,
  validateMeasure,
} from './index.js';
import {
  AnchorSchema,
  SongDocumentBaseSchema,
  SongSchema,
  fraction,
  uid,
  type StudioSong,
} from './workspace.js';
const id = z.string().min(1).max(100),
  trackId = z.string().min(1).max(200),
  derivedId = z.string().min(1).max(300);
export const ReducedTimeSchema = RationalSchema.refine((v) => {
  const reduced = fraction(v.numerator, v.denominator);
  return (
    reduced.numerator === v.numerator && reduced.denominator === v.denominator
  );
}, 'Use reduced musical fractions');
export const TrackEventSchema = NoteEventSchema.safeExtend({
  measureId: id,
  start: ReducedTimeSchema,
  duration: ReducedTimeSchema.refine((t) => t.numerator > 0),
});
export type TrackEvent = z.infer<typeof TrackEventSchema>;
export const TrackSchema = z.strictObject({
  id: trackId,
  arrangementId: id,
  name: z.string().trim().min(1).max(80),
  role: z.enum([
    'vocal_melody',
    'guitar_accompaniment',
    'second_guitar',
    'custom',
  ]),
  instrument: InstrumentProfileSchema,
  visible: z.boolean(),
  collapsed: z.boolean(),
  order: z.number().int().min(0).max(31),
  events: z.array(TrackEventSchema).max(10000),
  importSource: z
    .strictObject({
      documentIndex: z.number().int().nonnegative(),
      blockIndices: z.array(z.number().int().nonnegative()).max(100),
    })
    .optional(),
});
export type Track = z.infer<typeof TrackSchema>;
export const SyllableSchema = z.strictObject({
  id: derivedId,
  text: z.string().min(1).max(10000),
});
export const WordTokenSchema = z.strictObject({
  id,
  text: z.string().min(1).max(10000),
  syllables: z.array(SyllableSchema).max(100),
});
export const LyricsSectionSchema = z.strictObject({
  id,
  name: z.string().min(1).max(100),
  lines: z
    .array(
      z.strictObject({
        id: derivedId,
        tokens: z.array(WordTokenSchema).max(10000),
        newline: z.strictObject({ id, text: z.literal('\n') }).nullable(),
      }),
    )
    .min(1)
    .max(10000),
});
export const LyricsLinkSchema = z.strictObject({
  id,
  syllableId: derivedId,
  trackId,
  eventIds: z.array(id).min(1).max(1000),
  sustain: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type LyricsLink = z.infer<typeof LyricsLinkSchema>;
export const MultitrackArrangementSchema = z.strictObject({
  schemaVersion: z.literal(2),
  id,
  songId: id,
  name: z.string().trim().min(1).max(80),
  tempo: z.number().int().min(20).max(300),
  timeSignature: TimeSignatureSchema,
  capo: z.number().int().min(0).max(24),
  sections: z
    .array(
      z.strictObject({
        id,
        lyricsSectionId: id,
        practiced: z.boolean(),
        measures: z
          .array(z.strictObject({ id, timeSignature: TimeSignatureSchema }))
          .min(1)
          .max(200),
      }),
    )
    .min(1)
    .max(100),
  tracks: z.array(TrackSchema).min(1).max(32),
  trackOrder: z.array(trackId).min(1).max(32),
  activeTrackId: trackId,
  legacyTrackId: trackId,
  chordAnchors: z.array(AnchorSchema.extend({ sectionId: id })).max(10000),
  lyricsLinks: z.array(LyricsLinkSchema).max(10000),
});
const shape = SongDocumentBaseSchema.omit({
  schemaVersion: true,
  lyrics: true,
  arrangements: true,
}).extend({
  schemaVersion: z.literal(2),
  lyrics: z.array(LyricsSectionSchema).min(1).max(100),
  arrangements: z.array(MultitrackArrangementSchema).min(1).max(30),
});
export const MultitrackSongSchema = shape.superRefine((song, ctx) => {
  try {
    validateMultitrack(song);
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      message:
        error instanceof Error ? error.message : 'Invalid multitrack song',
    });
  }
});
export type MultitrackSong = z.infer<typeof shape>;
export type MultitrackArrangement = MultitrackSong['arrangements'][number];
const unique = (values: string[], label: string) => {
  if (new Set(values).size !== values.length)
    throw new Error('Duplicate ' + label);
};
export function validateMultitrack(song: MultitrackSong) {
  unique(
    song.lyrics.map((s) => s.id),
    'lyrics section',
  );
  unique(
    song.arrangements.map((a) => a.id),
    'arrangement',
  );
  unique(
    [
      ...song.lyrics.flatMap((s) => [
        s.id,
        ...s.lines.flatMap((l) => [
          ...l.tokens.map((t) => t.id),
          ...(l.newline ? [l.newline.id] : []),
        ]),
      ]),
      ...song.arrangements.flatMap((a) => [
        a.id,
        ...a.sections.flatMap((s) => [s.id, ...s.measures.map((m) => m.id)]),
        ...a.tracks.flatMap((t) => t.events.map((e) => e.id)),
        ...a.chordAnchors.map((c) => c.id),
      ]),
    ],
    'shared entity ID',
  );
  const words = song.lyrics.flatMap((s) => s.lines.flatMap((l) => l.tokens)),
    syllables = words.flatMap((w) => w.syllables);
  unique(
    words.map((w) => w.id),
    'word/token',
  );
  unique(
    syllables.map((s) => s.id),
    'syllable',
  );
  const syllableIds = new Set(syllables.map((s) => s.id)),
    sections = new Map(song.lyrics.map((s) => [s.id, s]));
  for (const section of song.lyrics) {
    if (
      section.lines.reduce(
        (count, line) => count + line.tokens.length + (line.newline ? 1 : 0),
        0,
      ) > 10000
    )
      throw new Error('Legacy-compatible lyric token limit exceeded');
    unique(
      section.lines.map((l) => l.id),
      'line',
    );
    for (const [i, line] of section.lines.entries()) {
      if (
        (i < section.lines.length - 1 && !line.newline) ||
        (i === section.lines.length - 1 && line.newline)
      )
        throw new Error('Line endings disagree');
      for (const token of line.tokens) {
        if (token.text.includes('\n')) throw new Error('Newline inside token');
        if (
          /\S/u.test(token.text)
            ? token.syllables.map((s) => s.text).join('') !== token.text
            : token.syllables.length !== 0
        )
          throw new Error('Syllables must reconstruct their word');
      }
    }
  }
  unique(
    song.arrangements.flatMap((a) => a.tracks.map((t) => t.id)),
    'track',
  );
  unique(
    song.arrangements.flatMap((a) =>
      a.tracks.flatMap((t) => t.events.map((e) => e.id)),
    ),
    'event',
  );
  for (const a of song.arrangements) {
    if (a.songId !== song.id) throw new Error('Cross-song arrangement');
    const tracks = new Map(a.tracks.map((t) => [t.id, t]));
    unique(a.trackOrder, 'track order');
    if (
      a.trackOrder.length !== a.tracks.length ||
      a.trackOrder.some((t) => !tracks.has(t)) ||
      !tracks.has(a.activeTrackId) ||
      !tracks.has(a.legacyTrackId)
    )
      throw new Error('Invalid track selection/order');
    unique(
      a.sections.map((s) => s.id),
      'section',
    );
    const measures = a.sections.flatMap((s) => s.measures);
    unique(
      measures.map((m) => m.id),
      'measure',
    );
    const measureIds = new Set(measures.map((m) => m.id));
    for (const s of a.sections)
      if (!sections.has(s.lyricsSectionId))
        throw new Error('Unknown lyrics section');
    for (const t of a.tracks) {
      if (
        t.arrangementId !== a.id ||
        t.order !== a.trackOrder.indexOf(t.id) ||
        t.instrument.capo !== a.capo
      )
        throw new Error('Track ownership/order/capo disagrees');
      const grouped = new Map<string, TrackEvent[]>();
      for (const e of t.events) {
        if (!measureIds.has(e.measureId))
          throw new Error('Unknown/cross-arrangement measure');
        if (e.tones.some((tone) => tone.position && tone.position.fret > 24))
          throw new Error('Fret outside 0–24');
        const group = grouped.get(e.measureId) ?? [];
        group.push(e);
        grouped.set(e.measureId, group);
      }
      for (const m of measures) {
        if ((grouped.get(m.id)?.length ?? 0) > 200)
          throw new Error('At most 200 events per track/measure');
        validateMeasure(
          {
            ...m,
            events: (grouped.get(m.id) ?? []).map(({ measureId, ...note }) => {
              void measureId;
              return note;
            }),
          },
          t.instrument,
        );
      }
      if (t.importSource) {
        const doc = song.importDocuments?.[t.importSource.documentIndex];
        if (
          !doc ||
          doc.source.storage !== 'user-confirmation' ||
          doc.source.origin !== 'user' ||
          t.importSource.blockIndices.some((i) => !doc.tabBlocks[i])
        )
          throw new Error('Unknown or forbidden import source');
      }
    }
    unique(
      a.chordAnchors.map((c) => c.id),
      'chord anchor',
    );
    for (const c of a.chordAnchors) {
      const s = a.sections.find((s) => s.id === c.sectionId);
      if (
        !s ||
        !s.measures.some((m) => m.id === c.measureId) ||
        (c.tokenId &&
          !sections
            .get(s.lyricsSectionId)!
            .lines.some((l) => l.tokens.some((t) => t.id === c.tokenId)))
      )
        throw new Error('Invalid chord anchor');
    }
    if (
      a.sections.some(
        (s) => a.chordAnchors.filter((c) => c.sectionId === s.id).length > 500,
      )
    )
      throw new Error('At most 500 chord anchors per section');
    unique(
      a.lyricsLinks.map((l) => l.id),
      'lyrics link',
    );
    for (const link of a.lyricsLinks) {
      if (!syllableIds.has(link.syllableId) || !tracks.has(link.trackId))
        throw new Error('Unknown syllable/track');
      const lyricSection = song.lyrics.find((s) =>
        s.lines.some((l) =>
          l.tokens.some((t) =>
            t.syllables.some((s) => s.id === link.syllableId),
          ),
        ),
      )!;
      if (!a.sections.some((s) => s.lyricsSectionId === lyricSection.id))
        throw new Error('Cross-arrangement syllable');
      const events = new Map(
        tracks.get(link.trackId)!.events.map((e) => [e.id, e]),
      );
      unique(link.eventIds, 'linked event');
      for (const eventId of link.eventIds) {
        const e = events.get(eventId);
        if (
          !e ||
          e.kind === 'rest' ||
          !a.sections.some((s) => s.measures.some((m) => m.id === e.measureId))
        )
          throw new Error('Link event belongs to another track/lyrics section');
      }
      if (Date.parse(link.updatedAt) < Date.parse(link.createdAt))
        throw new Error('Link timestamp order');
    }
  }
  if (
    song.lastArrangementId &&
    !song.arrangements.some((a) => a.id === song.lastArrangementId)
  )
    throw new Error('Unknown last arrangement');
}
export function lyricLines(
  section: StudioSong['lyrics'][number],
): z.infer<typeof LyricsSectionSchema> {
  const lines: z.infer<typeof LyricsSectionSchema>['lines'] = [];
  let current: (typeof lines)[number] = {
    id: `line:${section.id}:first`,
    tokens: [],
    newline: null,
  };
  for (const token of section.tokens) {
    if (token.text === '\n') {
      current.newline = structuredClone(token) as { id: string; text: '\n' };
      lines.push(current);
      current = {
        id: `line:${section.id}:${token.id}`,
        tokens: [],
        newline: null,
      };
    } else if (token.text.includes('\n'))
      throw new Error(
        'Legacy token contains embedded newline; explicit review required',
      );
    else
      current.tokens.push({
        ...structuredClone(token),
        syllables: /\S/u.test(token.text)
          ? [{ id: `syllable:${token.id}`, text: token.text }]
          : [],
      });
  }
  lines.push(current);
  return { id: section.id, name: section.name, lines };
}
export function toMultitrack(input: unknown): MultitrackSong {
  if ((input as { schemaVersion?: number })?.schemaVersion === 2)
    return MultitrackSongSchema.parse(structuredClone(input));
  const song = SongSchema.parse(input);
  return MultitrackSongSchema.parse({
    ...structuredClone(song),
    schemaVersion: 2,
    lyrics: song.lyrics.map(lyricLines),
    arrangements: song.arrangements.map((a) => {
      const track = `track:${a.id}`;
      return {
        schemaVersion: 2,
        id: a.id,
        songId: song.id,
        name: a.name,
        tempo: a.tempo,
        timeSignature: a.timeSignature,
        capo: a.instrument.capo,
        sections: a.sections.map((s) => ({
          id: s.id,
          lyricsSectionId: s.lyricsSectionId,
          practiced: s.practiced,
          measures: s.measures.map((m) => ({
            id: m.id,
            timeSignature: m.timeSignature,
          })),
        })),
        tracks: [
          {
            id: track,
            arrangementId: a.id,
            name: 'Oorspronkelijke gitaarpartij',
            role: 'guitar_accompaniment',
            instrument: a.instrument,
            visible: true,
            collapsed: false,
            order: 0,
            events: a.sections.flatMap((s) =>
              s.measures.flatMap((m) =>
                m.events.map((e) => ({
                  ...e,
                  measureId: m.id,
                  start: fraction(e.start.numerator, e.start.denominator),
                  duration: fraction(
                    e.duration.numerator,
                    e.duration.denominator,
                  ),
                })),
              ),
            ),
          },
        ],
        trackOrder: [track],
        activeTrackId: track,
        legacyTrackId: track,
        chordAnchors: a.sections.flatMap((s) =>
          s.chords.map((c) => ({ ...c, sectionId: s.id })),
        ),
        lyricsLinks: [],
      };
    }),
  });
}
export function toLegacy(input: MultitrackSong): StudioSong {
  const song = MultitrackSongSchema.parse(input);
  return SongSchema.parse({
    ...structuredClone(song),
    schemaVersion: 1,
    lyrics: song.lyrics.map((s) => ({
      id: s.id,
      name: s.name,
      tokens: s.lines.flatMap((l) => [
        ...l.tokens.map(({ id, text }) => ({ id, text })),
        ...(l.newline ? [l.newline] : []),
      ]),
    })),
    arrangements: song.arrangements.map((a) => {
      const t = a.tracks.find((t) => t.id === a.legacyTrackId)!;
      return {
        id: a.id,
        name: a.name,
        instrument: t.instrument,
        tempo: a.tempo,
        timeSignature: a.timeSignature,
        sections: a.sections.map((s) => ({
          id: s.id,
          lyricsSectionId: s.lyricsSectionId,
          practiced: s.practiced,
          measures: s.measures.map((m) => ({
            ...m,
            events: t.events
              .filter((e) => e.measureId === m.id)
              .map(({ measureId, ...e }) => {
                void measureId;
                return e;
              }),
          })),
          chords: a.chordAnchors
            .filter((c) => c.sectionId === s.id)
            .map(({ sectionId, ...c }) => {
              void sectionId;
              return c;
            }),
        })),
      };
    }),
  });
}
export function legacyView(input: unknown): StudioSong {
  return (input as { schemaVersion?: number })?.schemaVersion === 2
    ? toLegacy(MultitrackSongSchema.parse(input))
    : SongSchema.parse(input);
}
export function mergeLegacyWrite(
  current: MultitrackSong,
  incoming: StudioSong,
): MultitrackSong {
  const next = toMultitrack(incoming),
    previous = MultitrackSongSchema.parse(current),
    oldWords = new Map(
      previous.lyrics
        .flatMap((s) => s.lines.flatMap((l) => l.tokens))
        .map((w) => [w.id, w]),
    );
  const incomingWords = new Map(
    next.lyrics
      .flatMap((s) => s.lines.flatMap((l) => l.tokens))
      .map((w) => [w.id, w]),
  );
  const linkedSyllables = new Set(
    previous.arrangements.flatMap((a) =>
      a.lyricsLinks.map((l) => l.syllableId),
    ),
  );
  for (const section of previous.lyrics) {
    const incomingSection = next.lyrics.find((s) => s.id === section.id);
    const oldText = section.lines
      .map(
        (l) => l.tokens.map((t) => t.text).join('') + (l.newline ? '\n' : ''),
      )
      .join('');
    const newText = incomingSection?.lines
      .map(
        (l) => l.tokens.map((t) => t.text).join('') + (l.newline ? '\n' : ''),
      )
      .join('');
    const tokens = section.lines.flatMap((l) => l.tokens);
    for (const old of tokens.filter((w) => w.syllables.length)) {
      const custom =
        old.syllables.length !== 1 ||
        old.syllables[0]!.id !== `syllable:${old.id}`;
      if (custom && incomingWords.get(old.id)?.text !== old.text)
        throw new Error(
          'Review manually divided syllables before legacy text removal',
        );
      if (
        oldText !== newText &&
        tokens.filter((t) => t.text === old.text).length > 1 &&
        (custom || old.syllables.some((s) => linkedSyllables.has(s.id)))
      )
        throw new Error('Review repeated-word links in canonical editor');
    }
  }
  for (const s of next.lyrics)
    for (const line of s.lines)
      for (const word of line.tokens) {
        const old = oldWords.get(word.id);
        if (old && old.text === word.text)
          word.syllables = structuredClone(old.syllables);
      }
  for (const a of next.arrangements) {
    const old = previous.arrangements.find((o) => o.id === a.id);
    if (!old) continue;
    const primary = a.tracks[0]!;
    primary.id = old.legacyTrackId;
    primary.name = old.tracks.find((t) => t.id === old.legacyTrackId)!.name;
    primary.role = old.tracks.find((t) => t.id === old.legacyTrackId)!.role;
    primary.order = old.trackOrder.indexOf(primary.id);
    primary.visible = old.tracks.find((t) => t.id === primary.id)!.visible;
    primary.collapsed = old.tracks.find((t) => t.id === primary.id)!.collapsed;
    const previousPrimary = old.tracks.find((t) => t.id === primary.id)!;
    if (previousPrimary.importSource)
      primary.importSource = structuredClone(previousPrimary.importSource);
    a.tracks = old.tracks.map((t) =>
      t.id === primary.id ? primary : structuredClone(t),
    );
    a.trackOrder = structuredClone(old.trackOrder);
    a.legacyTrackId = old.legacyTrackId;
    a.activeTrackId = old.activeTrackId;
    a.lyricsLinks = structuredClone(old.lyricsLinks);
  }
  for (const old of previous.arrangements)
    if (
      !next.arrangements.some((a) => a.id === old.id) &&
      (old.tracks.length > 1 || old.lyricsLinks.length)
    )
      throw new Error('Use confirmed multi-track deletion');
  // Validation rejects a hidden track/link losing a measure, word, event or capo.
  return MultitrackSongSchema.parse(next);
}
export function arrangement(song: MultitrackSong, id: string) {
  const a = song.arrangements.find((a) => a.id === id);
  if (!a) throw new Error('Arrangement not found');
  return a;
}
export function timeline(a: MultitrackArrangement) {
  return a.sections
    .flatMap((s) => s.measures.map((m) => ({ sectionId: s.id, ...m })))
    .map((m, measureIndex) => ({ ...m, measureIndex }));
}
export const newId = uid;
export const MultitrackExportSchema = z.strictObject({
  format: z.literal('guitar-studio'),
  version: z.literal(2),
  song: MultitrackSongSchema,
});
export function cloneMultitrackSong(input: MultitrackSong): MultitrackSong {
  const song = MultitrackSongSchema.parse(structuredClone(input)),
    ids = new Map<string, string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (value && typeof value === 'object')
      for (const [key, item] of Object.entries(value)) {
        if (key === 'id' && typeof item === 'string' && !ids.has(item))
          ids.set(item, uid());
        else collect(item);
      }
  };
  collect(song);
  const references = new Set([
    'id',
    'songId',
    'arrangementId',
    'lastArrangementId',
    'lyricsSectionId',
    'sectionId',
    'measureId',
    'tokenId',
    'syllableId',
    'trackId',
    'activeTrackId',
    'legacyTrackId',
  ]);
  const rewrite = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string' && references.has(key))
      return ids.get(value) ?? value;
    if (Array.isArray(value))
      return value.map((v) =>
        typeof v === 'string' && ['trackOrder', 'eventIds'].includes(key)
          ? (ids.get(v) ?? v)
          : rewrite(v),
      );
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, rewrite(v, k)]),
      );
    return value;
  };
  const copy = MultitrackSongSchema.parse(rewrite(song));
  copy.title = copy.title.slice(0, 190) + ' · kopie';
  const now = new Date().toISOString();
  for (const a of copy.arrangements)
    for (const l of a.lyricsLinks) l.createdAt = l.updatedAt = now;
  return copy;
}
