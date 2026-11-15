import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import type {
  MultitrackSong,
  MultitrackArrangement,
  Track,
} from '../../../../packages/music-domain/src/multitrack';
import {
  fraction,
  sameTime,
  pitchName,
} from '../../../../packages/music-domain/src/workspace';
import {
  scoreSystems,
  positionPercent,
  value,
  type EditorCursor,
  type ToneSelection,
  practiceTracks,
} from '../../../../packages/music-domain/src/workspace-editor';
interface Props {
  song: MultitrackSong;
  a: MultitrackArrangement;
  columns: number;
  cursor: EditorCursor;
  selection: ToneSelection[];
  range: string[];
  lyricTracks: Set<string>;
  selectedSyllable: string;
  practiceView: string;
  playingMeasure: string | null;
  choose: (c: EditorCursor, eventId: string | null, e: MouseEvent) => void;
  measure: (id: string, extend: boolean) => void;
  selectTrack: (id: string) => void;
  toggleLyrics: (id: string) => void;
  collapse: (id: string) => void;
  chooseSyllable: (id: string) => void;
  keyboard: (e: KeyboardEvent) => void;
}
export function ScoreSystem(p: Props) {
  const { a, cursor, song } = p,
    ordered = a.trackOrder
      .map((id) => a.tracks.find((t) => t.id === id)!)
      .filter((t) => t.visible),
    allowed = p.practiceView ? practiceTracks(a, p.practiceView) : ordered;
  const highlighted = new Set(
    a.lyricsLinks
      .filter((l) => l.syllableId === p.selectedSyllable)
      .flatMap((l) => l.eventIds),
  );
  const eventMap = new Map(a.tracks.map((t) => [t.id, t.events]));
  const renderTrack = (
    t: Track,
    system: ReturnType<typeof scoreSystems>[number],
  ) => (
    <section
      key={t.id}
      className="notation-row"
      data-track-id={t.id}
      aria-label={'Partij ' + t.name}
    >
      <header className="track-heading">
        <button
          className="track-name gs-button"
          aria-pressed={cursor.trackId === t.id}
          onClick={() => p.selectTrack(t.id)}
        >
          {t.name}
        </button>
        <small>
          {t.instrument.type === 'acoustic' ? 'Akoestisch' : 'Gitaar'} ·{' '}
          {t.instrument.tuning.name}
        </small>
        <div>
          <button
            className="gs-button"
            aria-pressed={p.lyricTracks.has(t.id)}
            onClick={() => p.toggleLyrics(t.id)}
          >
            Lyrics {p.lyricTracks.has(t.id) ? 'aan' : 'uit'}: {t.name}
          </button>
          <button
            className="gs-button"
            aria-expanded={!t.collapsed}
            onClick={() => p.collapse(t.id)}
          >
            {t.collapsed ? 'Uitklappen' : 'Inklappen'}: {t.name}
          </button>
        </div>
      </header>
      {!t.collapsed && (
        <div
          className="measure-row"
          style={{ '--measure-count': p.columns } as CSSProperties}
        >
          {system.measures.map((m) => {
            const events = eventMap
                .get(t.id)!
                .filter((e) => e.measureId === m.id),
              index =
                a.sections
                  .flatMap((s) => s.measures)
                  .findIndex((x) => x.id === m.id) + 1;
            const points = Array.from(
              {
                length:
                  cursor.trackId === t.id && cursor.measureId === m.id
                    ? Math.ceil(
                        (m.timeSignature.beats / m.timeSignature.beatUnit) * 16,
                      )
                    : 1,
              },
              (_, i) => fraction(i, 16),
            );
            for (const e of events)
              if (!points.some((t) => sameTime(t, e.start)))
                points.push(e.start);
            if (
              cursor.measureId === m.id &&
              !points.some((t) => sameTime(t, cursor.start))
            )
              points.push(cursor.start);
            points.sort((x, y) => value(x) - value(y));
            const links = a.lyricsLinks
              .flatMap((link) => {
                if (link.trackId !== t.id) return [];
                const inBar = events
                  .filter((e) => link.eventIds.includes(e.id))
                  .sort((a, b) => value(a.start) - value(b.start));
                if (!inBar.length) return [];
                const syllable = song.lyrics
                  .flatMap((s) =>
                    s.lines.flatMap((l) =>
                      l.tokens.flatMap((w) => w.syllables),
                    ),
                  )
                  .find((s) => s.id === link.syllableId)!;
                return [{ link, syllable, start: inBar[0]!.start }];
              })
              .sort((a, b) => value(a.start) - value(b.start));
            return (
              <section
                key={m.id}
                className={
                  'score-measure' +
                  (p.range.includes(m.id) ? ' is-range' : '') +
                  (p.playingMeasure === m.id ? ' is-playing' : '')
                }
                data-measure-id={m.id}
                aria-label={t.name + ' maat ' + index}
              >
                <button
                  className="measure-heading"
                  aria-pressed={p.range.includes(m.id)}
                  onClick={(e) => p.measure(m.id, e.shiftKey)}
                >
                  Maat {index} · {m.timeSignature.beats}/
                  {m.timeSignature.beatUnit}
                </button>
                <div
                  className="tab-staff"
                  role="group"
                  aria-label={'Zes snaren ' + t.name + ' maat ' + index}
                  onKeyDown={p.keyboard}
                >
                  {t.instrument.tuning.pitches.map((pitch, i) => (
                    <div className="string-line" data-string={i + 1} key={i}>
                      <span className="string-name">
                        {pitchName(pitch).replace(/-?\d+$/, '')}
                      </span>
                      <div
                        className="staff-field"
                        onClick={(e) => {
                          if (e.target !== e.currentTarget || p.practiceView)
                            return;
                          const bounds =
                              e.currentTarget.getBoundingClientRect(),
                            units =
                              (m.timeSignature.beats /
                                m.timeSignature.beatUnit) *
                              16;
                          const start = fraction(
                            Math.max(
                              0,
                              Math.min(
                                Math.ceil(units) - 1,
                                Math.round(
                                  ((e.clientX - bounds.left) / bounds.width) *
                                    units,
                                ),
                              ),
                            ),
                            16,
                          );
                          p.choose(
                            {
                              trackId: t.id,
                              measureId: m.id,
                              start,
                              string: i + 1,
                            },
                            null,
                            e,
                          );
                        }}
                      >
                        {points.map((start) => {
                          const event = events.find(
                            (e) =>
                              sameTime(e.start, start) &&
                              (e.tones.some(
                                (t) => t.position?.string === i + 1,
                              ) ||
                                (e.kind === 'rest' && i === 2)),
                          );
                          const tone = event?.tones.find(
                              (t) => t.position?.string === i + 1,
                            ),
                            active =
                              cursor.trackId === t.id &&
                              cursor.measureId === m.id &&
                              cursor.string === i + 1 &&
                              sameTime(cursor.start, start);
                          const selected =
                            !!event &&
                            p.selection.some(
                              (s) =>
                                s.eventId === event.id &&
                                (s.string === i + 1 || s.string === null),
                            );
                          const text =
                            event?.kind === 'rest'
                              ? '𝄽'
                              : tone?.position
                                ? String(tone.position.fret)
                                : '';
                          return (
                            <button
                              type="button"
                              key={start.numerator + '/' + start.denominator}
                              className={
                                'tab-position' +
                                (selected ? ' is-selected' : '') +
                                (event && highlighted.has(event.id)
                                  ? ' is-linked'
                                  : '')
                              }
                              data-active={active}
                              data-event-id={event?.id}
                              data-string={i + 1}
                              data-start={
                                start.numerator + '/' + start.denominator
                              }
                              style={{
                                left:
                                  positionPercent(start, m.timeSignature) + '%',
                              }}
                              tabIndex={active ? 0 : -1}
                              aria-label={
                                t.name +
                                ', maat ' +
                                index +
                                ', positie ' +
                                start.numerator +
                                '/' +
                                start.denominator +
                                ', snaar ' +
                                (i + 1) +
                                (text
                                  ? ', ' +
                                    (event?.kind === 'rest'
                                      ? 'rust'
                                      : 'fysieke fret ' + text)
                                  : ', leeg')
                              }
                              aria-pressed={selected}
                              onClick={(e) =>
                                p.choose(
                                  {
                                    trackId: t.id,
                                    measureId: m.id,
                                    start,
                                    string: i + 1,
                                  },
                                  event?.id ?? null,
                                  e,
                                )
                              }
                            >
                              <span>{text || '·'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {events.some((e) => e.tones.some((t) => !t.position)) && (
                  <p className="unpositioned-notes">
                    Zonder snaarpositie:{' '}
                    {events
                      .flatMap((e) =>
                        e.tones
                          .filter((t) => !t.position)
                          .map(
                            (t) =>
                              'MIDI ' +
                              t.pitch +
                              ' op ' +
                              e.start.numerator +
                              '/' +
                              e.start.denominator,
                          ),
                      )
                      .join(' · ')}
                    . Kies zelf een speelpositie; deze toonhoogten blijven
                    bewaard.
                  </p>
                )}
                <div
                  className="duration-lane"
                  role="group"
                  aria-label="Nootduren"
                >
                  {events
                    .filter(
                      (e, i) =>
                        !events
                          .slice(0, i)
                          .some((x) => sameTime(x.start, e.start)),
                    )
                    .map((e) => (
                      <span
                        key={e.id}
                        title={events
                          .filter((n) => sameTime(n.start, e.start))
                          .map(
                            (n) =>
                              n.duration.numerator +
                              '/' +
                              n.duration.denominator +
                              (n.technique ? ' · ' + n.technique : ''),
                          )
                          .join(' + ')}
                        style={{
                          left: positionPercent(e.start, m.timeSignature) + '%',
                        }}
                      >
                        {[
                          ...new Set(
                            events
                              .filter((n) => sameTime(n.start, e.start))
                              .map(
                                (n) =>
                                  n.duration.numerator +
                                  '/' +
                                  n.duration.denominator +
                                  (n.technique && n.technique !== 'normal'
                                    ? ' · ' + n.technique
                                    : ''),
                              ),
                          ),
                        ].join(' + ')}
                      </span>
                    ))}
                </div>
                {(p.lyricTracks.has(t.id) || p.practiceView === 'linked') && (
                  <div
                    className="lyric-lane"
                    role="group"
                    aria-label={'Lyrics onder ' + t.name + ' maat ' + index}
                  >
                    {links.map(({ link, syllable, start }, i) => {
                      const left = positionPercent(start, m.timeSignature),
                        next = links[i + 1]
                          ? positionPercent(
                              links[i + 1]!.start,
                              m.timeSignature,
                            )
                          : 100;
                      return (
                        <button
                          key={link.id}
                          className={
                            'lyric-anchor' +
                            (p.selectedSyllable === syllable.id
                              ? ' is-selected'
                              : '')
                          }
                          title={
                            syllable.text +
                            (link.eventIds.length > 1 ? ' · melisma' : '') +
                            (link.sustain ? ' · aangehouden' : '')
                          }
                          style={{
                            left: left + '%',
                            maxWidth: Math.max(5, next - left) + '%',
                          }}
                          onClick={() => p.chooseSyllable(syllable.id)}
                        >
                          {syllable.text}
                          {link.eventIds.length > 1 && (
                            <span className="melisma-mark" aria-label="melisma">
                              ⌢
                            </span>
                          )}
                          {link.sustain && (
                            <span
                              className="sustain-mark"
                              aria-label="aangehouden"
                            >
                              —
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
  return (
    <div className="score-pages" role="group" aria-label="Muzieknotatie">
      {scoreSystems(a, p.columns).map((system, i) => (
        <section
          className="score-system"
          key={system.measures[0]!.id}
          aria-label={'Maatregel ' + (i + 1)}
        >
          <h3>
            {
              song.lyrics.find((s) => s.id === system.section.lyricsSectionId)
                ?.name
            }
          </h3>
          <div className="score-system-scroll">
            {allowed.map((t) => renderTrack(t, system))}
          </div>
        </section>
      ))}
    </div>
  );
}
