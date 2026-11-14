import {
  ExerciseSchema,
  type Exercise,
  type ExerciseConfiguration,
} from './practice.js';
import { rhythmPreset } from './theory.js';
const originals = [
  {
    id: 'r1',
    lab: 'rhythm',
    title: 'Een vaste basis',
    level: 1,
    goal: 'Houd vier rustige kwartslagen gelijkmatig.',
    instruction:
      'Tel hardop 1–2–3–4. Speel iedere tel een neerwaartse slag. Laat je schouders ontspannen.',
    start: 60,
    target: 80,
    minutes: 4,
    preset: 'quarters',
  },
  {
    id: 'r2',
    lab: 'rhythm',
    title: 'Ruimte tussen de slagen',
    level: 2,
    goal: 'Voel de puls ook wanneer je niet aanslaat.',
    instruction:
      'Blijf je hand bewegen tijdens de rusten. De opwaartse slagen vallen op de & tussen de tellen.',
    start: 60,
    target: 90,
    minutes: 5,
    preset: 'syncopated',
  },
  {
    id: 'r3',
    lab: 'rhythm',
    title: 'Twee golven in zes',
    level: 3,
    goal: 'Voel 6/8 als twee groepen van drie.',
    instruction:
      'Tel 1–2–3, 4–5–6. De hoofdpulsen liggen op 1 en 4. BPM slaat hier op een gepunte kwart.',
    start: 50,
    target: 80,
    minutes: 5,
    preset: 'six',
  },
  {
    id: 'r4',
    lab: 'rhythm',
    title: 'Zestienden met controle',
    level: 4,
    goal: 'Houd zestien posities gelijk zonder te versnellen.',
    instruction:
      'Tel 1-e-&-a. Wissel neer en op. Begin langzaam; verhoog pas wanneer het ontspannen blijft.',
    start: 45,
    target: 75,
    minutes: 6,
    preset: 'sixteenths',
  },
  {
    id: 's1',
    lab: 'scale',
    title: 'C majeur ontdekken',
    level: 1,
    goal: 'Herken C, E en G als I, III en V.',
    instruction:
      'Kies een noot op de hals. Lees de functie en zing de toonladdertrappen mee; notenschrift is niet nodig.',
    start: 60,
    target: 80,
    minutes: 5,
    root: 0,
    scale: 'major',
  },
  {
    id: 's2',
    lab: 'scale',
    title: 'Het karakter van mineur',
    level: 2,
    goal: 'Hoor en herken de kleine terts van A mineur.',
    instruction:
      'Vergelijk A–C–E met de grondtoon. III verwijst naar de derde trap; in mineur is dat een kleine terts.',
    start: 55,
    target: 85,
    minutes: 5,
    root: 9,
    scale: 'minor',
  },
  {
    id: 's3',
    lab: 'scale',
    title: 'Vijf tonen, veel ruimte',
    level: 3,
    goal: 'Verbind posities in A mineur pentatonisch.',
    instruction:
      'Speel stijgend en dalend. Verplaats je hand bewust en laat iedere toon helder klinken.',
    start: 60,
    target: 100,
    minutes: 6,
    root: 9,
    scale: 'minorPent',
  },
  {
    id: 's4',
    lab: 'scale',
    title: 'Van positie naar positie',
    level: 4,
    goal: 'Verbind C majeur pentatonisch over de hals.',
    instruction:
      'Gebruik I, III en V als oriëntatiepunten. Oefen één positie en schakel daarna naar het volgende venster.',
    start: 65,
    target: 105,
    minutes: 7,
    root: 0,
    scale: 'majorPent',
  },
  {
    id: 'c1',
    lab: 'chord',
    title: 'Van Am naar C',
    level: 1,
    goal: 'Wissel zonder je hele hand op te tillen.',
    instruction:
      'Laat de wijsvinger op B1 staan. Verplaats de overige vingers vlak boven de snaren.',
    start: 55,
    target: 80,
    minutes: 4,
    sequence: ['Am', 'C'],
  },
  {
    id: 'c2',
    lab: 'chord',
    title: 'Vier akkoorden, één flow',
    level: 2,
    goal: 'Speel C–G–Am–F met gelijke maatduur.',
    instruction:
      'Kijk tijdens het huidige akkoord alvast naar het volgende. Wissel op de eerste tel van de volgende maat.',
    start: 60,
    target: 90,
    minutes: 6,
    sequence: ['C', 'G', 'Am', 'F'],
  },
  {
    id: 'c3',
    lab: 'chord',
    title: 'De weg terug naar I',
    level: 3,
    goal: 'Herken ii–V–I als Dm–G–C in C.',
    instruction:
      'Noem de trapnummers terwijl je speelt. De toonsoort bepaalt de akkoordnamen.',
    start: 60,
    target: 95,
    minutes: 5,
    sequence: ['Dm', 'G', 'C'],
  },
  {
    id: 'c4',
    lab: 'chord',
    title: 'Vaste grepen, nieuwe kleur',
    level: 4,
    goal: 'Oefen alternatieve grepen met bewuste vingerzetting.',
    instruction:
      'Gebruik de alternatieve greep en controleer iedere snaar. Snelheid komt pas na helderheid.',
    start: 65,
    target: 100,
    minutes: 7,
    sequence: ['E', 'A', 'D', 'G'],
  },
  {
    id: 't1',
    lab: 'technique',
    title: 'P–I–M–A, rustig rond',
    level: 1,
    goal: 'Laat duim en vingers onafhankelijk bewegen.',
    instruction:
      'P = duim, I = wijs, M = middel, A = ring. Speel duim op A, daarna G–B–e.',
    start: 55,
    target: 85,
    minutes: 4,
    category: 'Fingerstyle',
    pattern: 'pima',
  },
  {
    id: 't2',
    lab: 'technique',
    title: 'Snaar overslaan',
    level: 2,
    goal: 'Raak alleen de bedoelde snaar.',
    instruction:
      'Wissel de bassnaar en hoge snaar af. Maak kleine plectrum- of vingerbewegingen.',
    start: 60,
    target: 95,
    minutes: 5,
    category: 'Snaarwisselingen',
    pattern: 'skip',
  },
  {
    id: 't3',
    lab: 'technique',
    title: 'Vier vingers op een rij',
    level: 2,
    goal: 'Ontwikkel gelijkmatige vingeronafhankelijkheid.',
    instruction:
      'Speel 1–2–3–4 met wijs–middel–ring–pink. Druk vlak achter de fret; houd de hand ontspannen.',
    start: 50,
    target: 90,
    minutes: 5,
    category: 'Linkerhand',
    pattern: 'chromatic',
  },
  {
    id: 't4',
    lab: 'technique',
    title: 'Een kleine reis',
    level: 3,
    goal: 'Verbind een korte melodie over twee posities.',
    instruction:
      'Volg de gemarkeerde tabnoot en schuif bewust naar de volgende positie. Het riffje is origineel voor dit prototype.',
    start: 55,
    target: 90,
    minutes: 6,
    category: 'Melodisch',
    pattern: 'melody',
  },
  {
    id: 't5',
    lab: 'technique',
    title: 'Hammer-on en pull-off',
    level: 4,
    goal: 'Laat de linkerhand noten verbinden.',
    instruction:
      'h betekent hammer-on, p betekent pull-off. Sla alleen de eerste noot van ieder paar aan.',
    start: 45,
    target: 75,
    minutes: 5,
    category: 'Linkerhand',
    pattern: 'legato',
  },
  {
    id: 't6',
    lab: 'technique',
    title: 'Afwisselende bas',
    level: 3,
    goal: 'Wissel basnoten af onder een rustig tokkelpatroon.',
    instruction:
      'De duim wisselt A en D af; I–M–A houden dezelfde hoge snaren.',
    start: 60,
    target: 90,
    minutes: 5,
    category: 'Fingerstyle',
    pattern: 'bass',
  },
] as const;
const levels = ['Basis', 'Ontwikkeling', 'Toepassing', 'Verdieping'] as const;
const shapes: Record<string, { root: number; quality: 'major' | 'minor' }> = {
  C: { root: 0, quality: 'major' },
  G: { root: 7, quality: 'major' },
  Am: { root: 9, quality: 'minor' },
  F: { root: 5, quality: 'major' },
  Dm: { root: 2, quality: 'minor' },
  E: { root: 4, quality: 'major' },
  A: { root: 9, quality: 'major' },
  D: { root: 2, quality: 'major' },
};
const patterns: Record<
  string,
  [number, number, string, ('none' | 'hammer-on' | 'pull-off')?][]
