import { MetronomeEngine, type AudioBackend } from './metronome.js';
/** One graph per shared service, allocated only in an explicit start gesture. */
export class WebAudioBackend implements AudioBackend {
  readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly voices = new Set<{
    oscillator: OscillatorNode;
    envelope: GainNode;
  }>();
  constructor() {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.master.connect(this.analyser);
    this.analyser.connect(this.context.destination);
  }
  get currentTime() {
    return this.context.currentTime;
  }
  async resume() {
    await this.context.resume();
    if (this.context.state !== 'running')
      throw new Error('AudioContext did not start');
  }
  async suspend() {
    if (this.context.state !== 'closed') await this.context.suspend();
  }
  async close() {
    this.cancel();
    this.master.disconnect();
    this.analyser.disconnect();
    if (this.context.state !== 'closed') await this.context.close();
  }
  gain(volume: number) {
    this.master.gain.setTargetAtTime(volume, this.currentTime, 0.005);
  }
  click(at: number, accent: boolean, subdivision: boolean) {
    const oscillator = this.context.createOscillator(),
      envelope = this.context.createGain();
    oscillator.frequency.value = accent ? 1320 : subdivision ? 660 : 880;
    envelope.gain.setValueAtTime(0.001, at);
    envelope.gain.exponentialRampToValueAtTime(0.35, at + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.001, at + 0.025);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    const voice = { oscillator, envelope };
    this.voices.add(voice);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.voices.delete(voice);
    };
    oscillator.start(at);
    oscillator.stop(at + 0.03);
  }
  cancel() {
    for (const { oscillator, envelope } of this.voices) {
      try {
        oscillator.stop();
      } catch {
        /* Already ended. */
      }
      oscillator.disconnect();
      envelope.disconnect();
    }
    this.voices.clear();
  }
  peak() {
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);
    return samples.reduce((peak, n) => Math.max(peak, Math.abs(n)), 0);
  }
}
let shared: MetronomeEngine | null = null;
let unbind: (() => void) | null = null;
export function bindMetronomeLifecycle(
  engine: MetronomeEngine,
  host: Pick<
    Document,
    'addEventListener' | 'removeEventListener' | 'visibilityState'
  > = document,
  page: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  onPageHide: () => Promise<void> = () => engine.dispose(),
) {
  const hidden = () => {
      if (host.visibilityState === 'hidden')
        void engine.pause().catch(() => {});
    },
    leave = () => {
      void engine.stop().catch(() => {});
    },
    close = () => {
      void onPageHide().catch(() => {});
    };
  host.addEventListener('visibilitychange', hidden);
  page.addEventListener('pagehide', close);
  page.addEventListener('popstate', leave);
  page.addEventListener('hashchange', leave);
  return () => {
    host.removeEventListener('visibilitychange', hidden);
    page.removeEventListener('pagehide', close);
    page.removeEventListener('popstate', leave);
    page.removeEventListener('hashchange', leave);
  };
}
export function getSharedMetronome() {
  if (!shared) {
    shared = new MetronomeEngine(() => new WebAudioBackend());
    unbind = bindMetronomeLifecycle(
      shared,
      document,
      window,
      disposeSharedMetronome,
    );
  }
  return shared;
}
/** React route owners in 2B call release on navigation/unmount; no competing clock. */
export async function releaseSharedMetronome() {
  await shared?.stop();
}
export async function disposeSharedMetronome() {
  const engine = shared;
  unbind?.();
  unbind = null;
  await engine?.dispose();
  if (shared === engine) shared = null;
}
