import { newSong, fraction, uid, presets } from '../src/workspace.js';
import {
  toMultitrack,
  MultitrackSongSchema,
  type TrackEvent,
} from '../src/multitrack.js';
import {
  splitWord,
  applyMultitrackMutation,
} from '../src/multitrack-operations.js';
import { duplicateArrangement } from '../src/workspace-editor.js';
export function alignmentFixture(withLinks = true) {
  let song = toMultitrack(
    newSong(
      'Eigen zangregel ' + uid().slice(0, 6),
      'Eigen alignmenttest',
      '[Couplet]\nLangs het water wordt licht\nEen eigen regel met nog vier woorden hier\nla la klinkt opnieuw\n[Refrein]\nEen eigen refrein',
    ),
  );
  const water = song.lyrics[0]!.lines[0]!.tokens.find(
    (w) => w.text === 'water',
  )!;
  song = splitWord(
    song,
    water.id,
    [{ text: 'wa' }, { text: 'ter' }],
    false,
  ).song;
  let a = song.arrangements[0]!;
  const t = a.tracks[0]!;
  t.name = 'Zangmelodie';
  t.role = 'vocal_melody';
  const prefix = uid(),
    bars = a.sections[0]!.measures;
  const note = (
    n: number,
    bar: number,
    num: number,
    den: number,
    string = 1,
    fret = n % 4,
  ): TrackEvent => ({
    id: prefix + '-' + String(n).padStart(2, '0'),
    measureId: bars[bar]!.id,
    kind: 'note',
    start: fraction(num, den),
    duration: fraction(1, den === 3 ? 12 : 4),
    tones: [
      {
        pitch: t.instrument.tuning.pitches[string - 1]! + fret,
        position: { string, fret },
      },
    ],
  });
  const group = note(0, 0, 0, 1);
  group.duration = fraction(1, 8);
  group.tones.push({ pitch: 60, position: { string: 2, fret: 1 } });
  t.events = [
    group,
    note(1, 0, 0, 1, 6, 0),
    note(2, 0, 1, 3, 3, 2),
    note(3, 0, 3, 4),
    ...Array.from({ length: 4 }, (_, i) => note(4 + i, 1, i, 4)),
    {
      id: uid(),
      measureId: bars[0]!.id,
      kind: 'rest',
      start: fraction(1, 2),
      duration: fraction(1, 8),
      tones: [],
    },
  ];
  const words = song.lyrics[0]!.lines[0]!.tokens,
    now = '2026-01-01T00:00:00.000Z';
  if (withLinks)
    for (const [word, ids] of [
      [words.find((w) => w.text === 'Langs')!, [t.events[0]!.id]],
      [
        words.find((w) => w.text === 'water')!,
        [t.events[3]!.id, t.events[4]!.id],
      ],
      [words.find((w) => w.text === 'licht')!, [t.events[7]!.id]],
    ] as const)
      a.lyricsLinks.push({
        id: uid(),
        trackId: t.id,
        syllableId: word.syllables[0]!.id,
        eventIds: [...ids],
        sustain: word.text === 'water',
        createdAt: now,
        updatedAt: now,
      });
  a.chordAnchors.push({
    id: uid(),
    sectionId: a.sections[0]!.id,
    measureId: bars[0]!.id,
    tokenId: words.find((w) => w.text === 'Langs')!.id,
    originalText: 'Langs',
    grip: structuredClone(presets[0]!),
  });
  song = applyMultitrackMutation(song, {
    op: 'duplicate-track',
    arrangementId: a.id,
    trackId: t.id,
  });
  a = song.arrangements[0]!;
  a.tracks[1]!.name = 'Gitaarbegeleiding';
  a.tracks[1]!.role = 'guitar_accompaniment';
  song = duplicateArrangement(song, a.id);
  song.lastArrangementId = a.id;
  return MultitrackSongSchema.parse(song);
}
