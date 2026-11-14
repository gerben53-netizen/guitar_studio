import { z } from 'zod';
import {
  PracticeMeterSchema,
  sixteenthSeconds,
} from '../../music-domain/src/theory.js';
export const MetronomeSettingsSchema = z.strictObject({
  bpm: z.number().int().min(20).max(300),
  meter: PracticeMeterSchema,
  subdivision: z.enum(['none', 'eighth', 'sixteenth']),
  volume: z.number().min(0).max(1),
  mute: z.boolean(),
  ramp: z
    .strictObject({
      enabled: z.boolean(),
      start: z.number().int().min(20).max(300),
      target: z.number().int().min(20).max(300),
      step: z.number().int().min(1).max(40),
      everyBars: z.number().int().min(1).max(100),
    })
    .refine((r) => r.target >= r.start, 'Ramp target must be at least start'),
});
export type MetronomeSettings = z.infer<typeof MetronomeSettingsSchema>;
export const defaultMetronomeSettings: MetronomeSettings = {
  bpm: 60,
  meter: { beats: 4, beatUnit: 4 },
  subdivision: 'none',
  volume: 0.45,
  mute: false,
  ramp: { enabled: false, start: 60, target: 100, step: 5, everyBars: 4 },
};
export interface AudioBackend {
  readonly currentTime: number;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
  click(at: number, accent: boolean, subdivision: boolean): void;
  gain(volume: number): void;
  cancel(): void;
  peak?(): number;
}
export interface SchedulerClock {
  repeat(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}
export interface ScheduledTick {
  at: number;
  index: number;
  bar: number;
  step: number;
  bpm: number;
  audible: boolean;
  accent: boolean;
}
const browserClock: SchedulerClock = {
  repeat: (callback, ms) => globalThis.setInterval(callback, ms),
  clear: (handle) =>
    globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};
/** Audio time is authoritative. Timer callbacks only fill a bounded future audio horizon. */
export class MetronomeEngine {
  private backend: AudioBackend | null = null;
  private timer: unknown = null;
  private serial: Promise<void> = Promise.resolve();
  private epoch = 0;
  private nextAt = 0;
  private nextIndex = 0;
  private resumeFraction = 0;
  private scheduled: ScheduledTick[] = [];
  private options: MetronomeSettings;
  private tempo: number;
  private taps: number[] = [];
  private listeners = new Set<(tick: ScheduledTick) => void>();
  private startJob: Promise<void> | null = null;
  private lastRampBar = 0;
  private cancelResume: (() => void) | null = null;
  status: 'stopped' | 'starting' | 'running' | 'paused' | 'error' | 'disposed' =
    'stopped';
  lastError: string | null = null;
  constructor(
    private readonly factory: () => AudioBackend,
    private readonly clock: SchedulerClock = browserClock,
    settings: MetronomeSettings = defaultMetronomeSettings,
  ) {
    this.options = MetronomeSettingsSchema.parse(structuredClone(settings));
    this.tempo = this.options.bpm;
  }
  get settings() {
    return structuredClone(this.options);
  }
  get bpm() {
    return this.tempo;
  }
  get audioTime() {
    return this.backend?.currentTime ?? 0;
  }
  get position() {
    return (
      [...this.scheduled].reverse().find((t) => t.at <= this.audioTime) ?? null
    );
  }
  outputPeak() {
    return this.backend?.peak?.() ?? 0;
  }
  onTick(listener: (tick: ScheduledTick) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private async closeBackend() {
    const backend = this.backend;
    if (backend) await backend.close();
    if (this.backend === backend) this.backend = null;
  }
  private enqueue(action: () => Promise<void>): Promise<void> {
    const job = this.serial.then(action).catch(async (error) => {
      this.halt(false);
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      try {
        await this.closeBackend();
      } catch {
        /* The primary failure remains visible. */
      }
      throw error;
    });
    this.serial = job.catch(() => {});
    return job;
  }
  private point() {
    return (
      this.scheduled.find((t) => t.at > this.audioTime) ?? {
        at: this.nextAt,
        index: this.nextIndex,
        bpm: this.tempo,
      }
    );
  }
  private halt(preserve: boolean) {
    const point = this.point();
    if (preserve && this.backend) {
      this.resumeFraction = Math.max(
        0,
        Math.min(
          1,
          (point.at - this.audioTime) /
            sixteenthSeconds(point.bpm, this.options.meter),
        ),
      );
      this.nextIndex = point.index;
      this.tempo = point.bpm;
      this.lastRampBar = Math.floor(
        point.index /
          ((this.options.meter.beats * 16) / this.options.meter.beatUnit),
      );
    } else {
      this.resumeFraction = 0;
      this.nextIndex = 0;
      this.lastRampBar = 0;
    }
    this.epoch++;
    this.cancelResume?.();
    this.cancelResume = null;
    if (this.timer !== null) {
      this.clock.clear(this.timer);
      this.timer = null;
    }
    this.backend?.cancel();
    this.scheduled = [];
  }
  start(): Promise<void> {
    if (this.status === 'disposed')
      return Promise.reject(new Error('Metronome disposed'));
    if (this.status === 'running') return Promise.resolve();
    if (this.startJob) return this.startJob;
    const paused = this.status === 'paused',
      generation = this.epoch;
    this.status = 'starting';
    const job = this.enqueue(async () => {
      if (generation !== this.epoch) return;
      if (!paused) {
        this.nextIndex = 0;
        this.lastRampBar = 0;
        this.tempo = this.options.ramp.enabled
          ? this.options.ramp.start
          : this.options.bpm;
      }
      this.backend ??= this.factory();
      try {
        await Promise.race([
          this.backend.resume(),
          new Promise<void>((resolve) => {
            this.cancelResume = resolve;
          }),
        ]);
      } finally {
        this.cancelResume = null;
      }
      if (generation !== this.epoch) return;
      this.backend.gain(this.options.mute ? 0 : this.options.volume);
      this.nextAt =
        this.audioTime +
        (paused
          ? this.resumeFraction *
            sixteenthSeconds(this.tempo, this.options.meter)
          : 0.03);
      this.status = 'running';
      this.lastError = null;
      this.schedule();
      if (this.status === 'running')
        this.timer = this.clock.repeat(() => {
          try {
            this.schedule();
          } catch (error) {
            this.halt(false);
            this.status = 'error';
            void this.enqueue(async () => {
              throw error;
            }).catch(() => {});
          }
        }, 25);
    });
    this.startJob = job;
    void job
      .finally(() => {
        if (this.startJob === job) this.startJob = null;
      })
      .catch(() => {});
    return job;
  }
  resume() {
    return this.start();
  }
  pause(): Promise<void> {
    if (
      this.status === 'disposed' ||
      this.status === 'stopped' ||
      this.status === 'paused'
    )
      return Promise.resolve();
    this.halt(true);
    this.status = 'paused';
    return this.enqueue(async () => {
      await this.backend?.suspend();
    });
  }
  stop(): Promise<void> {
    if (this.status === 'disposed') return Promise.resolve();
    this.halt(false);
    this.status = 'stopped';
    return this.enqueue(async () => {
      await this.backend?.suspend();
    });
  }
  dispose(): Promise<void> {
    if (this.status === 'disposed') return this.serial;
    this.halt(false);
    this.status = 'disposed';
    return this.enqueue(async () => {
      await this.closeBackend();
      this.listeners.clear();
    });
  }
  configure(settings: MetronomeSettings) {
    const next = MetronomeSettingsSchema.parse(structuredClone(settings));
    const meterChanged =
      next.meter.beats !== this.options.meter.beats ||
      next.meter.beatUnit !== this.options.meter.beatUnit;
    const point = this.point();
    const fraction = Math.max(
      0,
      Math.min(
        1,
        (point.at - this.audioTime) /
          sixteenthSeconds(point.bpm, this.options.meter),
      ),
    );
    const tempoChanged = next.bpm !== this.options.bpm;
    const subdivisionChanged = next.subdivision !== this.options.subdivision;
    this.options = next;
    if (tempoChanged) this.tempo = next.bpm;
    this.backend?.gain(next.mute ? 0 : next.volume);
    if (meterChanged) {
      void this.stop().catch(() => {});
      return;
    }
    if (this.status === 'running' && (tempoChanged || subdivisionChanged)) {
      this.tempo = tempoChanged ? next.bpm : point.bpm;
      this.backend?.cancel();
      this.scheduled = [];
      this.nextIndex = point.index;
      this.lastRampBar = Math.floor(
        point.index / ((next.meter.beats * 16) / next.meter.beatUnit),
      );
      this.nextAt =
        this.audioTime + fraction * sixteenthSeconds(this.tempo, next.meter);
      this.schedule();
    }
  }
  tap(timestamp = performance.now()) {
    const previous = this.taps.at(-1);
    if (
      previous !== undefined &&
      (timestamp - previous > 3000 || timestamp <= previous)
    )
      this.taps = [];
    this.taps.push(timestamp);
    this.taps = this.taps.slice(-8);
    if (this.taps.length < 2) return null;
    const interval = (timestamp - this.taps[0]!) / (this.taps.length - 1);
    const bpm = Math.max(20, Math.min(300, Math.round(60000 / interval)));
    this.configure({ ...this.settings, bpm });
    return bpm;
  }
  private schedule() {
    if (this.status !== 'running' || !this.backend) return;
    const now = this.audioTime;
    if (this.nextAt < now - 0.1) this.nextAt = now + 0.01;
    this.scheduled = this.scheduled.filter((t) => t.at >= now - 1);
    const slots = (this.options.meter.beats * 16) / this.options.meter.beatUnit;
    while (this.nextAt < now + 0.1) {
      const index = this.nextIndex,
        bar = Math.floor(index / slots),
        step = index % slots;
      if (
        step === 0 &&
        bar > this.lastRampBar &&
        this.options.ramp.enabled &&
        bar % this.options.ramp.everyBars === 0
      ) {
        this.tempo = Math.min(
          this.options.ramp.target,
          this.tempo + this.options.ramp.step,
        );
        this.lastRampBar = bar;
      }
      const pulse = step % (this.options.meter.beatUnit === 8 ? 6 : 4) === 0;
      const audible =
        pulse ||
        this.options.subdivision === 'sixteenth' ||
        (this.options.subdivision === 'eighth' && step % 2 === 0);
      const tick = {
        at: this.nextAt,
        index,
        bar,
        step,
        bpm: this.tempo,
        audible,
        accent: step === 0,
      };
      if (audible) this.backend.click(tick.at, tick.accent, !pulse);
      this.scheduled.push(tick);
      for (const listener of this.listeners) listener({ ...tick });
      this.nextAt += sixteenthSeconds(this.tempo, this.options.meter);
      this.nextIndex++;
    }
  }
}
