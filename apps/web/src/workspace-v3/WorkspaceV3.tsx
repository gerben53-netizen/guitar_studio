import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { useSong } from '../useSong';
import { request } from '../api';
import { Dialog } from '../components/Dialog';
import { ChordEditor } from '../components/ChordEditor';
import { Fretboard } from '../components/Fretboard';
import { NumericField } from '../practice/PracticeTransport';
import { TrackManager } from './TrackManager';
import { LyricsTextEditor, SyllableEditor } from './LyricLinkEditor';
import { ScoreSystem } from './ScoreSystem';
import { useScorePractice } from './useScorePractice';
import { WorkspaceDialogs } from './WorkspaceDialogs';
import {
  applyMultitrackMutation,
  type MultitrackMutation,
} from '../../../../packages/music-domain/src/multitrack-operations';
import {
  timeline,
  type TrackEvent,
} from '../../../../packages/music-domain/src/multitrack';
import {
  writeFret,
  putRest,
  deleteTones,
  moveCursor,
  inputBuffer,
  measureColumns,
  trackProjection,
  selectedRange,
  practiceTracks,
  setDurations,
  value,
  type EditorCursor,
  type ToneSelection,
} from '../../../../packages/music-domain/src/workspace-editor';
import {
  uid,
  fraction,
  sameTime,
  type Grip,
} from '../../../../packages/music-domain/src/workspace';
import {
  pitchAt,
  type MusicalTime,
} from '../../../../packages/music-domain/src/index';
export interface PracticeHandoff {
  id: string;
  title: string;
  arrangementId: string;
  cursor: EditorCursor;
}
type Props = {
  editor: ReturnType<typeof useSong>;
  practice: boolean;
  setPractice: (v: boolean) => void;
  exportSong: () => void;
  report: (s: string) => void;
  openImport: () => void;
  openPracticeRoom: (context: PracticeHandoff) => void;
  reload: () => void;
  returnCursor?: EditorCursor;
};
export function WorkspaceV3(p: Props) {
  const { editor, practice } = p;
  const song = editor.document!,
    change = editor.changeDocument;
  const [arrId, setArrId] = useState(
      song.lastArrangementId ?? song.arrangements[0]!.id,
    ),
    a = song.arrangements.find((a) => a.id === arrId) ?? song.arrangements[0]!;
  const [rawCursor, setCursor] = useState<EditorCursor>(
    p.returnCursor ?? {
      trackId: a.activeTrackId,
      measureId: a.sections[0]!.measures[0]!.id,
      start: fraction(0, 1),
      string: 1,
    },
  );
  const measures = timeline(a),
    track =
      a.tracks.find((t) => t.id === a.activeTrackId) ??
      a.tracks.find((t) => t.id === rawCursor.trackId) ??
      a.tracks[0]!;
  const cursor = {
    ...rawCursor,
    trackId: track.id,
    measureId: measures.some((m) => m.id === rawCursor.measureId)
      ? rawCursor.measureId
      : measures[0]!.id,
    start:
      value(rawCursor.start) <
      (() => {
        const m =
          measures.find((m) => m.id === rawCursor.measureId) ?? measures[0]!;
        return m.timeSignature.beats / m.timeSignature.beatUnit;
      })()
        ? rawCursor.start
        : fraction(0, 1),
  };
  const section =
    a.sections.find((s) => s.measures.some((m) => m.id === cursor.measureId)) ??
    a.sections[0]!;
  const [lyricSectionId, setLyricSectionId] = useState(section.lyricsSectionId),
    lyrics =
      song.lyrics.find((s) => s.id === lyricSectionId) ??
      song.lyrics.find((s) => s.id === section.lyricsSectionId)!;
  const [selection, setSelection] = useState<ToneSelection[]>([]),
    [range, setRange] = useState<string[]>([cursor.measureId]),
    [rangeAnchor, setRangeAnchor] = useState(cursor.measureId);
  const [duration, setDuration] = useState<MusicalTime>(fraction(1, 4)),
    [buffer, setBuffer] = useState(''),
    [columns, setColumns] = useState(0),
    [width, setWidth] = useState(1100),
    [lyricTracks, setLyricTracks] = useState(
      () =>
        new Set(
          a.tracks
            .filter(
              (t) => t.role === 'vocal_melody' || t.id === a.activeTrackId,
            )
            .map((t) => t.id),
        ),
    );
  const [wordId, setWordId] = useState(''),
    [syllableId, setSyllableId] = useState(''),
    [sustain, setSustain] = useState(false),
    [collapsedLyrics, setCollapsedLyrics] = useState(false),
    [neck, setNeck] = useState<'collapsed' | 'compact' | 'expanded'>('compact'),
    [advance, setAdvance] = useState(false),
    [modal, setModal] = useState(''),
    [technique, setTechnique] =
      useState<NonNullable<TrackEvent['technique']>>('normal');
  const [practiceView, setPracticeView] = useState('all'),
    [scope, setScope] = useState('selection');
  const root = useRef<HTMLDivElement>(null),
    score = useRef<HTMLElement>(null),
    focus = useRef(false);
  const selectedIds = [...new Set(selection.map((s) => s.eventId))].filter(
      (id) => track.events.some((e) => e.id === id),
    ),
    noteIds = selectedIds.filter(
      (id) => track.events.find((e) => e.id === id)?.kind === 'note',
    );
  const word = song.lyrics
    .flatMap((s) => s.lines.flatMap((l) => l.tokens))
    .find(
      (w) => w.id === wordId || w.syllables.some((s) => s.id === syllableId),
    );
  const practiceRange =
      scope === 'all'
        ? measures.map((m) => m.id)
        : range.filter((id) => measures.some((m) => m.id === id)),
    audio = useScorePractice(
      a,
      practiceRange.length ? practiceRange : [cursor.measureId],
      practice,
    );
  const mutate = (cmd: MultitrackMutation) =>
    change((s) => applyMultitrackMutation(s, cmd));
  useEffect(() => {
    if (!score.current) return;
    const observer = new ResizeObserver((e) =>
      setWidth(e[0]!.contentRect.width),
    );
    observer.observe(score.current);
    return () => observer.disconnect();
  }, [practice, practiceView]);
  useEffect(() => {
    if (focus.current) {
      const button = root.current?.querySelector<HTMLButtonElement>(
        '.tab-position[data-active="true"]',
      );
      if (button) {
        button.focus();
        button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else
        root.current
          ?.querySelector<HTMLSelectElement>('[aria-label="Actief spoor"]')
          ?.focus();
      focus.current = false;
    }
  }, [rawCursor, arrId, song]);
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        !(e.ctrlKey || e.metaKey) ||
        e.key.toLowerCase() !== 'z' ||
        (e.target as HTMLElement).closest('input,textarea,select,dialog')
      )
        return;
      e.preventDefault();
      editor.undo(e.shiftKey);
    };
    addEventListener('keydown', handler);
    return () => removeEventListener('keydown', handler);
  }, [editor.undo]);
  function chooseTrack(id: string) {
    if (id !== a.activeTrackId)
      mutate({ op: 'select-track', arrangementId: a.id, trackId: id });
    setCursor({ ...cursor, trackId: id });
    setSelection([]);
    setBuffer('');
  }
  function selectSyllable(id: string) {
    setSyllableId(id);
    const w = song.lyrics
      .flatMap((s) => s.lines.flatMap((l) => l.tokens))
      .find((w) => w.syllables.some((s) => s.id === id));
    if (w) setWordId(w.id);
    const links = a.lyricsLinks.filter((l) => l.syllableId === id),
      link = links.find((l) => l.trackId === track.id) ?? links[0];
    if (link) {
      if (link.trackId !== track.id) chooseTrack(link.trackId);
      const t = a.tracks.find((t) => t.id === link.trackId)!,
        event = t.events.find((e) => e.id === link.eventIds[0]);
      if (event) {
        setDuration(event.duration);
        setTechnique(event.technique ?? 'normal');
        setCursor({
          trackId: t.id,
          measureId: event.measureId,
          start: event.start,
          string: event.tones[0]?.position?.string ?? 1,
        });
      }
      setSelection(
        t.events
          .filter((e) =>
            links.some((l) => l.trackId === t.id && l.eventIds.includes(e.id)),
          )
          .flatMap((e) =>
            e.tones.flatMap((t) =>
              t.position ? [{ eventId: e.id, string: t.position.string }] : [],
            ),
          ),
      );
      setSustain(link.sustain);
    }
  }
  function choose(c: EditorCursor, eventId: string | null, e: MouseEvent) {
    if (practice) {
      setRange([c.measureId]);
      return;
    }
    if (c.trackId !== track.id) chooseTrack(c.trackId);
    setCursor(c);
    setBuffer('');
    focus.current = true;
    const event = a.tracks
        .find((t) => t.id === c.trackId)!
        .events.find((n) => n.id === eventId),
      key = {
        eventId: eventId ?? '',
        string: event?.kind === 'rest' ? null : c.string,
      };
    if (event) {
      setDuration(event.duration);
      setTechnique(event.technique ?? 'normal');
    }
    setSelection((old) =>
      !eventId
        ? []
        : e.ctrlKey || e.metaKey || e.shiftKey
          ? old.some(
              (s) => s.eventId === key.eventId && s.string === key.string,
            )
            ? old.filter(
                (s) => s.eventId !== key.eventId || s.string !== key.string,
              )
            : [...(c.trackId === track.id ? old : []), key]
          : [key],
    );
    const link = a.lyricsLinks.find(
      (l) => l.trackId === c.trackId && l.eventIds.includes(eventId ?? ''),
    );
    if (link) {
      setSyllableId(link.syllableId);
      setWordId(
        song.lyrics
          .flatMap((s) => s.lines.flatMap((l) => l.tokens))
          .find((w) => w.syllables.some((s) => s.id === link.syllableId))?.id ??
          '',
      );
    }
  }
  function selectMeasure(id: string, extend: boolean) {
    const anchor = measures.some((m) => m.id === rangeAnchor)
      ? rangeAnchor
      : cursor.measureId;
    const ids = extend ? selectedRange(a, anchor, id) : [id];
    setRange(ids);
    if (!extend) setRangeAnchor(id);
    setSelection(
      track.events
        .filter((e) => ids.includes(e.measureId))
        .flatMap<ToneSelection>((e) =>
          e.kind === 'rest'
            ? [{ eventId: e.id, string: null }]
            : e.tones.flatMap((t) =>
                t.position
                  ? [{ eventId: e.id, string: t.position.string }]
                  : [],
              ),
        ),
    );
    setCursor({ ...cursor, measureId: id, start: fraction(0, 1) });
  }
  function insert(string: number, fret: number) {
    if (practice) return;
    const c = { ...cursor, string };
    if (change((s) => writeFret(s, a.id, c, fret, duration, technique))) {
      setBuffer('');
      setCursor(advance ? moveCursor(a, c, 1, 0, duration) : c);
      focus.current = true;
    }
  }
  function commitBuffer() {
    if (buffer !== '') insert(cursor.string, Number(buffer));
  }
  function remove() {
    let selected = selection;
    if (!selected.length) {
      const e = track.events.find(
        (e) =>
          e.measureId === cursor.measureId &&
          sameTime(e.start, cursor.start) &&
          (e.kind === 'rest' ||
            e.tones.some((t) => t.position?.string === cursor.string)),
      );
      selected = e
        ? [{ eventId: e.id, string: e.kind === 'rest' ? null : cursor.string }]
        : [];
    }
    if (
      selected.length &&
      change((s) => deleteTones(s, a.id, track.id, selected))
    ) {
      setSelection([]);
      setBuffer('');
      focus.current = true;
      setCursor({ ...cursor });
    }
  }
  function keyboard(e: KeyboardEvent) {
    if (practice) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      editor.undo(e.shiftKey);
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      try {
        setBuffer(inputBuffer(buffer, e.key));
      } catch (e) {
        p.report((e as Error).message);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commitBuffer();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setBuffer('');
      setSelection([]);
      return;
    }
    if (['Delete', 'Backspace'].includes(e.key)) {
      e.preventDefault();
      remove();
      return;
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      if (buffer) {
        p.report('Bevestig met Enter of annuleer met Escape.');
        return;
      }
      const c = moveCursor(
        a,
        cursor,
        e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0,
        e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0,
        duration,
      );
      if (e.shiftKey) {
        const ids = selectedRange(a, rangeAnchor, c.measureId);
        setRange(ids);
        setSelection(
          track.events
            .filter(
              (n) =>
                ids.includes(n.measureId) &&
                (c.measureId !== cursor.measureId ||
                  (value(n.start) >=
                    Math.min(value(c.start), value(cursor.start)) &&
                    value(n.start) <=
                      Math.max(value(c.start), value(cursor.start)))),
            )
            .flatMap((n) =>
              n.tones.flatMap((t) =>
                t.position
                  ? [{ eventId: n.id, string: t.position.string }]
                  : [],
              ),
            ),
        );
      } else {
        setRange([c.measureId]);
        setRangeAnchor(c.measureId);
        setSelection([]);
      }
      setCursor(c);
      focus.current = true;
    }
  }
  function link(replace: boolean) {
    if (!syllableId || !noteIds.length) return;
    change((s) => {
      const arr = s.arrangements.find((x) => x.id === a.id)!,
        old = arr.lyricsLinks.filter(
          (l) => l.trackId === track.id && l.syllableId === syllableId,
        ),
        now = new Date().toISOString();
      arr.lyricsLinks = arr.lyricsLinks.filter((l) => !old.includes(l));
      arr.lyricsLinks.push({
        id: old[0]?.id ?? uid(),
        syllableId,
        trackId: track.id,
        eventIds: [
          ...new Set([
            ...(replace ? [] : old.flatMap((l) => l.eventIds)),
            ...noteIds,
          ]),
        ],
        sustain,
        createdAt: old[0]?.createdAt ?? now,
        updatedAt: now,
      });
    });
  }
  function chooseArrangement(id: string) {
    setArrId(id);
    const n = song.arrangements.find((a) => a.id === id)!;
    setCursor({
      trackId: n.activeTrackId,
      measureId: n.sections[0]!.measures[0]!.id,
      start: fraction(0, 1),
      string: 1,
    });
    setLyricSectionId(n.sections[0]!.lyricsSectionId);
    setSelection([]);
    setWordId('');
    setSyllableId('');
    setRangeAnchor(n.sections[0]!.measures[0]!.id);
    setLyricTracks(
      new Set(
        n.tracks
          .filter((t) => t.role === 'vocal_melody' || t.id === n.activeTrackId)
          .map((t) => t.id),
      ),
    );
    setRange([n.sections[0]!.measures[0]!.id]);
    setBuffer('');
    change((s) => {
      s.lastArrangementId = id;
    });
  }
  async function save() {
    if (
      editor.requiresUpgrade ||
      editor.needsUpgrade ||
      editor.status === 'Bevestig opslaan'
    )
      setModal('upgrade');
    else await editor.flush();
  }
  async function handoff() {
    if (!(await editor.flush())) return;
    const ids = practiceRange.length ? practiceRange : [cursor.measureId],
      tracks = practiceTracks(a, practiceView).map((t) => t.id);
    if (!tracks.length) tracks.push(track.id);
    const origin = await request<{ id: string }>('/practice/origins', {
      method: 'POST',
      body: JSON.stringify({
        songId: song.id,
        arrangementId: a.id,
        sectionId: section.id,
        measureId: cursor.measureId,
        position: cursor.start,
        stringSelection: [cursor.string],
        exerciseType: 'rhythm',
        trackIds: tracks,
        measureRange: { fromMeasureId: ids[0], toMeasureId: ids.at(-1) },
        returnCursor: {
          trackId: track.id,
          measureId: cursor.measureId,
          position: cursor.start,
          string: cursor.string,
        },
      }),
    });
    audio.stop();
    p.openPracticeRoom({
      id: origin.id,
      title: song.title,
      arrangementId: a.id,
      cursor,
    });
  }
  const projection = trackProjection(song, a.id, track.id),
    projectedSection = projection.sections.find((s) => s.id === section.id)!,
    activeChord = a.chordAnchors.find((c) => c.tokenId === word?.id);
  function saveChord(grip: Grip, library: boolean) {
    if (
      change((s) => {
        const arr = s.arrangements.find((x) => x.id === a.id)!,
          c = arr.chordAnchors.find((c) => c.tokenId === word?.id);
        if (c) c.grip = grip;
        else
          arr.chordAnchors.push({
            id: uid(),
            sectionId: arr.sections.find(
              (x) => x.lyricsSectionId === lyrics.id,
            )!.id,
            measureId: arr.sections
              .find((x) => x.lyricsSectionId === lyrics.id)!
              .measures.some((m) => m.id === cursor.measureId)
              ? cursor.measureId
              : arr.sections.find((x) => x.lyricsSectionId === lyrics.id)!
                  .measures[0]!.id,
            tokenId: word!.id,
            originalText: word!.text,
            grip,
          });
        if (library && !s.customChords.some((g) => g.id === grip.id))
          s.customChords.push(grip);
      })
    ) {
      setModal('');
    }
  }
  return (
    <div className="gs-workspace-v3" ref={root}>
      <header className="workspace-header">
        <div>
          <div className="eyebrow">Song Workspace v3</div>
          <h1>{song.title}</h1>
          <p>{song.artist || 'Eigen compositie'}</p>
        </div>
        <div className="workspace-actions">
          <button
            className="gs-button"
            aria-label="Undo"
            disabled={!editor.canUndo || practice}
            onClick={() => editor.undo()}
          >
            ↶
          </button>
          <button
            className="gs-button"
            aria-label="Redo"
            disabled={!editor.canRedo || practice}
            onClick={() => editor.undo(true)}
          >
            ↷
          </button>
          <button className="gs-button" onClick={() => void save()}>
            Opslaan
          </button>
          <button className="gs-button" onClick={() => setModal('metadata')}>
            Songgegevens
          </button>
          <button
            className="gs-button gs-button--primary"
            onClick={() => {
              audio.stop();
              p.setPractice(!practice);
            }}
          >
            {practice ? 'Terug naar editor' : '▷ Oefenen'}
          </button>
        </div>
      </header>
      <div className="workspace-settings">
        <label className="gs-field">
          Arrangement
          <select
            className="gs-input"
            aria-label="Arrangement"
            value={a.id}
            onChange={(e) => chooseArrangement(e.target.value)}
          >
            {song.arrangements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="gs-button"
          disabled={practice}
          onClick={() => setModal('arrangement')}
        >
          + Arrangement
        </button>
        <label className="gs-field">
          Actief spoor
          <select
            className="gs-input"
            aria-label="Actief spoor"
            value={track.id}
            onChange={(e) => chooseTrack(e.target.value)}
          >
            {a.trackOrder.map((id) => (
              <option key={id} value={id}>
                {a.tracks.find((t) => t.id === id)!.name}
              </option>
            ))}
          </select>
        </label>
        <label className="gs-field">
          Instrument
          <select
            className="gs-input"
            aria-label="Instrument"
            disabled={practice}
            value={track.instrument.type}
            onChange={(e) =>
              change((s) => {
                s.arrangements
                  .find((x) => x.id === a.id)!
                  .tracks.find((t) => t.id === track.id)!.instrument.type = e
                  .target.value as 'acoustic' | 'electric';
              })
            }
          >
            <option value="acoustic">Akoestisch</option>
            <option value="electric">Elektrisch</option>
          </select>
        </label>
        <label className="gs-field">
          Stemming
          <select
            className="gs-input"
            aria-label="Stemming"
            disabled={practice}
            value={
              track.instrument.tuning.pitches[5] === 38 ? 'dropd' : 'standard'
            }
            onChange={(e) => {
              if (
                track.events.length &&
                !confirm(
                  'Fysieke frets blijven gelijk; stemming verandert toonhoogten. Doorgaan?',
                )
              )
                return;
              change((s) => {
                const t = s.arrangements
                  .find((x) => x.id === a.id)!
                  .tracks.find((t) => t.id === track.id)!;
                t.instrument.tuning = {
                  name: e.target.value === 'dropd' ? 'Drop D' : 'EADGBE',
                  pitches: [
                    64,
                    59,
                    55,
                    50,
                    45,
                    e.target.value === 'dropd' ? 38 : 40,
                  ],
                };
                for (const n of t.events)
                  for (const tone of n.tones)
                    if (tone.position)
                      tone.pitch = pitchAt(t.instrument, tone.position);
              });
            }}
          >
            <option value="standard">EADGBE</option>
            <option value="dropd">Drop D</option>
          </select>
        </label>
        <NumericField
          label="Capo"
          value={a.capo}
          min={0}
          max={24}
          disabled={practice}
          change={(capo) =>
            mutate({ op: 'set-capo', arrangementId: a.id, capo })
          }
        />
        <NumericField
          label="BPM"
          value={a.tempo}
          min={20}
          max={300}
          change={(tempo) =>
            change((s) => {
              s.arrangements.find((x) => x.id === a.id)!.tempo = tempo;
            })
          }
        />
        <label className="gs-field">
          Maatsoort
          <select
            className="gs-input"
            aria-label="Maatsoort"
            disabled={practice}
            value={a.timeSignature.beats + '/' + a.timeSignature.beatUnit}
            onChange={(e) => {
              const [beats, unit] = e.target.value.split('/').map(Number);
              mutate({
                op: 'set-meter',
                arrangementId: a.id,
                measureIds: measures.map((m) => m.id),
                meter: { beats: beats!, beatUnit: unit as 2 | 4 | 8 | 16 },
              });
            }}
          >
            {['2/4', '3/4', '4/4', '6/8'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <span
          className={'save ' + (editor.error ? 'gs-danger' : '')}
          role="status"
        >
          {editor.status}
        </span>
      </div>
      {editor.error && (
        <div className="gs-notice gs-danger" role="alert">
          {editor.error}
          <button className="gs-button" onClick={() => void save()}>
            Opnieuw opslaan
          </button>
          <button className="gs-button" onClick={p.exportSong}>
            JSON exporteren
          </button>
          <button className="gs-button" onClick={p.reload}>
            Serverversie laden
          </button>
        </div>
      )}
      {editor.needsUpgrade && (
        <div className="gs-notice">
          Je oorspronkelijke versie en historie blijven bewaard.
          <button className="gs-button" onClick={() => setModal('upgrade')}>
            Opslag bevestigen
          </button>
        </div>
      )}
      {practice && (
        <section className="gs-panel score-practice" aria-label="Practice Mode">
          <h2>Oefen je arrangement</h2>
          <button
            className="gs-button"
            onClick={() => {
              void (
                document.fullscreenElement
                  ? document.exitFullscreen()
                  : root.current?.requestFullscreen()
              )?.catch(() => p.report('Volledig scherm is niet beschikbaar.'));
            }}
          >
            Volledig scherm
          </button>
          <NumericField
            label="Oefenvoortgang"
            value={song.progress}
            min={0}
            max={100}
            change={(progress) =>
              change((s) => {
                s.progress = progress;
              })
            }
          />
          <button
            className="gs-button"
            aria-pressed={section.practiced}
            onClick={() =>
              change((s) => {
                const target = s.arrangements
                  .find((x) => x.id === a.id)!
                  .sections.find((x) => x.id === section.id)!;
                target.practiced = !target.practiced;
              })
            }
          >
            Sectie geoefend
          </button>
          <label className="gs-field">
            Oefenweergave
            <select
              className="gs-input"
              aria-label="Oefenweergave"
              value={practiceView}
              onChange={(e) => setPracticeView(e.target.value)}
            >
              {[
                ['lyrics', 'Alleen lyrics'],
                ['vocal', 'Alleen zangmelodie'],
                ['guitar', 'Alleen gitaarbegeleiding'],
                ['all', 'Alle sporen'],
                ['linked', 'Lyrics met gekoppelde tablatuur'],
              ].map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="gs-field">
            Maatbereik
            <select
              className="gs-input"
              aria-label="Maatbereik"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="selection">
                Geselecteerde passage ({range.length} maten)
              </option>
              <option value="all">Alle maten</option>
            </select>
          </label>
          <button
            className="gs-button gs-button--primary"
            onClick={() => void audio.start()}
          >
            Start
          </button>
          <button className="gs-button" onClick={audio.pause}>
            Pauze
          </button>
          <button className="gs-button" onClick={audio.stop}>
            Stop
          </button>
          <label>
            <input
              type="checkbox"
              checked={audio.repeat}
              onChange={(e) => audio.setRepeat(e.target.checked)}
            />
            Herhalen
          </label>
          <button
            className="gs-button"
            onClick={() => void handoff().catch((e) => p.report(e.message))}
          >
            Open Practice Room
          </button>
          <span role="status">
            {audio.status === 'running'
              ? 'Metronoom actief'
              : audio.status === 'paused'
                ? 'Gepauzeerd'
                : 'Gestopt'}
          </span>
          {audio.error && <p role="alert">{audio.error}</p>}
        </section>
      )}
      {(!practice || ['lyrics', 'all', 'linked'].includes(practiceView)) && (
        <section
          className="workspace-panel gs-panel lyrics-editor"
          aria-label="Lyrics & akkoorden"
        >
          <header className="workspace-panel-heading">
            <h2>Lyrics & akkoorden</h2>
            <nav aria-label="Lyricssecties">
              {a.sections.map((s) => (
                <button
                  key={s.id}
                  className="gs-button"
                  aria-pressed={lyrics.id === s.lyricsSectionId}
                  onClick={() => {
                    setLyricSectionId(s.lyricsSectionId);
                    setWordId('');
                    setSyllableId('');
                  }}
                >
                  {song.lyrics.find((l) => l.id === s.lyricsSectionId)?.name}
                </button>
              ))}
            </nav>
            <div>
              <button
                className="gs-button"
                disabled={practice}
                onClick={() => setModal('lyrics')}
              >
                Tekst bewerken
              </button>
              <button
                className="gs-button"
                disabled={!word || practice}
                onClick={() => setModal('chord')}
              >
                Akkoord plaatsen
              </button>
              <button
                className="gs-button"
                aria-expanded={!collapsedLyrics}
                onClick={() => setCollapsedLyrics(!collapsedLyrics)}
              >
                {collapsedLyrics ? 'Uitklappen' : 'Inklappen'} lyrics
              </button>
            </div>
          </header>
          {!collapsedLyrics && (
            <div className="lyrics-content">
              {lyrics.lines.map((l) => (
                <div className="lyrics-line" key={l.id}>
                  {l.tokens.map((w) =>
                    /\S/.test(w.text) ? (
                      <button
                        key={w.id}
                        data-word-id={w.id}
                        className={
                          'lyric-word' +
                          (word?.id === w.id ? ' is-selected' : '')
                        }
                        aria-pressed={word?.id === w.id}
                        onClick={() => {
                          setWordId(w.id);
                          if (w.syllables[0]) selectSyllable(w.syllables[0].id);
                        }}
                      >
                        <span className="chord-annotation">
                          {a.chordAnchors
                            .filter((c) => c.tokenId === w.id)
                            .map((c) => c.grip.name)
                            .join(' · ')}
                        </span>
                        {w.text}
                      </button>
                    ) : (
                      <span key={w.id}>{w.text}</span>
                    ),
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {(!practice || practiceView !== 'lyrics') && (
        <section
          className="workspace-panel gs-panel score-editor"
          ref={score}
          aria-label="Tablatuureditor"
        >
          <header className="workspace-panel-heading">
            <h2>
              Tablatuur{' '}
              <small>
                {a.tracks.length} sporen · {measures.length} maten
              </small>
            </h2>
            <label className="gs-field">
              Maten per regel
              <select
                className="gs-input"
                aria-label="Maten per regel"
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value))}
              >
                {[
                  [0, 'Automatisch'],
                  [2, '2 maten'],
                  [3, '3 maten'],
                  [4, '4 maten'],
                ].map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </header>
          {!practice && (
            <div className="score-toolbar">
              <label className="gs-field">
                Nootduur
                <select
                  className="gs-input"
                  aria-label="Nootduur"
                  value={duration.denominator / duration.numerator}
                  onChange={(e) => {
                    const d = fraction(1, Number(e.target.value));
                    if (
                      !selectedIds.length ||
                      change((s) =>
                        setDurations(s, a.id, track.id, selectedIds, d),
                      )
                    )
                      setDuration(d);
                  }}
                >
                  {[
                    [1, 'Hele'],
                    [2, 'Halve'],
                    [4, 'Kwart'],
                    [8, 'Achtste'],
                    [16, 'Zestiende'],
                  ].map(([v, n]) => (
                    <option key={v} value={v}>
                      1/{v} {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="gs-field">
                Fysieke fret
                <input
                  className="gs-input fret-input"
                  inputMode="numeric"
                  aria-invalid={buffer !== '' && Number(buffer) > 24}
                  title="Fysieke fret 0–24; Enter bevestigt, Escape annuleert"
                  value={buffer}
                  maxLength={2}
                  onChange={(e) => {
                    if (/^\d{0,2}$/.test(e.target.value))
                      setBuffer(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitBuffer();
                    }
                    if (e.key === 'Escape') setBuffer('');
                  }}
                />
              </label>
              <button
                className="gs-button"
                disabled={!buffer || Number(buffer) > 24}
                onClick={commitBuffer}
              >
                Plaats
              </button>
              <button
                className="gs-button"
                onClick={() =>
                  change((s) => putRest(s, a.id, cursor, duration))
                }
              >
                Rust
              </button>
              <button className="gs-button" onClick={remove}>
                Wis selectie
              </button>
              <label className="gs-field">
                Techniek
                <select
                  className="gs-input"
                  aria-label="Techniek"
                  value={technique}
                  onChange={(e) => {
                    const tech = e.target.value as typeof technique;
                    setTechnique(tech);
                    if (selectedIds.length)
                      change((s) => {
                        for (const n of s.arrangements
                          .find((x) => x.id === a.id)!
                          .tracks.find((t) => t.id === track.id)!.events)
                          if (selectedIds.includes(n.id)) n.technique = tech;
                      });
                  }}
                >
                  {[
                    'normal',
                    'hammer-on',
                    'pull-off',
                    'slide',
                    'bend',
                    'vibrato',
                    'mute',
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <button
                className="gs-button"
                onClick={() => {
                  const id = uid();
                  if (
                    change((s) => {
                      s.arrangements
                        .find((x) => x.id === a.id)!
                        .sections.find((x) => x.id === section.id)!
                        .measures.push({
                          id,
                          timeSignature: structuredClone(a.timeSignature),
                        });
                    })
                  ) {
                    setCursor({
                      ...cursor,
                      measureId: id,
                      start: fraction(0, 1),
                    });
                    setRange([id]);
                    focus.current = true;
                  }
                }}
              >
                + Maat
              </button>
              <button className="gs-button" onClick={() => setModal('tracks')}>
                Sporen beheren
              </button>
              <button
                className="gs-button"
                onClick={() => setModal('sections')}
              >
                Secties beheren
              </button>
            </div>
          )}
          <nav className="track-tabs" aria-label="Sporen">
            {a.trackOrder.map((id) => (
              <button
                key={id}
                className="gs-button"
                aria-pressed={track.id === id}
                onClick={() => chooseTrack(id)}
              >
                {a.tracks.find((t) => t.id === id)!.name}
              </button>
            ))}
          </nav>
          <ScoreSystem
            song={song}
            a={a}
            columns={measureColumns(width, columns)}
            cursor={cursor}
            selection={selection}
            range={range}
            lyricTracks={lyricTracks}
            selectedSyllable={syllableId}
            practiceView={practice ? practiceView : ''}
            playingMeasure={audio.measure}
            choose={choose}
            measure={selectMeasure}
            selectTrack={chooseTrack}
            toggleLyrics={(id) =>
              setLyricTracks((old) => {
                const n = new Set(old);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
            collapse={(id) =>
              mutate({
                op: 'update-track',
                arrangementId: a.id,
                trackId: id,
                patch: {
                  collapsed: !a.tracks.find((t) => t.id === id)!.collapsed,
                },
              })
            }
            chooseSyllable={selectSyllable}
            keyboard={keyboard}
          />
          <div className="score-status" role="status">
            {track.name} · maat{' '}
            {measures.findIndex((m) => m.id === cursor.measureId) + 1} · positie{' '}
            {cursor.start.numerator}/{cursor.start.denominator} · snaar{' '}
            {cursor.string} · {selection.length} tonen geselecteerd{' '}
            {buffer &&
              ' · invoer ' + buffer + ' — Enter bevestigt, Escape annuleert'}
          </div>
          {!practice && (
            <section className="lyric-link-editor" aria-label="Lyrics koppelen">
              <h3>Lyrics koppelen</h3>
              <label className="gs-field">
                Lettergreep
                <select
                  className="gs-input"
                  aria-label="Lettergreep"
                  value={syllableId}
                  onChange={(e) => selectSyllable(e.target.value)}
                >
                  <option value="">Kies een lettergreep</option>
                  {lyrics.lines.flatMap((l, i) =>
                    l.tokens.flatMap((w, j) =>
                      w.syllables.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.text} · {w.text} (regel {i + 1}, woord {j + 1})
                        </option>
                      )),
                    ),
                  )}
                </select>
              </label>
              <button
                className="gs-button"
                disabled={!word}
                onClick={() => setModal('syllables')}
              >
                Lettergrepen bewerken
              </button>
              <button
                className="gs-button gs-button--primary"
                disabled={!syllableId || !noteIds.length}
                onClick={() => link(false)}
              >
                Koppel selectie
              </button>
              <button
                className="gs-button"
                disabled={!syllableId || !noteIds.length}
                onClick={() => link(true)}
              >
                Vervang koppeling
              </button>
              <button
                className="gs-button"
                disabled={
                  !a.lyricsLinks.some(
                    (l) =>
                      l.syllableId === syllableId && l.trackId === track.id,
                  )
                }
                onClick={() =>
                  change((s) => {
                    const arr = s.arrangements.find((x) => x.id === a.id)!;
                    arr.lyricsLinks = arr.lyricsLinks.filter(
                      (l) =>
                        !(
                          l.trackId === track.id && l.syllableId === syllableId
                        ),
                    );
                  })
                }
              >
                Ontkoppel
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={sustain}
                  onChange={(e) => setSustain(e.target.checked)}
                />
                Aanhouden
              </label>
            </section>
          )}
        </section>
      )}
      {!practice && (
        <section
          className={'compact-fretboard neck-' + neck}
          aria-label="Gitaarhals"
        >
          <div className="neck-mode">
            <h2>Gitaarhals · {track.name}</h2>
            {[
              ['collapsed', 'Ingeklapt'],
              ['compact', 'Compact'],
              ['expanded', 'Uitgebreid'],
            ].map(([v, n]) => (
              <button
                key={v}
                className="gs-button"
                aria-pressed={neck === v}
                onClick={() => setNeck(v as typeof neck)}
              >
                {n}
              </button>
            ))}
          </div>
          <Fretboard
            arrangement={projection}
            section={projectedSection}
            cursor={cursor}
            insert={insert}
            collapsed={neck === 'collapsed'}
            setCollapsed={(v) => setNeck(v ? 'collapsed' : 'compact')}
            advance={advance}
            setAdvance={setAdvance}
            physical
            expanded={neck === 'expanded'}
          />
        </section>
      )}
      <footer className="workspace-footer">
        <button className="gs-button" onClick={p.openImport}>
          Zoeken & importeren
        </button>
        <button className="gs-button" onClick={p.exportSong}>
          JSON exporteren
        </button>
        <button className="gs-button" onClick={() => setModal('history')}>
          Historische versies
        </button>
      </footer>
      {!!song.importDocuments?.length && (
        <details className="workspace-import-source">
          <summary>Importbron en oorspronkelijke timing</summary>
          {song.importDocuments.map((doc, i) => (
            <section key={i}>
              <h3>
                {doc.source.name} · {doc.title}
              </h3>
              {doc.source.url && (
                <a href={doc.source.url} target="_blank" rel="noreferrer">
                  {doc.source.provider?.toUpperCase() ?? doc.source.name}
                  {doc.source.recordId ? ' #' + doc.source.recordId : ''}
                </a>
              )}
              <p>
                {doc.source.personalImport?.album} ·{' '}
                {doc.source.personalImport?.importedAt} ·{' '}
                {doc.source.personalImport?.timingFormat}
              </p>
              <pre className="import-source-text">{doc.rawText}</pre>
              {doc.tabBlocks.map((b, j) => (
                <pre className="import-tab-source" key={j}>
                  {b.raw}
                </pre>
              ))}
              {doc.synchronization && (
                <details>
                  <summary>
                    Oorspronkelijke synchronisatie (milliseconden)
                  </summary>
                  <pre className="import-source-text">
                    {JSON.stringify(doc.synchronization, null, 2)}
                  </pre>
                </details>
              )}
              <p>
                Originele bron blijft apart van je bewerkte tekst. Geen
                automatische omzetting naar maatposities.
              </p>
            </section>
          ))}
        </details>
      )}
      {modal === 'tracks' && (
        <TrackManager
          song={song}
          arrangementId={a.id}
          change={change}
          close={() => {
            if (a.activeTrackId !== rawCursor.trackId)
              chooseTrack(a.activeTrackId);
            setModal('');
          }}
        />
      )}
      {modal === 'lyrics' && (
        <LyricsTextEditor
          song={song}
          sectionId={lyrics.id}
          change={change}
          close={() => setModal('')}
        />
      )}
      {modal === 'syllables' && word && (
        <SyllableEditor
          song={song}
          wordId={word.id}
          change={change}
          close={() => setModal('')}
        />
      )}
      {modal === 'chord' && word && (
        <ChordEditor
          {...(activeChord ? { initial: activeChord.grip } : {})}
          custom={song.customChords}
          arrangement={projection}
          word={word.text}
          close={() => setModal('')}
          save={saveChord}
          {...(activeChord
            ? {
                remove: () => {
                  if (
                    change((s) => {
                      s.arrangements.find((x) => x.id === a.id)!.chordAnchors =
                        s.arrangements
                          .find((x) => x.id === a.id)!
                          .chordAnchors.filter((c) => c.id !== activeChord.id);
                    })
                  )
                    setModal('');
                },
              }
            : {})}
          toTab={(grip) => {
            try {
              let next = song;
              for (const [i, f] of grip.frets.entries())
                if (f >= 0)
                  next = writeFret(
                    next,
                    a.id,
                    { ...cursor, string: i + 1 },
                    f + a.capo,
                    duration,
                  );
              if (change(() => next)) setModal('');
            } catch (e) {
              p.report((e as Error).message);
            }
          }}
          validationError={editor.error}
        />
      )}
      {modal === 'upgrade' && (
        <Dialog
          title="Oorspronkelijke versie bewaren"
          onClose={() => setModal('')}
        >
          <p>
            De oorspronkelijke song en alle beschikbare historische versies
            blijven behouden. Je bewerkingen worden als multi-trackarrangement
            opgeslagen.
          </p>
          <button className="gs-button" onClick={() => setModal('')}>
            Annuleren
          </button>
          <button
            className="gs-button gs-button--primary"
            onClick={() =>
              void editor.confirmUpgrade().then((ok) => {
                if (ok) setModal('');
              })
            }
          >
            Bewaren en opslaan
          </button>
        </Dialog>
      )}
      <WorkspaceDialogs
        modal={modal}
        song={song}
        arrangementId={a.id}
        change={change}
        close={() => setModal('')}
        selectArrangement={(id) => {
          setArrId(id);
          setCursor({
            trackId: '',
            measureId: '',
            start: fraction(0, 1),
            string: 1,
          });
          setSelection([]);
          setRange([]);
          setWordId('');
          setSyllableId('');
          setBuffer('');
        }}
        exportSong={p.exportSong}
      />
    </div>
  );
}
