import {
  getSharedMetronome,
  disposeSharedMetronome,
} from '../../../packages/audio/src/browser';
import type {
  ScheduledTick,
  MetronomeSettings,
} from '../../../packages/audio/src/metronome';
const engine = getSharedMetronome();
const ticks: ScheduledTick[] = [];
const errors: string[] = [];
engine.onTick((tick) => ticks.push(tick));
const guard = (fn: () => Promise<void>) => () => {
  void fn().catch((error) => errors.push(String(error)));
};
document.getElementById('start')!.onclick = guard(() => engine.start());
document.getElementById('resume')!.onclick = guard(() => engine.resume());
document.getElementById('pause')!.onclick = guard(() => engine.pause());
document.getElementById('stop')!.onclick = guard(() => engine.stop());
document.getElementById('dispose')!.onclick = guard(() =>
  disposeSharedMetronome(),
);
document.getElementById('mute')!.onclick = () =>
  engine.configure({ ...engine.settings, mute: !engine.settings.mute });
window.__metronomeTest = {
  snapshot: () => ({
    status: engine.status,
    bpm: engine.bpm,
    time: engine.audioTime,
    peak: engine.outputPeak(),
    ticks: [...ticks],
    errors: [...errors],
  }),
  configure: (value: MetronomeSettings) => engine.configure(value),
  settings: () => engine.settings,
  isShared: () => engine === getSharedMetronome(),
};
declare global {
  interface Window {
    __metronomeTest: {
      snapshot: () => {
        status: string;
        bpm: number;
        time: number;
        peak: number;
        ticks: ScheduledTick[];
        errors: string[];
      };
      configure: (settings: MetronomeSettings) => void;
      settings: () => MetronomeSettings;
      isShared: () => boolean;
    };
  }
}
