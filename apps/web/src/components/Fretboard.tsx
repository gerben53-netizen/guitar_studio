import { useEffect, useRef, useState } from 'react';
import {
  fretLabel,
  pitchName,
  sameTime,
  type StudioArrangement,
} from '../../../../packages/music-domain/src/workspace';
import type { EditorCursor } from '../../../../packages/music-domain/src/workspace-editor';
type Cursor = Pick<EditorCursor, 'measureId' | 'start' | 'string'>;
export function Fretboard({
  arrangement,
  section,
  cursor,
  insert,
  collapsed,
  setCollapsed,
  advance,
  setAdvance,
  physical = false,
  expanded = false,
}: {
  physical?: boolean;
  expanded?: boolean;
  arrangement: StudioArrangement;
  section: StudioArrangement['sections'][number];
  cursor: Cursor;
  insert: (string: number, fret: number) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  advance: boolean;
  setAdvance: (v: boolean) => void;
}) {
  const [showNames, setShowNames] = useState(false);
  const [focusPosition, setFocusPosition] = useState({ string: 1, fret: 0 });
  const board = useRef<HTMLDivElement>(null);
  const events =
    section.measures
      .find((m) => m.id === cursor.measureId)
      ?.events.filter((e) => sameTime(e.start, cursor.start)) ?? [];
  const event = events.length
    ? { tones: events.flatMap((e) => e.tones) }
    : undefined;
  useEffect(() => {
    const tone = event?.tones.find((t) => t.position?.string === cursor.string);
    const position = {
      string: cursor.string,
      fret: tone?.position
        ? physical
          ? tone.position.fret
          : fretLabel(tone.position.fret, arrangement.instrument.capo)
        : physical
          ? arrangement.instrument.capo
          : 0,
    };
    setFocusPosition(position);
    if (board.current?.contains(document.activeElement))
      board.current
        ?.querySelector(
          '[data-neck-string="' +
            position.string +
            '"][data-neck-fret="' +
            position.fret +
            '"]',
        )
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursor, section, arrangement.instrument.capo, physical]);
  return (
    <section className="panel neck gs-panel">
      <div className="panelhead fretboard-header gs-panel__header">
        <h2>
          Interactieve gitaarhals{' '}
          <small>
            {physical
              ? 'Fysieke frets 0–24 · capo '
              : 'Frets ten opzichte van capo '}
            {arrangement.instrument.capo}
          </small>
        </h2>
        <div className="fretboard-controls">
          <button
            className="gs-button"
            aria-pressed={advance}
            onClick={() => setAdvance(!advance)}
          >
            Opeenvolgend
          </button>
          <button
            className="gs-button"
            aria-pressed={showNames}
            onClick={() => setShowNames(!showNames)}
          >
            Nootnamen
          </button>
          <button
            className="gs-button"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? '⌃ Uitklappen' : '⌄ Inklappen'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="fret-scroll" ref={board}>
            <div className="fretboard gs-fretboard">
              <span />
              {Array.from({ length: 25 }, (_, f) => (
                <span
                  key={f}
                  className={
                    'fret-label ' +
                    ([3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(f)
                      ? 'dot'
                      : '')
                  }
                >
                  {f}
                  {f === 12 || f === 24 ? ' •' : ''}
                </span>
              ))}
              {Array.from({ length: 6 }, (_, i) => (
                <div className="string-row" key={i}>
                  <span className="fret-label">
                    {pitchName(
                      arrangement.instrument.tuning.pitches[i]!,
                    ).replace(/\d/, '')}{' '}
                    {i + 1}
                  </span>
                  {Array.from({ length: 25 }, (_, f) => {
                    const absolute = physical
                      ? f
                      : f + arrangement.instrument.capo;
                    const selected = event?.tones.some(
                      (t) =>
                        t.position?.string === i + 1 &&
                        t.position.fret === absolute,
                    );
                    const name = pitchName(
                      arrangement.instrument.tuning.pitches[i]! + absolute,
                    );
                    return (
                      <button
                        key={f}
                        data-selected={selected}
                        data-neck-string={i + 1}
                        data-neck-fret={f}
                        tabIndex={
                          focusPosition.string === i + 1 &&
                          focusPosition.fret === f
                            ? 0
                            : -1
                        }
                        className={
                          'gs-button ' +
                          ((f === (physical ? arrangement.instrument.capo : 0)
                            ? 'open '
                            : '') +
                            (selected ? 'lit' : ''))
                        }
                        disabled={
                          absolute > arrangement.instrument.maxFret ||
                          absolute < arrangement.instrument.capo
                        }
                        aria-label={
                          'Hals snaar ' +
                          (i + 1) +
                          (physical ? ', fysieke fret ' : ', fret ') +
                          f +
                          ', ' +
                          name
                        }
                        aria-pressed={!!selected}
                        onClick={() => {
                          setFocusPosition({ string: i + 1, fret: f });
                          insert(i + 1, f);
                        }}
                        onKeyDown={(e) => {
                          if (
                            ![
                              'ArrowLeft',
                              'ArrowRight',
                              'ArrowUp',
                              'ArrowDown',
                            ].includes(e.key)
                          )
                            return;
                          e.preventDefault();
                          const string = Math.max(
                            1,
                            Math.min(
                              6,
                              i +
                                1 +
                                (e.key === 'ArrowDown'
                                  ? 1
                                  : e.key === 'ArrowUp'
                                    ? -1
                                    : 0),
                            ),
                          );
                          const fret = Math.max(
                            0,
                            Math.min(
                              arrangement.instrument.maxFret -
                                (physical ? 0 : arrangement.instrument.capo),
                              24,
                              f +
                                (e.key === 'ArrowRight'
                                  ? 1
                                  : e.key === 'ArrowLeft'
                                    ? -1
                                    : 0),
                            ),
                          );
                          setFocusPosition({ string, fret });
                          board.current
                            ?.querySelector<HTMLButtonElement>(
                              '[data-neck-string="' +
                                string +
                                '"][data-neck-fret="' +
                                fret +
                                '"]',
                            )
                            ?.focus();
                        }}
                      >
                        <span className={showNames || expanded ? 'show' : ''}>
                          {name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="neckfooter">
            Selectie:{' '}
            {event?.tones
              .map((t) =>
                t.position
                  ? 'S' +
                    t.position.string +
                    ' fret ' +
                    (physical
                      ? t.position.fret
                      : fretLabel(
                          t.position.fret,
                          arrangement.instrument.capo,
                        )) +
                    ' = ' +
                    pitchName(t.pitch)
                  : pitchName(t.pitch),
              )
              .join(' · ') || 'Kies een fret'}{' '}
            · 0 = fysieke open snaar; capo bepaalt de speelbare ondergrens ·
            meerdere snaren = samenklank
          </div>
        </>
      )}
    </section>
  );
}