> = {
  pima: [
    [5, 0, 'P'],
    [3, 2, 'I'],
    [2, 1, 'M'],
    [1, 0, 'A'],
    [5, 0, 'P'],
    [3, 2, 'I'],
    [2, 1, 'M'],
    [1, 0, 'A'],
  ],
  bass: [
    [5, 0, 'P'],
    [3, 2, 'I'],
    [2, 1, 'M'],
    [1, 0, 'A'],
    [4, 2, 'P'],
    [3, 2, 'I'],
    [2, 1, 'M'],
    [1, 0, 'A'],
  ],
  skip: [
    [5, 0, '↓'],
    [2, 0, '↑'],
    [5, 0, '↓'],
    [1, 0, '↑'],
    [4, 0, '↓'],
    [2, 0, '↑'],
    [4, 0, '↓'],
    [1, 0, '↑'],
  ],
  chromatic: [
    [6, 1, '1'],
    [6, 2, '2'],
    [6, 3, '3'],
    [6, 4, '4'],
    [5, 1, '1'],
    [5, 2, '2'],
    [5, 3, '3'],
    [5, 4, '4'],
  ],
  melody: [
    [3, 0, '0'],
    [2, 1, '1'],
    [2, 3, '3'],
    [1, 0, '0'],
    [1, 3, '1'],
    [1, 5, '3'],
    [2, 5, '3'],
    [1, 3, '1'],
  ],
  legato: [
    [3, 0, '0'],
    [3, 2, '2', 'hammer-on'],
    [2, 3, '3'],
    [2, 1, '1', 'pull-off'],
    [3, 0, '0'],
    [3, 2, '2', 'hammer-on'],
    [1, 3, '3'],
    [1, 0, '0', 'pull-off'],
  ],
};
export const practiceCatalog: Exercise[] = originals.map((ex) => {
  const meter =
    ex.lab === 'rhythm' && ex.preset === 'six'
      ? { beats: 6, beatUnit: 8 as const }
      : { beats: 4, beatUnit: 4 as const };
  let specific: ExerciseConfiguration['specific'];
  if (ex.lab === 'rhythm')
    specific = { lab: 'rhythm', pattern: rhythmPreset(ex.preset, meter) };
  else if (ex.lab === 'scale')
    specific = {
      lab: 'scale',
      root: ex.root,
      scale: ex.scale,
      direction: 'up',
    };
  else if (ex.lab === 'chord')
    specific = {
      lab: 'chord',
      sequence: ex.sequence.map((name) => ({ ...shapes[name]! })),
    };
  else
    specific = {
      lab: 'technique',
      patternId: ex.pattern,
      steps: patterns[ex.pattern]!.map(
        ([string, fret, finger, technique], i) => ({
          id: ex.id + '-step-' + i,
          string,
          fret,
          finger,
          technique: technique ?? 'none',
        }),
      ),
    };
  const config: ExerciseConfiguration = {
    exerciseId: ex.id,
    exerciseVersion: 1,
    instrument: {
      id: 'catalog-' + ex.id,
      type: 'acoustic',
      stringCount: 6,
      tuning: { name: 'EADGBE', pitches: [64, 59, 55, 50, 45, 40] },
      capo: 0,
      maxFret: 24,
      preferredInput: 'builtin-microphone',
    },
    bpm: ex.start,
    meter,
    difficulty: levels[ex.level - 1]!,
    position: { from: 0, to: 24 },
    specific,
  };
  return ExerciseSchema.parse({
    id: ex.id,
    version: 1,
    title: ex.title,
    description: ex.goal,
    lab: ex.lab,
    category:
      ex.lab === 'technique'
        ? ex.category
        : ex.lab === 'rhythm'
          ? 'Ritme'
          : ex.lab === 'scale'
            ? 'Toonladders'
            : 'Akkoordwisselingen',
    level: levels[ex.level - 1],
    goal: ex.goal,
    instructions: [ex.instruction],
    startBpm: ex.start,
    targetBpm: ex.target,
    estimatedSeconds: ex.minutes * 60,
    compatibleInstruments: ['acoustic', 'electric'],
    defaultConfiguration: config,
    content: structuredClone(specific),
  });
});
