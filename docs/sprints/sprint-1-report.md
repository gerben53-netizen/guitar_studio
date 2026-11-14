# Sprint 1 — UX Prototype Implementation

Implementation and required Chromium scenarios: PASS. Overall acceptance is **partial** because the broader physical Safari/touch/screenreader acceptance in issue #14 is not demonstrated. Keep that issue and the Sprint 1 milestone open. This report distinguishes a functioning, tested implementation from full device/accessibility acceptance.

## Baseline and approach

Started from clean develop `05fc8a8`; Sprint 0's four issues/milestone were closed and develop CI 43599273216 was successful. Inspected issues #9–#15, architecture, tests and the actual original prototype ZIP/HTML, design review and screenshots. [Gap analysis](sprint-1-gap-analysis.md) records the differences before implementation. One local repository, feature/sprint-1-ux, no worktrees; main/license/history retained.

Used the existing React/TypeScript/Vite, Fastify/Zod/pg, PostgreSQL and Docker architecture. No replacement infrastructure or paid provider was added. Components replace the imperative prototype: library/dashboard, source wizard, combined workspace, tab, neck, chord editor and Practice Mode. Semantic component/state CSS and copper/sage tokens preserve the reference identity, dark/light themes and responsive rail. No utility CSS framework/classes are used.

## Delivered behavior

- Database-driven dashboard with recent/favorite songs, manual progress and resume-last-arrangement action.
- Searchable/filterable library, editable title/artist/status/difficulty/tags, favorite, card/list, independent copies, archive/restore and confirmed isolated deletion.
- Manual/UTF-8 lyrics import, explicit usage confirmation, persisted provenance, heading-based section preview and songs without lyrics. External search is visibly unavailable; no scraping.
- Shared lyrics and independently duplicated arrangements; sections can be added/reordered without changing IDs. Lyrics use stable tokens and preserve chords across safe edits; ambiguous anchors remain visible and repositionable.
- Six-line tab, arbitrary rational core time, explicit meters, whole through sixteenth durations and quarter-note triplets; simultaneous tones, rests, measure add/duplicate, multi-measure copy/paste, roving keyboard input, Delete/Backspace and Undo/Redo.
- Linked six-string neck through fret 24, pitch names/markers, simultaneous and sequential entry; standard/Drop D, acoustic/electric and explicit capo semantics.
- Named/custom chord grips, open/muted strings, standard Am/C/G/D/Em/F, alternative octave grips and deliberate grip-to-tab conversion.
- Practice read view with shared chords/tab, section switching, actual fullscreen and persisted manual progress.
- Debounced serialized PostgreSQL saves, visible retry/conflict states, revision-checked atomic updates, last 20 recovery versions, versioned JSON export/import. Unsaved drafts are retained in memory and can be exported; offline persistence is not claimed.

## Issue tracking

Milestone: Sprint 1 — UX Prototype Implementation (#2). Existing issues were reused; #17 records the previously untracked integrated screens/library/Practice work.

| Issue                        | Verified implementation                                                                    | Closure policy                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| #9 anchors                   | Stable token reconciliation, retained ambiguity and reposition tests                       | Close after green PR merge                                        |
| #10 timing                   | Explicit rational meters/durations/tuplets, structured notes, tested prototype conversion  | Close after green PR merge                                        |
| #11 input                    | Roving tab/neck focus, eight-note keyboard motif, multi-measure copy and Undo              | Close after green PR merge                                        |
| #12 profiles                 | Acoustic/electric, standard/Drop D, explicit capo confirmation and pitch tests             | Close after green PR merge                                        |
| #13 storage                  | Atomic revisions/history, failure/retry/conflict, reload and JSON transfer                 | Close after green PR merge                                        |
| #14 responsive/accessibility | Chromium sizes, context retention, keyboard and automated Axe pass                         | Remains OPEN: physical Safari/touch/screenreader evidence missing |
| #15 import                   | Manual/file/no-lyrics, rights/source gate, safe section proposals, disabled external route | Close after green PR merge                                        |
| #17 integrated screens       | Dashboard/library/workspace/chord editor/Practice                                          | Close after green PR merge                                        |

Issues #6 metronome, #7 PDF and #8 scale indicator are unchanged and outside scope. No audio, detection, automatic tablature, cloud hosting, release tag or main merge.

## Validation and integration

Local results: lint, formatting, strict typecheck, 15 unit tests, 2 PostgreSQL integration tests, both builds and all 7 Chromium tests PASS. Dependency install/audit reports zero vulnerabilities. See [acceptance evidence and screenshots](../qa/sprint-1-acceptance.md). Browser failures during development exposed time-label canonicalization, a missing explicit instrument label and an inappropriate JSON header on bodyless DELETE; all were corrected and the complete suite passed afterwards. Failed attempts are not acceptance evidence.

The existing CI is extended with Chromium installation, the same browser suite and artifact retention; all original checks remain. Implementation integrates only through a green PR to develop. The PR conversation/canonical metadata and the final delivery identify the exact CI run and merge commit; no self-referential hash is embedded here. Until integration succeeds, issue closure remains gated.

Docker startup and migration replay PASS: database/API/web healthchecks are healthy and both real PostgreSQL tests pass inside the built image. A real database/API restart retained a dedicated song's lyrics, positioned note, revision and update timestamp exactly; the test fixture was then removed. A workspace-specific Vite cache-permission problem was fixed, and nested local node_modules are excluded from the Docker context. Existing PostgreSQL volumes are retained. Temporary host preview servers were stopped; the standard Docker app remains available on localhost:5173. The three supplied original fictional demo songs are opt-in seeded using a validated converter; existing seed IDs/user songs are never overwritten.

## Deviations and next sprint

The old destructive lyrics reset, eighth-tick storage and browser song storage are intentionally replaced. Capo labels are relative but physical frets remain absolute (Sprint 0 convention), with confirmation and rejection of unplayable changes. The disabled search route replaces a misleading fixed demo search. Empty databases show a real empty state until a user creates songs or explicitly seeds the original demos. New save/history/export controls and rhythm choices expand the reference toolbar. Musical passage selection currently copies complete measures, not arbitrary rectangular note fragments.

Next: complete #14 with physical Safari/touch and screenreader sessions; then perform beginner usability tests around chord placement, numeric input and conflict recovery. Before any internet hosting, add ownership/authentication/authorization and production security. Future richer techniques, independent voices, actual lyrics providers, metronome/PDF and audio each need separate scope. The current app remains a personal local workspace.
