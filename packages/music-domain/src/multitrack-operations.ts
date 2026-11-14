import { canStoreImport } from './lrclib-personal-import.js';
import { z } from 'zod';
import { pitchAt, NoteEventSchema, type NoteEvent } from './index.js';
import { uid, reconcileTokens, type StudioSong } from './workspace.js';
import {
  arrangement,
  lyricLines,
  toLegacy,
  MultitrackSongSchema,
  TrackSchema,
  TrackEventSchema,
  LyricsLinkSchema,
  timeline,
  type MultitrackSong,
  type Track,
  type TrackEvent,
} from './multitrack.js';
const id = z.string().min(1).max(200);
export const MultitrackMutationSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('add-track'),
    arrangementId: id,
    track: TrackSchema,
  }),
  z.strictObject({
    op: z.literal('update-track'),
    arrangementId: id,
    trackId: id,
    patch: z.strictObject({
      name: z.string().trim().min(1).max(80).optional(),
      visible: z.boolean().optional(),
      collapsed: z.boolean().optional(),
      role: TrackSchema.shape.role.optional(),
      instrument: TrackSchema.shape.instrument.optional(),
    }),
  }),
  z.strictObject({
    op: z.literal('duplicate-track'),
    arrangementId: id,
    trackId: id,
  }),
  z.strictObject({
    op: z.literal('delete-track'),
    arrangementId: id,
    trackId: id,
    confirmed: z.literal(true),
  }),
  z.strictObject({
    op: z.literal('reorder-tracks'),
    arrangementId: id,
    trackIds: z.array(id).min(1).max(32),
  }),
  z.strictObject({
    op: z.literal('select-track'),
    arrangementId: id,
    trackId: id,
  }),
  z.strictObject({
    op: z.literal('put-event'),
    arrangementId: id,
    trackId: id,
    event: TrackEventSchema,
  }),
  z.strictObject({
    op: z.literal('delete-event'),
    arrangementId: id,
    trackId: id,
    eventId: id,
    confirmed: z.literal(true),
  }),
  z.strictObject({
    op: z.literal('put-link'),
    arrangementId: id,
    link: LyricsLinkSchema,
  }),
  z.strictObject({
    op: z.literal('delete-link'),
    arrangementId: id,
    linkId: id,
    confirmed: z.literal(true),
  }),
  z.strictObject({
    op: z.literal('set-meter'),
    arrangementId: id,
    measureIds: z.array(id).min(1).max(2000),
    meter: z.strictObject({
      beats: z.number().int().min(1).max(32),
      beatUnit: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(4),
        z.literal(8),
        z.literal(16),
        z.literal(32),
      ]),
    }),
  }),
  z.strictObject({
    op: z.literal('set-capo'),
    arrangementId: id,
    capo: z.number().int().min(0).max(24),
  }),
  z.strictObject({
    op: z.literal('edit-lyrics'),
    sectionId: id,
    text: z.string().max(60000),
    confirmed: z.boolean().default(false),
  }),
  z.strictObject({
    op: z.literal('split-word'),
    wordId: id,
    syllables: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(300).optional(),
          text: z.string().min(1).max(10000),
        }),
      )
      .min(1)
      .max(100),
    confirmed: z.boolean().default(false),
  }),
]);
export type MultitrackMutation = z.infer<typeof MultitrackMutationSchema>;
function track(a: ReturnType<typeof arrangement>, id: string) {
  const t = a.tracks.find((t) => t.id === id);
  if (!t) throw new Error('Unknown track');
  return t;
}
function cleanupEvents(
  a: ReturnType<typeof arrangement>,
  trackId: string,
  ids: Set<string>,
) {
  a.lyricsLinks = a.lyricsLinks.flatMap((l) => {
    if (l.trackId !== trackId) return [l];
    const eventIds = l.eventIds.filter((id) => !ids.has(id));
    return eventIds.length
      ? [{ ...l, eventIds, updatedAt: new Date().toISOString() }]
      : [];
  });
}
export function applyMultitrackMutation(
  input: MultitrackSong,
  value: unknown,
): MultitrackSong {
  const command = MultitrackMutationSchema.parse(value);
  let song = MultitrackSongSchema.parse(structuredClone(input));
  if (command.op === 'edit-lyrics')
    return applyLyricsEdit(
      song,
      command.sectionId,
      command.text,
      command.confirmed,
    ).song;
  if (command.op === 'split-word')
    return splitWord(song, command.wordId, command.syllables, command.confirmed)
      .song;
  const a = arrangement(song, command.arrangementId);
  switch (command.op) {
    case 'add-track':
      a.tracks.push(structuredClone(command.track));
      a.trackOrder.push(command.track.id);
      break;
    case 'update-track':
      Object.assign(track(a, command.trackId), structuredClone(command.patch));
      break;
    case 'duplicate-track': {
      const original = track(a, command.trackId),
        copy = structuredClone(original),
        eventIds = new Map<string, string>();
      copy.id = uid();
      copy.instrument.id = uid();
      copy.name = copy.name.slice(0, 70) + ' · kopie';
      copy.order = a.tracks.length;
      copy.events.forEach((e) => {
        const old = e.id;
        e.id = uid();
        eventIds.set(old, e.id);
      });
      a.tracks.push(copy);
      a.trackOrder.push(copy.id);
      const now = new Date().toISOString();
      a.lyricsLinks.push(
        ...a.lyricsLinks
          .filter((l) => l.trackId === original.id)
          .map((l) => ({
            ...structuredClone(l),
            id: uid(),
            trackId: copy.id,
            eventIds: l.eventIds.map((id) => eventIds.get(id)!),
            createdAt: now,
            updatedAt: now,
          })),
      );
      break;
    }
    case 'delete-track': {
      track(a, command.trackId);
      if (a.tracks.length === 1) throw new Error('Cannot delete last track');
      a.tracks = a.tracks.filter((t) => t.id !== command.trackId);
      a.trackOrder = a.trackOrder.filter((id) => id !== command.trackId);
      a.lyricsLinks = a.lyricsLinks.filter(
        (l) => l.trackId !== command.trackId,
      );
      if (a.activeTrackId === command.trackId)
        a.activeTrackId = a.trackOrder[0]!;
      if (a.legacyTrackId === command.trackId)
        a.legacyTrackId = a.trackOrder[0]!;
      break;
    }
    case 'reorder-tracks':
      a.trackOrder = [...command.trackIds];
      break;
    case 'select-track':
      track(a, command.trackId);
      a.activeTrackId = command.trackId;
      break;
    case 'put-event': {
      const t = track(a, command.trackId),
        index = t.events.findIndex((e) => e.id === command.event.id);
      if (index < 0) t.events.push(structuredClone(command.event));
      else t.events[index] = structuredClone(command.event);
      break;
    }
    case 'delete-event': {
      const t = track(a, command.trackId);
      if (!t.events.some((e) => e.id === command.eventId))
        throw new Error('Unknown event');
      t.events = t.events.filter((e) => e.id !== command.eventId);
      cleanupEvents(a, t.id, new Set([command.eventId]));
      break;
    }
    case 'put-link': {
      const index = a.lyricsLinks.findIndex((l) => l.id === command.link.id);
      if (index < 0) a.lyricsLinks.push(structuredClone(command.link));
      else a.lyricsLinks[index] = structuredClone(command.link);
      break;
    }
    case 'delete-link':
      if (!a.lyricsLinks.some((l) => l.id === command.linkId))
        throw new Error('Unknown link');
      a.lyricsLinks = a.lyricsLinks.filter((l) => l.id !== command.linkId);
      break;
    case 'set-meter': {
      const measures = timeline(a);
      if (new Set(command.measureIds).size !== command.measureIds.length)
        throw new Error('Duplicate measure IDs');
      for (const id of command.measureIds) {
        const m = measures.find((m) => m.id === id);
        if (!m) throw new Error('Unknown measure');
        a.sections
          .flatMap((s) => s.measures)
          .find((m) => m.id === id)!.timeSignature = structuredClone(
          command.meter,
        );
      }
      if (command.measureIds.length === measures.length)
        a.timeSignature = structuredClone(command.meter);
      break;
    }
    case 'set-capo':
      a.capo = command.capo;
      for (const t of a.tracks) t.instrument.capo = command.capo;
      break;
  }
  a.tracks.forEach((t) => {
    t.order = a.trackOrder.indexOf(t.id);
  });
  song = MultitrackSongSchema.parse(song);
  return song;
}
export function emptyTrack(
  song: MultitrackSong,
  arrangementId: string,
  name: string,
  role: Track['role'] = 'custom',
): Track {
  const a = arrangement(song, arrangementId);
  return TrackSchema.parse({
    id: uid(),
    arrangementId,
    name,
    role,
    instrument: { ...structuredClone(a.tracks[0]!.instrument), id: uid() },
    visible: true,
    collapsed: false,
    order: a.tracks.length,
    events: [],
  });
}
export function planLyricsEdit(
  input: MultitrackSong,
  sectionId: string,
  text: string,
) {
  const song = MultitrackSongSchema.parse(structuredClone(input)),
    section = song.lyrics.find((s) => s.id === sectionId);
  if (!section) throw new Error('Unknown lyrics section');
  const legacy = toLegacy(song).lyrics.find((s) => s.id === sectionId)!,
    oldWords = section.lines.flatMap((l) => l.tokens),
    oldMap = new Map(oldWords.map((w) => [w.id, w]));
  const before = legacy.tokens.map((t) => t.text).join('');
  const nextTokens =
    before === text
      ? structuredClone(legacy.tokens)
      : reconcileTokens(legacy.tokens, text);
  const counts = new Map<string, number>();
  for (const w of oldWords)
    if (/\S/u.test(w.text)) counts.set(w.text, (counts.get(w.text) ?? 0) + 1);
  const uncertainWordIds: string[] = [];
  if (before !== text)
    for (const token of nextTokens)
      if ((counts.get(token.text) ?? 0) > 1 && oldMap.has(token.id)) {
        uncertainWordIds.push(token.id);
        token.id = uid();
      }
  const next = lyricLines({ ...legacy, tokens: nextTokens });
  for (const line of next.lines)
    for (const token of line.tokens) {
      const old = oldMap.get(token.id);
      if (old && old.text === token.text)
        token.syllables = structuredClone(old.syllables);
    }
  const valid = new Set(
    next.lines.flatMap((l) =>
      l.tokens.flatMap((t) => t.syllables.map((s) => s.id)),
    ),
  );
  const oldSyllables = new Set(
    oldWords.flatMap((w) => w.syllables.map((s) => s.id)),
  );
  const affectedLinks = song.arrangements
    .flatMap((a) => a.lyricsLinks)
    .filter((l) => oldSyllables.has(l.syllableId) && !valid.has(l.syllableId));
  const affectedSyllables = oldWords.flatMap((w) =>
    w.syllables.filter(
      (s) =>
        !valid.has(s.id) &&
        (w.syllables.length > 1 || s.id !== `syllable:${w.id}`),
    ),
  );
  let requiresConfirmation =
    affectedLinks.length > 0 || affectedSyllables.length > 0;
  const affectedChordAnchors: {
    arrangementId: string;
    anchorId: string;
    tokenId: string;
  }[] = [];
  song.lyrics[song.lyrics.findIndex((s) => s.id === sectionId)] = next;
  for (const a of song.arrangements) {
    a.lyricsLinks = a.lyricsLinks.filter(
      (l) => !affectedLinks.some((old) => old.id === l.id),
    );
    a.chordAnchors.forEach((c) => {
      if (
        c.tokenId &&
        oldMap.has(c.tokenId) &&
        !next.lines.some((l) => l.tokens.some((t) => t.id === c.tokenId))
      ) {
        affectedChordAnchors.push({
          arrangementId: a.id,
          anchorId: c.id,
          tokenId: c.tokenId,
        });
        requiresConfirmation = true;
        c.tokenId = null;
      }
    });
  }
  return {
    song: MultitrackSongSchema.parse(song),
    status: requiresConfirmation
      ? ('review-required' as const)
      : ('ready' as const),
    uncertainWordIds,
    affectedLinks: structuredClone(affectedLinks),
    affectedSyllables: structuredClone(affectedSyllables),
    affectedChordAnchors,
    requiresConfirmation,
  };
}
export function applyLyricsEdit(
  song: MultitrackSong,
  sectionId: string,
  text: string,
  confirmed = false,
) {
  const plan = planLyricsEdit(song, sectionId, text);
  if (plan.requiresConfirmation && !confirmed)
    throw new Error(
      'Review lyrics links and explicitly confirm their removal; notes are retained',
    );
  return plan;
}
export function splitWord(
  input: MultitrackSong,
  wordId: string,
  parts: { id?: string | undefined; text: string }[],
  confirmed = false,
) {
  const song = MultitrackSongSchema.parse(structuredClone(input)),
    word = song.lyrics
      .flatMap((s) => s.lines.flatMap((l) => l.tokens))
      .find((t) => t.id === wordId);
  if (
    !word ||
    !word.syllables.length ||
    parts.map((p) => p.text).join('') !== word.text
  )
    throw new Error('Syllables must exactly reconstruct a word');
  const previous = new Map(word.syllables.map((s) => [s.id, s]));
  const next = parts.map((p) => {
    if (p.id && previous.get(p.id)?.text !== p.text)
      throw new Error('Changed/foreign syllable ID');
    return { id: p.id ?? uid(), text: p.text };
  });
  const removed = new Set(
    word.syllables
      .filter((s) => !next.some((n) => n.id === s.id))
      .map((s) => s.id),
  );
  const affectedLinks = song.arrangements.flatMap((a) =>
    a.lyricsLinks.filter((l) => removed.has(l.syllableId)),
  );
  if (affectedLinks.length && !confirmed)
    throw new Error('Confirm syllable link removal');
  word.syllables = next;
  for (const a of song.arrangements)
    a.lyricsLinks = a.lyricsLinks.filter((l) => !removed.has(l.syllableId));
  return { song: MultitrackSongSchema.parse(song), affectedLinks };
}
export function moveWord(
  input: MultitrackSong,
  sectionId: string,
  lineId: string,
  wordId: string,
  beforeTokenId: string | null,
) {
  const song = MultitrackSongSchema.parse(structuredClone(input)),
    section = song.lyrics.find((s) => s.id === sectionId),
    line = section?.lines.find((l) => l.id === lineId);
  if (!line) throw new Error('Unknown line');
  const index = line.tokens.findIndex((t) => t.id === wordId);
  if (index < 0) throw new Error('Unknown token');
  const [word] = line.tokens.splice(index, 1);
  const target =
    beforeTokenId === null
      ? line.tokens.length
      : line.tokens.findIndex((t) => t.id === beforeTokenId);
  if (target < 0) throw new Error('Unknown target token');
  line.tokens.splice(target, 0, word!);
  return MultitrackSongSchema.parse(song);
}
export function attachImportTrack(
  input: MultitrackSong,
  arrangementId: string,
  documentIndex: number,
  blockIndices: number[],
  mappedEvents: TrackEvent[],
  replaceTrackId?: string,
  confirmed = false,
) {
  const song = MultitrackSongSchema.parse(structuredClone(input)),
    a = arrangement(song, arrangementId),
    doc = song.importDocuments?.[documentIndex];
  if (!doc || !canStoreImport(doc))
    throw new Error('Import source is absent or preview-only');
  if (blockIndices.some((i) => !doc.tabBlocks[i]))
    throw new Error('Unknown source block');
  const t = replaceTrackId
    ? track(a, replaceTrackId)
    : emptyTrack(song, a.id, doc.title || 'Geïmporteerd spoor');
  if (replaceTrackId && !confirmed)
    throw new Error('Explicit replacement confirmation required');
  if (replaceTrackId)
    cleanupEvents(a, t.id, new Set(t.events.map((e) => e.id)));
  t.events = structuredClone(mappedEvents);
  t.importSource = { documentIndex, blockIndices };
  if (!replaceTrackId) {
    a.tracks.push(t);
    a.trackOrder.push(t.id);
  }
  return MultitrackSongSchema.parse(song);
}
export type PositionalEvent = Omit<NoteEvent, 'tones'> & {
  groupId: string;
  toneIndex: number;
  toneCount: number;
  tone: NoteEvent['tones'][number] | null;
};
export function positionalEvents(event: NoteEvent): PositionalEvent[] {
  const { tones, ...base } = event;
  return tones.length
    ? tones.map((tone, index) => ({
        ...structuredClone(base),
        id: `${event.id}:tone:${index}`,
        groupId: event.id,
        toneIndex: index,
        toneCount: tones.length,
        tone: structuredClone(tone),
      }))
    : [
        {
          ...structuredClone(base),
          groupId: event.id,
          toneIndex: 0,
          toneCount: 0,
          tone: null,
        },
      ];
}
export function groupedEvents(
  positions: ReturnType<typeof positionalEvents>,
): NoteEvent[] {
  const groups = new Map<string, typeof positions>();
  for (const p of positions) {
    const list = groups.get(p.groupId) ?? [];
    list.push(p);
    groups.set(p.groupId, list);
  }
  return [...groups.values()].map((list) => {
    const first = list[0]!;
    if (
      list.some(
        (p) =>
          p.kind !== first.kind ||
          JSON.stringify(p.start) !== JSON.stringify(first.start) ||
          JSON.stringify(p.duration) !== JSON.stringify(first.duration) ||
          p.technique !== first.technique ||
          p.toneCount !== first.toneCount,
      ) ||
      list.length !== Math.max(1, first.toneCount) ||
      new Set(list.map((p) => p.toneIndex)).size !== list.length ||
      list.some(
        (p) => p.toneIndex < 0 || p.toneIndex >= Math.max(1, first.toneCount),
      )
    )
      throw new Error(
        'Cannot losslessly reassemble changed or incomplete tone groups',
      );
    return NoteEventSchema.parse({
      id: first.groupId,
      kind: first.kind,
      start: first.start,
      duration: first.duration,
      ...(first.technique ? { technique: first.technique } : {}),
      tones: list
        .sort((a, b) => a.toneIndex - b.toneIndex)
        .flatMap((p) => (p.tone ? [p.tone] : [])),
    });
  });
}
export function physicalPitch(track: Track, string: number, fret: number) {
  return pitchAt(track.instrument, { string, fret });
}
export function legacySectionText(section: StudioSong['lyrics'][number]) {
  return section.tokens.map((t) => t.text).join('');
}
