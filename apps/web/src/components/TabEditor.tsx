import { useEffect, useRef, useState } from 'react';
import {
  fraction,
  timeValue,
  sameTime,
  uid,
  emptyMeasure,
  putTone,
  fretLabel,
  type StudioArrangement,
} from '../../../../packages/music-domain/src/workspace';
import {
  validateMeasure,
  type Measure,
  type MusicalTime,
} from '../../../../packages/music-domain/src/index';
export interface Cursor {
  measureId: string;
  start: MusicalTime;
  string: number;
}
export function TabEditor({
  arrangement,
  section,
  cursor,
  setCursor,
  duration,
  setDuration,
  change,
  undo,
  report,
  practice = false,
}: {
  arrangement: StudioArrangement;
  section: StudioArrangement['sections'][number];
  cursor: Cursor;
  setCursor: (c: Cursor) => void;
  duration: MusicalTime;
  setDuration: (t: MusicalTime) => void;
  change: (fn: (a: StudioArrangement) => void) => void;
  undo: (redo?: boolean) => void;
  report: (s: string) => void;
  practice?: boolean;
}) {
  const [resolution, setResolution] = useState(8),
    [rangeStart, setRangeStart] = useState<string | null>(null),
    [clipboard, setClipboard] = useState<Measure[] | null>(null);
  const ref = useRef<HTMLDivElement>(null),
    digits = useRef({ value: '', time: 0 });
  const index = Math.max(
    0,
    section.measures.findIndex((m) => m.id === cursor.measureId),
  );
  const selectedMeasure = section.measures[index]!;
  const startIndex = rangeStart
    ? section.measures.findIndex((m) => m.id === rangeStart)
    : index;
  const lo = Math.min(Math.max(0, startIndex), index),
    hi = Math.max(startIndex, index);
  const cells = Math.ceil(
    (arrangement.timeSignature.beats / arrangement.timeSignature.beatUnit) *
      resolution,
  );
  const sectionDraft = (a: StudioArrangement) =>
    a.sections.find((s) => s.id === section.id)!;
  function modify(fn: (m: Measure) => void) {
    change((a) => {
      const m = sectionDraft(a).measures[index]!;
      fn(m);
      validateMeasure(m, a.instrument);
    });
  }
  function write(fret: number) {
    change((a) =>
      putTone(
        a,
        sectionDraft(a).measures[index]!,
        cursor.start,
        duration,
        cursor.string,
        fret,
      ),
    );
  }
  function remove() {
    modify((m) => {
      const event = m.events.find((e) => sameTime(e.start, cursor.start));
      if (!event) return;
      event.tones = event.tones.filter(
        (t) => t.position?.string !== cursor.string,
      );
      if (event.kind === 'rest' || !event.tones.length)
        m.events = m.events.filter((e) => e.id !== event.id);
    });
  }
  function copy() {
    setClipboard(structuredClone(section.measures.slice(lo, hi + 1)));
    report(hi - lo + 1 + ' maat/maten gekopieerd.');
  }
  function paste() {
    if (!clipboard) return;
    change((a) => {
      const copies = structuredClone(clipboard);
      for (const m of copies) {
        m.id = uid();
        for (const e of m.events) e.id = uid();
        validateMeasure(m, a.instrument);
      }
      sectionDraft(a).measures.splice(index + 1, 0, ...copies);
    });
  }
  function advance(delta: number, extend = false) {
    digits.current = { value: '', time: 0 };
    const value = timeValue(cursor.start) + delta * timeValue(duration),
      capacity =
        arrangement.timeSignature.beats / arrangement.timeSignature.beatUnit;
    let next = index,
      t = value;
    if (t < 0 && index > 0) {
      next--;
      t = Math.max(0, capacity - timeValue(duration));
    } else if (t >= capacity && index < section.measures.length - 1) {
      next++;
      t = 0;
    } else t = Math.max(0, Math.min(capacity - 1 / resolution, t));
    if (extend && !rangeStart) setRangeStart(cursor.measureId);
    if (!extend) setRangeStart(null);
    setCursor({
      ...cursor,
      measureId: section.measures[next]!.id,
      start: fraction(Math.round(t * 48), 48),
    });
  }
  useEffect(() => {
    if (ref.current?.contains(document.activeElement)) {
      const button = ref.current.querySelector<HTMLButtonElement>(
        '[data-active="true"]',
      );
      button?.focus();
      button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [cursor]);
  function keyboard(e: React.KeyboardEvent) {
    if (practice) return;
    const cmd = e.ctrlKey || e.metaKey;
    if (cmd && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo(e.shiftKey);
      return;
    }
    if (cmd && ['c', 'v'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      if (e.key.toLowerCase() === 'c') copy();
      else paste();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      advance(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      digits.current = { value: '', time: 0 };
      setCursor({
        ...cursor,
        string: Math.max(
          1,
          Math.min(6, cursor.string + (e.key === 'ArrowDown' ? 1 : -1)),
        ),
      });
      return;
    }
    if (['Delete', 'Backspace'].includes(e.key)) {
      e.preventDefault();
      remove();
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const now = Date.now();
      const previous =
        now - digits.current.time < 650 ? digits.current.value : '';
      let value = previous + e.key;
      if (Number(value) > 24) value = e.key;
      digits.current = { value, time: now };
      write(Number(value));
    }
  }
  return (
    <section className="panel tab-panel" aria-label="Tablatuureditor">
      <div className="panelhead tab-panel-heading">
        <h2>
          Tablatuur{' '}
          <span className="badge">
            {arrangement.timeSignature.beats}/
            {arrangement.timeSignature.beatUnit}
          </span>
        </h2>
        <small>{section.measures.length} maten</small>
      </div>
      {!practice && (
        <div className="tabtools">
          <select
            aria-label="Nootduur"
            value={duration.denominator / duration.numerator}
            onChange={(e) => {
              const next = fraction(1, Number(e.target.value));
              setDuration(next);
              const event = selectedMeasure.events.find((e) =>
                sameTime(e.start, cursor.start),
              );
              if (event)
                modify((m) => {
                  m.events.find((e) => e.id === event.id)!.duration = next;
                });
            }}
          >
            {[
              [1, '𝅝 Hele'],
              [2, '𝅗𝅥 Halve'],
              [4, '♩ Kwart'],
              [8, '♪ Achtste'],
              [16, '♬ Zestiende'],
              [12, '⅓ Kwarttriool'],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              modify((m) => {
                m.events = m.events.filter(
                  (e) => !sameTime(e.start, cursor.start),
                );
                m.events.push({
                  id: uid(),
                  kind: 'rest',
                  start: cursor.start,
                  duration,
                  tones: [],
                });
              })
            }
          >
            Rust
          </button>
          <button onClick={remove}>Wis noot</button>
          <button onClick={() => advance(1)}>→</button>
          <button
            onClick={() =>
              change((a) =>
                sectionDraft(a).measures.push(emptyMeasure(a.timeSignature)),
              )
            }
          >
            + Maat
          </button>
          <button
            onClick={() =>
              change((a) => {
                const m = structuredClone(sectionDraft(a).measures[index]!);
                m.id = uid();
                m.events.forEach((e) => (e.id = uid()));
                sectionDraft(a).measures.splice(index + 1, 0, m);
              })
            }
          >
            Dupliceer maat
          </button>
          <button onClick={copy}>Kopieer</button>
          <button disabled={!clipboard} onClick={paste}>
            Plak
          </button>
          <select
            aria-label="Ritmeraster"
            value={resolution}
            onChange={(e) => setResolution(Number(e.target.value))}
          >
            <option value={8}>Raster 1/8</option>
            <option value={16}>Raster 1/16</option>
            <option value={12}>Triolen 1/12</option>
          </select>
        </div>
      )}
      <div className="tabscroll" ref={ref} onKeyDown={keyboard}>
        <div className="measures">
          {section.measures.map((m, mi) => {
            const positions = Array.from({ length: cells }, (_, c) =>
              fraction(c, resolution),
            );
            for (const event of m.events)
              if (!positions.some((t) => sameTime(t, event.start)))
                positions.push(event.start);
            if (
              m.id === cursor.measureId &&
              !positions.some((t) => sameTime(t, cursor.start))
            )
              positions.push(cursor.start);
            positions.sort((a, b) => timeValue(a) - timeValue(b));
            return (
              <div
                className={'measure ' + (mi >= lo && mi <= hi ? 'range' : '')}
                key={m.id}
              >
                <div className="measure-title">
                  <button
                    aria-label={'Selecteer maat ' + (mi + 1)}
                    onClick={(e) => {
                      setRangeStart(
                        e.shiftKey ? (rangeStart ?? cursor.measureId) : m.id,
                      );
                      setCursor({
                        ...cursor,
                        measureId: m.id,
                        start: fraction(0, 1),
                      });
                    }}
                  >
                    Maat {String(mi + 1).padStart(2, '0')}
                  </button>
                  <small>
                    {m.id === cursor.measureId ? 'ACTIEVE MAAT' : ''}
                  </small>
                </div>
                <div
                  className="tabgrid"
                  style={
                    { '--tab-columns': positions.length } as React.CSSProperties
                  }
                >
                  {Array.from({ length: 6 }, (_, s) => (
                    <div className="string-row" key={s}>
                      <span className="stringname">
                        {['e', 'B', 'G', 'D', 'A', 'E'][s]}
                      </span>
                      {positions.map((t, ti) => {
                        const event = m.events.find((e) =>
                          sameTime(e.start, t),
                        );
                        const tone = event?.tones.find(
                          (n) => n.position?.string === s + 1,
                        );
                        const active =
                          cursor.measureId === m.id &&
                          cursor.string === s + 1 &&
                          sameTime(cursor.start, t);
                        return (
                          <button
                            key={ti}
                            data-active={active}
                            className={'tabcell ' + (active ? 'sel' : '')}
                            tabIndex={active ? 0 : -1}
                            aria-label={
                              'Maat ' +
                              (mi + 1) +
                              ', positie ' +
                              t.numerator +
                              '/' +
                              t.denominator +
                              ', snaar ' +
                              (s + 1) +
                              (tone
                                ? ', fret ' +
                                  fretLabel(
                                    tone.position!.fret,
                                    arrangement.instrument.capo,
                                  )
                                : event?.kind === 'rest'
                                  ? ', rust'
                                  : ' leeg')
                            }
                            onClick={() => {
                              setCursor({
                                measureId: m.id,
                                start: t,
                                string: s + 1,
                              });
                              digits.current = { value: '', time: 0 };
                            }}
                          >
                            <span>
                              {tone
                                ? fretLabel(
                                    tone.position!.fret,
                                    arrangement.instrument.capo,
                                  )
                                : event?.kind === 'rest' && s === 0
                                  ? '𝄽'
                                  : '·'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <span />
                  {positions.map((t, i) => {
                    const event = m.events.find((e) => sameTime(e.start, t));
                    return (
                      <span className="beat" key={i}>
                        {event
                          ? (event.kind === 'rest' ? 'rust ' : '') +
                            '1/' +
                            event.duration.denominator /
                              event.duration.numerator
                          : t.numerator === 0
                            ? '1'
                            : (
                                timeValue(t) *
                                  arrangement.timeSignature.beatUnit +
                                1
                              )
                                .toFixed(2)
                                .replace('.00', '')}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="tab-info">
        Maat {index + 1} · positie {cursor.start.numerator}/
        {cursor.start.denominator} · snaar {cursor.string} · Shift + pijlen:
        passage · cijfers: fret · Ctrl Z / Shift Z · Ctrl C / V
      </div>
    </section>
  );
}
