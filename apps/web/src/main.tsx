import {
  MultitrackExportSchema,
  cloneMultitrackSong,
  mergeLegacyWrite,
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
import { Workspace } from './components/Workspace';
import './style.css';
import { PracticeRoom } from './practice/PracticeRoom';
import type { PracticeGuard } from './practice/RhythmLab';
function App() {
  const practiceGuard = useRef<PracticeGuard>(() => true);
  const registerPracticeGuard = useCallback((guard: PracticeGuard) => {
    practiceGuard.current = guard;
  }, []);
  function navigate(next: string) {
    if (next === page) return;
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
  const fullSongCache = useRef(new Map<string, MultitrackSong>());
  async function loadRecord(record: SongRecord) {
    try {
      if (record.storageSchemaVersion === 2) {
        const full = await request<{ document: MultitrackSong }>(
          '/songs/' + encodeURIComponent(record.song.id) + '/multitrack',
        );
        fullSongCache.current.set(record.song.id, full.document);
      } else fullSongCache.current.delete(record.song.id);
      editor.load(record);
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
    if (!practiceGuard.current()) return;
    if (!(await editor.flush())) return;
    const rows = await refresh();
    const latest = rows?.find((r) => r.song.id === record.song.id);
    if (!latest) {
      setMessage('Deze song is niet beschikbaar.');
      return;
    }
    if (!(await loadRecord(latest))) return;
    editor.change((s) => {
      s.lastOpened = new Date().toISOString();
    });
    setPage('workspace');
  }
  async function importSong(input: ImportCommit) {
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
    if (!practiceGuard.current())
      throw new Error('Je oefening is niet verlaten. Rond deze eerst af.');
    if (!(await editor.flush()))
      throw new Error('Sla je huidige wijzigingen eerst op of exporteer ze.');
    const record = await createSong(song);
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
        } else await createSong(cloneSong(current.song));
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
    let data: unknown = {
      format: 'guitar-studio',
      version: 1,
      song: editor.song,
    };
    const full = fullSongCache.current.get(editor.song.id);
    if (full) {
      try {
        data = {
          format: 'guitar-studio',
          version: 2,
          song: mergeLegacyWrite(full, editor.song),
        };
      } catch {
        data = {
          format: 'guitar-studio-recovery',
          version: 1,
          canonicalBase: full,
          legacyDraft: editor.song,
        };
        setMessage(
          'Herstelbestand bevat alle sporen en je onopgeslagen tekst. Review de koppelingen vóór herstel.',
        );
      }
    }
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
    if (!file) return;
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
            <PracticeRoom registerGuard={registerPracticeGuard} />
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
                  const record = rows?.find(
                    (r) => r.song.id === editor.song?.id,
                  );
                  if (record) await loadRecord(record);
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
