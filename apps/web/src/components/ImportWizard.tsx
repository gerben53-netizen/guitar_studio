import { useId, useRef, useState } from 'react';
import type { SongRecord } from '../../../../packages/music-domain/src/workspace';
import type {
  ImportCommit,
  ImportDocument,
} from '../../../../packages/music-domain/src/song-import-model';
import { Dialog } from './Dialog';
import { DiscoverySearch } from './DiscoverySearch';
import type { DiscoveryDetail } from '../../../../packages/shared/src/discovery';
import { request } from '../api';
export function ImportWizard({
  close,
  commit,
  records,
}: {
  close: () => void;
  commit: (input: ImportCommit) => Promise<void>;
  records: SongRecord[];
}) {
  const errorId = useId(),
    requestId = useRef(crypto.randomUUID()),
    saving = useRef(false);
  const [step, setStep] = useState(0),
    [title, setTitle] = useState(''),
    [artist, setArtist] = useState(''),
    [text, setText] = useState(''),
    [kind, setKind] = useState<'manual' | 'text-file' | 'search'>('manual'),
    [source, setSource] = useState('Eigen tekst'),
    [format, setFormat] = useState<'auto' | 'lyrics' | 'chordpro' | 'ascii'>(
      'auto',
    ),
    [rights, setRights] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<ImportDocument | null>(null),
    [target, setTarget] = useState('new-song'),
    [songId, setSongId] = useState(''),
    [arrangementId, setArrangementId] = useState('');
  const [personal, setPersonal] = useState<DiscoveryDetail | null>(null);
  function edited() {
    requestId.current = crypto.randomUUID();
    setPreview(null);
  }
  const input = () => ({
    text,
    title,
    artist,
    sourceName: source,
    format,
    method: kind === 'text-file' ? ('file' as const) : ('paste' as const),
    ...(personal?.personalImportReceipt
      ? { personalReceipt: personal.personalImportReceipt }
      : {}),
  });
  async function file(file?: File) {
    if (!file) return;
    if (file.size > 240000 || !/\.(txt|cho|chordpro|pro)$/i.test(file.name)) {
      setError(
        'Kies een UTF-8 .txt, .cho, .chordpro of .pro-bestand van maximaal 240 KB en 60.000 tekens.',
      );
      return;
    }
    try {
      const value = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (
        value.length > 60000 ||
        [...value].some(
          (c) => c.charCodeAt(0) < 32 && !['\t', '\r', '\n'].includes(c),
        )
      )
        throw new Error();
      edited();
      setText(value);
      setSource(file.name);
      setError('');
    } catch {
      setError(
        'Het bestand bevat geen geldige UTF-8 tekst of overschrijdt de tekstlimiet.',
      );
    }
  }
  async function next() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      if (step === 1 && !rights)
        throw new Error('Bevestig eerst het gebruiksrecht.');
      if (step < 2) {
        const doc = await request<ImportDocument>('/imports/preview', {
          method: 'POST',
          body: JSON.stringify(input()),
        });
        if (!doc.title.trim()) throw new Error('Geef je song een titel.');
        setTitle(doc.title);
        setArtist(doc.artist);
        setPreview(doc);
        if (
          step === 1 &&
          ['invalid', 'correction-required'].includes(doc.status)
        )
          throw new Error(
            'Handmatige correctie vereist. Controleer de waarschuwingen en pas de bron aan.',
          );
        setStep(step + 1);
      } else {
        const existing = records.find((r) => r.song.id === songId);
        if (target !== 'new-song' && !existing)
          throw new Error('Kies een bestaande song.');
        const destination: ImportCommit['target'] =
          target === 'new-song'
            ? { kind: 'new-song' }
            : target === 'new-arrangement'
              ? {
                  kind: 'new-arrangement',
                  songId,
                  revision: existing!.revision,
                }
              : {
                  kind: 'append',
                  songId,
                  arrangementId,
                  revision: existing!.revision,
                };
        await commit({
          requestId: requestId.current,
          confirmed: true,
          rightsConfirmed: true,
          personalUseConfirmed: !!personal && rights,
          input: input(),
          target: destination,
        });
        close();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Import mislukt. Probeer opnieuw met dezelfde import-ID.',
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog title="Een nieuwe song" onClose={close} dismissible={!busy}>
      <p className="muted">Begin met woorden. De muziek zoek jij uit.</p>
      <div className="steps">
        {['01 Bron kiezen', '02 Lyrics controleren', '03 Secties & klaar'].map(
          (s, i) => (
            <span key={s} className={step === i ? 'on' : ''}>
              {s}
            </span>
          ),
        )}
      </div>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="notice danger gs-notice gs-danger"
        >
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="import-fields">
        {step === 0 ? (
          <>
            <div className="seg">
              {(
                [
                  ['search', 'Zoeken'],
                  ['manual', 'Plakken'],
                  ['text-file', 'Tekstbestand'],
                ] as const
              ).map(([v, n]) => (
                <button
                  key={v}
                  className={'gs-button ' + (kind === v ? 'active' : '')}
                  onClick={() => {
                    edited();
                    setPersonal(null);
                    if (personal) {
                      setText('');
                      setTitle('');
                      setArtist('');
                      setSource('Eigen tekst');
                    }
                    setRights(false);
                    setKind(v);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            {kind === 'search' ? (
              <DiscoverySearch
                onSelect={(detail) => {
                  edited();
                  setPersonal(detail);
                  setRights(false);
                  setFormat('lyrics');
                  setTitle(detail.result.title);
                  setArtist(detail.result.artist);
                  setSource('LRCLIB');
                  setText(
                    detail.document.sections
                      .map((s) => s.lines.join('\n'))
                      .join('\n\n'),
                  );
                  setStep(1);
                  setError('');
                }}
              />
            ) : (
              <>
                <div className="import-metadata-fields">
                  <label className="gs-field">
                    Titel
                    <input
                      className="gs-input"
                      aria-label="Songtitel"
                      maxLength={200}
                      value={title}
                      onChange={(e) => {
                        edited();
                        setTitle(e.target.value);
                      }}
                    />
                  </label>
                  <label className="gs-field">
                    Artiest
                    <input
                      className="gs-input"
                      maxLength={200}
                      value={artist}
                      onChange={(e) => {
                        edited();
                        setArtist(e.target.value);
                      }}
                    />
                  </label>
                </div>
                {kind === 'text-file' && (
                  <label className="gs-field">
                    Lokaal UTF-8 tekstbestand
                    <input
                      className="gs-input"
                      type="file"
                      accept=".txt,.cho,.chordpro,.pro,text/plain"
                      onChange={(e) => void file(e.target.files?.[0])}
                    />
                  </label>
                )}
                <label className="gs-field">
                  Formaat
                  <select
                    className="gs-input"
                    aria-label="Formaat"
                    value={format}
                    onChange={(e) => {
                      edited();
                      setFormat(e.target.value as typeof format);
                    }}
                  >
                    {[
                      ['auto', 'Automatisch herkennen'],
                      ['lyrics', 'Lyrics en akkoorden'],
                      ['chordpro', 'ChordPro'],
                      ['ascii', 'ASCII-tab'],
                    ].map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="gs-field">
                  Eigen lyrics (optioneel)
                  <textarea
                    className="gs-input"
                    maxLength={60000}
                    value={text}
                    onChange={(e) => {
                      edited();
                      setText(e.target.value);
                    }}
                  />
                </label>
              </>
            )}
          </>
        ) : step === 1 ? (
          <>
            <p className="notice gs-notice">
              {personal
                ? 'Songtekst uit LRCLIB. Deze communitytekst kan fouten bevatten. Controleer de inhoud voor je persoonlijke bibliotheek. '
                : ''}
              Controleer tekst en metadata vóór opslag. Sectiekoppen, lege
              regels, akkoordkolommen en onzekere tabnotatie blijven behouden.
              Ga terug om titel, artiest of formaat te corrigeren.
            </p>
            {personal && (
              <>
                <div className="import-metadata-fields">
                  <label className="gs-field">
                    Titel
                    <input
                      className="gs-input"
                      aria-label="Songtitel"
                      maxLength={200}
                      value={title}
                      onChange={(e) => {
                        edited();
                        setTitle(e.target.value);
                      }}
                    />
                  </label>
                  <label className="gs-field">
                    Artiest
                    <input
                      className="gs-input"
                      maxLength={200}
                      value={artist}
                      onChange={(e) => {
                        edited();
                        setArtist(e.target.value);
                      }}
                    />
                  </label>
                </div>
                <p>
                  <a
                    href={personal.result.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Bron: LRCLIB #{personal.result.id}
                  </a>{' '}
                  · {personal.result.album || 'Geen album'}
                </p>
                {personal.document.synchronization && (
                  <details>
                    <summary>Synchronisatiegegevens (milliseconden)</summary>
                    <pre className="import-source-text">
                      {JSON.stringify(
                        personal.document.synchronization,
                        null,
                        2,
                      )}
                    </pre>
                    <p className="muted">
                      Timing blijft bij de oorspronkelijke tekst; geen
                      automatische koppeling aan maten of gecorrigeerde woorden.
                    </p>
                  </details>
                )}
              </>
            )}
            <label className="gs-field">
              Controleer de lyrics
              <textarea
                className="gs-input"
                aria-label="Lyrics controleren"
                value={text}
                maxLength={60000}
                onChange={(e) => {
                  edited();
                  setText(e.target.value);
                }}
              />
            </label>
            <label className="gs-field">
              Bronvermelding
              <input
                className="gs-input"
                maxLength={300}
                readOnly={!!personal}
                value={source}
                onChange={(e) => {
                  edited();
                  setSource(e.target.value);
                }}
              />
            </label>
            <label className="rights-confirmation gs-field">
              <input
                className="gs-input"
                type="checkbox"
                checked={rights}
                aria-invalid={!!error && !rights}
                aria-describedby={error && !rights ? errorId : undefined}
                onChange={(e) => {
                  requestId.current = crypto.randomUUID();
                  setRights(e.target.checked);
                }}
              />
              {personal
                ? 'Ik voeg deze communitytekst uitsluitend toe aan mijn persoonlijke bibliotheek.'
                : 'Ik mag deze tekst opslaan en gebruiken (of voeg geen lyrics toe).'}
            </label>
          </>
        ) : (
          <>
            <p className="notice gs-notice">
              {title} · {artist || 'Eigen song'} · {source}
            </p>
            <label className="gs-field">
              Bestemming
              <select
                className="gs-input"
                aria-label="Bestemming"
                value={target}
                onChange={(e) => {
                  requestId.current = crypto.randomUUID();
                  setTarget(e.target.value);
                }}
              >
                <option value="new-song">Nieuwe song</option>
                <option value="new-arrangement">
                  Nieuw arrangement bij bestaande song
                </option>
                <option value="append">
                  Nieuwe secties aan bestaand arrangement toevoegen
                </option>
              </select>
            </label>
            {target !== 'new-song' && (
              <label className="gs-field">
                Bestaande song
                <select
                  className="gs-input"
                  aria-label="Bestaande song"
                  value={songId}
                  onChange={(e) => {
                    requestId.current = crypto.randomUUID();
                    setSongId(e.target.value);
                    setArrangementId('');
                  }}
                >
                  <option value="">Kies een song</option>
                  {records.map((r) => (
                    <option key={r.song.id} value={r.song.id}>
                      {r.song.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {target === 'append' && (
              <label className="gs-field">
                Bestaand arrangement
                <select
                  className="gs-input"
                  aria-label="Bestaand arrangement"
                  value={arrangementId}
                  onChange={(e) => {
                    requestId.current = crypto.randomUUID();
                    setArrangementId(e.target.value);
                  }}
                >
                  <option value="">Kies een arrangement</option>
                  {records
                    .find((r) => r.song.id === songId)
                    ?.song.arrangements.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <p className="muted">
              Bestaande gegevens blijven behouden. Toevoegen maakt alleen nieuwe
              secties; gewijzigde bronmetadata vereist een passend of nieuw
              arrangement.
            </p>
          </>
        )}
      </fieldset>
      {preview && step > 0 && (
        <section className="import-preview" aria-label="Importpreview">
          <h3>
            Importpreview ·{' '}
            {preview.status === 'valid'
              ? 'Geldig'
              : preview.status === 'warnings'
                ? 'Geldig met waarschuwingen'
                : preview.status === 'invalid'
                  ? 'Ongeldig'
                  : 'Handmatige correctie vereist'}
          </h3>
          <p>
            {preview.contentType} · {preview.format} · BPM{' '}
            {preview.metadata.bpm ?? 'onbekend'} · maat{' '}
            {preview.metadata.meter
              ? `${preview.metadata.meter.beats}/${preview.metadata.meter.beatUnit}`
              : 'onbekend'}{' '}
            · capo {preview.metadata.capo ?? 'onbekend'}
          </p>
          {preview.sections.map((s, i) => (
            <div className="section-preview" key={i}>
              <strong>{s.name}</strong>
              <pre className="import-source-text">{s.lines.join('\n')}</pre>
              {s.chords.length > 0 && (
                <p>
                  {s.chords
                    .map(
                      (c) =>
                        `${c.symbol} (regel ${c.line + 1}, kolom ${c.column})`,
                    )
                    .join(' · ')}
                </p>
              )}
            </div>
          ))}
          {preview.tabBlocks.map((b, i) => (
            <div key={i}>
              <pre className="import-tab-source">{b.raw}</pre>
              <p>
                {b.notes.length} noten · {b.barColumns.length} maatgrenzen ·
                ritme onzeker
              </p>
            </div>
          ))}
          {preview.warnings.map((w, i) => (
            <p key={i} className="notice gs-notice">
              {w}
            </p>
          ))}
          {preview.unrecognized.length > 0 && (
            <details>
              <summary>Niet-herkende bronfragmenten</summary>
              {preview.unrecognized.map((u, i) => (
                <pre className="import-source-text" key={i}>
                  {u.text}
                </pre>
              ))}
            </details>
          )}
          <details>
            <summary>Oorspronkelijke bron</summary>
            <pre className="import-source-text">{preview.rawText}</pre>
          </details>
        </section>
      )}
      <footer className="dialog-actions">
        <button
          className="gs-button"
          disabled={busy}
          onClick={() => (step ? setStep(step - 1) : close())}
        >
          {step ? '← Terug' : 'Annuleren'}
        </button>
        <button
          className="primary gs-button gs-button--primary"
          disabled={
            busy ||
            (kind === 'search' && step === 0) ||
            (step === 2 && target === 'append' && !arrangementId)
          }
          aria-busy={busy}
          onClick={() => void next()}
        >
          {busy
            ? 'Aanmaken…'
            : step === 2
              ? personal
                ? 'Toevoegen aan mijn bibliotheek'
                : target === 'new-song'
                  ? 'Song aanmaken →'
                  : 'Import bevestigen →'
              : 'Verder →'}
        </button>
      </footer>
    </Dialog>
  );
}
