import {
  ParseImportInputSchema,
  ImportDocumentSchema,
  type ImportDocument,
} from './song-import-model.js';
import { presets } from './workspace.js';
const roots: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
/** Reuses existing grip names; unsupported fingerings never become invented grips. */
export function recognizeChord(symbol: string) {
  const m =
    /^([A-G])([#b♯♭]?)(?:(?:maj|min|dim|aug|sus|add|m|M|ø|°|\+)?[0-9]*(?:sus[24]|add[0-9]+)?)(?:\/([A-G])([#b♯♭]?))?$/.exec(
      symbol,
    );
  if (!m) return null;
  const pc = (name: string, accidental: string) =>
    (roots[name]! +
      (/[#♯]/.test(accidental) ? 1 : /[b♭]/.test(accidental) ? -1 : 0) +
      12) %
    12;
  return {
    symbol,
    root: pc(m[1]!, m[2]!),
    bass: m[3] ? pc(m[3], m[4]!) : null,
    grip: presets.find((p) => p.name === symbol) ?? null,
  };
}
export function parseSongImport(value: unknown): ImportDocument {
  const input = ParseImportInputSchema.parse(value),
    raw = input.text;
  const doc: ImportDocument = {
    version: 1,
    title: input.title,
    artist: input.artist,
    format: input.format,
    contentType: 'lyrics',
    rawText: raw,
    sections: [{ name: 'Couplet 1', lines: [], chords: [] }],
    tabBlocks: [],
    metadata: { key: null, bpm: null, meter: null, capo: null, tuning: null },
    source: {
      origin: 'user',
      provider: null,
      recordId: null,
      name: input.sourceName,
      url: null,
      method: input.method,
      storage: 'user-confirmation',
    },
    synchronization: null,
    warnings: [],
    unrecognized: [],
    status: 'valid',
  };
  const lines = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  let section = doc.sections[0]!;
  const warn = (line: number, text: string, message: string) => {
    doc.unrecognized.push({ line, text });
    doc.warnings.push(`Regel ${line + 1}: ${message}`);
  };
  const newSection = (name: string) => {
    if (
      !section.lines.length &&
      !section.chords.length &&
      !doc.tabBlocks.some((b) => b.sectionIndex === doc.sections.length - 1)
    )
      section.name = name;
    else {
      section = { name, lines: [], chords: [] };
      doc.sections.push(section);
    }
  };
  const addLine = (line: string, sourceLine: number) => {
    let text = '',
      cursor = 0;
    for (const m of line.matchAll(/\[([^\]]+)\]/g)) {
      text += line.slice(cursor, m.index);
      const chord = recognizeChord(m[1]!);
      if (chord)
        section.chords.push({
          line: section.lines.length,
          column: text.length,
          symbol: chord.symbol,
          root: chord.root,
          bass: chord.bass,
        });
      else {
        text += m[0];
        warn(sourceLine, m[0], 'Onbekende akkoordnotatie als tekst behouden.');
      }
      cursor = m.index + m[0].length;
    }
    section.lines.push(text + line.slice(cursor));
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*e\|/.test(line)) {
      const block = lines.slice(i, i + 6),
        parsed = block.map((l) => /^\s*([eBGDAE])\|(.*)$/.exec(l));
      if (
        parsed.length !== 6 ||
        parsed.some((m, n) => !m || m[1] !== ['e', 'B', 'G', 'D', 'A', 'E'][n])
      ) {
        warn(i, line, 'Tabblok vereist zes snaren in volgorde e B G D A E.');
        doc.status = 'correction-required';
        continue;
      }
      const bodies = parsed.map((m) => m![2]!);
      const bars = [...bodies[0]!.matchAll(/\|/g)].map((m) => m.index);
      if (
        bodies.some(
          (b) =>
            b.length !== bodies[0]!.length ||
            JSON.stringify([...b.matchAll(/\|/g)].map((m) => m.index)) !==
              JSON.stringify(bars),
        )
      ) {
        warn(
          i,
          block.join('\n'),
          'Snaarlengtes of maatstrepen verschillen; corrigeer het bronblok.',
        );
        doc.status = 'correction-required';
      }
      const notes: ImportDocument['tabBlocks'][number]['notes'] = [];
      bodies.forEach((b, s) => {
        for (const m of b.matchAll(/\d+/g)) {
          const fret = Number(m[0]);
          if (fret > 24) {
            warn(i + s, block[s]!, 'Fret buiten bereik 0–24.');
            doc.status = 'correction-required';
          } else
            notes.push({
              string: s + 1,
              fret,
              column: m.index,
              measureIndex: bars.filter((c) => c < m.index).length,
            });
        }
        if (/[^\d\s\-|:*]/.test(b))
          warn(
            i + s,
            block[s]!,
            'Techniek/notatie blijft bronfragment; geen speeltechniek of duur afgeleid.',
          );
      });
      doc.tabBlocks.push({
        sourceLine: i,
        sectionIndex: doc.sections.length - 1,
        raw: block.join('\n'),
        stringOrder: ['e', 'B', 'G', 'D', 'A', 'E'],
        tuning: 'EADGBE',
        rhythmicUncertainty: true,
        barColumns: bars,
        repeatMarkers: [...bodies[0]!.matchAll(/[:*]/g)].map((m) => m.index),
        notes,
      });
      doc.metadata.tuning = 'EADGBE';
      i += 5;
      doc.warnings.push(
        'ASCII-tab: kolommen zijn bronposities, geen nootduren. Noten blijven in de importbron voor handmatige timing. Streepjes zijn geen bewezen rusten; herhaaltekens worden niet uitgewerkt.',
      );
      continue;
    }
    if (/^\s*[BGDAE]\|/.test(line)) {
      warn(i, line, 'Losse tab-snaar buiten een zeslijnig blok.');
      doc.status = 'correction-required';
      continue;
    }
    const directive = /^\s*\{([\w_]+)(?:\s*:\s*|\s+)?(.*?)\}\s*$/.exec(line);
    if (directive) {
      const name = directive[1]!.toLowerCase(),
        value = directive[2]!.trim();
      if (['title', 't'].includes(name)) doc.title ||= value;
      else if (name === 'artist') doc.artist ||= value;
      else if (name === 'key' && recognizeChord(value))
        doc.metadata.key = value;
      else if (
        name === 'tempo' &&
        /^\d+$/.test(value) &&
        +value >= 20 &&
        +value <= 300
      )
        doc.metadata.bpm = +value;
      else if (name === 'capo' && /^\d+$/.test(value) && +value <= 24)
        doc.metadata.capo = +value;
      else if (
        name === 'time' &&
        /^(?:[1-9]|1[0-2])\/(?:2|4|8|16)$/.test(value)
      ) {
        const [beats, beatUnit] = value.split('/').map(Number);
        doc.metadata.meter = {
          beats: beats!,
          beatUnit: beatUnit as 2 | 4 | 8 | 16,
        };
      } else if (
        [
          'start_of_chorus',
          'soc',
          'start_of_verse',
          'sov',
          'start_of_bridge',
          'sob',
        ].includes(name)
      )
        newSection(
          value ||
            (['soc', 'start_of_chorus'].includes(name)
              ? 'Refrein'
              : ['sob', 'start_of_bridge'].includes(name)
                ? 'Bridge'
                : 'Couplet'),
        );
      else if (
        [
          'end_of_chorus',
          'eoc',
          'end_of_verse',
          'eov',
          'end_of_bridge',
          'eob',
        ].includes(name)
      )
        newSection('Couplet');
      else if (['start_of_tab', 'sot', 'end_of_tab', 'eot'].includes(name)) {
        /* ASCII detection operates independently. */
      } else warn(i, line, 'Onbekende of ongeldige directive behouden.');
      continue;
    }
    const metadata = /^(Title|Titel|Artist|Artiest):\s*(.+)$/i.exec(line);
    if (metadata) {
      if (/^(title|titel)$/i.test(metadata[1]!)) doc.title ||= metadata[2]!;
      else doc.artist ||= metadata[2]!;
      continue;
    }
    const heading = /^\s*\[([^\]]{1,100})\]\s*$/.exec(line);
    if (heading && !recognizeChord(heading[1]!)) {
      newSection(heading[1]!);
      continue;
    }
    const matches = [...line.matchAll(/\S+/g)];
    if (matches.length && matches.every((m) => recognizeChord(m[0]))) {
      const next = lines[i + 1];
      const lyric =
        next !== undefined &&
        !/^\s*(?:\[|\{|e\|)/.test(next) &&
        ![...next.matchAll(/\S+/g)].every((m) => recognizeChord(m[0]));
      matches.forEach((m) => {
        const c = recognizeChord(m[0])!;
        section.chords.push({
          line: section.lines.length,
          column: m.index,
          symbol: c.symbol,
          root: c.root,
          bass: c.bass,
        });
      });
      section.lines.push(lyric ? next! : '');
      if (lyric) i++;
      continue;
    }
    addLine(line, i);
  }
  while (
    doc.sections.length > 1 &&
    !doc.sections.at(-1)!.lines.length &&
    !doc.sections.at(-1)!.chords.length
  )
    doc.sections.pop();
  const chordCount = doc.sections.reduce((n, s) => n + s.chords.length, 0);
  doc.contentType = doc.tabBlocks.length
    ? chordCount || doc.sections.some((s) => s.lines.some((l) => l.trim()))
      ? 'mixed'
      : 'tablature'
    : chordCount
      ? 'chords'
      : 'lyrics';
  if (doc.format === 'auto')
    doc.format = /\{\w+/.test(raw)
      ? 'chordpro'
      : doc.tabBlocks.length
        ? 'ascii'
        : 'lyrics';
  if (chordCount)
    doc.warnings.push(
      'Akkoordposities zijn tekstkolommen, geen maatposities. Alleen bestaande akkoordgrepen worden aan woorden gekoppeld; alle symbolen blijven in de importbron.',
    );
  if (input.format === 'ascii' && !doc.tabBlocks.length) {
    doc.status = 'invalid';
    doc.warnings.push('Geen geldig zeslijnig tabblok gevonden.');
  }
  if (doc.status === 'valid' && doc.warnings.length) doc.status = 'warnings';
  if (!doc.title.trim())
    doc.warnings.push('Vul een titel in vóór definitieve import.');
  return ImportDocumentSchema.parse(doc);
}
