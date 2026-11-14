import {
  newSong,
  putTone,
  fraction,
  uid,
  presets,
  cloneArrangement,
  SongSchema,
} from '../src/workspace.js';
import { pitchAt } from '../src/index.js';
export function legacyFixture(index = 0) {
  const song = newSong(
    'Eigen multitrack fixture ' + index,
    'Eigen testauteur',
    '[Couplet]\nla la water\nEen eigen regel\n[Refrein]\nEigen refrein',
  );
  const a = song.arrangements[0]!,
    meter = [
      { beats: 2, beatUnit: 4 as const },
      { beats: 3, beatUnit: 4 as const },
      { beats: 4, beatUnit: 4 as const },
      { beats: 6, beatUnit: 8 as const },
    ][index % 4]!;
  a.timeSignature = meter;
  a.instrument.capo = index % 2 ? 2 : 0;
  if (index % 3 === 0)
    a.instrument.tuning = { name: 'Drop D', pitches: [64, 59, 55, 50, 45, 38] };
  for (const section of a.sections)
    for (const m of section.measures) {
      m.timeSignature = structuredClone(meter);
      putTone(a, m, fraction(0, 1), fraction(1, 8), 1, 0);
      putTone(a, m, fraction(0, 1), fraction(1, 8), 2, 1);
      m.events.push({
        id: uid(),
        kind: 'note',
        start: fraction(0, 1),
        duration: fraction(1, 4),
        tones: [
          {
            pitch: pitchAt(a.instrument, {
              string: 6,
              fret: a.instrument.capo,
            }),
            position: { string: 6, fret: a.instrument.capo },
          },
        ],
      });
      m.events[0]!.technique = 'vibrato';
      m.events.push({
        id: uid(),
        kind: 'rest',
        start: fraction(1, 4),
        duration: fraction(1, 8),
        tones: [],
      });
    }
  const s = a.sections[0]!,
    word = song.lyrics[0]!.tokens.find((t) => t.text === 'water')!;
  s.chords.push({
    id: uid(),
    tokenId: word.id,
    originalText: 'water',
    grip: { ...structuredClone(presets[0]!), id: uid() },
    measureId: s.measures[0]!.id,
  });
  if (index >= 2) {
    song.arrangements.push(cloneArrangement(a));
    if (index >= 4) song.arrangements.push(cloneArrangement(a));
  }
  return SongSchema.parse(song);
}
