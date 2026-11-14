import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SongSchema,
  type SongRecord,
  type StudioSong,
} from '../../../packages/music-domain/src/workspace';
import { request } from './api';
export function useSong(onSaved: (record: SongRecord) => void) {
  const [song, setSong] = useState<StudioSong | null>(null),
    [status, setStatus] = useState('Opgeslagen'),
    [error, setError] = useState(''),
    [history, setHistory] = useState<{
      past: StudioSong[];
      future: StudioSong[];
    }>({ past: [], future: [] });
  const state = useRef<{
    song: StudioSong | null;
    revision: number;
    saved: string;
    flight: Promise<boolean> | null;
  }>({ song: null, revision: 0, saved: '', flight: null });
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const dirty = () =>
    state.current.song !== null &&
    JSON.stringify(state.current.song) !== state.current.saved;
  const flush = useCallback(async (): Promise<boolean> => {
    if (state.current.flight) return state.current.flight;
    const run = async () => {
      while (
        state.current.song &&
        JSON.stringify(state.current.song) !== state.current.saved
      ) {
        const snapshot = state.current.song;
        setStatus('Opslaan…');
        try {
          const record = await request<SongRecord>('/songs/' + snapshot.id, {
            method: 'PUT',
            body: JSON.stringify({
              song: snapshot,
              revision: state.current.revision,
            }),
          });
          state.current.revision = record.revision;
          state.current.saved = JSON.stringify(snapshot);
          savedCallback.current(record);
          setError('');
        } catch (error) {
          setStatus('Niet opgeslagen');
          setError(error instanceof Error ? error.message : 'Opslaan mislukt');
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
    if (!song) return;
    if (!dirty()) {
      setStatus('Opgeslagen');
      return;
    }
    setStatus('Wijzigingen wachten');
    const timer = setTimeout(() => void flush(), 600);
    return () => clearTimeout(timer);
  }, [song, flush]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    addEventListener('beforeunload', leave);
    return () => removeEventListener('beforeunload', leave);
  }, []);
  function load(record: SongRecord) {
    state.current = {
      song: structuredClone(record.song),
      revision: record.revision,
      saved: JSON.stringify(record.song),
      flight: null,
    };
    setSong(state.current.song);
    setHistory({ past: [], future: [] });
    setStatus('Opgeslagen');
    setError('');
  }
  function change(action: (draft: StudioSong) => void) {
    if (!state.current.song) return false;
    try {
      const draft = structuredClone(state.current.song);
      action(draft);
      const result = SongSchema.parse(draft);
      const previous = state.current.song;
      setHistory((h) => ({
        past: [...h.past.slice(-99), previous],
        future: [],
      }));
      state.current.song = result;
      setSong(result);
      setError('');
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Wijziging ongeldig');
      return false;
    }
  }
  function undo(redo = false) {
    const source = redo ? history.future : history.past;
    const next = source.at(-1);
    if (!next || !state.current.song) return;
    const current = state.current.song;
    setHistory(
      redo
        ? { past: [...history.past, current], future: source.slice(0, -1) }
        : { past: source.slice(0, -1), future: [...history.future, current] },
    );
    state.current.song = next;
    setSong(next);
  }
  return {
    song,
    status,
    error,
    setError,
    change,
    load,
    flush,
    undo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
