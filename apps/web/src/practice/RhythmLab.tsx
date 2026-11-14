import { useEffect, useRef, useState } from 'react';
import {
  ConfigurationSchema,
  type Exercise,
  type ExerciseConfiguration,
  type PracticeSessionInput,
} from '../../../../packages/music-domain/src/practice';
import { rhythmPreset } from '../../../../packages/music-domain/src/theory';
import { defaultTransportOptions } from '../../../../packages/music-domain/src/practice-transport';
import {
  editRhythm,
  eraseRhythm,
} from '../../../../packages/music-domain/src/rhythm-practice';
import type {
  PracticeSettingsRecord,
  createPracticeClient,
} from '../../../../packages/shared/src/practice-client';
import { usePracticeAudio } from './usePracticeAudio';
import { PracticeTransport, NumericField } from './PracticeTransport';
import { RhythmTimeline } from './RhythmTimeline';
import { PracticeSessionDialog } from './PracticeSessionDialog';
export type PracticeClient = ReturnType<typeof createPracticeClient>;
export type PracticeGuard = () => boolean;
const normalize = (c: ExerciseConfiguration) => ({
  ...structuredClone(c),
  transport: structuredClone(c.transport ?? defaultTransportOptions),
});
export function RhythmLab({
  exercise,
  initial,
  client,
  active,
  guard,
  saved,
  choose,
  rhythmExercises,
}: {
  exercise: Exercise;
  initial: PracticeSettingsRecord;
  client: PracticeClient;
  active: boolean;
  guard: (fn: PracticeGuard) => void;
  saved: () => Promise<void>;
  choose: (id: string) => void;
  rhythmExercises: Exercise[];
}) {
  const [configuration, setConfiguration] = useState(() =>
      normalize(initial.configuration),
    ),
    [selected, setSelected] = useState(0),
    [duration, setDuration] = useState(8),
    [stroke, setStroke] = useState<'down' | 'up'>('down'),
    [rest, setRest] = useState(false),
    [accent, setAccent] = useState(false),
    [history, setHistory] = useState<ExerciseConfiguration[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [dialog, setDialog] = useState(false),
    [startedAt, setStartedAt] = useState<string | null>(null),
    [dirty, setDirty] = useState(false),
    [mastery, setMastery] = useState(initial.mastery.configuration),
    [metrics, setMetrics] = useState({
      seconds: 0,
      bars: 0,
      bpm: configuration.bpm,
    });
  const baseline = useRef(normalize(initial.configuration)),
    revision = useRef(initial.revision),
    saving = useRef(false),
    actionEpoch = useRef(0),
    root = useRef<HTMLDivElement>(null);
  const audio = usePracticeAudio(configuration, active),
    t = configuration.transport!;
  const hasRun = startedAt !== null;
  const pending = useRef(false);
  pending.current = dirty || hasRun || busy;
  useEffect(() => {
    guard(() => {
      if (
        pending.current &&
        !confirm(
          'Je hebt een onopgeslagen patroon of oefensessie. Sla eerst op of rond af. Toch verlaten en deze lokale invoer verwerpen?',
        )
      )
        return false;
      actionEpoch.current++;
      void audio.engine.stop().catch(() => {});
      return true;
    });
    const leave = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => {
      actionEpoch.current++;
      guard(() => true);
      window.removeEventListener('beforeunload', leave);
    };
  }, [guard, audio.engine]);
  useEffect(() => {
    if (error)
      root.current
        ?.querySelector('[role=alert]')
        ?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  function change(next: ExerciseConfiguration, remember = false) {
    const valid = ConfigurationSchema.safeParse(next);
    if (!valid.success) {
      setError(
        'Controleer je instellingen: doeltempo moet minstens het starttempo zijn en het patroon moet binnen de maat passen.',
      );
      return false;
    }
    if (remember) setHistory((h) => [...h.slice(-49), configuration]);
    setConfiguration(normalize(valid.data));
    setMastery(false);
    setDirty(
      JSON.stringify(normalize(valid.data)) !==
        JSON.stringify(baseline.current),
    );
    setError('');
    setNotice('');
    return true;
  }
  async function persist(next: ExerciseConfiguration = configuration) {
    const result = await client.saveSettings(next, revision.current);
    revision.current = result.revision;
    setMastery(result.mastery.configuration);
    baseline.current = normalize(result.configuration);
    setConfiguration(normalize(result.configuration));
    setDirty(false);
    return result;
  }
  async function start() {
    if (saving.current) return;
    const invalid =
      root.current?.querySelector<HTMLInputElement>('input:invalid');
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    setError('');
    const generation = ++actionEpoch.current;
    setBusy(true);
    saving.current = true;
    try {
      await persist();
      if (generation !== actionEpoch.current) return;
      setStartedAt((v) => v ?? new Date().toISOString());
      await audio.engine.start();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function pause() {
    actionEpoch.current++;
    audio.read();
    void audio.engine.pause().catch((err) => setError(String(err)));
  }
  function stop() {
    actionEpoch.current++;
    audio.read();
    void audio.engine.stop().catch((err) => setError(String(err)));
  }
  function finish() {
    const read = audio.read();
    pause();
    setMetrics({
      seconds: read.seconds,
      bars: read.bars,
      bpm: read.maxBpm || configuration.bpm,
    });
    setDialog(true);
  }
  async function saveSession(
    input: PracticeSessionInput,
    reported: ExerciseConfiguration,
  ) {
    const settings = await persist(reported);
    const body = {
      ...input,
      configurationKey: settings.key,
      snapshot: reported,
    };
    try {
      await client.saveSession(body);
    } catch (err) {
      const existing = await client.session(body.id).catch(() => null);
      if (!existing || existing.configurationKey !== body.configurationKey)
        throw err;
    }
    setMastery(input.result === 'Beheerst' || settings.mastery.configuration);
    await audio.engine.stop();
    audio.reset();
    setStartedAt(null);
    setDialog(false);
    setNotice('Sessie opgeslagen. Je vindt deze terug in Voortgang.');
    await saved();
  }
  const pattern =
    configuration.specific.lab === 'rhythm'
      ? configuration.specific.pattern
      : null;
  if (!pattern)
    return <p role="alert">Deze oefening heeft geen ritme-inhoud.</p>;
  const locked = hasRun || busy,
    slots = (configuration.meter.beats * 16) / configuration.meter.beatUnit;
  function edit(kind: 'put' | 'erase') {
    try {
      const next =
        kind === 'erase'
          ? eraseRhythm(pattern!, selected)
          : editRhythm(
              pattern!,
              selected,
              duration,
              rest ? 'rest' : 'note',
              stroke,
              accent,
            );
      change(
        { ...configuration, specific: { lab: 'rhythm', pattern: next } },
        true,
      );
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  }
  return (
    <div className="rhythm-lab" ref={root}>
      <header className="practice-heading">
        <div>
          <p className="eyebrow">RHYTHM LAB · {exercise.level}</p>
          <h1>{exercise.title}</h1>
          <p className="muted">{exercise.goal}</p>
        </div>
        <label className="gs-field">
          Ritmische oefening
          <select
            className="gs-input"
            value={exercise.id}
            onChange={(e) => choose(e.target.value)}
            disabled={busy}
          >
            {rhythmExercises.map((e) => (
              <option value={e.id} key={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      </header>
      {initial.needsUpgrade && (
        <p className="gs-notice gs-notice--warning">
          Deze catalogusversie is bijgewerkt. Bekijk de nieuwe inhoud en kies
          bewust{' '}
          <button
            className="gs-button"
            disabled={locked}
            onClick={() => change(exercise.defaultConfiguration, true)}
          >
            Nieuwe versie laden
          </button>{' '}
          voordat je opslaat.
        </p>
      )}
      <div className="rhythm-layout">
        <div className="rhythm-workspace">
          <section className="gs-panel">
            <header className="gs-panel__header">
              <h2>Speel in de ruimte tussen de tellen</h2>
              <span className="gs-badge">
                {configuration.meter.beats}/{configuration.meter.beatUnit}
              </span>
            </header>
            <div className="practice-controls">
              <label className="gs-field">
                Patroon
                <select
                  className="gs-input"
                  value="custom"
                  disabled={locked}
                  onChange={(e) => {
                    if (e.target.value === 'custom') return;
                    if (
                      pattern.events.length &&
                      !confirm(
                        'Het gekozen patroon vervangt deze maat. Doorgaan?',
                      )
                    )
                      return;
                    const value =
                      e.target.value === 'empty'
                        ? { meter: configuration.meter, events: [] }
                        : rhythmPreset(
                            e.target.value as 'quarters',
                            configuration.meter,
                          );
                    change(
                      {
                        ...configuration,
                        specific: { lab: 'rhythm', pattern: value },
                      },
                      true,
                    );
                  }}
                >
                  <option value="custom">Eigen / geselecteerd patroon</option>
                  <option value="quarters">Kwartslagen</option>
                  <option value="eighths">Achtsten</option>
                  <option value="sixteenths">Zestienden</option>
                  <option value="syncopated">Syncope</option>
                  <option value="empty">Lege maat</option>
                </select>
              </label>
              <label className="gs-field">
                Maatsoort
                <select
                  className="gs-input"
                  value={
                    configuration.meter.beats +
                    '/' +
                    configuration.meter.beatUnit
                  }
                  disabled={locked}
                  onChange={(e) => {
                    const [beats, beatUnit] = e.target.value
                        .split('/')
                        .map(Number),
                      meter = { beats: beats!, beatUnit: beatUnit! as 4 | 8 };
                    if (
                      pattern.events.length &&
                      !confirm(
                        'Maatsoort wijzigen maakt een nieuwe lege maat. De vorige maat blijft via Undo beschikbaar. Doorgaan?',
                      )
                    )
                      return;
                    change(
                      {
                        ...configuration,
                        meter,
                        specific: {
                          lab: 'rhythm',
                          pattern: { meter, events: [] },
                        },
                      },
                      true,
                    );
                    setSelected(0);
                  }}
                >
                  {['2/4', '3/4', '4/4', '6/8'].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="gs-field">
                Instrument
                <select
                  className="gs-input"
                  value={configuration.instrument.type}
                  disabled={locked}
                  onChange={(e) =>
                    change({
                      ...configuration,
                      instrument: {
                        ...configuration.instrument,
                        type: e.target.value as 'acoustic' | 'electric',
                      },
                    })
                  }
                >
                  <option value="acoustic">Akoestisch</option>
                  <option value="electric">Elektrisch</option>
                </select>
              </label>
            </div>
            <div className="rhythm-pulses" aria-label="Hoofdpulsen">
              {Array.from(
                {
                  length:
                    configuration.meter.beatUnit === 8
                      ? 2
                      : configuration.meter.beats,
                },
                (_, i) => (
                  <span
                    className={
                      'rhythm-pulse ' +
                      (audio.snapshot.position &&
                      Math.floor(
                        audio.snapshot.position.step /
                          (configuration.meter.beatUnit === 8 ? 6 : 4),
                      ) === i
                        ? 'is-playing'
                        : '')
                    }
                    key={i}
                  >
                    {i + 1}
                  </span>
                ),
              )}
            </div>
            <p className="rhythm-position" aria-live="off">
              {audio.snapshot.position
                ? 'Hoofdpuls ' +
                  (Math.floor(
                    audio.snapshot.position.step /
                      (configuration.meter.beatUnit === 8 ? 6 : 4),
                  ) +
                    1) +
                  ' · maat ' +
                  (audio.snapshot.position.bar + 1)
                : 'Klaar om te beginnen'}{' '}
              ·{' '}
              {configuration.meter.beatUnit === 8
                ? 'BPM = gepunte kwart; twee hoofdpulsen per maat'
                : 'BPM = kwartnoot'}
            </p>
            <RhythmTimeline
              pattern={pattern}
              selected={Math.min(selected, slots - 1)}
              select={setSelected}
              disabled={busy}
              activeStep={audio.snapshot.position?.step ?? null}
            />
            <div className="rhythm-editor-controls">
              <label className="gs-field">
                Slag
                <select
                  className="gs-input"
                  disabled={locked}
                  value={rest ? 'rest' : stroke}
                  onChange={(e) => {
                    setRest(e.target.value === 'rest');
                    if (e.target.value !== 'rest')
                      setStroke(e.target.value as 'up' | 'down');
                  }}
                >
                  <option value="down">↓ Neerslag</option>
                  <option value="up">↑ Opslag</option>
                  <option value="rest">Rust</option>
                </select>
              </label>
              <label className="gs-field">
                Duur
                <select
                  className="gs-input"
                  value={duration}
                  disabled={locked}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  {[
                    [1, 'Hele'],
                    [2, 'Halve'],
                    [4, 'Kwart'],
                    [8, 'Achtste'],
                    [16, 'Zestiende'],
                  ].map(([n, label]) => (
                    <option value={n} key={n}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="gs-field practice-confirm">
                <input
                  type="checkbox"
                  checked={accent}
                  disabled={locked || rest}
                  onChange={(e) => setAccent(e.target.checked)}
                />
                Accent
              </label>
              <button
                className="gs-button"
                disabled={locked}
                onClick={() => edit('put')}
              >
                Plaats / wijzig event
              </button>
              <button
                className="gs-button"
                disabled={locked}
                onClick={() => edit('erase')}
              >
                Wis event
              </button>
              <button
                className="gs-button"
                disabled={locked || !history.length}
                onClick={() => {
                  const prior = history.at(-1)!;
                  setHistory((h) => h.slice(0, -1));
                  change(prior);
                  setSelected((slot) =>
                    Math.min(
                      slot,
                      (prior.meter.beats * 16) / prior.meter.beatUnit - 1,
                    ),
                  );
                }}
              >
                Undo patroon
              </button>
            </div>
            <p className="practice-hint">
              Kies een tijdpositie en plaats of wijzig de slag. Pijltjes, Home
              en End verplaatsen de selectie. — = aanhouden; · = stilte. Overlap
              wordt geweigerd.
            </p>
          </section>
          <details className="gs-panel practice-ramp">
            <summary>Tempo opbouwen · optioneel</summary>
            <div className="practice-controls">
              <label className="gs-field practice-confirm">
                <input
                  type="checkbox"
                  checked={t.ramp.enabled}
                  disabled={locked}
                  onChange={(e) =>
                    change({
                      ...configuration,
                      transport: {
                        ...t,
                        ramp: { ...t.ramp, enabled: e.target.checked },
                      },
                    })
                  }
                />
                Tempo-opbouw aan
              </label>
              {(
                [
                  ['start', 'Starttempo', 20, 300],
                  ['target', 'Doeltempo', 20, 300],
                  ['step', 'BPM-stap', 1, 40],
                  ['everyBars', 'Maten per stap', 1, 100],
                ] as const
              ).map(([key, label, min, max]) => (
                <NumericField
                  key={key}
                  label={label}
                  value={t.ramp[key]}
                  min={min}
                  max={max}
                  disabled={locked}
                  change={(n) =>
                    change({
                      ...configuration,
                      transport: { ...t, ramp: { ...t.ramp, [key]: n } },
                    })
                  }
                />
              ))}
            </div>
            <p>
              Verhoging uitsluitend op de maatgrens. Richttempo is geen
              beheersbeoordeling.
            </p>
          </details>
          <PracticeTransport
            configuration={configuration}
            change={change}
            audio={audio}
            start={() => void start()}
            pause={pause}
            stop={stop}
            finish={finish}
            busy={busy}
          />
        </div>
        <aside className="gs-panel practice-instructions">
          <p className="eyebrow">ZO OEFEN JE</p>
          <h2>Begin rustig.</h2>
          {exercise.instructions.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
          <dl>
            <dt>Starttempo</dt>
            <dd>{exercise.startBpm} BPM</dd>
            <dt>Richttempo</dt>
            <dd>{exercise.targetBpm} BPM</dd>
            <dt>Oefenduur</dt>
            <dd>± {Math.round(exercise.estimatedSeconds / 60)} min</dd>
          </dl>
          <p>
            {mastery
              ? 'Deze opgeslagen configuratie is expliciet beheerst.'
              : 'Zelf beoordelen: geen automatische spelbeoordeling.'}
          </p>
          <button
            className="gs-button"
            disabled={busy}
            onClick={() => {
              if (saving.current) return;
              saving.current = true;
              setBusy(true);
              void persist()
                .then(() => setNotice('Instellingen opgeslagen.'))
                .catch((err) =>
                  setError(String(err instanceof Error ? err.message : err)),
                )
                .finally(() => {
                  saving.current = false;
                  setBusy(false);
                });
            }}
          >
            Instellingen opslaan
          </button>
          <p role="status">
            {dirty
              ? 'Niet opgeslagen wijzigingen'
              : 'Instellingen bewaard / geladen'}
          </p>
          {hasRun && (
            <>
              <p>Rond je sessie af voordat je het patroon wijzigt.</p>
              <button
                className="gs-button gs-danger"
                onClick={() => {
                  if (confirm('Deze ongeregistreerde sessie verwerpen?')) {
                    stop();
                    audio.reset();
                    setStartedAt(null);
                  }
                }}
              >
                Sessie verwerpen
              </button>
            </>
          )}
        </aside>
      </div>
      {error && (
        <p className="gs-notice gs-notice--error" role="alert">
          {error}{' '}
          <button className="gs-button" onClick={() => setError('')}>
            Melding sluiten
          </button>
          <button
            className="gs-button"
            disabled={busy}
            onClick={() => choose(exercise.id)}
          >
            Instellingen opnieuw laden
          </button>
        </p>
      )}
      {notice && (
        <p className="gs-notice gs-notice--success" role="status">
          {notice}
        </p>
      )}
      {dialog && (
        <PracticeSessionDialog
          configuration={configuration}
          seconds={metrics.seconds}
          bars={metrics.bars}
          bpm={metrics.bpm}
          startedAt={startedAt ?? new Date().toISOString()}
          save={saveSession}
          close={() => setDialog(false)}
        />
      )}
    </div>
  );
}
