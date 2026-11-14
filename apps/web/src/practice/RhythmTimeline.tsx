import { useRef } from 'react';
import { fraction } from '../../../../packages/music-domain/src/workspace';
import type { RhythmPattern } from '../../../../packages/music-domain/src/theory';
export function RhythmTimeline({
  pattern,
  selected,
  select,
  activeStep,
  disabled,
}: {
  pattern: RhythmPattern;
  selected: number;
  select: (n: number) => void;
  activeStep: number | null;
  disabled: boolean;
}) {
  const slots = (pattern.meter.beats * 16) / pattern.meter.beatUnit,
    ref = useRef<HTMLDivElement>(null);
  return (
    <div className="rhythm-scroll" ref={ref}>
      <div
        className="rhythm-timeline"
        style={{ '--rhythm-slots': slots } as React.CSSProperties}
      >
        {Array.from({ length: slots }, (_, i) => {
          const event = pattern.events.find(
              (e) => e.start.numerator * 16 === i * e.start.denominator,
            ),
            held = pattern.events.some(
              (e) =>
                e.start.numerator / e.start.denominator < i / 16 &&
                e.start.numerator / e.start.denominator +
                  e.duration.numerator / e.duration.denominator >
                  i / 16,
            ),
            time = fraction(i, 16),
            label =
              pattern.meter.beatUnit === 8
                ? i % 2
                  ? '&'
                  : String(i / 2 + 1)
                : i % 4 === 0
                  ? String(i / 4 + 1)
                  : ['', 'e', '&', 'a'][i % 4];
          return (
            <div className="rhythm-column" key={i}>
              <span aria-hidden="true">{label}</span>
              <button
                className="gs-button gs-rhythm-cell"
                disabled={disabled}
                aria-label={
                  'Tijdpositie ' +
                  time.numerator +
                  '/' +
                  time.denominator +
                  (event
                    ? ', ' +
                      (event.kind === 'rest'
                        ? 'rust'
                        : event.stroke === 'up'
                          ? 'opslag'
                          : 'neerslag') +
                      ', duur ' +
                      event.duration.numerator +
                      '/' +
                      event.duration.denominator +
                      (event.accent ? ', accent' : '')
                    : '')
                }
                aria-pressed={selected === i}
                aria-current={activeStep === i ? 'true' : undefined}
                tabIndex={selected === i ? 0 : -1}
                onClick={() => select(i)}
                onKeyDown={(e) => {
                  if (
                    ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)
                  ) {
                    e.preventDefault();
                    const n =
                      e.key === 'Home'
                        ? 0
                        : e.key === 'End'
                          ? slots - 1
                          : Math.max(
                              0,
                              Math.min(
                                slots - 1,
                                i + (e.key === 'ArrowRight' ? 1 : -1),
                              ),
                            );
                    select(n);
                    ref.current?.querySelectorAll('button')[n]?.focus();
                  }
                }}
              >
                <strong aria-hidden="true">
                  {event?.kind === 'rest'
                    ? '𝄽'
                    : event
                      ? event.stroke === 'up'
                        ? '↑'
                        : '↓'
                      : held
                        ? '—'
                        : '·'}
                </strong>
                <small>
                  {event
                    ? event.duration.numerator +
                      '/' +
                      event.duration.denominator
                    : held
                      ? 'aanhouden'
                      : 'stilte'}
                </small>
                {event?.accent && (
                  <span className="rhythm-accent">&gt; accent</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
