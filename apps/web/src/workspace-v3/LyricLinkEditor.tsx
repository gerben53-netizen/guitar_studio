import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import {
  planLyricsEdit,
  applyLyricsEdit,
  splitWord,
} from '../../../../packages/music-domain/src/multitrack-operations';
import type { MultitrackSong } from '../../../../packages/music-domain/src/multitrack';
export function LyricsTextEditor({
  song,
  sectionId,
  change,
  close,
}: {
  song: MultitrackSong;
  sectionId: string;
  change: (fn: (s: MultitrackSong) => void | MultitrackSong) => boolean;
  close: () => void;
}) {
  const section = song.lyrics.find((s) => s.id === sectionId)!;
  const [text, setText] = useState(
      section.lines.map((l) => l.tokens.map((t) => t.text).join('')).join('\n'),
    ),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  let plan: ReturnType<typeof planLyricsEdit> | null = null;
  try {
    plan = planLyricsEdit(song, sectionId, text);
  } catch {
    /* Render correction feedback without committing invalid text. */
  }
  return (
    <Dialog title="Lyrics bewerken" onClose={close}>
      <label className="gs-field">
        Sectietekst
        <textarea
          className="gs-input"
          value={text}
          maxLength={60000}
          onChange={(e) => {
            setText(e.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      {plan?.requiresConfirmation && (
        <section className="gs-notice" aria-label="Ankerreview">
          <p>
            Deze wijziging raakt {plan.affectedLinks.length} lyricskoppelingen,{' '}
            {plan.affectedSyllables.length} handmatige lettergrepen en{' '}
            {plan.affectedChordAnchors.length} tekstankers. Tabnoten blijven
            behouden.
          </p>
          <ul>
            {plan.affectedLinks.map((l) => (
              <li key={l.id}>
                {
                  section.lines
                    .flatMap((l) => l.tokens)
                    .flatMap((w) => w.syllables)
                    .find((s) => s.id === l.syllableId)?.text
                }{' '}
                · {l.eventIds.length} events
              </li>
            ))}
          </ul>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Ik bevestig het verwijderen van de getoonde koppelingen en ankers.
          </label>
        </section>
      )}
      {plan?.uncertainWordIds.length ? (
        <p className="gs-notice">
          {plan.uncertainWordIds.length} herhaalde woorden vereisen nieuwe
          identiteiten; controleer de koppelingen.
        </p>
      ) : null}
      {error && <p role="alert">{error}</p>}
      <footer className="dialog-actions">
        <button className="gs-button" onClick={close}>
          Annuleren
        </button>
        <button
          className="gs-button gs-button--primary"
          disabled={!plan || (plan.requiresConfirmation && !confirmed)}
          onClick={() => {
            if (
              change((s) => applyLyricsEdit(s, sectionId, text, confirmed).song)
            )
              close();
            else
              setError('Controleer de tekst en ankers; niets is overschreven.');
          }}
        >
          Lyrics opslaan
        </button>
      </footer>
    </Dialog>
  );
}
export function SyllableEditor({
  song,
  wordId,
  change,
  close,
}: {
  song: MultitrackSong;
  wordId: string;
  change: (fn: (s: MultitrackSong) => void | MultitrackSong) => boolean;
  close: () => void;
}) {
  const word = song.lyrics
    .flatMap((s) => s.lines.flatMap((l) => l.tokens))
    .find((w) => w.id === wordId)!;
  const [parts, setParts] = useState(
      word.syllables.map((s) => s.text).join('|'),
    ),
    [confirmed, setConfirmed] = useState(false);
  const split = parts.split('|'),
    valid = split.every(Boolean) && split.join('') === word.text;
  const linked = song.arrangements
    .flatMap((a) => a.lyricsLinks)
    .filter((l) => word.syllables.some((s) => s.id === l.syllableId));
  const changed = parts !== word.syllables.map((s) => s.text).join('|');
  return (
    <Dialog title="Lettergrepen bewerken" onClose={close}>
      <p>
        “{word.text}” · scheid lettergrepen met |. De volledige woordtekst
        blijft gelijk.
      </p>
      <label className="gs-field">
        Lettergreepverdeling
        <input
          className="gs-input"
          value={parts}
          onChange={(e) => {
            setParts(e.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      {!valid && (
        <p role="alert">
          De delen moeten samen exact het oorspronkelijke woord vormen.
        </p>
      )}
      {!!linked.length && changed && (
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          De {linked.length} bestaande koppelingen vervangen; noten blijven
          behouden.
        </label>
      )}
      <footer className="dialog-actions">
        <button className="gs-button" onClick={close}>
          Annuleren
        </button>
        <button
          className="gs-button gs-button--primary"
          disabled={!valid || (!!linked.length && changed && !confirmed)}
          onClick={() => {
            if (
              change(
                (s) =>
                  splitWord(
                    s,
                    word.id,
                    split.map((text, i) => ({
                      text,
                      ...(word.syllables[i]?.text === text
                        ? { id: word.syllables[i]!.id }
                        : {}),
                    })),
                    confirmed,
                  ).song,
              )
            )
              close();
          }}
        >
          Lettergrepen opslaan
        </button>
      </footer>
    </Dialog>
  );
}
