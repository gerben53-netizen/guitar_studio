import { RhythmPatternSchema, type RhythmPattern } from './theory.js';
import { fraction } from './workspace.js';
export const rhythmDurations = [1, 2, 4, 8, 16] as const;
export function editRhythm(
  pattern: RhythmPattern,
  slot: number,
  denominator: number,
  kind: 'note' | 'rest',
  stroke: 'down' | 'up',
  accent: boolean,
): RhythmPattern {
  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    !rhythmDurations.includes(denominator as (typeof rhythmDurations)[number])
  )
    throw new Error('Kies een geldige tijdpositie en duur.');
  const start = fraction(slot, 16);
  const existing = pattern.events.find(
    (e) => e.start.numerator * 16 === slot * e.start.denominator,
  );
  const events = pattern.events.filter((e) => e.id !== existing?.id);
  events.push({
    id: existing?.id ?? crypto.randomUUID(),
    start,
    duration: fraction(1, denominator),
    kind,
    stroke: kind === 'rest' ? null : stroke,
    accent: kind === 'note' && accent,
  });
  const next = RhythmPatternSchema.safeParse({ ...pattern, events });
  if (!next.success)
    throw new Error(
      'Deze duur overlapt een ander event of valt buiten de maat. Wis eerst de betrokken slag of kies een kortere duur.',
    );
  return next.data;
}
export function eraseRhythm(pattern: RhythmPattern, slot: number) {
  return RhythmPatternSchema.parse({
    ...pattern,
    events: pattern.events.filter(
      (e) => e.start.numerator * 16 !== slot * e.start.denominator,
    ),
  });
}
/** Audio-context time is authoritative; this observer never schedules audio. */
export class PracticeRun {
  seconds = 0;
  bars = 0;
  maxBpm = 0;
  private lastTime: number | null = null;
  private lastStatus = 'stopped';
  private bar = 0;
  observe(
    status: string,
    time: number,
    position: { bar: number; bpm: number } | null,
  ) {
    if (this.lastTime !== null && this.lastStatus === 'running')
      this.seconds += Math.max(0, time - this.lastTime);
    if (position && (status === 'running' || status === 'paused')) {
      this.maxBpm = Math.max(this.maxBpm, position.bpm);
      if (position.bar > this.bar) this.bars += position.bar - this.bar;
      this.bar = position.bar;
    }
    if (status === 'stopped') this.bar = 0;
    this.lastTime = time;
    this.lastStatus = status;
  }
  reset() {
    this.seconds = 0;
    this.bars = 0;
    this.maxBpm = 0;
    this.lastTime = null;
    this.lastStatus = 'stopped';
    this.bar = 0;
  }
}
