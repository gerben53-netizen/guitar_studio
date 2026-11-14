# Practice domain

Sprint 2A adds functional, React-independent modules to the existing music-domain package. `practice.ts` defines strict Zod input contracts and inferred Exercise, ExerciseConfiguration, PracticeSession, PracticeProgress, PracticeMastery and PracticeOrigin types. `practice-catalog.ts` supplies the 18 original prototype exercises: r1–r4, s1–s4, c1–c4 and t1–t6, version 1. Acoustic/electric profiles share the existing six-string model. No prototype sessions or achievements are seeded.

Exercise contains title/description/lab/category/level/goal/instructions/start and target BPM/estimated seconds/compatibility/default configuration/content/version. Configuration separately stores instrument (including tuning and capo), BPM, meter, difficulty, absolute fret range and discriminated rhythm/scale/chord/technique settings. Selected ranges may include frets below capo but must intersect the playable range; calculations clip those frets. Technique steps must be playable. Practice never updates a song arrangement.

Configuration identity is a versioned canonical serialization, SHA-256 hashed by the server. Object keys are binary-sorted, rational times reduced and rhythm events sorted; generated event/step IDs, profile IDs and tuning labels do not affect identity. Musical content, sequence order, BPM, position, tuning pitches, capo, instrument type, difficulty and exercise version do. Profile range/input preferences conservatively remain part of the identity. Keys are owner scoped in storage. Original immutable JSON remains available even when settings select a different key.

Session UUIDs identify completed reflections, not live transports. Server derives owner, createdAt, BPM and instrument; client submits start/end, active seconds (not more than elapsed + one second), repetitions, rating 1–5, notes, result and configuration snapshot/key. Duplicate saves return 409 without double-counting. `Beheerst` requires explicit masteryConfirmed=true and awards only that configuration. An exercise-wide award/revocation requires a separate confirmed mastery request. Tempo, duration and repetitions never award mastery.

Progress is a transactionally rebuilt projection: no activity = Nog niet begonnen; saving settings = Aan het oefenen; one or more completed sessions = Uitgevoerd; only explicit current-version overall mastery = Beheerst. Last rating follows endedAt and UUID tie-break, highest BPM is from recorded sessions. Configuration mastery count never promotes overall status. Catalog upgrades preserve history and old settings, reset current-version mastery projections, and require explicit review/save of new settings.

## Music theory

`theory.ts` extends existing pitchAt/possiblePositions and rational time rather than replacing them. Four scale families × twelve roots produce diatonic names, degrees, semitone intervals and I/III/V anchors (including pentatonic degree numbering). `intervalAt` distinguishes minor/major thirds through semitone values. Structured triads for I–IV–V, I–V–vi–IV and ii–V–I compute quality from chord tones; display names are derived afterward.

Scale positions cover six strings and frets 0–24, clipped to capo/maxFret. Absolute fret is measured from the nut; relative fret = absolute minus capo; MIDI pitch = uncapoed open-string pitch plus absolute fret. Standard and alternate tuning, including Drop D, use the same existing instrument profile. Rhythm events use rational whole-note times, notes/rests, accent and up/down strokes. BigInt cross-products check ordering, overlap and measure bounds. Practice meters: 2/4, 3/4, 4/4, 6/8. Source snapshots preserve any existing valid Song meter.

## Sprint 2B component contracts

The injected-transport `createPracticeClient` reuses the existing web request helper and centralized errors. `PracticeRoomService` expresses the room orchestration boundary. No empty React components or second editor exist.

| Future component      | Existing service or component to consume                                         |
| --------------------- | -------------------------------------------------------------------------------- |
| PracticeRoom          | catalog/settings/origin client; route owner calls releaseSharedMetronome on exit |
| PracticeTransport     | shared MetronomeEngine; session start/active-time tracking                       |
| RhythmTimeline        | rational RhythmPattern; no pixel-based persistence                               |
| MetronomeControls     | shared settings/start/pause/resume/stop/tap/ramp                                 |
| ScaleFretboard        | existing Fretboard with scalePositions/I/III/V overlay                           |
| ChordProgression      | structured progression + existing ChordEditor                                    |
| TechniqueTab          | typed technique steps + existing TabEditor                                       |
| PracticeSessionDialog | validated session, explicit mastery confirmation                                 |
| PracticeProgress      | persisted progress + selected configuration mastery                              |

2B owns final design tokens/semantic CSS, route/navigation, actual component integration, active-session clock, dialog UX, visible failure/retry states and complete #6/#8 user acceptance. #14 and EPIC #18 remain open.
