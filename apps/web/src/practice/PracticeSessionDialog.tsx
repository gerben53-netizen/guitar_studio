import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';
import {
  SessionInputSchema,
  type ExerciseConfiguration,
  type PracticeSessionInput,
} from '../../../../packages/music-domain/src/practice';
export function PracticeSessionDialog({
  configuration,
  seconds,
  bars,
  bpm,
  startedAt,
  save,
  close,
}: {
  configuration: ExerciseConfiguration;
  seconds: number;
  bars: number;
  bpm: number;
  startedAt: string;
  save: (
    input: PracticeSessionInput,
    reported: ExerciseConfiguration,
  ) => Promise<void>;
  close: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID()),
    [instrument, setInstrument] = useState(configuration.instrument.type),
    [tempo, setTempo] = useState(String(bpm)),
    [duration, setDuration] = useState(String(Math.floor(seconds))),
    [repetitions, setRepetitions] = useState(String(bars)),
    [rating, setRating] = useState('3'),
    [notes, setNotes] = useState(''),
    [result, setResult] = useState<'Uitgevoerd' | 'Beheerst'>('Uitgevoerd'),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const saving = useRef(false);
  const edited =
    notes !== '' ||
    instrument !== configuration.instrument.type ||
    Number(tempo) !== bpm ||
    Number(duration) !== Math.floor(seconds) ||
    Number(repetitions) !== bars ||
    rating !== '3' ||
    result !== 'Uitgevoerd';
  function cancel() {
    if (saving.current) return;
    if (
      edited &&
      !confirm(
        'Je reflectie is nog niet opgeslagen. Deze invoer verwerpen en terug naar de oefening?',
      )
    )
      return;
    close();
  }
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (edited) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [edited]);
  return (
    <Dialog dismissible={!busy} title="Oefensessie afronden" onClose={cancel}>
      <form
        aria-busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving.current) return;
          const snapshot = {
            ...configuration,
            bpm: Number(tempo),
            instrument: { ...configuration.instrument, type: instrument },
          };
          const input = {
            id,
            exerciseId: configuration.exerciseId,
            configurationKey: '0'.repeat(64),
            startedAt,
            endedAt: new Date().toISOString(),
            durationSeconds: Number(duration),
            repetitions: Number(repetitions),
            rating: Number(rating),
            notes,
            result,
            masteryConfirmed: result === 'Beheerst' && confirmed,
            snapshot,
          };
          if (!SessionInputSchema.safeParse(input).success) {
            setError(
              'Controleer de duur (niet langer dan de verstreken tijd), aantallen en je expliciete beheersbevestiging.',
            );
            return;
          }
          saving.current = true;
          setBusy(true);
          setError('');
          try {
            await save(input, snapshot);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : 'Opslaan mislukt. Je invoer blijft bewaard; probeer opnieuw.',
            );
          } finally {
            saving.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="practice-session-fields">
          <p>
            Reflecteer op deze uitvoering. Een bereikt tempo kent nooit
            automatisch beheersing toe.
          </p>
          <div className="practice-form-grid">
            <label className="gs-field">
              Instrument
              <select
                className="gs-input"
                value={instrument}
                onChange={(e) =>
                  setInstrument(e.target.value as typeof instrument)
                }
              >
                <option value="acoustic">Akoestisch</option>
                <option value="electric">Elektrisch</option>
              </select>
            </label>
            <label className="gs-field">
              Geoefend BPM
              <input
                className="gs-input"
                type="number"
                required
                min="20"
                max="300"
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
              />
            </label>
            <label className="gs-field">
              Oefenduur in seconden
              <input
                className="gs-input"
                type="number"
                required
                min="0"
                max="86400"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </label>
            <label className="gs-field">
              Herhalingen
              <input
                className="gs-input"
                type="number"
                required
                min="0"
                max="100000"
                value={repetitions}
                onChange={(e) => setRepetitions(e.target.value)}
              />
            </label>
            <label className="gs-field">
              Zelfbeoordeling
              <select
                className="gs-input"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </label>
            <label className="gs-field">
              Resultaat
              <select
                className="gs-input"
                value={result}
                onChange={(e) => {
                  setResult(e.target.value as typeof result);
                  setConfirmed(false);
                }}
              >
                <option>Uitgevoerd</option>
                <option>Beheerst</option>
              </select>
            </label>
          </div>
          <label className="gs-field">
            Notities
            <textarea
              className="gs-input"
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {result === 'Beheerst' && (
            <label className="gs-field practice-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
              />
              Ik bevestig dat ik deze configuratie beheers. Andere patronen,
              tempi en posities krijgen geen beheersstatus.
            </label>
          )}
          {error && (
            <p role="alert" className="gs-notice gs-notice--error">
              {error}
            </p>
          )}
        </fieldset>
        <footer className="dialog-actions">
          <button
            type="button"
            className="gs-button"
            disabled={busy}
            onClick={cancel}
          >
            Terug naar oefening
          </button>
          <button
            className="gs-button gs-button--primary"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'Opslaan…' : 'Sessie opslaan'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
