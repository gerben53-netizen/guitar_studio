import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  cloneSong,
  ExportSchema,
  type SongRecord,
  type StudioSong,
} from '../../../packages/music-domain/src/workspace';
import { request, createSong, listSongs } from './api';
import { useSong } from './useSong';
import { Library, type SongAction } from './components/Library';
import { ImportWizard } from './components/ImportWizard';
import { Workspace } from './components/Workspace';
import './style.css';
function App() {
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
      return localStorage.getItem('theme') ?? 'dark';
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
    if (!(await editor.flush())) return;
    const rows = await refresh();
    const latest = rows?.find((r) => r.song.id === record.song.id);
    if (!latest) {
      setMessage('Deze song is niet beschikbaar.');
      return;
    }
    editor.load(latest);
    editor.change((s) => {
      s.lastOpened = new Date().toISOString();
    });
    setPage('workspace');
  }
  async function create(song: StudioSong) {
    if (!(await editor.flush()))
      throw new Error('Sla je huidige wijzigingen eerst op of exporteer ze.');
    const record = await createSong(song);
    setRecords((rows) => [record, ...rows]);
    editor.load(record);
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
        await createSong(cloneSong(current.song));
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
        if (editor.song?.id === song.id) editor.load(updated);
      }
      await refresh();
    } catch (error) {
      setMessage(String(error));
    }
  }
  function exportSong() {
    if (!editor.song) return;
    const content = JSON.stringify(
      { format: 'guitar-studio', version: 1, song: editor.song },
      null,
      2,
    );
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
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw new Error('JSON-bestand is groter dan 2 MB.');
      const data = ExportSchema.parse(JSON.parse(await file.text()));
      await create(cloneSong(data.song));
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
    <div className="shell">
      <nav className="rail" aria-label="Hoofdnavigatie">
        <div className="mark" aria-label="Guitar Studio">
          g
        </div>
        {[
          ['dashboard', '⌂', 'Start'],
          ['library', '▤', 'Songs'],
          ['workspace', '♧', 'Studio'],
        ].map(([value, icon, label]) => (
          <button
            key={value}
            aria-label={label}
            className={page === value ? 'active' : ''}
            disabled={
              value === 'workspace' &&
              !records.some((r) => r.song.id === editor.song?.id)
            }
            onClick={() => setPage(value!)}
          >
            <span className="icon" aria-hidden="true">
              {icon}
            </span>
            {label}
          </button>
        ))}
        <button aria-label="Nieuwe song" onClick={() => setWizard(true)}>
          <span className="icon" aria-hidden="true">
            ＋
          </span>
          Nieuw
        </button>
        <button
          aria-label="JSON importeren"
          onClick={() => importRef.current?.click()}
        >
          <span className="icon" aria-hidden="true">
            ↥
          </span>
          Import
        </button>
        <button
          className="bottom"
          aria-label="Thema wisselen"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <span className="icon" aria-hidden="true">
            ◐
          </span>
          Thema
        </button>
      </nav>
      <main className="main">
        <header className="top">
          <div className="brand">
            GUITAR <span>STUDIO</span>
          </div>
          <div className="studio-header-details">
            <small>Jouw muziek. Jouw ontdekking.</small>
            <span className="badge" role="status">
              {apiStatus}
            </span>
          </div>
        </header>
        {loadError && (
          <div className="notice danger" role="alert">
            {loadError}
            <button onClick={() => void refresh()}>Opnieuw laden</button>
          </div>
        )}
        {loading ? (
          <div className="empty" role="status">
            Je studio wordt geladen…
          </div>
        ) : page === 'dashboard' || page === 'library' ? (
          <Library
            records={records}
            dashboard={page === 'dashboard'}
            open={(r) => void open(r)}
            newSong={() => setWizard(true)}
            action={(r, a) => void action(r, a)}
          />
        ) : editor.song ? (
          <Workspace
            key={editor.song.id}
            song={editor.song}
            change={editor.change}
            status={editor.status}
            error={editor.error}
            retry={() => void editor.flush()}
            reload={async () => {
              if (
                confirm(
                  'Niet opgeslagen wijzigingen vervangen door de serverversie? Exporteer ze eerst als je ze wilt bewaren.',
                )
              ) {
                const rows = await refresh();
                const record = rows?.find((r) => r.song.id === editor.song?.id);
                if (record) editor.load(record);
              }
            }}
            undo={editor.undo}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            practice={page === 'practice'}
            setPractice={(p) => setPage(p ? 'practice' : 'workspace')}
            exportSong={exportSong}
            report={setMessage}
          />
        ) : null}
      </main>
      <input
        hidden
        type="file"
        accept="application/json,.json"
        ref={importRef}
        onChange={(e) => void importFile(e.target.files?.[0])}
      />
      {wizard && (
        <ImportWizard close={() => setWizard(false)} create={create} />
      )}
      <div className={'toast ' + (message ? 'visible' : '')} role="status">
        {message}
        {message && (
          <button aria-label="Melding sluiten" onClick={() => setMessage('')}>
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
