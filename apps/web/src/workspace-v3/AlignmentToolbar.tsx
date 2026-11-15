import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';
import {
  alignmentAction,
  alignmentUndo,
  proposeAlignment,
  cancelAlignmentProposal,
  currentAlignmentDraft,
  planAlignment,
  type AlignmentSession,
  type AlignmentAction,
} from '../../../../packages/music-domain/src/lyrics-alignment';
import type { TrackEvent } from '../../../../packages/music-domain/src/multitrack';

export function alignmentNoteLabel(
  note: TrackEvent | undefined,
  measureIds: string[],
) {
  if (!note) return 'Geen volgende noot';
  const positions = note.tones
    .map((t) =>
      t.position
        ? 'snaar ' + t.position.string + ' · fret ' + t.position.fret
        : 'MIDI ' + t.pitch + ' (zonder snaarpositie)',
    )
    .join(' / ');
  return (
    'M' +
    (measureIds.indexOf(note.measureId) + 1) +
    ' · ' +
    note.start.numerator +
    '/' +
    note.start.denominator +
    ' · ' +
    positions
  );
}
interface Props {
  session: AlignmentSession;
  setSession: (s: AlignmentSession) => void;
  songTitle: string;
  trackName: string;
  arrangementName: string;
  measureIds: string[];
  lines: { id: string; text: string }[];
  chooseLine: (id: string) => void;
  close: () => void;
  commit: () => Promise<{ ok: boolean; error?: string }>;
}
const labels = {
  new: 'Nieuw',
  unchanged: 'Ongewijzigd',
  replace: 'Te vervangen',
  kept: 'Bestaand behouden',
  conflict: '⚠ Conflict',
};
export function AlignmentToolbar(p: Props) {
  const s = p.session,
    c = s.current,
    sy = s.syllables[c.syllableIndex],
    note = s.notes[c.noteIndex],
    draft = currentAlignmentDraft(s);
  const [modal, setModal] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const toolbar = useRef<HTMLElement>(null),
    chipStrip = useRef<HTMLDivElement>(null);
  // Preview IDs are created only at the commit boundary, never on render.
  const plan = planAlignment(
    s,
    '2000-01-01T00:00:00.000Z',
    () => 'preview-only',
  );
  const remaining = s.syllables.filter(
    (sy) =>
      !c.skipped.includes(sy.id) &&
      !c.drafts.some((d) => d.syllableId === sy.id && d.eventIds.length),
  ).length;
  const live = useRef(s);
  live.current = s;
  function replace(next: AlignmentSession) {
    live.current = next;
    p.setSession(next);
  }
  function action(a: AlignmentAction) {
    replace(alignmentAction(live.current, a));
    setError('');
  }
  useEffect(() => {
    toolbar.current?.scrollIntoView({ block: 'start' });
    toolbar.current
      ?.querySelector<HTMLButtonElement>('[data-alignment-command="bind"]')
      ?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const strip = chipStrip.current,
      chip = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (strip && chip)
      strip.scrollLeft = Math.max(
        0,
        chip.offsetLeft -
          strip.offsetLeft -
          strip.clientWidth / 2 +
          chip.clientWidth / 2,
      );
    const targets = document.querySelectorAll<HTMLElement>(
      '.gs-workspace-v3 [data-alignment-current="true"]',
    );
    const target = targets[0],
      pages = target?.closest<HTMLElement>('.score-pages'),
      system = target?.closest<HTMLElement>('.score-system-scroll');
    if (target && pages) {
      const r = target.getBoundingClientRect(),
        pr = pages.getBoundingClientRect();
      if (r.top < pr.top || r.bottom > pr.bottom)
        pages.scrollTop += r.top - pr.top - 40;
    }
    if (target && system) {
      const r = target.getBoundingClientRect(),
        sr = system.getBoundingClientRect();
      if (r.left < sr.left || r.right > sr.right)
        system.scrollLeft += r.left - sr.left - system.clientWidth / 2;
    }
  }, [c.noteIndex, c.syllableIndex, s.scope.trackId]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.defaultPrevented ||
        document.querySelector('dialog[open]') ||
        target.closest('input,select,textarea') ||
        target.isContentEditable
      )
        return;
      let command: AlignmentAction | undefined;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopImmediatePropagation();
        replace(alignmentUndo(live.current, e.shiftKey));
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') command = { type: 'bind', melisma: e.shiftKey };
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
        command = {
          type: 'move-note',
          index:
            live.current.current.noteIndex + (e.key === 'ArrowLeft' ? -1 : 1),
        };
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown')
        command = {
          type: 'move-syllable',
          index:
            live.current.current.syllableIndex + (e.key === 'ArrowUp' ? -1 : 1),
        };
      if (e.key.toLowerCase() === 's') command = { type: 'skip' };
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        p.close();
        return;
      }
      if (command) {
        e.preventDefault();
        e.stopImmediatePropagation();
        action(command);
      } else if (
        /^\d$/.test(e.key) ||
        ['Delete', 'Backspace'].includes(e.key)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setError('Nootinvoer is gepauzeerd tijdens Lyrics uitlijnen.');
      }
    };
    addEventListener('keydown', handler, true);
    return () => removeEventListener('keydown', handler, true);
  });
  async function commit() {
    setBusy(true);
    setError('');
    try {
      const result = await p.commit();
      if (!result.ok)
        setError(
          result.error ?? 'Opslaan mislukt. Je concept blijft behouden.',
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const button = (
    text: string,
    fn: () => void,
    disabled = false,
    primary = false,
  ) => (
    <button
      type="button"
      className={'gs-button' + (primary ? ' gs-button--primary' : '')}
      disabled={disabled || busy}
      onClick={fn}
    >
      {text}
    </button>
  );
  return (
    <section
      className="alignment-panel"
      aria-label="Lyrics uitlijnen"
      ref={toolbar}
      aria-busy={busy}
    >
      <header className="alignment-heading">
        <div>
          <div className="eyebrow">Lyrics uitlijnen · concept</div>
          <h3>{p.trackName}</h3>
          <small>
            {p.songTitle} · {p.arrangementName} · {s.notes.length} bestaande
            noten · startrevisie {s.startRevision}
          </small>
        </div>
        <div className="alignment-history">
          {button(
            'Concept-Undo',
            () => p.setSession(alignmentUndo(s)),
            !s.past.length,
          )}
          {button(
            'Concept-Redo',
            () => p.setSession(alignmentUndo(s, true)),
            !s.future.length,
          )}
          {button('Annuleren uitlijnen', p.close)}
        </div>
      </header>
      <div className="alignment-line-choice">
        <label className="gs-field">
          Lyricsregel
          <select
            className="gs-input"
            aria-label="Lyricsregel"
            value={s.scope.lineId}
            disabled={busy}
            onChange={(e) => p.chooseLine(e.target.value)}
          >
            {p.lines.map((line, i) => (
              <option key={line.id} value={line.id}>
                {i + 1}. {line.text || '(lege regel)'}
              </option>
            ))}
          </select>
        </label>
        <span className="alignment-counts" role="status" aria-live="polite">
          {c.drafts.filter((d) => d.eventIds.length).length} concept ·{' '}
          {remaining} resterend · {plan.unresolved} conflicten
        </span>
      </div>
      <div
        className="syllable-strip"
        ref={chipStrip}
        role="group"
        aria-label="Lettergrepen in leesvolgorde"
      >
        {s.syllables.map((sy, i) => {
          const state = c.skipped.includes(sy.id)
            ? '↷ overgeslagen'
            : c.drafts.some((d) => d.syllableId === sy.id)
              ? '✓ concept'
              : s.baseLinks.some(
                    (l) =>
                      l.trackId === s.scope.trackId && l.syllableId === sy.id,
                  )
                ? '● bestaand'
                : '○ vrij';
          return (
            <button
              className="syllable-chip"
              key={sy.id}
              data-syllable-id={sy.id}
              aria-pressed={i === c.syllableIndex}
              disabled={busy}
              onClick={() => action({ type: 'move-syllable', index: i })}
            >
              <small>{state}</small>
              <strong>{sy.text}</strong>
              <span className="syllable-word-context">
                woord {sy.wordIndex}
              </span>
            </button>
          );
        })}
      </div>
      <p className="alignment-current" role="status" aria-live="polite">
        <strong>{sy?.text ?? 'Regel afgerond'}</strong>
        <span aria-hidden="true"> → </span>
        <span>{alignmentNoteLabel(note, p.measureIds)}</span>
      </p>
      <div className="alignment-actions">
        <button
          className="gs-button gs-button--primary"
          data-alignment-command="bind"
          disabled={!sy || !note || busy}
          onClick={() => action({ type: 'bind' })}
        >
          Koppel en volgende ↵
        </button>
        {button(
          'Zelfde lettergreep, volgende noot',
          () => action({ type: 'bind', melisma: true }),
          !sy || !note,
        )}
        {button('Overslaan', () => action({ type: 'skip' }), !sy)}
        {button(
          'Verdeling voorstellen',
          () => {
            p.setSession(proposeAlignment(s));
            setModal('preview');
          },
          !!s.proposal || !s.notes.length || !s.syllables.length,
        )}
        {button(
          'Controleer concept',
          () => setModal('preview'),
          !c.drafts.length,
        )}
      </div>
      <details className="alignment-corrections">
        <summary>Correcties & sneltoetsen{sy ? ' · ' + sy.text : ''}</summary>
        <div className="alignment-navigation">
          {button(
            'Vorige noot',
            () => action({ type: 'move-note', index: c.noteIndex - 1 }),
            !c.noteIndex,
          )}
          {button(
            'Volgende noot',
            () => action({ type: 'move-note', index: c.noteIndex + 1 }),
            c.noteIndex >= s.notes.length - 1,
          )}
          {button(
            'Vorige lettergreep',
            () => action({ type: 'move-syllable', index: c.syllableIndex - 1 }),
            !c.syllableIndex,
          )}
          {button(
            'Volgende lettergreep',
            () => action({ type: 'move-syllable', index: c.syllableIndex + 1 }),
            c.syllableIndex >= s.syllables.length - 1,
          )}
        </div>
        <p>
          {draft?.eventIds.length ?? 0}{' '}
          {c.drafts.some((d) => d.syllableId === sy?.id)
            ? 'concept'
            : 'bestaande'}{' '}
          nootkoppelingen
        </p>
        <div className="alignment-navigation">
          <label>
            <input
              type="checkbox"
              checked={draft?.sustain ?? false}
              disabled={!sy || busy}
              onChange={(e) =>
                action({ type: 'sustain', value: e.target.checked })
              }
            />
            Aanhouden
          </label>
          {button(
            'Deze noot losmaken',
            () => action({ type: 'remove-note' }),
            !sy || !note,
          )}
          {button(
            'Lettergreep leegmaken',
            () => action({ type: 'clear' }),
            !sy,
          )}
        </div>
        <p>
          Enter: koppel en volgende · Shift+Enter: melisma · ←/→: noot · ↑/↓:
          lettergreep · S: overslaan · Ctrl+Z / Ctrl+Shift+Z: concept-Undo/Redo
          · Escape: veilige keuze bij verlaten.
        </p>
      </details>
      {!s.notes.length && (
        <p role="status">
          Deze passage bevat geen koppelbare noten. Rusten worden overgeslagen.
        </p>
      )}
      {error && !modal && <p role="alert">{error}</p>}
      {modal === 'preview' && (
        <Dialog
          title="Controleer je koppelingen"
          dismissible={!busy}
          onClose={() => {
            if (!busy) {
              if (s.proposal) p.setSession(cancelAlignmentProposal(s));
              setModal('');
            }
          }}
        >
          <p>
            Er is nog niets opgeslagen. Alleen de bedoelde lyricskoppelingen
            veranderen; noten, tekst en timing blijven gelijk. Een
            oorspronkelijke schema-1-versie wordt bij bevestiging veilig
            bewaard.
          </p>
          {s.proposal && (
            <p className="gs-notice">
              {s.proposal.uncertain
                ? 'Aantal verschilt: ' +
                  s.syllables.length +
                  ' lettergrepen en ' +
                  s.notes.length +
                  ' noten. Alleen de eerste ' +
                  Math.min(s.syllables.length, s.notes.length) +
                  ' zijn voorgesteld. ' +
                  s.proposal.unpairedNotes +
                  ' noten en ' +
                  s.proposal.unpairedSyllables +
                  ' lettergrepen blijven ongepaard.'
                : 'Evenveel lettergrepen als noten: voorlopig één-op-éénvoorstel.'}{' '}
              Controleer of de verdeling muzikaal klopt. Er zijn geen noten,
              tijden of lettergrepen verzonnen.
            </p>
          )}
          <p role="status">
            {plan.rows.filter((r) => r.status === 'new').length} nieuw ·{' '}
            {plan.rows.filter((r) => r.status === 'replace').length} te
            vervangen · {plan.unresolved} onopgeloste conflicten
          </p>
          <div className="alignment-preview-list">
            {plan.rows.map((row) => {
              const sy = s.syllables.find(
                (sy) => sy.id === row.draft.syllableId,
              )!;
              return (
                <article
                  className="alignment-preview-row"
                  data-syllable-id={sy.id}
                  data-preview-status={row.status}
                  key={sy.id}
                >
                  <h3>
                    {sy.text}{' '}
                    <small>
                      woord {sy.wordIndex} · {labels[row.status]}
                    </small>
                  </h3>
                  <p>
                    {row.draft.eventIds.length
                      ? row.draft.eventIds
                          .map((id) =>
                            alignmentNoteLabel(
                              s.allNotes.find((n) => n.id === id),
                              p.measureIds,
                            ),
                          )
                          .join(' → ')
                      : 'Koppeling verwijderen'}
                    {row.draft.sustain ? ' · aangehouden' : ''}
                  </p>
                  {!!row.existing.length && (
                    <p>
                      Bestaande lettergreep:{' '}
                      {row.existing.flatMap((l) => l.eventIds).length} noten.
                    </p>
                  )}
                  {!!row.competing.length && (
                    <p>
                      Deze noten horen ook bij{' '}
                      {row.competing
                        .map(
                          (l) =>
                            s.syllables.find((sy) => sy.id === l.syllableId)
                              ?.text ?? 'een andere lettergreep',
                        )
                        .join(', ')}
                      . Overige melismanoten blijven behouden.
                    </p>
                  )}
                  {!['new', 'unchanged'].includes(row.status) && (
                    <label className="gs-field">
                      Keuze voor {sy.text} (woord {sy.wordIndex})
                      <select
                        className="gs-input"
                        aria-label={'Keuze woord ' + sy.wordIndex}
                        disabled={busy}
                        value={c.resolutions[sy.id] ?? ''}
                        onChange={(e) =>
                          action({
                            type: 'resolve',
                            syllableId: sy.id,
                            decision: e.target.value as 'keep' | 'new' | '',
                          })
                        }
                      >
                        <option value="">Kies een oplossing</option>
                        <option value="keep">
                          Bestaande koppeling behouden
                        </option>
                        <option value="new">Nieuwe koppeling gebruiken</option>
                      </select>
                    </label>
                  )}
                  {button('Handmatig corrigeren', () => {
                    action({
                      type: 'move-syllable',
                      index: s.syllables.indexOf(sy),
                    });
                    setModal('');
                  })}
                </article>
              );
            })}
          </div>
          {error && (
            <p className="gs-notice gs-danger" role="alert">
              {error} Het concept is behouden. Bij een nieuwere bron: verlaat
              het concept met een expliciete keuze en laad de serverversie
              voordat je opnieuw uitlijnt.
            </p>
          )}
          <footer className="dialog-actions">
            {button(
              s.proposal ? 'Voorstel annuleren' : 'Terug naar uitlijnen',
              () => {
                if (s.proposal) p.setSession(cancelAlignmentProposal(s));
                setModal('');
              },
            )}
            {s.proposal && button('Voorstel aanpassen', () => setModal(''))}
            <button
              className="gs-button gs-button--primary"
              disabled={busy || !!plan.unresolved || !c.drafts.length}
              onClick={() => void commit()}
            >
              {busy ? 'Opslaan…' : 'Bevestigen & opslaan'}
            </button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
