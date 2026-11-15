import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import {
  applyMultitrackMutation,
  emptyTrack,
  type MultitrackMutation,
} from '../../../../packages/music-domain/src/multitrack-operations';
import { roleNames } from '../../../../packages/music-domain/src/workspace-editor';
import type {
  MultitrackSong,
  Track,
} from '../../../../packages/music-domain/src/multitrack';
export function TrackManager({
  song,
  arrangementId,
  change,
  close,
}: {
  song: MultitrackSong;
  arrangementId: string;
  change: (fn: (s: MultitrackSong) => void | MultitrackSong) => boolean;
  close: () => void;
}) {
  const a = song.arrangements.find((a) => a.id === arrangementId)!;
  const [name, setName] = useState('Nieuw spoor'),
    [role, setRole] = useState<Track['role']>('custom'),
    [deleting, setDeleting] = useState<string | null>(null);
  const run = (cmd: MultitrackMutation) =>
    change((s) => applyMultitrackMutation(s, cmd));
  const target = a.tracks.find((t) => t.id === deleting);
  return (
    <Dialog title="Sporen beheren" onClose={close}>
      <p>Elk spoor heeft eigen noten op dezelfde muzikale tijdlijn.</p>
      <div className="track-manager-list">
        {a.trackOrder.map((id, index) => {
          const t = a.tracks.find((t) => t.id === id)!;
          return (
            <section
              className="track-manager-row"
              key={id}
              aria-label={'Spoor ' + t.name}
            >
              <label className="gs-field">
                Spoornaam
                <input
                  className="gs-input"
                  aria-label={'Naam ' + t.name}
                  maxLength={80}
                  defaultValue={t.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== t.name)
                      run({
                        op: 'update-track',
                        arrangementId,
                        trackId: id,
                        patch: { name: e.target.value },
                      });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              </label>
              <label className="gs-field">
                Spoorrol
                <select
                  className="gs-input"
                  aria-label={'Rol ' + t.name}
                  value={t.role}
                  onChange={(e) =>
                    run({
                      op: 'update-track',
                      arrangementId,
                      trackId: id,
                      patch: { role: e.target.value as Track['role'] },
                    })
                  }
                >
                  {Object.entries(roleNames).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                {t.events.length} events · {roleNames[t.role]}
              </span>
              <div className="track-manager-actions">
                <button
                  className="gs-button"
                  aria-pressed={a.activeTrackId === id}
                  onClick={() =>
                    run({ op: 'select-track', arrangementId, trackId: id })
                  }
                >
                  Actief: {t.name}
                </button>
                <button
                  className="gs-button"
                  onClick={() =>
                    run({ op: 'duplicate-track', arrangementId, trackId: id })
                  }
                >
                  Dupliceer {t.name}
                </button>
                <button
                  className="gs-button"
                  onClick={() =>
                    run({
                      op: 'update-track',
                      arrangementId,
                      trackId: id,
                      patch: { visible: !t.visible },
                    })
                  }
                >
                  {t.visible ? 'Verberg' : 'Toon'} {t.name}
                </button>
                <button
                  className="gs-button"
                  onClick={() =>
                    run({
                      op: 'update-track',
                      arrangementId,
                      trackId: id,
                      patch: { collapsed: !t.collapsed },
                    })
                  }
                >
                  {t.collapsed ? 'Uitklappen' : 'Inklappen'} {t.name}
                </button>
                <button
                  className="gs-button"
                  disabled={index === 0}
                  aria-label={t.name + ' omhoog'}
                  onClick={() => {
                    const order = [...a.trackOrder];
                    [order[index - 1], order[index]] = [
                      order[index]!,
                      order[index - 1]!,
                    ];
                    run({
                      op: 'reorder-tracks',
                      arrangementId,
                      trackIds: order,
                    });
                  }}
                >
                  ↑
                </button>
                <button
                  className="gs-button"
                  disabled={index === a.trackOrder.length - 1}
                  aria-label={t.name + ' omlaag'}
                  onClick={() => {
                    const order = [...a.trackOrder];
                    [order[index + 1], order[index]] = [
                      order[index]!,
                      order[index + 1]!,
                    ];
                    run({
                      op: 'reorder-tracks',
                      arrangementId,
                      trackIds: order,
                    });
                  }}
                >
                  ↓
                </button>
                <button
                  className="gs-button gs-danger"
                  disabled={a.tracks.length === 1}
                  onClick={() => setDeleting(id)}
                >
                  Verwijder {t.name}
                </button>
              </div>
            </section>
          );
        })}
      </div>
      {target && (
        <div className="gs-notice" role="alert">
          <p>
            Spoor “{target.name}” met {target.events.length} events en{' '}
            {a.lyricsLinks.filter((l) => l.trackId === target.id).length}{' '}
            lyricskoppelingen verwijderen? Andere sporen blijven behouden.
          </p>
          <button
            className="gs-button gs-danger"
            onClick={() => {
              run({
                op: 'delete-track',
                arrangementId,
                trackId: target.id,
                confirmed: true,
              });
              setDeleting(null);
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLInputElement>('.track-manager-list input')
                  ?.focus(),
              );
            }}
          >
            Verwijderen bevestigen
          </button>
          <button className="gs-button" onClick={() => setDeleting(null)}>
            Annuleren
          </button>
        </div>
      )}
      <label className="gs-field">
        Nieuw spoor
        <input
          className="gs-input"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="gs-field">
        Spoorrol
        <select
          className="gs-input"
          aria-label="Spoorrol"
          value={role}
          onChange={(e) => setRole(e.target.value as Track['role'])}
        >
          {Object.entries(roleNames).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <footer className="dialog-actions">
        <button className="gs-button" onClick={close}>
          Sluiten
        </button>
        <button
          className="gs-button gs-button--primary"
          disabled={!name.trim() || a.tracks.length >= 32}
          onClick={() => {
            const t = emptyTrack(song, a.id, name, role);
            run({ op: 'add-track', arrangementId, track: t });
          }}
        >
          Nieuw spoor toevoegen
        </button>
      </footer>
    </Dialog>
  );
}
