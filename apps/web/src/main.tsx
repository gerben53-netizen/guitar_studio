import {
  MultitrackExportSchema,
  cloneMultitrackSong,
  toMultitrack,
  type MultitrackSong,
} from '../../../packages/music-domain/src/multitrack';
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  cloneSong,
  ExportSchema,
  type SongRecord,
  type StudioSong,
} from '../../../packages/music-domain/src/workspace';
import { request, createSong, listSongs } from './api';
import type { ImportCommit } from '../../../packages/music-domain/src/song-import-model';
import { useSong } from './useSong';
import { Library, type SongAction } from './components/Library';
import { ImportWizard } from './components/ImportWizard';
import { WorkspaceV3, type PracticeHandoff } from './workspace-v3/WorkspaceV3';
import type { EditorCursor } from '../../../packages/music-domain/src/workspace-editor';
import type { MultitrackRecord } from '../../../packages/shared/src/multitrack-client';
import './style.css';
import { PracticeRoom } from './practice/PracticeRoom';
import type { PracticeGuard } from './practice/RhythmLab';
function App() {
  const practiceGuard = useRef<PracticeGuard>(() => true);
  const [originContext, setOriginContext] = useState<PracticeHandoff | null>(
    null,
  );
  const [returnCursor, setReturnCursor] = useState<EditorCursor | undefined>();
  const registerPracticeGuard = useCallback((guard: PracticeGuard) => {
    practiceGuard.current = guard;
  }, []);
  function navigate(next: string) {
    if (next === page) return;
    if (editor.locked) {
      setMessage('Rond Lyrics uitlijnen eerst af of annuleer het concept.');
      return;
    }
    if (!practiceGuard.current()) return;
    setPage(next);
  }
  const [apiStatus, setApiStatus] = useState('API controleren…');
  useEffect(() => {
    const controller = new AbortController();
    async function check() {
      try {
        const response = await fetch('/health', { signal: controller.signal });
        const health = await response.json();
        setApiStatus(
          response.ok && health.database === 'up'
            ? 'API + database beschikbaar'
            : 'API of database niet beschikbaar',
        );
      } catch {
        if (!controller.signal.aborted) setApiStatus('API niet bereikbaar');
      }
    }
    void check();
    const interval = setInterval(() => void check(), 15000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);
  const [records, setRecords] = useState<SongRecord[]>([]),
    [page, setPage] = useState('dashboard'),
    [wizard, setWizard] = useState(false),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const saved = useCallback(
    (record: SongRecord) =>
      setRecords((rows) =>
        rows.map((r) => (r.song.id === record.song.id ? record : r)),
      ),
    [],
  );
  const editor = useSong(saved);
  async function loadRecord(record: SongRecord) {
    try {
      const full = await request<MultitrackRecord>(
        '/songs/' + encodeURIComponent(record.song.id) + '/multitrack',
      );
      editor.load(record, full);
      return true;
    } catch {
      setMessage(
        'Volledige song kon niet worden geladen. Probeer opnieuw; er is niets gewijzigd.',
      );
      return false;
    }
  }
  const refresh = useCallback(async () => {
    try {
      const rows = await listSongs();
      setRecords(rows);
      setLoadError('');
      return rows;
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Bibliotheek niet bereikbaar',
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* Theme remains usable without storage. */
    }
  }, [theme]);
  async function open(record: SongRecord) {
    if (editor.locked || !practiceGuard.current()) return;
    if (!(await editor.flush())) return;
    const rows = await refresh();
    const latest = rows?.find((r) => r.song.id === record.song.id);
    if (!latest) {
      setMessage('Deze song is niet beschikbaar.');
      return;
    }
    if (!(await loadRecord(latest))) return;
    setReturnCursor(undefined);
    setPage('workspace');
  }
  async function importSong(input: ImportCommit) {
    if (editor.locked) throw Error('Rond Lyrics uitlijnen eerst af.');
    if (!practiceGuard.current() || !(await editor.flush()))
      throw new Error('Sla je huidige wijzigingen eerst op.');
    const record = await request<SongRecord>('/imports', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await refresh();
    if (!(await loadRecord(record)))
      throw new Error(
        'Song is opgeslagen maar kon niet volledig worden geopend. Open opnieuw vanuit de bibliotheek.',
      );
    setPage('workspace');
  }
  async function create(song: StudioSong | MultitrackSong) {
    if (editor.locked) throw Error('Rond Lyrics uitlijnen eerst af.');
    if (!practiceGuard.current())
      throw new Error('Je oefening is niet verlaten. Rond deze eerst af.');
    if (!(await editor.flush()))
      throw new Error('Sla je huidige wijzigingen eerst op of exporteer ze.');
    const record = await createSong(toMultitrack(song));
    setRecords((rows) => [record, ...rows]);
    if (!(await loadRecord(record)))
      throw new Error(
        'Song is opgeslagen maar kon niet volledig worden geopend. Open opnieuw vanuit de bibliotheek.',
      );
    setPage('workspace');
  }
  async function action(record: SongRecord, action: SongAction) {
    if (!(await editor.flush())) return;
    try {
      const current = (await listSongs()).find(
        (r) => r.song.id === record.song.id,
      );
      if (!current) throw new Error('Song niet gevonden.');
      if (action === 'duplicate') {
        if (current.storageSchemaVersion === 2) {
          const full = await request<{ document: MultitrackSong }>(
            '/songs/' + encodeURIComponent(current.song.id) + '/multitrack',
          );
          await createSong(cloneMultitrackSong(full.document));
        } else await createSong(toMultitrack(cloneSong(current.song)));
      } else if (action === 'delete') {
        if (
          !confirm(
            'Song “' +
              current.song.title +
              '” en de bijbehorende arrangementen definitief verwijderen? Andere songs blijven behouden.',
          )
        )
          return;
        await request(
          '/songs/' + current.song.id + '?revision=' + current.revision,
          { method: 'DELETE' },
        );
      } else {
        const song = structuredClone(current.song);
        if (action === 'favorite') song.favorite = !song.favorite;
        else song.archived = !song.archived;
        const updated = await request<SongRecord>('/songs/' + song.id, {
          method: 'PUT',
          body: JSON.stringify({ song, revision: current.revision }),
        });
        if (editor.song?.id === song.id) await loadRecord(updated);
      }
      await refresh();
    } catch (error) {
      setMessage(String(error));
    }
  }
  function exportSong() {
    if (!editor.song) return;
    const data = { format: 'guitar-studio', version: 2, song: editor.document };
    const content = JSON.stringify(data, null, 2);
    const url = URL.createObjectURL(
      new Blob([content], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      editor.song.title.replace(/[^\p{L}\p{N}-]/gu, '_') + '.guitar.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function importFile(file?: File) {
    if (!file || editor.locked) return;
    try {
      if (file.size > 8_000_000)
        throw new Error('JSON-bestand is groter dan 8 MB.');
      const parsed = JSON.parse(await file.text());
      if (parsed?.format === 'guitar-studio' && parsed?.version === 2)
        await create(
          cloneMultitrackSong(MultitrackExportSchema.parse(parsed).song),
        );
      else {
        if (file.size > 2_000_000)
          throw new Error('Versie-1 JSON-bestand is groter dan 2 MB.');
        const data = ExportSchema.parse(parsed);
        await create(cloneSong(data.song));
      }
      setMessage('Eigen arrangementen geïmporteerd als onafhankelijke song.');
    } catch (error) {
      setMessage(
        'Import geweigerd: ' +
          (error instanceof Error ? error.message : 'ongeldig bestand'),
      );
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }
  return (
    <div className="shell gs-song-app">
      <nav className="rail" aria-label="Hoofdnavigatie">
        <div className="mark">
          <img
            className="gs-brand__mark"
            src="/brand/gs-mark.png"
            alt="Gitaar Studio"
            width="42"
            height="42"
          />
        </div>
        {[
          ['dashboard', '⌂', 'Start'],
          ['library', '▤', 'Songs'],
          ['workspace', '♧', 'Studio'],
          ['practice-room', '◎', 'Oefenen'],
        ].map(([value, icon, label]) => (
          <button
            key={value}
            aria-label={label}
            aria-current={page === value ? 'page' : undefined}
            className={'gs-button ' + (page === value ? 'active' : '')}
            disabled={
              value === 'workspace' &&
              !records.some((r) => r.song.id === editor.song?.id)
            }
            onClick={() => navigate(value!)}
          >
            <span className="icon" aria-hidden="true">
              {icon}
            </span>
            {label}
          </button>
        ))}
        <button
          className="gs-button"
          aria-label="Nieuwe song"
          disabled={editor.locked}
          onClick={() => setWizard(true)}
        >
          <span className="icon" aria-hidden="true">
            ＋
          </span>
          Nieuw
        </button>
        <button
          className="gs-button"
          aria-label="JSON importeren"
          disabled={editor.locked}
          onClick={() => importRef.current?.click()}
        >
          <span className="icon" aria-hidden="true">
            ↥
          </span>
          Import
        </button>
        <button
          className="bottom gs-button"
          aria-label="Thema wisselen"
          aria-pressed={theme === 'light'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <span className="icon" aria-hidden="true">
            ◐
          </span>
          Thema
        </button>
      </nav>
      <div className="main">
        <header className="top">
          <div className="gs-brand">
            <img
              className="gs-brand__logo"
              src="/brand/gs-logo-original.png"
              alt="Gitaar Studio"
              width="176"
              height="59"
            />
          </div>
          <div className="studio-header-details">
            <small>Jouw muziek. Jouw ontdekking.</small>
            <span className="badge gs-badge" role="status">
              {apiStatus}
            </span>
          </div>
        </header>
        <main id="studio-content">
          {loadError && (
            <div className="notice danger gs-notice gs-danger" role="alert">
              {loadError}
              <button className="gs-button" onClick={() => void refresh()}>
                Opnieuw laden
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty" role="status">
              Je studio wordt geladen…
            </div>
          ) : page === 'practice-room' ? (
            <>
              {originContext && (
                <section className="gs-notice" aria-label="Songpassage">
                  <strong>{originContext.title}</strong>
                  <p>Oefenen vanuit de geselecteerde sporen en passage.</p>
                  <button
                    className="gs-button"
                    onClick={() =>
                      void (async () => {
                        if (!practiceGuard.current()) return;
                        const result = await request<{ status: string }>(
                          '/practice/origins/' + originContext.id,
                        );
                        if (result.status === 'available') {
                          const rows = await refresh();
                          const row = rows?.find(
                            (r) => r.song.id === editor.song?.id,
                          );
                          if (row && (await loadRecord(row))) {
                            setReturnCursor(originContext.cursor);
                            setPage('workspace');
                          }
                        } else {
                          setPage('library');
                          setMessage(
                            'De bron is gewijzigd of verwijderd. Je oorspronkelijke oefensnapshot blijft bewaard.',
                          );
                        }
                      })().catch(() =>
                        setMessage('Bron niet bereikbaar; probeer opnieuw.'),
                      )
                    }
                  >
                    Terug naar songpassage
                  </button>
                </section>
              )}
              <PracticeRoom registerGuard={registerPracticeGuard} />
            </>
          ) : page === 'dashboard' || page === 'library' ? (
            <Library
              records={records}
              dashboard={page === 'dashboard'}
              open={(r) => void open(r)}
              newSong={() => setWizard(true)}
              action={(r, a) => void action(r, a)}
            />
          ) : editor.song && editor.document ? (
            <WorkspaceV3
              key={editor.song.id}
              editor={editor}
              practice={page === 'practice'}
              setPractice={(p) => setPage(p ? 'practice' : 'workspace')}
              exportSong={exportSong}
              report={setMessage}
              openImport={() => setWizard(true)}
              openPracticeRoom={(context) => {
                setOriginContext(context);
                navigate('practice-room');
              }}
              {...(returnCursor ? { returnCursor } : {})}
              reload={async () => {
                if (
                  confirm(
                    'Niet opgeslagen wijzigingen vervangen? Exporteer ze eerst als je ze wilt bewaren.',
                  )
                ) {
                  const rows = await refresh();
                  const record = rows?.find(
                    (r) => r.song.id === editor.song?.id,
                  );
                  if (record) await loadRecord(record);
                }
              }}
            />
          ) : null}
        </main>
      </div>
      <input
        className="gs-input"
        hidden
        type="file"
        accept="application/json,.json"
        ref={importRef}
        onChange={(e) => void importFile(e.target.files?.[0])}
      />
      {wizard && (
        <ImportWizard
          close={() => setWizard(false)}
          commit={importSong}
          records={records}
        />
      )}
      <div className={'toast ' + (message ? 'visible' : '')} role="status">
        {message}
        {message && (
          <button
            className="gs-button"
            aria-label="Melding sluiten"
            onClick={() => setMessage('')}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
