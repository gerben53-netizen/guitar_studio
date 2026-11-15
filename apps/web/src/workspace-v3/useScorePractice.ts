import { useEffect, useRef, useState } from 'react';
import {
  getSharedMetronome,
  releaseSharedMetronome,
} from '../../../../packages/audio/src/browser';
import {
  defaultMetronomeSettings,
  type MetronomeEngine,
} from '../../../../packages/audio/src/metronome';
import {
  timeline,
  type MultitrackArrangement,
} from '../../../../packages/music-domain/src/multitrack';
export function useScorePractice(
  a: MultitrackArrangement,
  range: string[],
  enabled: boolean,
) {
  const engine = useRef<MetronomeEngine | null>(null),
    [repeat, setRepeat] = useState(true),
    [status, setStatus] = useState('stopped'),
    [measure, setMeasure] = useState<string | null>(null),
    [error, setError] = useState('');
  const measures = timeline(a).filter((m) => range.includes(m.id));
  const current = useRef({ measures, repeat });
  current.current = { measures, repeat };
  useEffect(() => {
    let frame = 0,
      last = 0;
    const poll = (at: number) => {
      const e = engine.current;
      if (e && at - last > 40) {
        last = at;
        setStatus(e.status);
        const bar = e.position?.bar ?? 0;
        if (e.status === 'running') {
          if (
            bar >= current.current.measures.length &&
            !current.current.repeat
          ) {
            void e.stop();
            setMeasure(null);
          } else
            setMeasure(
              current.current.measures[bar % current.current.measures.length]
                ?.id ?? null,
            );
        }
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(frame);
      if (engine.current) {
        void releaseSharedMetronome().catch(() => {});
        engine.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (!enabled && engine.current) void engine.current.stop();
  }, [enabled]);
  useEffect(() => {
    const e = engine.current;
    if (e && e.status !== 'disposed')
      try {
        e.configure({ ...e.settings, bpm: a.tempo });
      } catch {
        /* Invalid tempo never enters the stored arrangement. */
      }
  }, [a.tempo]);
  const rangeKey = range.join('|');
  useEffect(() => {
    if (engine.current) void engine.current.stop();
    setMeasure(null);
  }, [rangeKey, a.id]);
  async function start() {
    try {
      const m = measures[0];
      if (!m) throw new Error('Kies een maatbereik.');
      if (
        measures.some(
          (x) =>
            x.timeSignature.beats !== m.timeSignature.beats ||
            x.timeSignature.beatUnit !== m.timeSignature.beatUnit,
        )
      )
        throw new Error(
          'Kies een passage met dezelfde maatsoort; gemengde maatsoorten worden niet stilzwijgend aangepast.',
        );
      const e = getSharedMetronome();
      engine.current = e;
      e.configure({
        ...defaultMetronomeSettings,
        bpm: a.tempo,
        meter: m.timeSignature,
      });
      await e.start();
      setError('');
      setStatus(e.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audio kon niet starten.');
    }
  }
  return {
    status,
    measure,
    error,
    repeat,
    setRepeat,
    start,
    pause: () => {
      void engine.current?.pause();
    },
    stop: () => {
      void engine.current?.stop();
      setMeasure(null);
    },
  };
}
