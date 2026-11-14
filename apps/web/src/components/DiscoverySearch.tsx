import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DiscoveryDetail,
  DiscoveryProviderInfo,
  DiscoverySearch as SearchResponse,
} from '../../../../packages/shared/src/discovery';
import { request } from '../api';
export function DiscoverySearch({
  onSelect,
}: {
  onSelect: (detail: DiscoveryDetail) => void;
}) {
  const [providers, setProviders] = useState<DiscoveryProviderInfo[]>([]),
    [provider, setProvider] = useState('lrclib'),
    [q, setQ] = useState(''),
    [title, setTitle] = useState(''),
    [artist, setArtist] = useState(''),
    [content, setContent] = useState('lyrics'),
    [result, setResult] = useState<SearchResponse | null>(null),
    [detail, setDetail] = useState<DiscoveryDetail | null>(null),
    [error, setError] = useState(''),
    [providerError, setProviderError] = useState(''),
    [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null),
    epoch = useRef(0);
  const providerRequest = useRef<AbortController | null>(null);
  const loadProviders = useCallback(async () => {
    providerRequest.current?.abort();
    const controller = new AbortController();
    providerRequest.current = controller;
    setProviderError('');
    try {
      const data = await request<DiscoveryProviderInfo[]>(
        '/discovery/providers',
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(8000),
          ]),
        },
      );
      if (!controller.signal.aborted) {
        setProviders(data);
        if (!data.length) setProviderError('Geen provider beschikbaar.');
      }
    } catch {
      if (!controller.signal.aborted)
        setProviderError('Providers niet bereikbaar. Probeer opnieuw.');
    }
  }, []);
  useEffect(() => {
    void loadProviders();
    return () => {
      providerRequest.current?.abort();
      current.current?.abort();
      epoch.current++;
    };
  }, [loadProviders]);
  function cancel() {
    current.current?.abort();
    epoch.current++;
    setBusy(false);
    setError('');
    setDetail(null);
    setResult(null);
  }
  async function run(id?: string) {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    const version = ++epoch.current;
    setBusy(true);
    setError('');
    setDetail(null);
    if (!id) setResult(null);
    try {
      if (id) {
        const data = await request<DiscoveryDetail>(
          `/discovery/results/${provider}/${id}`,
          { signal: controller.signal },
        );
        if (version === epoch.current) setDetail(data);
      } else {
        const params = new URLSearchParams({
          provider,
          contentType: content,
          limit: '20',
        });
        if (q.trim()) params.set('q', q.trim());
        else {
          if (title.trim()) params.set('title', title.trim());
          if (artist.trim()) params.set('artist', artist.trim());
        }
        const data = await request<SearchResponse>(
          '/discovery/search?' + params,
          { signal: controller.signal },
        );
        if (version === epoch.current) setResult(data);
      }
    } catch (e) {
      if (!controller.signal.aborted && version === epoch.current)
        setError(e instanceof Error ? e.message : 'Zoeken mislukt.');
    } finally {
      if (version === epoch.current) setBusy(false);
    }
  }
  return (
    <section className="song-discovery" aria-label="Online zoeken">
      {providerError && (
        <div>
          <p role="alert" className="notice danger gs-notice gs-danger">
            {providerError}
          </p>
          <button className="gs-button" onClick={() => void loadProviders()}>
            Providers opnieuw laden
          </button>
        </div>
      )}
      <label className="gs-field">
        Provider
        <select
          className="gs-input"
          aria-label="Provider"
          value={provider}
          onChange={(e) => {
            cancel();
            setProvider(e.target.value);
          }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p className="notice gs-notice">
        {providers.find((p) => p.id === provider)?.restrictions ??
          'Provider laden…'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label className="gs-field">
          Vrij zoeken
          <input
            className="gs-input"
            maxLength={200}
            value={q}
            onChange={(e) => {
              cancel();
              setQ(e.target.value);
            }}
          />
        </label>
        <div className="import-metadata-fields">
          <label className="gs-field">
            Zoektitel
            <input
              className="gs-input"
              disabled={!!q.trim()}
              maxLength={200}
              value={title}
              onChange={(e) => {
                cancel();
                setTitle(e.target.value);
              }}
            />
          </label>
          <label className="gs-field">
            Zoekartiest
            <input
              className="gs-input"
              disabled={!!q.trim()}
              maxLength={200}
              value={artist}
              onChange={(e) => {
                cancel();
                setArtist(e.target.value);
              }}
            />
          </label>
        </div>
        <label className="gs-field">
          Inhoudstype
          <select
            className="gs-input"
            aria-label="Inhoudstype"
            value={content}
            onChange={(e) => {
              cancel();
              setContent(e.target.value);
            }}
          >
            {[
              ['lyrics', 'Lyrics'],
              ['chords', 'Akkoorden'],
              ['tablature', 'Tablatuur'],
              ['mixed', 'Gemengd'],
            ].map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Vrij zoeken heeft voorrang. Maximaal 20 resultaten, zonder paginering.
          Alleen zoeken na bevestiging.
        </p>
        <button
          className="gs-button"
          type="submit"
          disabled={
            busy ||
            !providers.length ||
            !(q.trim() || title.trim() || artist.trim())
          }
        >
          {busy ? 'Laden…' : 'Online zoeken'}
        </button>
      </form>
      {error && (
        <p role="alert" className="notice danger gs-notice gs-danger">
          {error}
        </p>
      )}
      {result && (
        <div aria-live="polite">
          {result.results.length ? (
            <p>
              {result.results.length} resultaten · {result.apiVersion}
            </p>
          ) : (
            <p>Geen resultaten voor deze zoekopdracht of dit inhoudstype.</p>
          )}
          <ul className="discovery-results">
            {result.results.map((r) => (
              <li key={r.id}>
                <strong>{r.title}</strong> · {r.artist}
                <p>
                  {r.album || 'Geen album'} · {r.duration} s ·{' '}
                  {r.instrumental
                    ? 'Instrumentaal'
                    : [
                        r.hasPlainLyrics && 'Plain lyrics',
                        r.hasSyncedLyrics && 'LRC-regeltiming',
                        r.hasWordSync && 'Woordtiming',
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Alleen metadata'}
                </p>
                <a href={r.sourceUrl} target="_blank" rel="noreferrer">
                  Externe bron
                </a>{' '}
                <button
                  className="gs-button"
                  disabled={busy}
                  onClick={() => void run(r.id)}
                >
                  Selecteren: {r.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {detail && (
        <section aria-label="Lyrics-preview" className="section-preview">
          <h3>
            {detail.result.title} · {detail.result.artist}
          </h3>
          <a href={detail.result.sourceUrl} target="_blank" rel="noreferrer">
            Bron: LRCLIB #{detail.result.id}
          </a>
          <p>
            {detail.instrumental
              ? 'Instrumentaal nummer'
              : 'Tijdelijke lyrics-preview'}{' '}
            ·{' '}
            {detail.document.synchronization?.kind === 'word'
              ? 'Woordtiming'
              : detail.document.synchronization?.kind === 'line'
                ? 'LRC-regeltiming'
                : 'Zonder timing'}
          </p>
          <pre className="import-source-text">
            {detail.document.sections.map((s) => s.lines.join('\n')).join('\n')}
          </pre>
          {detail.document.synchronization && (
            <details>
              <summary>Synchronisatiegegevens (milliseconden)</summary>
              <pre className="import-source-text">
                {JSON.stringify(detail.document.synchronization, null, 2)}
              </pre>
            </details>
          )}
          {detail.document.warnings.map((w, i) => (
            <p key={i} className="notice gs-notice">
              {w}
            </p>
          ))}
          <p className="notice gs-notice">{detail.storageReason}</p>
          <button
            className="gs-button"
            disabled={!detail.personalImportReceipt || detail.instrumental}
            onClick={() => onSelect(detail)}
          >
            {detail.personalImportReceipt && !detail.instrumental
              ? 'Tekst controleren voor import'
              : 'Geen importeerbare songtekst'}
          </button>
        </section>
      )}
    </section>
  );
}
