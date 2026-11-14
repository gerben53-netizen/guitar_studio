import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../../../packages/ui/src/index';
import type { HealthResponse } from '../../../packages/shared/src/index';
import './style.css';
const pages = [
  'Dashboard',
  'Songbibliotheek',
  'Song Workspace',
  'Practice Mode',
];
function currentPage() {
  try {
    return decodeURIComponent(location.hash.slice(1)) || pages[0]!;
  } catch {
    return 'Pagina niet gevonden';
  }
}
function App() {
  const [page, setPage] = useState(currentPage);
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem('theme') ??
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const [status, setStatus] = useState('Controleren…');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);
  useEffect(() => {
    const change = () => setPage(currentPage());
    addEventListener('hashchange', change);
    return () => removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function check() {
      try {
        const response = await fetch('/health', { signal: controller.signal });
        const result: HealthResponse = await response.json();
        setStatus(
          response.ok && result.status === 'ok'
            ? 'API en database beschikbaar'
            : 'API of database niet beschikbaar',
        );
      } catch {
        if (!controller.signal.aborted) setStatus('API niet bereikbaar');
      }
    }
    void check();
    const timer = setInterval(() => void check(), 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  return (
    <>
      <header>
        <h1>Guitar Studio</h1>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? 'Licht thema' : 'Donker thema'}
        </button>
      </header>
      <nav aria-label="Hoofdnavigatie">
        {pages.map((p) => (
          <a
            key={p}
            href={'#' + encodeURIComponent(p)}
            aria-current={page === p ? 'page' : undefined}
          >
            {p}
          </a>
        ))}
      </nav>
      <main>
        <Panel title={pages.includes(page) ? page : 'Pagina niet gevonden'}>
          <p>
            Technische basis — deze werkruimte wordt in een volgende sprint
            uitgewerkt.
          </p>
        </Panel>
        <p role="status">{status}</p>
      </main>
      <footer>Sprint 0 · Akoestische en elektrische gitaar</footer>
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
