import { expect, it } from 'vitest';
import {
  MetronomeEngine,
  defaultMetronomeSettings,
  type AudioBackend,
  type SchedulerClock,
  type ScheduledTick,
} from './metronome';
import { bindMetronomeLifecycle } from './browser';
class Clock implements SchedulerClock {
  callbacks = new Set<() => void>();
  repeat(cb: () => void) {
    this.callbacks.add(cb);
    return cb;
  }
  clear(handle: unknown) {
    this.callbacks.delete(handle as () => void);
  }
  fire() {
    for (const cb of this.callbacks) cb();
  }
}
class Audio implements AudioBackend {
  currentTime = 0;
  volume = 0;
  closed = false;
  suspended = false;
  clicks: { at: number; accent: boolean; subdivision: boolean }[] = [];
  failResume = false;
  failClick = false;
  async resume() {
    if (this.failResume) throw new Error('AudioContext denied');
    this.suspended = false;
  }
  async suspend() {
    this.suspended = true;
  }
  async close() {
    this.closed = true;
  }
  click(at: number, accent: boolean, subdivision: boolean) {
    if (this.failClick) throw new Error('Audio graph failed');
    this.clicks.push({ at, accent, subdivision });
  }
  gain(v: number) {
    this.volume = v;
  }
  cancel() {
    this.clicks = this.clicks.filter((c) => c.at <= this.currentTime);
  }
}
function fixture(settings = defaultMetronomeSettings) {
  const audio = new Audio(),
    clock = new Clock();
  let contexts = 0;
  const engine = new MetronomeEngine(
    () => {
      contexts++;
      return audio;
    },
    clock,
    settings,
  );
  const ticks: ScheduledTick[] = [];
  engine.onTick((t) => ticks.push(t));
  const advance = (seconds: number) => {
    const end = audio.currentTime + seconds;
    while (audio.currentTime < end) {
      audio.currentTime = Math.min(end, audio.currentTime + 0.025);
      clock.fire();
    }
  };
  return { audio, clock, engine, ticks, advance, contexts: () => contexts };
}
it('schedules exact quarter beats and measure accents with one context/timer despite repeated start', async () => {
  const f = fixture();
  await Promise.all([f.engine.start(), f.engine.start(), f.engine.start()]);
  expect(f.contexts()).toBe(1);
  expect(f.clock.callbacks.size).toBe(1);
  f.advance(4.1);
  const clicks = f.audio.clicks;
  clicks.slice(0, 5).forEach((c, i) => expect(c.at).toBeCloseTo(0.03 + i, 10));
  expect(clicks.slice(0, 5).map((c) => c.accent)).toEqual([
    true,
    false,
    false,
    false,
    true,
  ]);
  await f.engine.dispose();
  expect(f.clock.callbacks.size).toBe(0);
  expect(f.audio.closed).toBe(true);
});
it('preserves the pending fraction on pause/resume and cancels stopped/late sounds', async () => {
  const f = fixture();
  await f.engine.start();
  f.advance(0.5);
  await f.engine.pause();
  expect(f.clock.callbacks.size).toBe(0);
  expect(f.audio.suspended).toBe(true);
  const count = f.audio.clicks.length;
  f.advance(3);
  expect(f.audio.clicks).toHaveLength(count);
  await f.engine.resume();
  f.advance(0.6);
  expect(f.audio.clicks.at(-1)!.at).toBeCloseTo(4.03);
  await f.engine.stop();
  expect(f.clock.callbacks.size).toBe(0);
  await f.engine.start();
  expect(f.ticks.at(-1)!.index).toBe(0);
  await f.engine.dispose();
});
it('cancels an in-flight start when immediately stopped or paused', async () => {
  const f = fixture();
  const starting = f.engine.start();
  await f.engine.stop();
  await starting;
  expect(f.engine.status).toBe('stopped');
  expect(f.clock.callbacks.size).toBe(0);
  expect(f.audio.clicks).toHaveLength(0);
  const again = f.engine.start();
  await f.engine.pause();
  await again;
  expect(f.engine.status).toBe('paused');
  expect(f.clock.callbacks.size).toBe(0);
  await f.engine.dispose();
});
it('rephases tempo, supports tap tempo, volume/mute without stopping the clock and resets meter safely', async () => {
  const f = fixture();
  await f.engine.start();
  f.advance(0.5);
  f.engine.configure({ ...f.engine.settings, bpm: 120 });
  f.advance(1);
  const times = f.audio.clicks.map((c) => c.at);
  expect(times.at(-1)! - times.at(-2)!).toBeCloseTo(0.5);
  f.engine.configure({ ...f.engine.settings, mute: true });
  expect(f.audio.volume).toBe(0);
  const n = f.ticks.length;
  f.advance(0.4);
  expect(f.ticks.length).toBeGreaterThan(n);
  f.engine.configure({ ...f.engine.settings, mute: false, volume: 0.2 });
  expect(f.audio.volume).toBe(0.2);
  expect(f.engine.tap(0)).toBeNull();
  expect(f.engine.tap(600)).toBe(100);
  f.engine.configure({
    ...f.engine.settings,
    meter: { beats: 6, beatUnit: 8 },
  });
  expect(f.engine.status).toBe('stopped');
  expect(f.clock.callbacks.size).toBe(0);
  await f.engine.dispose();
});
it('treats 6/8 BPM as dotted quarters with two pulses and optional eighth subdivisions', async () => {
  const f = fixture({
    ...defaultMetronomeSettings,
    meter: { beats: 6, beatUnit: 8 },
    subdivision: 'eighth',
  });
  await f.engine.start();
  f.advance(2.1);
  expect(f.audio.clicks.slice(0, 7).map((c) => c.at)).toEqual(
    expect.arrayContaining([
      expect.closeTo(0.03),
      expect.closeTo(0.03 + 1 / 3),
      expect.closeTo(1.03),
      expect.closeTo(2.03),
    ]),
  );
  expect(
    f.audio.clicks
      .filter((c) => !c.subdivision)
      .slice(0, 3)
      .map((c) => c.accent),
  ).toEqual([true, false, true]);
  await f.engine.dispose();
});
it('ramps once per requested measure interval, including rescheduling near a bar boundary', async () => {
  const f = fixture({
    ...defaultMetronomeSettings,
    ramp: { enabled: true, start: 60, target: 80, step: 10, everyBars: 1 },
  });
  await f.engine.start();
  f.advance(3.95);
  expect(f.engine.bpm).toBe(70);
  await f.engine.pause();
  await f.engine.resume();
  f.advance(0.2);
  expect(f.engine.bpm).toBe(70);
  f.advance(8);
  expect(f.engine.bpm).toBe(80);
  await f.engine.dispose();
});
it('surfaces AudioContext and graph failures without orphaned schedulers', async () => {
  const f = fixture();
  f.audio.failResume = true;
  await expect(f.engine.start()).rejects.toThrow('AudioContext denied');
  expect(f.engine.status).toBe('error');
  expect(f.audio.closed).toBe(true);
  expect(f.clock.callbacks.size).toBe(0);
  const g = fixture();
  await g.engine.start();
  g.audio.failClick = true;
  g.advance(1.1);
  await Promise.resolve();
  await Promise.resolve();
  expect(g.engine.status).toBe('error');
  expect(g.clock.callbacks.size).toBe(0);
  await g.engine.dispose();
});
it('pauses hidden pages, stops on navigation and disposes/unbinds page lifecycle', async () => {
  const f = fixture();
  const host = Object.assign(new EventTarget(), {
      visibilityState: 'visible' as DocumentVisibilityState,
    }),
    page = new EventTarget();
  const unbind = bindMetronomeLifecycle(f.engine, host, page);
  await f.engine.start();
  host.visibilityState = 'hidden';
  host.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  expect(f.engine.status).toBe('paused');
  await f.engine.resume();
  page.dispatchEvent(new Event('hashchange'));
  expect(f.engine.status).toBe('stopped');
  await f.engine.start();
  page.dispatchEvent(new Event('pagehide'));
  await Promise.resolve();
  await f.engine.dispose();
  expect(f.audio.closed).toBe(true);
  unbind();
});
it('cancels a native resume promise that has not settled, without leaking a scheduler', async () => {
  const audio = new Audio(),
    clock = new Clock();
  let finish: () => void = () => {};
  audio.resume = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  const engine = new MetronomeEngine(() => audio, clock);
  const starting = engine.start();
  await Promise.resolve();
  await engine.stop();
  await starting;
  expect(engine.status).toBe('stopped');
  expect(clock.callbacks.size).toBe(0);
  await engine.dispose();
  finish();
  expect(audio.closed).toBe(true);
  expect(audio.clicks).toHaveLength(0);
});
