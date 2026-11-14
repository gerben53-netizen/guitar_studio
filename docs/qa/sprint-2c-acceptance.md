# Sprint 2C acceptance

Official local environment: Windows 11 Home 10.0.26200, installed Google Chrome 157.0.8103.51 through Playwright. Chromium is the automated CI browser. Only these browsers are in scope; viewports are not physical-device, screen-reader speech or speaker listening acceptance.

| #   | Criterion              | Technical evidence / final integration gate                                                                                                |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Practice Home          | PASS: real welcome/resume/recommendation/goals/skill aggregates/recent sessions and honest empty states                                    |
| 2   | 18 API exercises       | PASS: one catalog, all 18 visible, search/lab/level/category filters, 14 future-Lab exercises have no start action                         |
| 3   | Rhythm Lab             | PASS: four Rhythm exercises, rational timeline, supported meters/strokes/rests/accents/durations and registration                          |
| 4   | Metronome              | PASS: real Web Audio, one shared context, pause/resume/stop/tap/volume/mute/subdivision, failures and lifecycle                            |
| 5   | Reusable transport     | PASS: React adapter consumes existing engine and common validated playback controls                                                        |
| 6   | Pattern editing        | PASS: whole/half/quarter/eighth/sixteenth, offbeat, rests, accents, erase and Undo; invalid overlap/bounds leave draft intact              |
| 7   | Ramp                   | PASS: start/target/step/bars persisted; actual played BPM rises at bar boundary; manual tempo overrides disable ramp                       |
| 8   | Persistent sessions    | PASS: existing API/PG snapshots, stable UUID, duplicate-click and lost-response recovery                                                   |
| 9   | Progress               | PASS: real journal fields and per-Lab session/mastery/BPM aggregates; pagination and recent history separated                              |
| 10  | Uitgevoerd vs Beheerst | PASS: performed never awards mastery; confirmed Beheerst affects one configuration; overall mastery is not inferred                        |
| 11  | Resume                 | PASS: saved settings/goals survive reload, an entirely new Chrome process/context and actual PostgreSQL restart                            |
| 12  | Library and path       | PASS: all 18 exercises across four free levels; only Rhythm startable; actual statuses                                                     |
| 13  | Design System v2       | PASS: existing neon assets, themes, semantic tokens/components, scoped Practice CSS and reduced motion                                     |
| 14  | Chrome acceptance      | PASS: 20 full suite tests on Windows/Chrome; targeted lifecycle/validation rerun; four viewports/both themes                               |
| 15  | Axe                    | PASS: 48 new Chrome scans across Home/library/path/progress/Rhythm/dialog, zero violations in tested WCAG tags                             |
| 16  | Song regression        | PASS: all 13 existing browser scenarios retained, including library/import/lyrics/chords/tab/fretboard/Practice Mode/storage recovery      |
| 17  | PostgreSQL integration | PASS: 12 tests, repeated migrations, isolation, explicit mastery, preferences/ramp, duplicate protection and legacy identity compatibility |
| 18  | Final CI               | Required gate: quality+secrets green on exact PR head and final develop; final links in PR completion record                               |
| 19  | Sprint issues          | Implementation complete: #36–42 under milestone #5 and EPIC #18; close only after accepted green merge                                     |
| 20  | Merged develop         | Required gate:PR to develop only, clean checkout, final merge SHA/CI in completion record                                                  |

## Evidence

[Raw evidence](evidence/sprint-2c) contains functional audio/session/lost-response/browser-restart assertions, four viewport axe/environment records, real graph audio evidence and [PostgreSQL restart proof](evidence/sprint-2c/restart.json). Forty-eight [Chrome screenshots](screenshots/sprint-2c) use WIDTH-THEME-SCREEN.jpg. Six screens at all four widths and both themes: home, library, path, progress, rhythm, session.

Representative views: [Home dark](screenshots/sprint-2c/1440-dark-home.jpg), [Home light](screenshots/sprint-2c/1440-light-home.jpg), [Rhythm](screenshots/sprint-2c/1440-dark-rhythm.jpg), [library](screenshots/sprint-2c/1440-light-library.jpg), [path](screenshots/sprint-2c/1280-dark-path.jpg), [journal](screenshots/sprint-2c/1024-light-progress.jpg), [session](screenshots/sprint-2c/1440-dark-session.jpg), [mobile Rhythm](screenshots/sprint-2c/390-light-rhythm.jpg), [mobile Home](screenshots/sprint-2c/390-dark-home.jpg).

## Validation

42 unit tests cover the existing music/audio contracts plus rational edits, all binary durations, overlap/bounds, 6/8, audio-time accounting, held pause position, optional playback and default-key compatibility. Twelve real-PG integration tests cover catalog/settings/sessions/progress/mastery/origins/preferences, revisions, owner isolation/FKs, immutable history and current/old versions. Both migrations and catalog seeding run repeatedly without modifying prior song/catalog data. The real database container was restarted; settings (including ramp), preferences, session, progress/mastery and Song origin responses compared equal and its isolated fixture was removed.

Twenty browser tests combine all 13 existing regression scenarios with seven new Practice cases. They exercise every requested interaction: open/select/start, BPM/tap, pause/resume/stop/mute/subdivision, four meters, duration/stroke/rest/accent/Undo, ramp, performed and confirmed mastered saves, goals, journal, filters/path, re-open/relaunch, themes/viewports and dialogs. One test aborts the POST response after the server commits and verifies recovery with exactly one session. Another delays settings persistence, presses Stop/navigates and verifies no late AudioContext is created. API load retry and rejected AudioContext are tested. Song tempo remains 84 in a separate real fixture. Pause-on-hidden uses the real shared listener with a synthetic visibility event; this is not a human tab/audio-device test.

Axe uses wcag2a/wcag2aa/wcag21aa on actual rendered pages. Zero violations includes no critical or serious findings, but does not certify all assistive technology. Native dialog focus loops in both directions, Escape/restore, rhythm arrow focus and overflow are asserted. Existing32 selected token contrasts and five asset hashes continue to pass; there are no new color values or dependencies.

Local Chromium's first combined run passed 18 scenarios but hit a 15-second screenshot capture deadline in one viewport; that failed run is not counted as acceptance. Screenshot-only capture now has a 45-second bound and disabled animation while functional action timeouts remain short. Subsequent successful runs/CI are authoritative. Only observed successful outcomes count.

## Deliberate differences and limitations

No prototype sessions, demo JavaScript or practice localStorage are copied. Home recommendation is a simple catalog/progress choice. Historical playback settings are snapshots; resume uses the latest saved settings. Meter/preset replacement asks confirmation, overlapping events are rejected rather than silently removed, and Undo preserves a valid selection. Patterns are fixed during an unfinished run so its reflection has a coherent source; user may finish/discard before structural edits. Session repetitions count completed measures; time excludes pauses and remains a self-reported reflection, not microphone grading. Non-default playback settings conservatively scope configurations; adding default options preserves pre-2C keys/mastery.

Other Labs remain future modules. #6 remains open for Song Practice/Tab metronome UI; #8/#18 open; #14 untouched. No Safari/Firefox/Edge, physical phone/screen reader/speaker certification, microphone, automatic assessment, release, deployment or main change. Browser tests persist fixtures: run against disposable local/test databases, never real production user data.
