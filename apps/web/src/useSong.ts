import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MultitrackSongSchema,
  toLegacy,
  type MultitrackSong,
} from '../../../packages/music-domain/src/multitrack';
import type { SongRecord } from '../../../packages/music-domain/src/workspace';
import type { MultitrackRecord } from '../../../packages/shared/src/multitrack-client';
import { request } from './api';
import {
  pushHistory,
  stepHistory,
} from '../../../packages/music-domain/src/workspace-editor';
export function useSong(onSaved: (r: SongRecord) => void) {
  const [document, setDocument] = useState<MultitrackSong | null>(null),
    [status, setStatus] = useState('Opgeslagen'),
    [error, setError] = useState(''),
    [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [locked, setLockedState] = useState(false);
  const lock = useRef(false);
  function setLocked(value: boolean) {
    lock.current = value;
    setLockedState(value);
  }
  const [history, setHistory] = useState<{
    past: MultitrackSong[];
    future: MultitrackSong[];
  }>({ past: [], future: [] });
  const historyRef = useRef(history);
  const state = useRef<{
    document: MultitrackSong | null;
    saved: string;
    revision: number;
    schema: 1 | 2;
    upgrade: boolean;
    flight: Promise<boolean> | null;
  }>({
    document: null,
    saved: 'null',
    revision: 0,
    schema: 1,
    upgrade: false,
    flight: null,
  });
  const callback = useRef(onSaved);
  callback.current = onSaved;
  const dirty = () =>
    JSON.stringify(state.current.document) !== state.current.saved;
  const flush = useCallback(async (): Promise<boolean> => {
    if (state.current.flight) return state.current.flight;
    const run = async () => {
      while (
        state.current.document &&
        JSON.stringify(state.current.document) !== state.current.saved
      ) {
        if (state.current.schema === 1 && !state.current.upgrade) {
          setNeedsUpgrade(true);
          setStatus('Bevestig opslaan');
          return false;
        }
        const snapshot = state.current.document;
        setStatus('Opslaan…');
        try {
          const saved = await request<MultitrackRecord>(
            '/songs/' + snapshot.id + '/multitrack',
            {
              method: 'PUT',
              body: JSON.stringify({
                document: snapshot,
                revision: state.current.revision,
                confirmedUpgrade: state.current.upgrade,
                confirmedDestructive: true,
              }),
            },
          );
          state.current.schema = 2;
          state.current.revision = saved.revision;
          state.current.saved = JSON.stringify(snapshot);
          callback.current({
            song: toLegacy(saved.document),
            revision: saved.revision,
            updatedAt: saved.updatedAt,
            storageSchemaVersion: 2,
          });
          setError('');
          setNeedsUpgrade(false);
        } catch (e) {
          setStatus('Niet opgeslagen');
          setError(e instanceof Error ? e.message : 'Opslaan mislukt');
          return false;
        }
      }
      setStatus('Opgeslagen');
      return true;
    };
    const flight = run();
    state.current.flight = flight;
    try {
      return await flight;
    } finally {
      state.current.flight = null;
    }
  }, []);
  useEffect(() => {
    if (!document) return;
    if (!dirty()) {
      setStatus('Opgeslagen');
      return;
    }
    setStatus('Wijzigingen wachten');
    const t = setTimeout(() => void flush(), 600);
    return () => clearTimeout(t);
  }, [document, flush]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty() || lock.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    addEventListener('beforeunload', leave);
    return () => removeEventListener('beforeunload', leave);
  }, []);
  function load(_record: SongRecord, full: MultitrackRecord) {
    const document = MultitrackSongSchema.parse(full.document);
    state.current = {
      document,
      saved: JSON.stringify(document),
      revision: full.revision,
      schema: full.storageSchemaVersion,
      upgrade: false,
      flight: null,
    };
    setDocument(document);
    historyRef.current = { past: [], future: [] };
    setHistory(historyRef.current);
    setStatus('Opgeslagen');
    setError('');
    setNeedsUpgrade(false);
  }
  function changeDocument(fn: (s: MultitrackSong) => void | MultitrackSong) {
    if (lock.current) return false;
    const current = state.current.document;
    if (!current) return false;
    try {
      const draft = structuredClone(current);
      const next = MultitrackSongSchema.parse(fn(draft) ?? draft);
      historyRef.current = pushHistory(historyRef.current, current);
      setHistory(historyRef.current);
      state.current.document = next;
      setDocument(next);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ongeldige wijziging');
      return false;
    }
  }
  function undo(redo = false) {
    if (lock.current) return;
    const current = state.current.document;
    if (!current) return;
    const result = stepHistory(historyRef.current, current, redo);
    if (!result) return;
    historyRef.current = result.history;
    setHistory(result.history);
    state.current.document = result.document;
    setDocument(result.document);
    setError('');
  }
  async function confirmUpgrade() {
    state.current.upgrade = true;
    setNeedsUpgrade(false);
    return flush();
  }
  /** Explicit concept commit: keep the editor/history untouched until the transaction succeeds. */
  async function commitDocument(
    fn: (s: MultitrackSong) => MultitrackSong,
    revision: number,
  ) {
    if (state.current.flight) await state.current.flight;
    const before = state.current.document;
    if (
      !before ||
      !lock.current ||
      dirty() ||
      revision !== state.current.revision
    )
      return {
        ok: false,
        error: 'De bron of revisie is gewijzigd. Je concept blijft behouden.',
      };
    let result: { ok: boolean; error?: string } = { ok: false };
    const flight = (async () => {
      try {
        const next = MultitrackSongSchema.parse(fn(structuredClone(before)));
        if (JSON.stringify(next) === state.current.saved) {
          result = { ok: true };
          return true;
        }
        setStatus('Opslaan…');
        const saved = await request<MultitrackRecord>(
          '/songs/' + next.id + '/multitrack',
          {
            method: 'PUT',
            body: JSON.stringify({
              document: next,
              revision,
              confirmedUpgrade: true,
              confirmedDestructive: true,
            }),
          },
        );
        historyRef.current = pushHistory(historyRef.current, before);
        setHistory(historyRef.current);
        const canonical = MultitrackSongSchema.parse(saved.document);
        state.current.document = canonical;
        state.current.saved = JSON.stringify(canonical);
        state.current.revision = saved.revision;
        state.current.schema = 2;
        state.current.upgrade = true;
        setDocument(canonical);
        setError('');
        setNeedsUpgrade(false);
        setStatus('Opgeslagen');
        callback.current({
          song: toLegacy(saved.document),
          revision: saved.revision,
          updatedAt: saved.updatedAt,
          storageSchemaVersion: 2,
        });
        result = { ok: true };
        return true;
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message
            : 'Opslaan mislukt; je concept blijft behouden.';
        setError(message);
        setStatus('Niet opgeslagen');
        result = { ok: false, error: message };
        return false;
      }
    })();
    state.current.flight = flight;
    try {
      await flight;
      return result;
    } finally {
      state.current.flight = null;
    }
  }
  return {
    locked,
    setLocked,
    commitDocument,
    current: () => ({
      document: state.current.document,
      revision: state.current.revision,
    }),
    song: document ? toLegacy(document) : null,
    document,
    status,
    error,
    setError,
    load,
    changeDocument,
    flush,
    undo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    requiresUpgrade: state.current.schema === 1,
    needsUpgrade,
    confirmUpgrade,
  };
}
