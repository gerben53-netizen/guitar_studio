import { useEffect, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { request } from '../api';
import { duplicateArrangement } from '../../../../packages/music-domain/src/workspace-editor';
import {
  lyricLines,
  toMultitrack,
  type MultitrackSong,
} from '../../../../packages/music-domain/src/multitrack';
import { uid, tokens } from '../../../../packages/music-domain/src/workspace';
interface Props {
  modal: string;
  song: MultitrackSong;
  arrangementId: string;
  change: (fn: (s: MultitrackSong) => void | MultitrackSong) => boolean;
  close: () => void;
  selectArrangement: (id: string) => void;
  exportSong: () => void;
}
export function WorkspaceDialogs(p: Props) {
  if (p.modal === 'metadata') return <Metadata {...p} />;
  if (p.modal === 'sections') return <Sections {...p} />;
  if (p.modal === 'history') return <History {...p} />;
  if (p.modal === 'arrangement')
    return (
      <Dialog title="Arrangement toevoegen" onClose={p.close}>
        <p>De huidige partijen en lyrics blijven behouden.</p>
        {[false, true].map((empty) => (
          <button
            key={String(empty)}
            className="gs-button"
            onClick={() => {
              let id = '';
              if (
                p.change((s) => {
                  const next = duplicateArrangement(s, p.arrangementId, empty);
                  id = next.lastArrangementId!;
                  return next;
                })
              ) {
                p.selectArrangement(id);
                p.close();
              }
            }}
          >
            {empty ? 'Leeg arrangement toevoegen' : 'Arrangement dupliceren'}
          </button>
        ))}
      </Dialog>
    );
  return null;
}
function Metadata(p: Props) {
  const [title, setTitle] = useState(p.song.title),
    [artist, setArtist] = useState(p.song.artist),
    [name, setName] = useState(
      p.song.arrangements.find((a) => a.id === p.arrangementId)!.name,
    );
  return (
    <Dialog title="Songgegevens" onClose={p.close}>
      <label className="gs-field">
        Songtitel
        <input
          className="gs-input"
          value={title}
          maxLength={200}
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
      <label className="gs-field">
        Arrangementnaam
        <input
          className="gs-input"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <footer className="dialog-actions">
        <button className="gs-button" onClick={p.close}>
          Annuleren
        </button>
        <button
          className="gs-button gs-button--primary"
          disabled={!title.trim() || !name.trim()}
          onClick={() => {
            if (
              p.change((s) => {
                s.title = title;
                s.artist = artist;
                s.arrangements.find((a) => a.id === p.arrangementId)!.name =
                  name;
              })
            )
              p.close();
          }}
        >
          Gegevens opslaan
        </button>
      </footer>
    </Dialog>
  );
}
function Sections(p: Props) {
  const [name, setName] = useState('Nieuwe sectie'),
    [text, setText] = useState('');
  const a = p.song.arrangements.find((a) => a.id === p.arrangementId)!;
  return (
    <Dialog title="Secties beheren" onClose={p.close}>
      {a.sections.map((s, i) => (
        <div key={s.id}>
          <span>
            {p.song.lyrics.find((l) => l.id === s.lyricsSectionId)?.name}
          </span>
          <button
            className="gs-button"
            disabled={!i}
            aria-label={'Sectie ' + (i + 1) + ' omhoog'}
            onClick={() =>
              p.change((doc) => {
                const sections = doc.arrangements.find(
                  (x) => x.id === a.id,
                )!.sections;
                [sections[i - 1], sections[i]] = [
                  sections[i]!,
                  sections[i - 1]!,
                ];
              })
            }
          >
            ↑
          </button>
        </div>
      ))}
      <label className="gs-field">
        Nieuwe sectienaam
        <input
          className="gs-input"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="gs-field">
        Lyrics voor deze sectie
        <textarea
          className="gs-input"
          maxLength={60000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button
        className="gs-button"
        disabled={!name.trim()}
        onClick={() =>
          p.change((s) => {
            const lyrics = lyricLines({
              id: uid(),
              name,
              tokens: tokens(text),
            });
            s.lyrics.push(lyrics);
            s.arrangements
              .find((x) => x.id === a.id)!
              .sections.push({
                id: uid(),
                lyricsSectionId: lyrics.id,
                practiced: false,
                measures: [
                  {
                    id: uid(),
                    timeSignature: structuredClone(a.timeSignature),
                  },
                ],
              });
          })
        }
      >
        Sectie toevoegen
      </button>
      <button className="gs-button" onClick={p.close}>
        Sluiten
      </button>
    </Dialog>
  );
}
function History(p: Props) {
  const [entries, setEntries] = useState<
      { revision: number; document: { schemaVersion: number } }[]
    >([]),
    [error, setError] = useState('');
  useEffect(() => {
    void request<{ entries: typeof entries }>(
      '/songs/' + p.song.id + '/multitrack?view=history',
    )
      .then((r) => setEntries(r.entries))
      .catch(() => setError('Historie niet bereikbaar.'));
  }, [p.song.id]);
  return (
    <Dialog title="Historische versies" onClose={p.close}>
      {error && <p role="alert">{error}</p>}
      <p>
        Exporteer je huidige wijzigingen vóór herstel. Historische documenten
        bevatten alle sporen.
      </p>
      {entries.map((e) => (
        <div key={e.revision}>
          <button
            className="gs-button"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        format: 'guitar-studio',
                        version: e.document.schemaVersion === 2 ? 2 : 1,
                        song: e.document,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: 'application/json' },
                ),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = 'song-revision-' + e.revision + '.json';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Revisie {e.revision} exporteren
          </button>
          <button
            className="gs-button"
            onClick={() => {
              if (
                !confirm(
                  'Revisie ' +
                    e.revision +
                    ' als nieuwe versie herstellen? Exporteer je huidige wijzigingen eerst. De historie blijft behouden.',
                )
              )
                return;
              try {
                if (p.change(() => toMultitrack(e.document))) p.close();
              } catch {
                setError(
                  'Deze historische versie kan niet veilig worden omgezet. Exporteer de oorspronkelijke versie.',
                );
              }
            }}
          >
            Revisie {e.revision} herstellen
          </button>
        </div>
      ))}
      <button className="gs-button" onClick={p.exportSong}>
        Huidige JSON exporteren
      </button>
      <button className="gs-button" onClick={p.close}>
        Sluiten
      </button>
    </Dialog>
  );
}
