import { useState } from 'react';
import {
  newSong,
  parseLyrics,
  type StudioSong,
} from '../../../../packages/music-domain/src/workspace';
import { Dialog } from './Dialog';
export function ImportWizard({
  close,
  create,
}: {
  close: () => void;
  create: (song: StudioSong) => Promise<void>;
}) {
  const [step, setStep] = useState(0),
    [title, setTitle] = useState(''),
    [artist, setArtist] = useState(''),
    [text, setText] = useState(''),
    [kind, setKind] = useState<'manual' | 'text-file'>('manual'),
    [source, setSource] = useState('Eigen tekst'),
    [rights, setRights] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function file(file?: File) {
    if (!file) return;
    if (file.size > 1_000_000 || !file.name.toLowerCase().endsWith('.txt')) {
      setError('Kies een UTF-8 .txt-bestand van maximaal 1 MB.');
      return;
    }
    try {
      const value = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (value.includes('\0')) throw new Error();
      setText(value);
      setSource(file.name);
      setError('');
    } catch {
      setError('Het bestand bevat geen geldige UTF-8 tekst.');
    }
  }
  return (
    <Dialog title="Een nieuwe song" onClose={close}>
      <p className="muted">Begin met woorden. De muziek zoek jij uit.</p>
      <div className="steps">
        {['01 Bron kiezen', '02 Lyrics controleren', '03 Secties & klaar'].map(
          (s, i) => (
            <span className={step === i ? 'on' : ''} key={s}>
              {s}
            </span>
          ),
        )}
      </div>
      {error && (
        <p role="alert" className="notice danger gs-notice gs-danger">
          {error}
        </p>
      )}
      {step === 0 ? (
        <>
          <div className="seg">
            <button
              className="gs-button"
              disabled
              title="Geen toegestane externe provider aangesloten"
            >
              Zoeken · niet beschikbaar
            </button>
            <button
              className={'gs-button ' + (kind === 'manual' ? 'active' : '')}
              onClick={() => setKind('manual')}
            >
              Plakken
            </button>
            <button
              className={'gs-button ' + (kind === 'text-file' ? 'active' : '')}
              onClick={() => setKind('text-file')}
            >
              Tekstbestand
            </button>
          </div>
          <div className="import-metadata-fields">
            <label className="gs-field">
              Titel
              <input
                className="gs-input"
                aria-label="Songtitel"
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="gs-field">
              Artiest
              <input
                className="gs-input"
                value={artist}
                maxLength={200}
                onChange={(e) => setArtist(e.target.value)}
              />
            </label>
          </div>
          {kind === 'text-file' && (
            <label className="gs-field">
              Lokaal UTF-8 tekstbestand
              <input
                className="gs-input"
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => void file(e.target.files?.[0])}
              />
            </label>
          )}
          <label className="gs-field">
            Eigen lyrics (optioneel)
            <textarea
              className="gs-input"
              value={text}
              maxLength={60000}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        </>
      ) : step === 1 ? (
        <>
          <p className="notice gs-notice">
            Geen zoekdienst of scraping. Zonder lyrics kun je gewoon verder.
            Gebruik [Couplet 1] en [Refrein] voor sectievoorstellen; lege regels
            blijven tekstregels.
          </p>
          <label className="gs-field">
            Controleer de lyrics
            <textarea
              className="gs-input"
              aria-label="Lyrics controleren"
              value={text}
              maxLength={60000}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <label className="gs-field">
            Bronvermelding
            <input
              className="gs-input"
              value={source}
              maxLength={300}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label className="rights-confirmation gs-field">
            <input
              className="gs-input"
              type="checkbox"
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
            />
            Ik mag deze tekst opslaan en gebruiken (of voeg geen lyrics toe).
          </label>
        </>
      ) : (
        <>
          <p className="notice gs-notice">
            {title} · {artist || 'Eigen song'} · {source}
          </p>
          {parseLyrics(text).map((s, i) => (
            <div className="section-preview" key={i}>
              <strong>{s.name}</strong>
              <p className="muted">
                {s.text.split('\n').length} tekstregels · lege tablatuur
              </p>
            </div>
          ))}
          <p className="muted">
            Deze voorgestelde secties worden aangemaakt. Ga terug om koppen te
            wijzigen.
          </p>
        </>
      )}
      <footer className="dialog-actions">
        <button
          className="gs-button"
          onClick={() => (step ? setStep(step - 1) : close())}
        >
          {step ? '← Terug' : 'Annuleren'}
        </button>
        <button
          className="primary gs-button gs-button--primary"
          disabled={busy}
          onClick={async () => {
            if (!title.trim()) {
              setError('Geef je song een titel.');
              return;
            }
            if (step === 1 && !rights) {
              setError('Bevestig eerst het gebruiksrecht.');
              return;
            }
            setError('');
            if (step < 2) {
              setStep(step + 1);
              return;
            }
            setBusy(true);
            try {
              await create(newSong(title.trim(), artist, text, kind, source));
              close();
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : 'Song aanmaken mislukt',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Aanmaken…' : step === 2 ? 'Song aanmaken →' : 'Verder →'}
        </button>
      </footer>
    </Dialog>
  );
}
