import { useState } from 'react';
import type {
  SongRecord,
  StudioSong,
} from '../../../../packages/music-domain/src/workspace';
import { Artwork } from './Artwork';
export function Library({
  records,
  dashboard,
  open,
  newSong,
  action,
}: {
  records: SongRecord[];
  dashboard: boolean;
  open: (record: SongRecord) => void;
  newSong: () => void;
  action: (
    record: SongRecord,
    action: 'favorite' | 'duplicate' | 'archive' | 'delete',
  ) => void;
}) {
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [difficulty, setDifficulty] = useState(''),
    [tag, setTag] = useState(''),
    [archive, setArchive] = useState(false),
    [list, setList] = useState(false),
    [favorites, setFavorites] = useState(false);
  const active = records.filter((r) => !r.song.archived),
    recent = [...active].sort((a, b) =>
      (b.song.lastOpened ?? '').localeCompare(a.song.lastOpened ?? ''),
    );
  const visible = dashboard
    ? recent.slice(0, 6)
    : records.filter(
        ({ song: s }) =>
          s.archived === archive &&
          (!favorites || s.favorite) &&
          (!status || s.status === status) &&
          (!difficulty || s.difficulty === difficulty) &&
          (!tag || s.tags.includes(tag)) &&
          (s.title + ' ' + s.artist)
            .toLowerCase()
            .includes(search.toLowerCase()),
      );
  const SongHeading = dashboard ? 'h3' : 'h2';
  return (
    <div className="content">
      <div className="library-header">
        <div>
          <div className="eyebrow">
            {dashboard ? 'JOUW MUZIEKWERKPLAATS' : 'SONGBIBLIOTHEEK'}
          </div>
          <h1>
            {dashboard
              ? 'Goed om je weer te zien.'
              : 'Jouw songs, jouw versies.'}
          </h1>
          <p className="muted">
            {dashboard
              ? 'Een paar akkoorden. Een eigen geluid. Tijd om te spelen.'
              : 'Van eerste idee tot een arrangement dat bij je past.'}
          </p>
        </div>
        <button
          className="primary gs-button gs-button--primary"
          onClick={newSong}
        >
          + Nieuwe song
        </button>
      </div>
      {dashboard && (
        <>
          <div className="hero">
            <div className="hero-copy">
              <div className="eyebrow">MAAK ER IETS VAN JOU VAN</div>
              <h2>
                Pak je gitaar.
                <br />
                Vind je volgende noot.
              </h2>
              <p>
                Je woorden, akkoorden en ideeën bij elkaar. Werk verder waar je
                gebleven bent.
              </p>
              <button
                className="primary gs-button gs-button--primary"
                onClick={() => (recent[0] ? open(recent[0]) : newSong())}
              >
                {recent[0] ? 'Verder in de studio →' : 'Begin je eerste song →'}
              </button>
            </div>
            <div className="hero-art">
              <img
                className="gs-brand-hero"
                src="/brand/gs-logo-original.png"
                alt=""
              />
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <strong>{active.length}</strong> songs
            </div>
            <button
              className="stat gs-button"
              onClick={() => setFavorites(!favorites)}
            >
              <strong>{active.filter((r) => r.song.favorite).length}</strong>{' '}
              favorieten
            </button>
            <div className="stat">
              <strong>
                {active.length
                  ? Math.round(
                      active.reduce((n, r) => n + r.song.progress, 0) /
                        active.length,
                    )
                  : 0}
                %
              </strong>{' '}
              handmatige voortgang
            </div>
          </div>
          <h2>{favorites ? 'Favorieten' : 'Recent in je studio'}</h2>
        </>
      )}
      {!dashboard && (
        <div className="library-filters">
          <input
            className="gs-input"
            aria-label="Zoeken op titel en artiest"
            placeholder="Zoek op titel of artiest…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="gs-input"
            aria-label="Statusfilter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Alle statussen</option>
            {['In bewerking', 'Oefenen', 'Beheerst'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            className="gs-input"
            aria-label="Moeilijkheidsfilter"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">Alle niveaus</option>
            {['Beginner', 'Gemiddeld', 'Gevorderd'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            className="gs-input"
            aria-label="Tagfilter"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">Alle tags</option>
            {[...new Set(records.flatMap((r) => r.song.tags))].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <button
            className="gs-button"
            aria-pressed={favorites}
            onClick={() => setFavorites(!favorites)}
          >
            ☆ Favorieten
          </button>
          <button
            className="gs-button"
            aria-pressed={archive}
            onClick={() => setArchive(!archive)}
          >
            Archief
          </button>
          <button
            className="gs-button"
            aria-pressed={list}
            onClick={() => setList(!list)}
          >
            {list ? 'Kaarten' : 'Lijst'}
          </button>
        </div>
      )}
      <div className={'cards ' + (list ? 'list' : '')}>
        {visible
          .filter((r) => !dashboard || !favorites || r.song.favorite)
          .map((r, i) => (
            <article className="song" key={r.song.id} data-song-id={r.song.id}>
              <div className={'cover c' + (i % 3)}>
                <Artwork variant={i} />
                <button
                  className="fav gs-button"
                  aria-label={'Favoriet ' + r.song.title}
                  aria-pressed={r.song.favorite}
                  onClick={() => action(r, 'favorite')}
                >
                  {r.song.favorite ? '★' : '☆'}
                </button>
              </div>
              <div className="song-body">
                <span className="badge gs-badge">
                  {r.song.difficulty} · {r.song.status}
                </span>
                <SongHeading>
                  <button
                    className="song-title gs-button"
                    onClick={() => open(r)}
                  >
                    {r.song.title}
                  </button>
                </SongHeading>
                <p className="muted">
                  {r.song.artist || 'Eigen song'} · {r.song.arrangements.length}{' '}
                  arrangementen
                </p>
                <progress
                  className="progress"
                  aria-label={'Voortgang ' + r.song.title}
                  value={r.song.progress}
                  max={100}
                />
                <small>
                  {r.song.progress}% ·{' '}
                  {r.song.tags.join(' · ') || 'Jouw muziek'}
                </small>
              </div>
              <div className="song-actions">
                <button className="gs-button" onClick={() => open(r)}>
                  Openen →
                </button>
                <button
                  className="gs-button"
                  onClick={() => action(r, 'duplicate')}
                >
                  Kopie
                </button>
                <button
                  className="gs-button"
                  onClick={() => action(r, 'archive')}
                >
                  {r.song.archived ? 'Herstellen' : 'Archiveren'}
                </button>
                <button
                  className="danger gs-button gs-danger"
                  onClick={() => action(r, 'delete')}
                >
                  Verwijderen
                </button>
              </div>
            </article>
          ))}
      </div>
      {!visible.length && (
        <div className="empty">
          <h2>Nog geen songs gevonden</h2>
          <p>Pas je filters aan of begin met een eigen tekst.</p>
          <button className="gs-button" onClick={newSong}>
            + Nieuwe song
          </button>
        </div>
      )}
    </div>
  );
}
export type SongAction = Parameters<Parameters<typeof Library>[0]['action']>[1];
export type SongMetadata = Pick<
  StudioSong,
  'title' | 'artist' | 'status' | 'difficulty' | 'tags'
>;
