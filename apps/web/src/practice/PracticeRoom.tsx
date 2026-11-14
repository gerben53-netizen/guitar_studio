import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPracticeClient,
  type PracticeSettingsRecord,
  type SessionPage,
} from '../../../../packages/shared/src/practice-client';
import type {
  Exercise,
  PracticeProgress,
} from '../../../../packages/music-domain/src/practice';
import type { PracticePreferences } from '../../../../packages/music-domain/src/practice-transport';
import { request } from '../api';
import { RhythmLab, type PracticeGuard } from './RhythmLab';
import { elapsed } from './PracticeTransport';
const client = createPracticeClient(request);
const labs = [
  {
    id: 'rhythm',
    name: 'Rhythm Lab',
    description: 'Vind je puls. Speel met ruimte.',
    path: 'M0 36h12V12h10v30h12V4h10v38h12V18h10v24h12V10h10v32h12',
  },
  {
    id: 'scale',
    name: 'Scale Lab',
    description: 'Ontdek de logica op je gitaarhals.',
    path: 'M0 8h100M0 20h100M0 32h100M0 44h100M16 0v50M40 0v50M64 0v50M88 0v50',
  },
  {
    id: 'chord',
    name: 'Chord Lab',
    description: 'Laat je akkoorden soepel verbinden.',
    path: 'M10 0v50M30 0v50M50 0v50M70 0v50M90 0v50M0 10h100M0 25h100M0 40h100',
  },
  {
    id: 'technique',
    name: 'Technique Lab',
    description: 'Kleine bewegingen. Meer controle.',
    path: 'M0 45Q12 10 20 45M30 45Q40 0 50 45M60 45Q70 10 80 45M90 45V4',
  },
] as const;
const levels = ['Basis', 'Ontwikkeling', 'Toepassing', 'Verdieping'] as const;
export function PracticeRoom({
  registerGuard,
}: {
  registerGuard: (guard: PracticeGuard) => void;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]),
    [progress, setProgress] = useState<PracticeProgress[]>([]),
    [sessions, setSessions] = useState<SessionPage | null>(null),
    [recentSessions, setRecentSessions] = useState<SessionPage['items']>([]),
    [preferences, setPreferences] = useState<PracticePreferences>({
      goals: [],
      lastExerciseId: null,
      revision: 0,
    }),
    [goals, setGoals] = useState(''),
    [route, setRoute] = useState('home'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<{
      exercise: Exercise;
      settings: PracticeSettingsRecord;
    } | null>(null),
    [search, setSearch] = useState(''),
    [lab, setLab] = useState(''),
    [level, setLevel] = useState(''),
    [category, setCategory] = useState(''),
    [offset, setOffset] = useState(0);
  const pref = useRef(preferences),
    childGuard = useRef<PracticeGuard>(() => true),
    goalPending = useRef(false),
    selecting = useRef(false),
    loaded = useRef(false),
    loadGeneration = useRef(0);
  pref.current = preferences;
  goalPending.current = goals !== preferences.goals.join('\n');
  const setGuard = useCallback((guard: PracticeGuard) => {
    childGuard.current = guard;
  }, []);
  useEffect(() => {
    registerGuard(() => {
      if (
        goalPending.current &&
        !confirm(
          'Je leerdoelen zijn nog niet opgeslagen. Toch verlaten en deze tekst verwerpen?',
        )
      )
        return false;
      return childGuard.current();
    });
    const leave = (e: BeforeUnloadEvent) => {
      if (goalPending.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => {
      registerGuard(() => true);
      window.removeEventListener('beforeunload', leave);
    };
  }, [registerGuard]);
  const refresh = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        client.allProgress(),
        client.sessions({ limit: 20, offset: 0 }),
      ]);
      setProgress(p);
      setSessions(s);
      setRecentSessions(s.items);
      setOffset(0);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  }, []);
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError('');
    try {
      const [e, p, s, settings] = await Promise.all([
        client.exercises(),
        client.allProgress(),
        client.sessions({ limit: 20 }),
        client.preferences(),
      ]);
      if (generation !== loadGeneration.current) return;
      setExercises(e);
      setProgress(p);
      setSessions(s);
      setRecentSessions(s.items);
      setPreferences(settings);
      pref.current = settings;
      setGoals(settings.goals.join('\n'));
      loaded.current = true;
    } catch (err) {
      if (generation === loadGeneration.current)
        setError(String(err instanceof Error ? err.message : err));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      loadGeneration.current++;
    };
  }, [load]);
  async function choose(id: string) {
    if (selecting.current) return;
    const exercise = exercises.find((e) => e.id === id);
    if (!exercise || exercise.lab !== 'rhythm') return;
    if (selected && !childGuard.current()) return;
    selecting.current = true;
    setBusy(true);
    setError('');
    try {
      const settings = await client.settings(id);
      const next = await client.savePreferences({
        ...pref.current,
        lastExerciseId: id,
      });
      setPreferences(next);
      pref.current = next;
      setSelected({ exercise, settings });
      setRoute('rhythm');
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      selecting.current = false;
      setBusy(false);
    }
  }
  async function saveGoals() {
    if (selecting.current) return;
    selecting.current = true;
    setBusy(true);
    try {
      const next = await client.savePreferences({
        ...pref.current,
        goals: goals
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setPreferences(next);
      pref.current = next;
      setGoals(next.goals.join('\n'));
      setError('');
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      selecting.current = false;
      setBusy(false);
    }
  }
  const status = (id: string) => progress.find((p) => p.exerciseId === id);
  const statusText = (id: string) => {
    const p = status(id);
    return p?.mastered
      ? 'Beheerst'
      : p?.masteredConfigurations
        ? 'Configuratie beheerst'
        : (p?.status ?? 'Nog niet begonnen');
  };
  const rhythm = exercises.filter((e) => e.lab === 'rhythm'),
    recommended =
      rhythm.find((e) => !status(e.id)?.masteredConfigurations) ?? rhythm[0];
  const latest = recentSessions[0],
    resume =
      exercises.find(
        (e) => e.id === preferences.lastExerciseId && e.lab === 'rhythm',
      ) ??
      rhythm.find((e) => e.id === latest?.exerciseId) ??
      recommended;
  const title = (id: string) => exercises.find((e) => e.id === id)?.title ?? id;
  const summary = (id: string) => {
    const ids = new Set(exercises.filter((e) => e.lab === id).map((e) => e.id)),
      rows = progress.filter((p) => ids.has(p.exerciseId));
    return {
      sessions: rows.reduce((n, p) => n + p.sessionCount, 0),
      mastered: rows.filter((p) => p.mastered || p.masteredConfigurations > 0)
        .length,
      bpm: Math.max(0, ...rows.map((p) => p.highestBpm ?? 0)),
      total: ids.size,
    };
  };
  function cards(rows: Exercise[]) {
    return (
      <div className="practice-exercise-grid">
        {rows.map((e) => (
          <article
            className="gs-panel practice-exercise"
            key={e.id}
            data-exercise-id={e.id}
          >
            <p className="eyebrow">
              {labs.find((l) => l.id === e.lab)?.name} · {e.level}
            </p>
            <h3>{e.title}</h3>
            <p>{e.goal}</p>
            <p className="muted">
              {e.category} · {e.startBpm} → {e.targetBpm} BPM · ±{' '}
              {Math.round(e.estimatedSeconds / 60)} min
            </p>
            <span className="gs-badge">{statusText(e.id)}</span>
            {e.lab === 'rhythm' ? (
              <button
                className="gs-button"
                disabled={busy}
                onClick={() => void choose(e.id)}
              >
                {status(e.id)?.sessionCount ? 'Hervatten' : 'Oefening openen'}
              </button>
            ) : (
              <p className="practice-future">
                Binnenkort beschikbaar · deze Lab is nog niet te starten.
              </p>
            )}
          </article>
        ))}
      </div>
    );
  }
  function journal() {
    return !sessions?.items.length ? (
      <p className="gs-notice">
        Nog geen oefensessies. Kies Rhythm Lab en bewaar je eerste uitvoering.
      </p>
    ) : (
      <>
        <div className="practice-journal">
          {(route === 'home' ? recentSessions.slice(0, 4) : sessions.items).map(
            (s) => (
              <article className="gs-panel practice-session" key={s.id}>
                <header className="practice-session-heading">
                  <h3>{title(s.exerciseId)}</h3>
                  <span className="gs-badge">{s.result}</span>
                </header>
                <p>
                  <time dateTime={s.endedAt}>
                    {new Date(s.endedAt).toLocaleString('nl-NL')}
                  </time>{' '}
                  ·{' '}
                  {s.instrument.type === 'acoustic'
                    ? 'Akoestisch'
                    : 'Elektrisch'}{' '}
                  · {s.bpm} BPM
                </p>
                <p>
                  {elapsed(s.durationSeconds)} · {s.repetitions} herhalingen ·
                  zelfbeoordeling {s.rating}/5
                </p>
                {s.notes && <p className="practice-session-note">{s.notes}</p>}
                {s.result === 'Beheerst' && (
                  <p className="muted">
                    Expliciet beheerst voor de vastgelegde configuratie.
                  </p>
                )}
                {exercises.find((e) => e.id === s.exerciseId)?.lab ===
                'rhythm' ? (
                  <button
                    className="gs-button"
                    disabled={busy}
                    onClick={() => void choose(s.exerciseId)}
                  >
                    Opnieuw oefenen
                  </button>
                ) : (
                  <p className="practice-future">Lab volgt later.</p>
                )}
              </article>
            ),
          )}
        </div>
        {route === 'progress' && (
          <div className="practice-controls">
            <button
              className="gs-button"
              disabled={offset === 0 || busy}
              onClick={() => void pageSessions(offset - 20)}
            >
              Vorige sessies
            </button>
            <span>
              {offset + 1}–{Math.min(offset + 20, sessions.total)} van{' '}
              {sessions.total}
            </span>
            <button
              className="gs-button"
              disabled={offset + 20 >= sessions.total || busy}
              onClick={() => void pageSessions(offset + 20)}
            >
              Volgende sessies
            </button>
          </div>
        )}
      </>
    );
  }
  async function pageSessions(next: number) {
    setBusy(true);
    try {
      setSessions(await client.sessions({ limit: 20, offset: next }));
      setOffset(next);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="gs-practice-app practice-room">
        <p role="status">Practice Room laden…</p>
      </div>
    );
  if (!loaded.current)
    return (
      <div className="gs-practice-app practice-room">
        <h1>Practice Room</h1>
        <p className="gs-notice gs-notice--error" role="alert">
          {error}
        </p>
        <button className="gs-button" onClick={() => void load()}>
          Opnieuw laden
        </button>
      </div>
    );
  return (
    <div className="gs-practice-app practice-room">
      <nav className="practice-nav" aria-label="Practice Room navigatie">
        {[
          ['home', 'Overzicht'],
          ['rhythm', 'Rhythm Lab'],
        ].map(([id, name]) => (
          <button
            className="gs-button"
            aria-current={route === id ? 'page' : undefined}
            key={id}
            disabled={busy}
            onClick={() =>
              id === 'rhythm' && !selected
                ? void choose(resume!.id)
                : setRoute(id!)
            }
          >
            {name}
          </button>
        ))}
        {labs.slice(1).map((l) => (
          <span className="practice-future-nav" key={l.id}>
            {l.name}
            <small>Binnenkort</small>
          </span>
        ))}
        {[
          ['library', 'Oefenbibliotheek'],
          ['path', 'Leerpad'],
          ['progress', 'Voortgang'],
        ].map(([id, name]) => (
          <button
            className="gs-button"
            key={id}
            aria-current={route === id ? 'page' : undefined}
            disabled={busy}
            onClick={() => {
              setRoute(id!);
              if (id === 'progress') void refresh();
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      {error && (
        <p className="gs-notice gs-notice--error" role="alert">
          {error}{' '}
          <button className="gs-button" onClick={() => setError('')}>
            Melding sluiten
          </button>
          <button
            className="gs-button"
            disabled={busy}
            onClick={() => {
              if (
                goalPending.current &&
                !confirm(
                  'Je lokale leerdoelen vervangen door de opgeslagen versie?',
                )
              )
                return;
              setBusy(true);
              void client
                .preferences()
                .then((p) => {
                  setPreferences(p);
                  pref.current = p;
                  setGoals(p.goals.join('\n'));
                  setError('');
                })
                .catch((err) => setError(String(err)))
                .finally(() => setBusy(false));
            }}
          >
            Voorkeuren herladen
          </button>
        </p>
      )}
      {route === 'home' && (
        <>
          <header className="practice-heading">
            <div>
              <p className="eyebrow">RUIMTE VOOR VOORUITGANG</p>
              <h1>Jouw Practice Room.</h1>
              <p>Werk aan je basis. Volg je nieuwsgierigheid. Maak muziek.</p>
            </div>
            <button className="gs-button" onClick={() => setRoute('library')}>
              Naar oefenbibliotheek
            </button>
          </header>
          <section className="gs-panel practice-welcome">
            <div>
              <p className="eyebrow">
                {latest
                  ? 'GA VERDER OP JOUW TEMPO'
                  : 'BEGIN MET EEN RUSTIGE PULS'}
              </p>
              <h2>{resume?.title ?? 'Kies een oefening'}</h2>
              <p>{resume?.goal}</p>
              <p>
                {resume
                  ? Math.round(resume.estimatedSeconds / 60) +
                    ' minuten · ' +
                    resume.startBpm +
                    ' BPM · Rhythm Lab'
                  : ''}
              </p>
              {resume && (
                <button
                  className="gs-button gs-button--primary"
                  disabled={busy}
                  onClick={() => void choose(resume.id)}
                >
                  {preferences.lastExerciseId
                    ? 'Oefening hervatten'
                    : 'Rhythm-oefening openen'}
                </button>
              )}
            </div>
            <div className="practice-welcome-art">
              <img src="/brand/gs-logo-original.png" alt="" />
            </div>
          </section>
          <div className="practice-lab-grid">
            {labs.map((l) => {
              const p = summary(l.id);
              return (
                <section className="gs-panel practice-lab-card" key={l.id}>
                  <svg viewBox="0 0 110 55" aria-hidden="true">
                    <path d={l.path} />
                  </svg>
                  <h2>{l.name}</h2>
                  <p>{l.description}</p>
                  <p className="muted">
                    {p.mastered}/{p.total} oefeningen met beheerste configuratie
                    · {p.bpm || '—'} BPM bereikt
                  </p>
                  <progress
                    value={p.mastered}
                    max={p.total || 1}
                    aria-label={'Beheerste configuraties ' + l.name}
                  />
                  {l.id === 'rhythm' ? (
                    <button
                      className="gs-button"
                      disabled={busy}
                      onClick={() => void choose(resume!.id)}
                    >
                      Rhythm Lab openen
                    </button>
                  ) : (
                    <p className="practice-future">Binnenkort beschikbaar</p>
                  )}
                </section>
              );
            })}
          </div>
          <div className="practice-home-grid">
            <section className="gs-panel practice-home-panel">
              <h2>Op je oefenstandaard</h2>
              <p>
                {latest
                  ? 'Laatst uitgevoerd: ' + title(latest.exerciseId)
                  : 'Nog geen sessies opgeslagen. Je voortgang begint met je eerste eigen uitvoering.'}
              </p>
              {recommended && (
                <>
                  <h3>Aanbevolen: {recommended.title}</h3>
                  <p>{recommended.goal}</p>
                  <button
                    className="gs-button"
                    disabled={busy}
                    onClick={() => void choose(recommended.id)}
                  >
                    Aanbevolen oefening openen
                  </button>
                </>
              )}
              <h3>Recente sessies</h3>
              {journal()}
            </section>
            <section className="gs-panel practice-home-panel">
              <h2>Jouw leerdoelen</h2>
              <label className="gs-field">
                Persoonlijke leerdoelen (maximaal 5, één per regel)
                <textarea
                  className="gs-input"
                  maxLength={1004}
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                />
              </label>
              <button
                className="gs-button"
                disabled={busy}
                onClick={() => void saveGoals()}
              >
                Leerdoelen opslaan
              </button>
              <p role="status">
                {goalPending.current
                  ? 'Leerdoelen nog niet opgeslagen'
                  : preferences.goals.length
                    ? 'Je leerdoelen zijn opgeslagen.'
                    : 'Nog geen persoonlijke leerdoelen ingesteld.'}
              </p>
              <button className="gs-button" onClick={() => setRoute('path')}>
                Bekijk je leerpad
              </button>
            </section>
          </div>
        </>
      )}
      {selected && (
        <div hidden={route !== 'rhythm'}>
          <RhythmLab
            key={selected.exercise.id + ':' + selected.settings.revision}
            exercise={selected.exercise}
            initial={selected.settings}
            client={client}
            active={route === 'rhythm'}
            guard={setGuard}
            saved={refresh}
            choose={(id) => void choose(id)}
            rhythmExercises={rhythm}
          />
        </div>
      )}
      {route === 'library' && (
        <>
          <header className="practice-heading">
            <div>
              <p className="eyebrow">KIES WAT BIJ JE PAST</p>
              <h1>Oefenbibliotheek</h1>
              <p>
                {exercises.length} originele oefeningen · alle niveaus vrij
                toegankelijk.
              </p>
            </div>
          </header>
          <div className="practice-controls">
            <label className="gs-field">
              Zoek oefening
              <input
                className="gs-input"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="gs-field">
              Labfilter
              <select
                className="gs-input"
                value={lab}
                onChange={(e) => {
                  setLab(e.target.value);
                  setCategory('');
                }}
              >
                <option value="">Alle Labs</option>
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="gs-field">
              Niveaufilter
              <select
                className="gs-input"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option value="">Alle niveaus</option>
                {levels.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="gs-field">
              Categoriefilter
              <select
                className="gs-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Alle categorieën</option>
                {[
                  ...new Set(
                    exercises
                      .filter((e) => !lab || e.lab === lab)
                      .map((e) => e.category),
                  ),
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <section aria-label="Oefeningen">
            <h2>Oefeningen</h2>
            {cards(
              exercises.filter(
                (e) =>
                  (!lab || e.lab === lab) &&
                  (!level || e.level === level) &&
                  (!category || e.category === category) &&
                  (e.title + ' ' + e.goal)
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
              ),
            )}
            {!exercises.some(
              (e) =>
                (!lab || e.lab === lab) &&
                (!level || e.level === level) &&
                (!category || e.category === category) &&
                (e.title + ' ' + e.goal)
                  .toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase()),
            ) && <p className="gs-notice">Geen oefeningen bij deze filters.</p>}
          </section>
        </>
      )}
      {route === 'path' && (
        <>
          <header className="practice-heading">
            <div>
              <p className="eyebrow">STAP VOOR STAP</p>
              <h1>Jouw leerpad</h1>
              <p>
                Geen vergrendelingen. Kies vrij je niveau en reflecteer op je
                eigen voortgang.
              </p>
            </div>
          </header>
          {preferences.goals.length > 0 && (
            <section className="gs-panel practice-home-panel">
              <h2>Persoonlijke doelen</h2>
              <ul>
                {preferences.goals.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </section>
          )}
          {levels.map((l) => (
            <section className="practice-level" key={l}>
              <h2>{l}</h2>
              {cards(exercises.filter((e) => e.level === l))}
            </section>
          ))}
        </>
      )}
      {route === 'progress' && (
        <>
          <header className="practice-heading">
            <div>
              <p className="eyebrow">JOUW OEFENDAGBOEK</p>
              <h1>Oefenvoortgang</h1>
              <p>
                Werkelijk opgeslagen sessies; beheersing is jouw expliciete
                zelfbeoordeling.
              </p>
            </div>
          </header>
          <div className="practice-lab-grid">
            {labs.map((l) => {
              const p = summary(l.id);
              return (
                <section className="gs-panel practice-lab-card" key={l.id}>
                  <h2>{l.name}</h2>
                  <p>{p.sessions} sessies</p>
                  <p>{p.mastered} oefeningen met beheerste configuratie</p>
                  <p>{p.bpm || '—'} BPM hoogst geregistreerd</p>
                </section>
              );
            })}
          </div>
          <section>
            <h2>Oefendagboek</h2>
            {journal()}
          </section>
        </>
      )}
    </div>
  );
}
