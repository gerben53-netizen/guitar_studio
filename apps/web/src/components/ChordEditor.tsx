import { useState } from 'react';
import {
  presets,
  uid,
  pitchName,
  type Grip,
  type StudioArrangement,
} from '../../../../packages/music-domain/src/workspace';
import { Dialog } from './Dialog';
export function ChordDiagram({ grip }: { grip: Grip }) {
  const positive = grip.frets.filter((f) => f > 0);
  const base = Math.max(...positive) > 5 ? Math.min(...positive) : 1;
  return (
    <svg
      className="chord-diagram"
      viewBox="0 0 110 108"
      role="img"
      aria-label={grip.name + ' akkoorddiagram, lage E links'}
    >
      <text x="45" y="12" textAnchor="middle" fill="currentColor" fontSize="12">
        {grip.name}
      </text>
      {Array.from({ length: 6 }, (_, i) => (
        <line
          key={i}
          x1={12 + i * 13}
          x2={12 + i * 13}
          y1="32"
          y2="97"
          stroke="currentColor"
          opacity=".5"
        />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line
          key={i}
          x1="12"
          x2="77"
          y1={32 + i * 13}
          y2={32 + i * 13}
          stroke="currentColor"
          strokeWidth={i === 0 ? 3 : 1}
          opacity=".6"
        />
      ))}
      {[...grip.frets].reverse().map((f, i) =>
        f <= 0 ? (
          <text
            key={i}
            x={12 + i * 13}
            y="27"
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
          >
            {f < 0 ? '×' : '○'}
          </text>
        ) : (
          <circle
            key={i}
            cx={12 + i * 13}
            cy={38 + Math.min(f - base, 4) * 13}
            r="4"
            fill="var(--color-note-selected)"
          />
        ),
      )}
      {base > 1 && (
        <text x="85" y="44" fontSize="9" fill="currentColor">
          {base}fr
        </text>
      )}
      <text x="45" y="107" textAnchor="middle" fontSize="7" fill="currentColor">
        E A D G B e
      </text>
    </svg>
  );
}
export function ChordEditor({
  initial,
  custom,
  arrangement,
  word,
  close,
  save,
  toTab,
  remove,
  validationError,
}: {
  initial?: Grip;
  custom: Grip[];
  arrangement: StudioArrangement;
  word: string;
  close: () => void;
  save: (grip: Grip, library: boolean) => void;
  toTab: (grip: Grip) => void;
  remove?: () => void;
  validationError: string;
}) {
  const [grip, setGrip] = useState<Grip>(() =>
      structuredClone(initial ?? presets[0]!),
    ),
    [library, setLibrary] = useState(false);
  const [error, setError] = useState('');
  return (
    <Dialog title="Een akkoord, jouw greep" onClose={close}>
      <p className="muted">
        Op “{word || 'selecteer eerst een woord'}” · laag E links, hoge e rechts
      </p>
      <div className="chord-layout">
        <div>
          <ChordDiagram grip={grip} />
          <div className="grip-grid">
            {[6, 5, 4, 3, 2, 1].map((s) => (
              <label className="gs-field" key={s}>
                Snaar {s}
                <select
                  className="gs-input"
                  aria-label={'Greep snaar ' + s}
                  value={grip.frets[s - 1]}
                  onChange={(e) => {
                    const frets = [...grip.frets];
                    frets[s - 1] = Number(e.target.value);
                    setGrip({ ...grip, id: uid(), frets });
                  }}
                >
                  {Array.from({ length: 26 }, (_, i) => i - 1).map((f) => (
                    <option key={f} value={f}>
                      {f < 0 ? '×' : f === 0 ? '○' : f}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <small>× gedempt · ○ open ten opzichte van de capo</small>
        </div>
        <div>
          <label className="gs-field">
            Akkoordnaam
            <input
              className="gs-input"
              maxLength={60}
              value={grip.name}
              onChange={(e) => setGrip({ ...grip, name: e.target.value })}
            />
          </label>
          <div className="chord-actions">
            {[...presets, ...custom].map((p, i) => (
              <button
                className="gs-button"
                key={p.id + i}
                onClick={() => setGrip(structuredClone(p))}
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            className="gs-button"
            disabled={grip.frets.some((f) => f > 12)}
            onClick={() =>
              setGrip({
                ...grip,
                id: uid(),
                name: grip.name.slice(0, 55) + ' alt',
                frets: grip.frets
                  .map((f) => (f < 0 ? -1 : f + 12))
                  .map((f) => Math.min(24, f)),
              })
            }
          >
            Alternatieve greep +12
          </button>
          <label className="chord-actions gs-field">
            <input
              className="gs-input"
              type="checkbox"
              checked={library}
              onChange={(e) => setLibrary(e.target.checked)}
            />
            Ook bewaren in eigen grepen
          </label>
          <p className="chord-preview">
            {grip.frets
              .map(
                (f, i) =>
                  'S' +
                  (i + 1) +
                  ': ' +
                  (f < 0
                    ? 'gedempt'
                    : pitchName(
                        arrangement.instrument.tuning.pitches[i]! +
                          arrangement.instrument.capo +
                          f,
                      )),
              )
              .join(' · ')}
          </p>
        </div>
      </div>
      {(error || validationError) && (
        <p role="alert">{error || validationError}</p>
      )}
      <footer className="dialog-actions">
        {remove && (
          <button className="danger gs-button gs-danger" onClick={remove}>
            Akkoord verwijderen
          </button>
        )}
        <button className="gs-button" onClick={() => toTab(grip)}>
          Greep → tab
        </button>
        <button
          className="primary gs-button gs-button--primary"
          onClick={() => {
            if (!grip.name.trim()) {
              setError('Geef de greep een naam.');
              return;
            }
            save({ ...grip, name: grip.name.trim() }, library);
          }}
        >
          Op woord plaatsen
        </button>
      </footer>
    </Dialog>
  );
}
