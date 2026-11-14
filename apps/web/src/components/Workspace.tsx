import { useEffect, useState } from 'react';
import {
  cloneArrangement,
  editLyrics,
  emptyMeasure,
  fraction,
  putTone,
  retune,
  sameTime,
  sectionText,
  timeValue,
  tokens,
  uid,
  type Grip,
  type SongRecord,
  type StudioArrangement,
  type StudioSong,
} from '../../../../packages/music-domain/src/workspace';
import { validateMeasure } from '../../../../packages/music-domain/src/index';
import { Dialog } from './Dialog';
import { ChordEditor, ChordDiagram } from './ChordEditor';
import { TabEditor, type Cursor } from './TabEditor';
import { Fretboard } from './Fretboard';
import { request } from '../api';
export function Workspace({
  song,
  change,
  status,
  error,
  retry,
  reload,
  undo,
  canUndo,
  canRedo,
  practice,
  setPractice,
  exportSong,
  report,
}: {
  song: StudioSong;
  change: (fn: (s: StudioSong) => void) => boolean;
  status: string;
  error: string;
  retry: () => void;
  reload: () => void;
  undo: (redo?: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  practice: boolean;
  setPractice: (p: boolean) => void;
  exportSong: () => void;
  report: (message: string) => void;
}) {
  const [arrId, setArrId] = useState(
      song.lastArrangementId ?? song.arrangements[0]!.id,
    ),
    [sectionId, setSectionId] = useState(song.arrangements[0]!.sections[0]!.id);
  const arrangement =
    song.arrangements.find((a) => a.id === arrId) ?? song.arrangements[0]!;
  const section =
    arrangement.sections.find((s) => s.id === sectionId) ??
    arrangement.sections[0]!;
  const lyrics = song.lyrics.find((l) => l.id === section.lyricsSectionId)!;
  const [cursor, setCursor] = useState<Cursor>({
    measureId: section.measures[0]!.id,
    start: fraction(0, 1),
    string: 1,
  });
  const currentCursor = section.measures.some((m) => m.id === cursor.measureId)
    ? cursor
    : { ...cursor, measureId: section.measures[0]!.id, start: fraction(0, 1) };
  const [duration, setDuration] = useState(fraction(1, 8)),
    [view, setView] = useState('combined'),
    [mobile, setMobile] = useState('lyrics'),
    [collapsed, setCollapsed] = useState(false),
    [advance, setAdvance] = useState(false),
    [split, setSplit] = useState(42),
    [selectedWord, setSelectedWord] = useState<string | null>(null),
    [modal, setModal] = useState(''),
    [text, setText] = useState(''),
    [sectionName, setSectionName] = useState(''),
    [newText, setNewText] = useState(''),
    [versions, setVersions] = useState<SongRecord[]>([]);
  const chord = section.chords.find(
    (c) => c.tokenId === selectedWord && selectedWord !== null,
  );
  const activeToken = lyrics.tokens.find((t) => t.id === selectedWord);
  const [reposition, setReposition] = useState<string | null>(null);
  const changeArrangement = (fn: (a: StudioArrangement) => void) =>
    change((s) => fn(s.arrangements.find((a) => a.id === arrangement.id)!));
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        !(e.ctrlKey || e.metaKey) ||
        e.key.toLowerCase() !== 'z' ||
        e.defaultPrevented
      )
        return;
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable=true]',
        )
      )
        return;
      e.preventDefault();
      undo(e.shiftKey);
    };
    addEventListener('keydown', handler);
    return () => removeEventListener('keydown', handler);
  }, [undo]);
  function chooseSection(id: string) {
    const s = arrangement.sections.find((s) => s.id === id)!;
    setSectionId(id);
    setCursor({
      measureId: s.measures[0]!.id,
      start: fraction(0, 1),
      string: currentCursor.string,
    });
    setSelectedWord(null);
  }
  function insert(string: number, fret: number) {
    changeArrangement((a) => {
      const s = a.sections.find((s) => s.id === section.id)!;
      let m = s.measures.find((m) => m.id === currentCursor.measureId)!;
      let start = currentCursor.start;
      if (advance) {
        const current = m.events.find((e) => sameTime(e.start, start));
        if (current) {
          let v = timeValue(start) + timeValue(current.duration);
          if (v >= a.timeSignature.beats / a.timeSignature.beatUnit) {
            let next = s.measures[s.measures.indexOf(m) + 1];
            if (!next) {
              next = emptyMeasure(a.timeSignature);
              s.measures.push(next);
            }
            m = next;
            v = 0;
          }
          start = fraction(Math.round(v * 48), 48);
        }
      }
      putTone(a, m, start, duration, string, fret);
      setCursor({ measureId: m.id, start, string });
      report('Noot ingevoerd op snaar ' + string + ', fret ' + fret + '.');
    });
  }
  function gripToTab(grip: Grip) {
    const accepted = changeArrangement((a) => {
      const m = a.sections
        .find((s) => s.id === section.id)!
        .measures.find((m) => m.id === currentCursor.measureId)!;
      m.events = m.events.filter(
        (e) => !sameTime(e.start, currentCursor.start),
      );
      grip.frets.forEach((f, i) => {
        if (f >= 0) putTone(a, m, currentCursor.start, duration, i + 1, f);
      });
    });
    if (!accepted) return;
    report('Greep als gelijktijdige tabnoten ingevoerd.');
    setModal('');
  }
  function profileChange(profile: StudioArrangement['instrument']) {
    if (
      arrangement.sections.some((s) =>
        s.measures.some((m) => m.events.length),
      ) &&
      !confirm(
        'Fysieke fretposities blijven gelijk. Stemming wijzigt de klinkende toonhoogte; de capo wijzigt relatieve fretlabels. Noten onder de capo blokkeren deze wijziging. Doorgaan?',
      )
    )
      return;
    changeArrangement((a) => retune(a, profile));
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      report('Volledig scherm is niet beschikbaar in deze browsercontext.');
    }
  }
  return (
    <div
      className={
        'workspace ' +
        (practice ? 'practice ' : '') +
        'view-' +
        view +
        ' mobile-' +
        mobile
      }
      style={{ '--split': split + '%' } as React.CSSProperties}
    >
      {song.importDocuments?.length ? (
        <details className="workspace-import-source">
          <summary>Importbron, akkoorden en ongetimede tablatuur</summary>
          {song.importDocuments.map((doc, i) => (
            <section key={i}>
              <h3>
                {doc.source.name} · {doc.contentType}
              </h3>
              <p>
                {doc.source.origin === 'user'
                  ? 'Gebruikersinhoud'
                  : doc.source.provider}{' '}
                · {doc.source.method}
              </p>
              <pre className="import-source-text">{doc.rawText}</pre>
              {doc.tabBlocks.map((b, j) => (
                <div key={j}>
                  <pre className="import-tab-source">{b.raw}</pre>
                  <p>
                    {b.notes.length} noten · ritme onzeker; nog niet naar het
                    speelraster omgezet.
                  </p>
                </div>
              ))}
              {doc.warnings.map((w, j) => (
                <p key={j} className="notice gs-notice">
                  {w}
                </p>
              ))}
            </section>
          ))}
        </details>
      ) : null}
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">
            {practice ? 'PRACTICE MODE' : 'SONG WORKSPACE'}
          </div>
          <h1>{song.title}</h1>
          <p className="muted">
            {song.artist || 'Eigen song'} ·{' '}
            {song.tags.join(' · ') || 'Jouw arrangement'}
          </p>
        </div>
        <div className="workspace-actions">
          {!practice && (
            <>
              <button
                className="gs-button"
                aria-label="Undo"
                disabled={!canUndo}
                onClick={() => undo()}
              >
                ↶
              </button>
              <button
                className="gs-button"
                aria-label="Redo"
                disabled={!canRedo}
                onClick={() => undo(true)}
              >
                ↷
              </button>
              <button
                className="gs-button"
                onClick={() => setModal('metadata')}
              >
                Songgegevens
              </button>
            </>
          )}
          {practice && (
            <button className="gs-button" onClick={() => void fullscreen()}>
              Volledig scherm
            </button>
          )}
          <button
            className="primary gs-button gs-button--primary"
            onClick={() => setPractice(!practice)}
          >
            {practice ? '← Terug naar editor' : '▷ Oefenen'}
          </button>
        </div>
      </div>
      <div className="workspace-settings">
        <label className="gs-field">
          Arrangement
          <select
            className="gs-input"
            aria-label="Arrangement"
            value={arrangement.id}
            onChange={(e) => {
              const id = e.target.value;
              setArrId(id);
              setSelectedWord(null);
              change((s) => {
                s.lastArrangementId = id;
              });
            }}
          >
            {song.arrangements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {!practice && (
          <>
            <button
              className="gs-button"
              aria-label="Arrangement dupliceren"
              onClick={() =>
                change((s) => {
                  const a = cloneArrangement(arrangement);
                  s.arrangements.push(a);
                  s.lastArrangementId = a.id;
                  setArrId(a.id);
                })
              }
            >
              + Kopie
            </button>
            <label className="gs-field">
              Instrument
              <select
                className="gs-input"
                aria-label="Instrument"
                value={arrangement.instrument.type}
                onChange={(e) =>
                  profileChange({
                    ...arrangement.instrument,
                    type: e.target.value as 'acoustic' | 'electric',
                    preferredInput:
                      e.target.value === 'electric'
                        ? 'audio-interface'
                        : 'builtin-microphone',
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
                value={arrangement.instrument.tuning.name}
                onChange={(e) =>
                  profileChange({
                    ...arrangement.instrument,
                    tuning: {
                      name: e.target.value,
                      pitches:
                        e.target.value === 'Drop D'
                          ? [64, 59, 55, 50, 45, 38]
                          : [64, 59, 55, 50, 45, 40],
                    },
                  })
                }
              >
                <option>EADGBE</option>
                <option>Drop D</option>
              </select>
            </label>
            <label className="gs-field">
              Capo
              <input
                className="gs-input"
                aria-label="Capo"
                type="number"
                min={0}
                max={24}
                value={arrangement.instrument.capo}
                onChange={(e) =>
                  profileChange({
                    ...arrangement.instrument,
                    capo: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="gs-field">
              BPM
              <input
                className="gs-input"
                aria-label="Tempo"
                type="number"
                min={20}
                max={300}
                value={arrangement.tempo}
                onChange={(e) =>
                  changeArrangement((a) => {
                    a.tempo = Number(e.target.value);
                  })
                }
              />
            </label>
            <label className="gs-field">
              Maat
              <select
                className="gs-input"
                aria-label="Maatsoort"
                value={
                  arrangement.timeSignature.beats +
                  '/' +
                  arrangement.timeSignature.beatUnit
                }
                onChange={(e) =>
                  changeArrangement((a) => {
                    const [beats, unit] = e.target.value.split('/').map(Number);
                    const meter = { beats: beats!, beatUnit: unit as 4 | 8 };
                    for (const s of a.sections)
                      for (const m of s.measures) {
                        m.timeSignature = meter;
                        validateMeasure(m, a.instrument);
                      }
                    a.timeSignature = meter;
                  })
                }
              >
                {['2/4', '3/4', '4/4', '6/8'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <span
          className={'save ' + (status === 'Niet opgeslagen' ? 'danger' : '')}
          role="status"
        >
          ● {status}
        </span>
      </div>
      {error && (
        <div className="notice danger gs-notice gs-danger" role="alert">
          <strong>
            {status === 'Niet opgeslagen' ? 'Niet opgeslagen. ' : ''}
          </strong>
          {error}
          <div className="workspace-actions">
            <button className="gs-button" onClick={retry}>
              Opnieuw opslaan
            </button>
            <button className="gs-button" onClick={exportSong}>
              Exporteer mijn wijzigingen
            </button>
            <button className="gs-button" onClick={reload}>
              Serverversie laden
            </button>
          </div>
        </div>
      )}
      <div className="workspace-toolbar">
        <div className="workspace-actions">
          {arrangement.sections.map((s) => (
            <button
              key={s.id}
              aria-pressed={s.id === section.id}
              className={'gs-button ' + (s.id === section.id ? 'active' : '')}
              onClick={() => chooseSection(s.id)}
            >
              {song.lyrics.find((l) => l.id === s.lyricsSectionId)!.name}
              {s.practiced ? ' ✓' : ''}
            </button>
          ))}
        </div>
        {!practice && (
          <div className="seg">
            {[
              ['combined', 'Gecombineerd'],
              ['lyrics', 'Lyrics'],
              ['tab', 'Tablatuur'],
            ].map(([v, label]) => (
              <button
                key={v}
                aria-pressed={view === v}
                className={'gs-button ' + (view === v ? 'active' : '')}
                onClick={() => setView(v!)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mobile-context">
        Maat{' '}
        {section.measures.findIndex((m) => m.id === currentCursor.measureId) +
          1}{' '}
        · positie {currentCursor.start.numerator}/
        {currentCursor.start.denominator} · snaar {currentCursor.string}
      </div>
      <div className="mobiletabs seg">
        {[
          ['lyrics', 'Lyrics'],
          ['tab', 'Tablatuur'],
          ['neck', 'Gitaarhals'],
        ].map(([v, label]) => (
          <button
            key={v}
            aria-pressed={mobile === v}
            className={'gs-button ' + (mobile === v ? 'active' : '')}
            onClick={() => setMobile(v!)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="editor">
        <section
          className="panel lyric-panel gs-panel"
          aria-label="Lyrics en akkoorden"
        >
          <div className="panelhead section-manager-item gs-panel__header">
            <h2>Lyrics & akkoorden</h2>
            <small>Kies een woord → voeg een akkoord toe</small>
          </div>
          <div className="lyrics-content">
            <div className="section-title">{lyrics.name}</div>
            <div className="lyric-lines">
              {lyrics.tokens.length ? (
                lyrics.tokens.map((t) =>
                  /^\s+$/.test(t.text) ? (
                    <span className="whitespace" key={t.id}>
                      {t.text}
                    </span>
                  ) : (
                    <button
                      key={t.id}
                      className={
                        'gs-button ' +
                        ('word ' + (selectedWord === t.id ? 'chosen' : ''))
                      }
                      onClick={() => {
                        setSelectedWord(t.id);
                        if (reposition) {
                          changeArrangement((a) => {
                            a.sections
                              .find((s) => s.id === section.id)!
                              .chords.find(
                                (c) => c.id === reposition,
                              )!.tokenId = t.id;
                          });
                          setReposition(null);
                        } else if (
                          section.chords.some((c) => c.tokenId === t.id)
                        )
                          setModal('chord');
                      }}
                    >
                      <span className="chord">
                        {section.chords
                          .filter((c) => c.tokenId === t.id)
                          .map((c) => c.grip.name)
                          .join(' / ')}
                      </span>
                      {t.text}
                    </button>
                  ),
                )
              ) : (
                <p className="muted">
                  Nog geen lyrics. Voeg je eigen tekst toe.
                </p>
              )}
            </div>
            {section.chords
              .filter((c) => !c.tokenId)
              .map((c) => (
                <div className="notice gs-notice" key={c.id}>
                  Akkoord {c.grip.name} op “{c.originalText}” heeft geen zeker
                  tekstanker.
                  <button
                    className="gs-button"
                    onClick={() => {
                      setReposition(c.id);
                      report('Kies het juiste woord voor ' + c.grip.name);
                    }}
                  >
                    Opnieuw positioneren
                  </button>
                  <button
                    className="gs-button"
                    onClick={() =>
                      changeArrangement((a) => {
                        const s = a.sections.find((s) => s.id === section.id)!;
                        s.chords = s.chords.filter((item) => item.id !== c.id);
                      })
                    }
                  >
                    Verwijderen
                  </button>
                </div>
              ))}
            {reposition && (
              <p role="status">
                Kies een woord om het bewaarde akkoord opnieuw te koppelen.
              </p>
            )}
          </div>
          {!practice ? (
            <div className="lyrics-foot">
              <button
                className="primary gs-button gs-button--primary"
                disabled={!activeToken}
                onClick={() => setModal('chord')}
              >
                + Akkoord
              </button>
              <button
                className="gs-button"
                onClick={() => {
                  setText(sectionText(lyrics));
                  setModal('lyrics');
                }}
              >
                Lyrics bewerken
              </button>
              <button
                className="gs-button"
                onClick={() => setModal('sections')}
              >
                Secties indelen
              </button>
            </div>
          ) : (
            <div className="lyrics-foot">
              {section.chords.map((c) => (
                <ChordDiagram key={c.id} grip={c.grip} />
              ))}
            </div>
          )}
        </section>
        <div
          role="separator"
          aria-label="Paneelbreedte"
          aria-orientation="vertical"
          aria-valuemin={25}
          aria-valuemax={70}
          aria-valuenow={split}
          tabIndex={0}
          className="splitter"
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
              e.preventDefault();
              e.stopPropagation();
              setSplit(
                Math.max(
                  25,
                  Math.min(70, split + (e.key === 'ArrowRight' ? 3 : -3)),
                ),
              );
            }
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              const bounds =
                e.currentTarget.parentElement!.getBoundingClientRect();
              setSplit(
                Math.max(
                  25,
                  Math.min(70, ((e.clientX - bounds.x) / bounds.width) * 100),
                ),
              );
            }
          }}
          onPointerUp={(e) =>
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
        >
          ⋮
        </div>
        <TabEditor
          arrangement={arrangement}
          section={section}
          cursor={currentCursor}
          setCursor={setCursor}
          duration={duration}
          setDuration={setDuration}
          change={changeArrangement}
          undo={undo}
          report={report}
          practice={practice}
        />
      </div>
      {!practice && (
        <Fretboard
          arrangement={arrangement}
          section={section}
          cursor={currentCursor}
          insert={insert}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          advance={advance}
          setAdvance={setAdvance}
        />
      )}
      <div className="workspace-footer">
        <small>{song.source.attribution} · gebruik bevestigd</small>
        {practice ? (
          <label className="gs-field">
            Handmatige voortgang {song.progress}%
            <input
              className="gs-input"
              aria-label="Oefenvoortgang"
              type="range"
              min={0}
              max={100}
              value={song.progress}
              onChange={(e) =>
                change((s) => {
                  s.progress = Number(e.target.value);
                })
              }
            />
            <button
              className="gs-button"
              aria-pressed={section.practiced}
              onClick={() =>
                changeArrangement((a) => {
                  const s = a.sections.find((s) => s.id === section.id)!;
                  s.practiced = !s.practiced;
                })
              }
            >
              Sectie geoefend
            </button>
          </label>
        ) : (
          <div className="workspace-actions">
            <button className="gs-button" onClick={exportSong}>
              JSON exporteren
            </button>
            <button
              className="gs-button"
              onClick={async () => {
                try {
                  setVersions(
                    await request<SongRecord[]>(
                      '/songs/' + song.id + '/history',
                    ),
                  );
                  setModal('history');
                } catch (error) {
                  report(String(error));
                }
              }}
            >
              Herstelversies
            </button>
          </div>
        )}
      </div>
      {modal === 'lyrics' && (
        <Dialog title="Lyrics bewerken" onClose={() => setModal('')}>
          {error && <p role="alert">{error}</p>}
          <label className="gs-field">
            Tekst van {lyrics.name}
            <textarea
              className="gs-input"
              aria-label="Sectietekst"
              value={text}
              maxLength={20000}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className="notice gs-notice">
            Akkoorden blijven behouden. Bij een onzekere woordkoppeling vragen
            we je het bewaarde akkoord opnieuw te positioneren.
          </p>
          <footer className="dialog-actions">
            <button className="gs-button" onClick={() => setModal('')}>
              Annuleren
            </button>
            <button
              className="primary gs-button gs-button--primary"
              onClick={() => {
                if (change((s) => editLyrics(s, lyrics.id, text))) setModal('');
              }}
            >
              Lyrics opslaan
            </button>
          </footer>
        </Dialog>
      )}
      {modal === 'sections' && (
        <Dialog title="Geef je song structuur" onClose={() => setModal('')}>
          <div className="section-manager">
            {song.lyrics.map((l, i) => (
              <div className="section-manager-item" key={l.id}>
                <strong>{l.name}</strong>
                <div className="workspace-actions">
                  <button
                    className="gs-button"
                    aria-label={l.name + ' omhoog'}
                    disabled={i === 0}
                    onClick={() =>
                      change((s) => {
                        [s.lyrics[i - 1], s.lyrics[i]] = [
                          s.lyrics[i]!,
                          s.lyrics[i - 1]!,
                        ];
                        for (const a of s.arrangements)
                          a.sections.sort(
                            (x, y) =>
                              s.lyrics.findIndex(
                                (l) => l.id === x.lyricsSectionId,
                              ) -
                              s.lyrics.findIndex(
                                (l) => l.id === y.lyricsSectionId,
                              ),
                          );
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    className="gs-button"
                    aria-label={l.name + ' omlaag'}
                    disabled={i === song.lyrics.length - 1}
                    onClick={() =>
                      change((s) => {
                        [s.lyrics[i], s.lyrics[i + 1]] = [
                          s.lyrics[i + 1]!,
                          s.lyrics[i]!,
                        ];
                        for (const a of s.arrangements)
                          a.sections.sort(
                            (x, y) =>
                              s.lyrics.findIndex(
                                (l) => l.id === x.lyricsSectionId,
                              ) -
                              s.lyrics.findIndex(
                                (l) => l.id === y.lyricsSectionId,
                              ),
                          );
                      })
                    }
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
            <label className="gs-field">
              Nieuwe sectienaam
              <input
                className="gs-input"
                value={sectionName}
                maxLength={100}
                onChange={(e) => setSectionName(e.target.value)}
              />
            </label>
            <label className="gs-field">
              Lyrics voor deze sectie
              <textarea
                className="gs-input"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
              />
            </label>
          </div>
          <footer className="dialog-actions">
            <button
              className="gs-button"
              disabled={!sectionName.trim()}
              onClick={() => {
                change((s) => {
                  const l = {
                    id: uid(),
                    name: sectionName.trim(),
                    tokens: tokens(newText),
                  };
                  s.lyrics.push(l);
                  for (const a of s.arrangements)
                    a.sections.push({
                      id: uid(),
                      lyricsSectionId: l.id,
                      measures: [emptyMeasure(a.timeSignature)],
                      chords: [],
                      practiced: false,
                    });
                });
                setSectionName('');
                setNewText('');
                setModal('');
              }}
            >
              Sectie toevoegen
            </button>
          </footer>
        </Dialog>
      )}
      {modal === 'chord' && (
        <ChordEditor
          {...(chord
            ? {
                initial: chord.grip,
                remove: () => {
                  changeArrangement((a) => {
                    const s = a.sections.find((s) => s.id === section.id)!;
                    s.chords = s.chords.filter((c) => c.id !== chord.id);
                  });
                  setModal('');
                },
              }
            : {})}
          custom={song.customChords}
          validationError={error}
          arrangement={arrangement}
          word={activeToken?.text ?? ''}
          close={() => setModal('')}
          toTab={gripToTab}
          save={(grip, library) => {
            change((s) => {
              const a = s.arrangements.find((a) => a.id === arrangement.id)!,
                target = a.sections.find((s) => s.id === section.id)!;
              const existing = target.chords.find(
                (c) => c.tokenId === selectedWord,
              );
              if (existing) existing.grip = grip;
              else
                target.chords.push({
                  id: uid(),
                  tokenId: selectedWord,
                  originalText: activeToken?.text ?? '',
                  grip,
                  measureId: currentCursor.measureId,
                });
              if (library) s.customChords.push({ ...grip, id: uid() });
            });
            setModal('');
          }}
        />
      )}
      {modal === 'metadata' && (
        <Metadata
          song={song}
          arrangement={arrangement}
          close={() => setModal('')}
          save={(data, name) => {
            change((s) => {
              Object.assign(s, data);
              s.arrangements.find((a) => a.id === arrangement.id)!.name = name;
            });
            setModal('');
          }}
        />
      )}
      {modal === 'history' && (
        <Dialog title="Herstelversies" onClose={() => setModal('')}>
          <p className="notice gs-notice">
            Elke geslaagde opslag bewaart een herstelpunt (laatste 20).
            Herstellen maakt een nieuwe revisie; je kunt dit ongedaan maken.
          </p>
          {versions.map((v) => (
            <div className="history-version" key={v.revision}>
              <span>
                Versie {v.revision} ·{' '}
                {new Date(v.updatedAt).toLocaleString('nl-NL')}
              </span>
              <button
                className="gs-button"
                onClick={() => {
                  if (
                    confirm(
                      'Deze versie herstellen? Je huidige versie blijft in de herstelgeschiedenis.',
                    )
                  ) {
                    change((s) => Object.assign(s, structuredClone(v.song)));
                    setModal('');
                  }
                }}
              >
                Herstellen
              </button>
            </div>
          ))}
        </Dialog>
      )}
    </div>
  );
}
function Metadata({
  song,
  arrangement,
  save,
  close,
}: {
  song: StudioSong;
  arrangement: StudioArrangement;
  save: (data: Partial<StudioSong>, name: string) => void;
  close: () => void;
}) {
  const [title, setTitle] = useState(song.title),
    [artist, setArtist] = useState(song.artist),
    [name, setName] = useState(arrangement.name),
    [tags, setTags] = useState(song.tags.join(', ')),
    [difficulty, setDifficulty] = useState(song.difficulty),
    [status, setStatus] = useState(song.status);
  return (
    <Dialog title="Songgegevens" onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(
            {
              title,
              artist,
              tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
              difficulty,
              status,
            },
            name,
          );
        }}
      >
        <div className="song-metadata-fields">
          <label className="gs-field">
            Titel
            <input
              className="gs-input"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="gs-field">
            Artiest
            <input
              className="gs-input"
              maxLength={200}
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
            />
          </label>
          <label className="gs-field">
            Arrangementnaam
            <input
              className="gs-input"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="gs-field">
            Tags (komma's)
            <input
              className="gs-input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </label>
          <label className="gs-field">
            Niveau
            <select
              className="gs-input"
              value={difficulty}
              onChange={(e) =>
                setDifficulty(e.target.value as typeof difficulty)
              }
            >
              {['Beginner', 'Gemiddeld', 'Gevorderd'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="gs-field">
            Status
            <select
              className="gs-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              {['In bewerking', 'Oefenen', 'Beheerst'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <footer className="dialog-actions">
          <button className="primary gs-button gs-button--primary">
            Opslaan
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
