import { useEffect, useState } from 'react';
import type { ExerciseConfiguration } from '../../../../packages/music-domain/src/practice';
import {
  defaultTransportOptions,
  type PracticePreferences,
} from '../../../../packages/music-domain/src/practice-transport';
import type { usePracticeAudio } from './usePracticeAudio';
export type { PracticePreferences };
export function NumericField({
  label,
  value,
  min,
  max,
  change,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  change: (n: number) => void | boolean;
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  const valid =
    raw !== '' &&
    Number.isInteger(Number(raw)) &&
    Number(raw) >= min &&
    Number(raw) <= max;
  return (
    <label className="gs-field">
      {label}
      <input
        className="gs-input"
        type="number"
        min={min}
        max={max}
        step="1"
        required
        value={raw}
        disabled={disabled}
        aria-invalid={!valid}
        onChange={(e) => {
          setRaw(e.target.value);
          const n = Number(e.target.value);
          if (
            e.target.value !== '' &&
            Number.isInteger(n) &&
            n >= min &&
            n <= max
          )
            if (change(n) === false) setRaw(String(value));
        }}
      />
    </label>
  );
}
export const elapsed = (seconds: number) =>
  Math.floor(seconds / 60) +
  ':' +
  String(Math.floor(seconds) % 60).padStart(2, '0');
export function PracticeTransport({
  configuration,
  change,
  audio,
  start,
  pause,
  stop,
  finish,
  busy,
}: {
  configuration: ExerciseConfiguration;
  change: (c: ExerciseConfiguration) => void;
  audio: ReturnType<typeof usePracticeAudio>;
  start: () => void;
  pause: () => void;
  stop: () => void;
  finish: () => void;
  busy: boolean;
}) {
  const { snapshot, engine } = audio,
    t = configuration.transport ?? defaultTransportOptions;
  const setTempo = (n: number) =>
    change({
      ...configuration,
      bpm: Math.max(20, Math.min(300, n)),
      transport: { ...t, ramp: { ...t.ramp, enabled: false } },
    });
  return (
    <section
      className="gs-panel practice-transport"
      aria-label="Oefenbediening"
    >
      <div className="practice-transport-actions">
        <button
          className="gs-button gs-button--primary"
          disabled={busy || snapshot.status === 'starting'}
          onClick={snapshot.status === 'running' ? pause : start}
        >
          {snapshot.status === 'running'
            ? 'Ⅱ Pauze'
            : snapshot.status === 'paused'
              ? '▷ Hervatten'
              : '▷ Start'}
        </button>
        <button className="gs-button" onClick={stop}>
          ■ Stop
        </button>
        <button
          className="gs-button"
          aria-label="BPM verlagen"
          onClick={() => setTempo(configuration.bpm - 5)}
        >
          −5
        </button>
        <NumericField
          label="BPM"
          value={configuration.bpm}
          min={20}
          max={300}
          change={setTempo}
        />
        <button
          className="gs-button"
          aria-label="BPM verhogen"
          onClick={() => setTempo(configuration.bpm + 5)}
        >
          +5
        </button>
        <button
          className="gs-button"
          onClick={() => {
            const n = engine.tap();
            if (n) setTempo(n);
          }}
        >
          Tap tempo
        </button>
        <button className="gs-button" onClick={finish} disabled={busy}>
          ✓ Sessie afronden
        </button>
      </div>
      <div className="practice-transport-options">
        <label className="gs-field">
          Volume
          <input
            className="gs-input gs-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={t.volume}
            onChange={(e) =>
              change({
                ...configuration,
                transport: { ...t, volume: Number(e.target.value) },
              })
            }
          />
        </label>
        <button
          className="gs-button"
          aria-pressed={t.mute}
          onClick={() =>
            change({ ...configuration, transport: { ...t, mute: !t.mute } })
          }
        >
          {t.mute ? 'Geluid uit' : 'Geluid aan'}
        </button>
        <label className="gs-field">
          Subdivisies
          <select
            className="gs-input"
            value={t.subdivision}
            onChange={(e) =>
              change({
                ...configuration,
                transport: {
                  ...t,
                  subdivision: e.target.value as typeof t.subdivision,
                },
              })
            }
          >
            <option value="none">Alleen hoofdpulsen</option>
            <option value="eighth">Achtsten</option>
            <option value="sixteenth">Zestienden</option>
          </select>
        </label>
        <output aria-label="Oefentijd">
          {elapsed(snapshot.seconds)} oefentijd
        </output>
        <output aria-label="Gespeelde maten">{snapshot.bars} maten</output>
        <output aria-label="Actueel tempo">{snapshot.bpm} BPM</output>
        <span role="status">
          {snapshot.status === 'running'
            ? 'Metronoom actief'
            : snapshot.status === 'paused'
              ? 'Gepauzeerd'
              : 'Gestopt'}
        </span>
      </div>
      {snapshot.error && (
        <p className="gs-notice gs-notice--error" role="alert">
          Audio kon niet starten: {snapshot.error}. Gebruik Start om opnieuw te
          proberen.
        </p>
      )}
    </section>
  );
}
