import { useEffect, useRef, useState } from 'react';
import {
  getSharedMetronome,
  releaseSharedMetronome,
} from '../../../../packages/audio/src/browser';
import { PracticeRun } from '../../../../packages/music-domain/src/rhythm-practice';
import { defaultTransportOptions } from '../../../../packages/music-domain/src/practice-transport';
import type { ExerciseConfiguration } from '../../../../packages/music-domain/src/practice';
export function usePracticeAudio(
  configuration: ExerciseConfiguration,
  active: boolean,
) {
  const [engine] = useState(getSharedMetronome),
    run = useRef(new PracticeRun());
  const read = () => {
    run.current.observe(engine.status, engine.audioTime, engine.position);
    return {
      status: engine.status,
      seconds: run.current.seconds,
      bars: run.current.bars,
      maxBpm: run.current.maxBpm,
      position: engine.position,
      bpm: engine.position?.bpm ?? engine.bpm,
      error: engine.lastError,
    };
  };
  const [snapshot, setSnapshot] = useState(read);
  useEffect(() => {
    engine.configure({
      ...structuredClone(configuration.transport ?? defaultTransportOptions),
      bpm: configuration.bpm,
      meter: configuration.meter,
    });
  }, [configuration, engine]);
  useEffect(() => {
    if (!active) {
      run.current.observe(engine.status, engine.audioTime, engine.position);
      void engine.pause().catch(() => {});
    }
  }, [active, engine]);
  useEffect(() => {
    let frame = 0,
      last = 0;
    const render = (at: number) => {
      run.current.observe(engine.status, engine.audioTime, engine.position);
      if (at - last >= 50) {
        last = at;
        const next = {
          status: engine.status,
          seconds: run.current.seconds,
          bars: run.current.bars,
          maxBpm: run.current.maxBpm,
          position: engine.position,
          bpm: engine.position?.bpm ?? engine.bpm,
          error: engine.lastError,
        };
        setSnapshot((previous) =>
          previous.status === next.status &&
          Math.floor(previous.seconds) === Math.floor(next.seconds) &&
          previous.bars === next.bars &&
          previous.position?.index === next.position?.index &&
          previous.bpm === next.bpm &&
          previous.error === next.error
            ? previous
            : next,
        );
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      void releaseSharedMetronome().catch(() => {});
    };
  }, [engine]);
  return {
    engine,
    snapshot,
    read,
    reset: () => {
      run.current.reset();
      setSnapshot(read());
    },
  };
}
